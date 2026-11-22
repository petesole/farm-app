-- Permit D-Notes that include zero-pocket size rows. The UI only prices positive sizes.
create or replace function public.potato_market_save_sale(
  p_sale_id uuid,p_dispatch_id uuid,p_lines jsonb,p_allocations jsonb,p_reason text default null)
returns uuid language plpgsql security definer set search_path=''
as $func$
declare sid uuid:=coalesce(p_sale_id,gen_random_uuid());
  d public.wb_potato_dispatch;
  dnote_date date;
  k text;
  expected integer;
  got integer;
  trace_id bigint;
  size text;
  qty integer;
  before_doc jsonb;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if jsonb_typeof(p_lines)<>'object' or jsonb_typeof(p_allocations)<>'array' then raise exception 'D-Note prices and field allocations are required'; end if;
 select * into d from public.wb_potato_dispatch where dispatch_id=p_dispatch_id and status='issued' for update;
 if not found then raise exception 'Choose an issued potato D-Note'; end if;
 select (coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date
   into dnote_date from public.wb_scale_transaction w where w.transaction_id=d.wb_transaction_id;
 if dnote_date is null then raise exception 'The selected D-Note has no recorded date'; end if;
 if p_sale_id is null and exists(select 1 from public.potato_market_sale where dispatch_id=p_dispatch_id) then raise exception 'This D-Note already has a sale'; end if;
 if p_sale_id is not null then
  select jsonb_build_object('sale',to_jsonb(s),
    'lines',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from public.potato_market_sale_line l where l.sale_id=s.sale_id),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.potato_market_field_allocation a where a.sale_id=s.sale_id))
    into before_doc from public.potato_market_sale s where s.sale_id=p_sale_id and s.dispatch_id=p_dispatch_id for update;
  if before_doc is null then raise exception 'Sale not found'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason for this change'; end if;
 end if;
 for k in select size_code from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id and pockets>0 loop
   select pockets into expected from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id and size_code=k;
   if coalesce(p_lines->k->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$'
      or coalesce((p_lines->k->>'pockets')::integer,-1)<>expected then
     raise exception 'Enter a price for every D-Note size';
   end if;
   select coalesce(sum((a->>'pockets')::integer),0) into got
     from jsonb_array_elements(p_allocations) a where a->>'size_code'=k;
   if got<>expected then raise exception 'Field allocations must equal the D-Note pockets for every size'; end if;
 end loop;
 if (select count(*) from jsonb_object_keys(p_lines))<>(select count(*) from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id and pockets>0) then
   raise exception 'Prices must match all D-Note sizes';
 end if;
 if p_sale_id is null then
   insert into public.potato_market_sale(sale_id,dispatch_id,sale_date) values(sid,p_dispatch_id,dnote_date);
 else
   insert into public.potato_market_audit(record_type,record_id,before_data,change_reason) values('sale',sid,before_doc,btrim(p_reason));
   update public.potato_market_sale set sale_date=dnote_date,updated_at=now() where sale_id=sid;
   delete from public.potato_market_sale_line where sale_id=sid;
   delete from public.potato_market_field_allocation where sale_id=sid;
 end if;
 for k in select jsonb_object_keys(p_lines) loop
   insert into public.potato_market_sale_line values(sid,k,(p_lines->k->>'pockets')::integer,(p_lines->k->>'price')::numeric);
 end loop;
 for size,trace_id,qty in
   select a->>'size_code',(a->>'tracecode_id')::bigint,(a->>'pockets')::integer from jsonb_array_elements(p_allocations) a
 loop
   if qty<=0 or not exists(select 1 from public.v_active_tracecodes t
       where t.tracecode_id=trace_id and lower(btrim(t.crop_name))='potatoes') then
     raise exception 'Choose live potato fields only';
   end if;
   insert into public.potato_market_field_allocation values(sid,trace_id,size,qty);
 end loop;
 return sid;
end
$func$;
