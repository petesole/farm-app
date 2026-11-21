-- Audited pre-sale contract amendments. Allocated financial/stock commitments
-- cannot be repriced or reassigned silently after grading.
create table if not exists public.potato_presale_correction_audit (
  audit_id bigint generated always as identity primary key,
  presale_id uuid not null references public.potato_presale(presale_id),
  prior_values jsonb not null,
  updated_values jsonb not null,
  reason text not null check(length(btrim(reason))>0),
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.potato_presale_correction_audit enable row level security;
revoke all on public.potato_presale_correction_audit from public,anon,authenticated;

create or replace function public.potato_presale_edit_context(p_presale_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare ctx jsonb; detail jsonb;
begin
  if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  ctx:=public.potato_market_statement_context();
  select jsonb_build_object(
    'presale_id',s.presale_id,'reference',s.reference,'contract_date',s.contract_date,
    'customer_id',s.customer_id,'tracecode_id',s.tracecode_id,'season_id',s.season_id,
    'notes',s.notes,'status',s.status,
    'has_allocations',exists(select 1 from public.potato_stock_allocation a where a.presale_id=s.presale_id),
    'lines',coalesce((select jsonb_agg(jsonb_build_object('size_code',l.size_code,
      'pockets',l.contracted_pockets,'price',l.price_per_pocket) order by l.size_code)
      from public.potato_presale_line l where l.presale_id=s.presale_id),'[]'::jsonb)
  ) into detail from public.potato_presale s where s.presale_id=p_presale_id;
  if detail is null then raise exception 'Pre-sale not found'; end if;
  return jsonb_build_object('contract',detail,'customers',ctx->'customers',
    'fields',ctx->'contract_fields');
end $fn$;

create or replace function public.potato_presale_update(
  p_presale_id uuid,p_reference text,p_contract_date date,p_customer_id bigint,
  p_tracecode_id bigint,p_lines jsonb,p_notes text,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $fn$
declare current_contract public.potato_presale; season_key bigint;
 old_values jsonb; new_values jsonb; item record; new_count integer:=0;
 locked boolean;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Correction reason required'; end if;
 if nullif(btrim(coalesce(p_reference,'')),'') is null or p_contract_date is null
  or p_customer_id is null or p_tracecode_id is null then raise exception 'Contract details required'; end if;
 if jsonb_typeof(p_lines) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_lines))=0 then raise exception 'Enter size quantities and prices'; end if;
 perform pg_catalog.pg_advisory_xact_lock(742219,1);
 select * into current_contract from public.potato_presale
  where presale_id=p_presale_id for update;
 if not found or current_contract.status<>'active' then raise exception 'Active pre-sale not found'; end if;
 if not exists(select 1 from public.wb_customer c where c.customer_id=p_customer_id and c.active)
  then raise exception 'Choose an active customer'; end if;
 select season_id into season_key from public.v_active_tracecodes
  where tracecode_id=p_tracecode_id and lower(btrim(crop_name))='potatoes';
 if season_key is null then raise exception 'Choose a live potato field'; end if;
 for item in select key as size_code,value as details from jsonb_each(p_lines) loop
   if not exists(select 1 from public.wb_potato_size where size_code=item.size_code and active)
     or coalesce(item.details->>'pockets','') !~ '^[1-9][0-9]*$'
     or coalesce(item.details->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$'
     or (item.details->>'price')::numeric<=0
   then raise exception 'Invalid size, quantity or price for %',item.size_code; end if;
   new_count:=new_count+1;
 end loop;
 locked:=exists(select 1 from public.potato_stock_allocation
                   where presale_id=p_presale_id);
 if locked and (
   p_contract_date is distinct from current_contract.contract_date
   or p_customer_id is distinct from current_contract.customer_id
   or p_tracecode_id is distinct from current_contract.tracecode_id
   or (select coalesce(jsonb_object_agg(l.size_code,
      jsonb_build_object('pockets',l.contracted_pockets,'price',l.price_per_pocket)),'{}'::jsonb)
      from public.potato_presale_line l where l.presale_id=p_presale_id)
      is distinct from p_lines
 ) then raise exception 'Stock already allocated. Quantities, price, customer, field and date cannot be changed without a stock/financial correction'; end if;
 old_values:=jsonb_build_object(
  'contract',to_jsonb(current_contract),
  'lines',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb)
     from public.potato_presale_line l where l.presale_id=p_presale_id));
 update public.potato_presale set
  reference=btrim(p_reference),contract_date=p_contract_date,
  customer_id=p_customer_id,tracecode_id=p_tracecode_id,season_id=season_key,
  notes=nullif(btrim(coalesce(p_notes,'')),'')
 where presale_id=p_presale_id;
 if not locked then
   delete from public.potato_presale_line where presale_id=p_presale_id;
   insert into public.potato_presale_line(presale_id,size_code,contracted_pockets,price_per_pocket)
    select p_presale_id,key,(value->>'pockets')::integer,(value->>'price')::numeric
    from jsonb_each(p_lines);
   perform public.potato_reserve_newly_available(p_presale_id);
 end if;
 select jsonb_build_object(
   'contract',to_jsonb(s),
   'lines',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb)
     from public.potato_presale_line l where l.presale_id=p_presale_id))
 into new_values from public.potato_presale s where s.presale_id=p_presale_id;
 insert into public.potato_presale_correction_audit(presale_id,prior_values,updated_values,reason)
 values(p_presale_id,old_values,new_values,btrim(p_reason));
 return p_presale_id;
end $fn$;
revoke all on function public.potato_presale_edit_context(uuid) from public,anon,authenticated;
revoke all on function public.potato_presale_update(uuid,text,date,bigint,bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.potato_presale_edit_context(uuid) to authenticated;
grant execute on function public.potato_presale_update(uuid,text,date,bigint,bigint,jsonb,text,text) to authenticated;
