-- Audited latest-dispatch corrections. Never silently rewrite FIFO history.
create table if not exists public.potato_allocation_correction_audit(
  correction_id bigint generated always as identity primary key,
  dispatch_id uuid not null references public.wb_potato_dispatch(dispatch_id),
  reason text not null check(length(btrim(reason))>0),
  previous_state jsonb not null,
  replacement_state jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid not null default auth.uid()
);
alter table public.potato_allocation_correction_audit enable row level security;
revoke all on public.potato_allocation_correction_audit from anon,authenticated;

create or replace function public.potato_market_correct_latest(
 p_dispatch_id uuid,p_source text,p_presale_id uuid,p_lines jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $fn$
declare last_id bigint; newest_id bigint; old_doc jsonb; new_doc jsonb;
 v_correction_id bigint; new_sale uuid;
begin
 if not potato_market_private.is_admin() then
  raise exception 'Admin access required' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Correction reason required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(742219,1);
 select max(allocation_id) into last_id
 from public.potato_stock_allocation where dispatch_id=p_dispatch_id;
 if last_id is null then raise exception 'D-Note has no existing stock allocation'; end if;
 select max(allocation_id) into newest_id from public.potato_stock_allocation;
 if last_id<>newest_id then
   raise exception 'Only the latest stock allocation may be corrected. Later movements need reconciliation first'; end if;
 if exists (
   select 1 from public.potato_market_payment p
   join public.potato_market_sale s on s.sale_id=p.sale_id
   where s.dispatch_id=p_dispatch_id
 ) then raise exception 'Cannot replace a sale linked to payment; use accounting correction'; end if;
 select jsonb_build_object(
  'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.allocation_id)
   from public.potato_stock_allocation a where a.dispatch_id=p_dispatch_id),'[]'::jsonb),
  'sale', (select to_jsonb(s) from public.potato_market_sale s where s.dispatch_id=p_dispatch_id),
  'sale_lines',coalesce((select jsonb_agg(to_jsonb(l))
   from public.potato_market_sale_line l join public.potato_market_sale s using(sale_id)
   where s.dispatch_id=p_dispatch_id),'[]'::jsonb),
  'field_allocations',coalesce((select jsonb_agg(to_jsonb(a))
   from public.potato_market_field_allocation a join public.potato_market_sale s using(sale_id)
   where s.dispatch_id=p_dispatch_id),'[]'::jsonb)) into old_doc;
 insert into public.potato_allocation_correction_audit(dispatch_id,reason,previous_state)
 values(p_dispatch_id,btrim(p_reason),old_doc) returning potato_allocation_correction_audit.correction_id into v_correction_id;
 delete from public.potato_market_field_allocation a using public.potato_market_sale s
  where a.sale_id=s.sale_id and s.dispatch_id=p_dispatch_id;
 delete from public.potato_market_sale_line l using public.potato_market_sale s
  where l.sale_id=s.sale_id and s.dispatch_id=p_dispatch_id;
 delete from public.potato_market_sale where dispatch_id=p_dispatch_id;
 delete from public.potato_stock_allocation where dispatch_id=p_dispatch_id;
 new_sale:=public.potato_market_allocate_and_price(p_dispatch_id,p_source,p_presale_id,p_lines,p_reason);
 select jsonb_build_object(
  'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.allocation_id)
   from public.potato_stock_allocation a where a.dispatch_id=p_dispatch_id),'[]'::jsonb),
  'sale',(select to_jsonb(s) from public.potato_market_sale s where s.dispatch_id=p_dispatch_id),
  'sale_lines',coalesce((select jsonb_agg(to_jsonb(l))
   from public.potato_market_sale_line l join public.potato_market_sale s using(sale_id)
   where s.dispatch_id=p_dispatch_id),'[]'::jsonb)) into new_doc;
 update public.potato_allocation_correction_audit
 set replacement_state=new_doc where potato_allocation_correction_audit.correction_id=v_correction_id;
 return new_sale;
end $fn$;
revoke all on function public.potato_market_correct_latest(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.potato_market_correct_latest(uuid,text,uuid,jsonb,text) to authenticated;

-- App context: expose only the safely correctable latest dispatch.
create or replace function public.potato_market_extended_context()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare ctx jsonb; latest public.potato_stock_allocation;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 ctx:=public.potato_market_full_context();
 select * into latest from public.potato_stock_allocation order by allocation_id desc limit 1;
 if latest.dispatch_id is null then
   return jsonb_set(ctx,'{latest_allocated}','null'::jsonb,true);
 end if;
 return jsonb_set(ctx,'{latest_allocated}',coalesce((
   select jsonb_build_object(
    'dispatch_id',d.dispatch_id,'dnote_number',d.dnote_number,
    'dnote_date',(coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date,
    'counts',(select coalesce(jsonb_object_agg(l.size_code,l.pockets),'{}'::jsonb)
       from public.wb_potato_dispatch_line l where l.dispatch_id=d.dispatch_id),
    'source',(case
       when exists(select 1 from public.potato_stock_allocation a
         where a.dispatch_id=d.dispatch_id and a.kind='divert') then 'divert'
       when exists(select 1 from public.potato_stock_allocation a
         where a.dispatch_id=d.dispatch_id and a.kind='presale_dispatch') then 'presale'
       else 'normal' end),
    'presale_id',(select a.presale_id from public.potato_stock_allocation a
       where a.dispatch_id=d.dispatch_id and a.presale_id is not null limit 1),
    'prices',coalesce((select jsonb_object_agg(l.size_code,l.price_per_pocket)
       from public.potato_market_sale_line l join public.potato_market_sale s using(sale_id)
       where s.dispatch_id=d.dispatch_id),'{}'::jsonb))
   from public.wb_potato_dispatch d
   join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id
   where d.dispatch_id=latest.dispatch_id
 ),'null'::jsonb),true);
end $fn$;
revoke all on function public.potato_market_extended_context() from public,anon,authenticated;
grant execute on function public.potato_market_extended_context() to authenticated;
