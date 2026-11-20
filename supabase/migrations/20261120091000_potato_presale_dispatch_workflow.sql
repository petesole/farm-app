-- Contract creation, D-Note stock-source allocation and report feed.
-- Execute after 20261120090000_potato_presale_fifo_ledger.sql, once approved.

create or replace function public.potato_presale_create(
 p_reference text,p_contract_date date,p_customer_id bigint,p_tracecode_id bigint,
 p_lines jsonb,p_notes text default null)
returns uuid language plpgsql security definer set search_path=''
as $fn$
declare cid uuid; season_key bigint; item record; pockets integer; price numeric; 
begin
 if not potato_market_private.is_admin() then
   raise exception 'Admin access required' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_reference,'')),'') is null or p_contract_date is null
   or p_customer_id is null or p_tracecode_id is null then
   raise exception 'Reference, date, customer and field are required'; end if;
 if not exists(select 1 from public.wb_customer where customer_id=p_customer_id and active=true)
   then raise exception 'Choose an active customer'; end if;
 select t.season_id into season_key
 from public.v_active_tracecodes t where t.tracecode_id=p_tracecode_id
 and lower(btrim(t.crop_name))='potatoes';
 if season_key is null then raise exception 'Choose an active potato field'; end if;
 if jsonb_typeof(p_lines)<>'object' or (select count(*) from jsonb_object_keys(p_lines))=0
   then raise exception 'Enter contracted pockets and a price for at least one potato size'; end if;
 perform pg_catalog.pg_advisory_xact_lock(742219,1);
 insert into public.potato_presale(reference,contract_date,customer_id,tracecode_id,season_id,notes)
 values(btrim(p_reference),p_contract_date,p_customer_id,p_tracecode_id,season_key,nullif(btrim(p_notes),''))
 returning presale_id into cid;
 for item in select key as size_code,value as details from jsonb_each(p_lines) loop
   if not exists(select 1 from public.wb_potato_size s where s.size_code=item.size_code and s.active)
      then raise exception 'Invalid potato size %',item.size_code; end if;
   if coalesce(item.details->>'pockets','') !~ '^[1-9][0-9]*$'
      or coalesce(item.details->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$'
      then raise exception 'Valid positive pockets and price required for %',item.size_code; end if;
   pockets:=(item.details->>'pockets')::integer;
   price:=(item.details->>'price')::numeric;
   if price<=0 then raise exception 'Price must be positive for %',item.size_code; end if;
   insert into public.potato_presale_line(presale_id,size_code,contracted_pockets,price_per_pocket)
     values(cid,item.size_code,pockets,price);
 end loop;
 perform public.potato_reserve_newly_available(cid);
 return cid;
end $fn$;

-- One transaction: classify outgoing physical stock, FIFO it, and price normal sales.
-- A pre-sale collection reduces reserved physical stock but never creates a second sale.
create or replace function public.potato_market_allocate_and_price(
 p_dispatch_id uuid,p_source text,p_presale_id uuid,p_lines jsonb,p_reason text default null)
returns uuid language plpgsql security definer set search_path=''
as $fn$
declare sid uuid; rec record; expected integer; has_positive integer;
begin
 if not potato_market_private.is_admin() then
   raise exception 'Admin access required' using errcode='42501'; end if;
 if p_source not in ('normal','presale','divert') then raise exception 'Choose stock source'; end if;
 if exists(select 1 from public.potato_market_sale s where s.dispatch_id=p_dispatch_id)
   then raise exception 'D-Note has a saved sale; use an audited correction'; end if;
 select count(*) into has_positive from public.wb_potato_dispatch_line
 where dispatch_id=p_dispatch_id and pockets>0;
 if has_positive<=0 then raise exception 'D-Note must have positive pockets'; end if;
 if p_source in ('normal','divert') then
   if jsonb_typeof(p_lines)<>'object' or
      (select count(*) from jsonb_object_keys(p_lines))<>has_positive
       then raise exception 'Enter a price for every positive D-Note size'; end if;
   for rec in select size_code,pockets from public.wb_potato_dispatch_line
     where dispatch_id=p_dispatch_id and pockets>0 loop
     if coalesce(p_lines->rec.size_code->>'price','') !~ '^[0-9]+([.][0-9]{1,2})?$'
        or (p_lines->rec.size_code->>'price')::numeric<=0
     then raise exception 'Valid price required for %',rec.size_code; end if;
   end loop;
 end if;
 -- All writes below roll back together on any error.
 perform public.potato_allocate_outgoing(p_dispatch_id,p_source,p_presale_id,p_reason);
 if p_source='presale' then return null; end if;
 insert into public.potato_market_sale(dispatch_id,sale_date)
 select d.dispatch_id,(coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date
 from public.wb_potato_dispatch d join public.wb_scale_transaction w
 on w.transaction_id=d.wb_transaction_id where d.dispatch_id=p_dispatch_id
 returning sale_id into sid;
 if sid is null then raise exception 'Cannot determine D-Note sale date'; end if;
 insert into public.potato_market_sale_line(sale_id,size_code,pockets,price_per_pocket)
 select sid,l.size_code,l.pockets,(p_lines->l.size_code->>'price')::numeric
 from public.wb_potato_dispatch_line l
 where l.dispatch_id=p_dispatch_id and l.pockets>0;
 insert into public.potato_market_field_allocation(sale_id,tracecode_id,size_code,pockets)
 select sid,g.tracecode_id,a.size_code,sum(a.pockets)::integer
 from public.potato_stock_allocation a
 join public.wb_potato_grading_batch g on g.grading_id=a.grading_id
 where a.dispatch_id=p_dispatch_id and a.kind='normal_dispatch'
 group by g.tracecode_id,a.size_code;
 return sid;
end $fn$;

create or replace function public.potato_market_full_context()
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare result jsonb;
begin
 if not potato_market_private.is_admin() then
   raise exception 'Admin access required' using errcode='42501'; end if;
 result:=public.potato_market_context();
 result:=jsonb_set(result,'{dispatches}',coalesce((
   select jsonb_agg(jsonb_build_object(
     'dispatch_id',d.dispatch_id,'dnote_number',d.dnote_number,
     'dnote_date',(coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date,
     'counts',(select coalesce(jsonb_object_agg(l.size_code,l.pockets),'{}'::jsonb)
               from public.wb_potato_dispatch_line l where l.dispatch_id=d.dispatch_id))
       order by w.first_at,d.dnote_number)
   from public.wb_potato_dispatch d
   join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id
   where d.status='issued' and not exists (
      select 1 from public.potato_stock_allocation a where a.dispatch_id=d.dispatch_id
   )),'[]'::jsonb),true);
 result:=jsonb_set(result,'{presales}',coalesce((
   select jsonb_agg(jsonb_build_object(
    'presale_id',c.presale_id,'reference',c.reference,'contract_date',c.contract_date,
    'customer_id',c.customer_id,'customer_name',cust.customer_name,
    'tracecode_id',c.tracecode_id,'trace_name',t.tracecode_name,
    'status',c.status,'lines',(
      select coalesce(jsonb_agg(jsonb_build_object(
       'size_code',p.size_code,'contracted',p.contracted_pockets,
       'price',p.price_per_pocket,'allocated',p.allocated_to_contract,
       'collected',p.collected_pockets,'awaiting',p.awaiting_grading,
       'reserved',p.reserved_in_storage,'sold_value',p.sales_value)
        order by p.size_code),'[]'::jsonb)
      from public.potato_presale_position_v p where p.presale_id=c.presale_id))
     order by c.contract_date,c.reference)
   from public.potato_presale c
   join public.wb_customer cust on cust.customer_id=c.customer_id
   join public.tracecode t on t.tracecode_id=c.tracecode_id),'[]'::jsonb),true);
 result:=jsonb_set(result,'{stock_pools}',coalesce((
  select jsonb_agg(jsonb_build_object(
    'season_id',g.season_id,'tracecode_id',g.tracecode_id,
    'size_code',g.size_code,'normal',g.normal_available,
    'reserved',g.reserved_available,'physical',g.normal_available+g.reserved_available)
    order by g.tracecode_id,g.size_code)
  from (select season_id,tracecode_id,size_code,
        sum(normal_available) normal_available,sum(reserved_available) reserved_available
        from public.potato_grade_pool_v
        group by season_id,tracecode_id,size_code) g),'[]'::jsonb),true);
 return result;
end $fn$;
revoke all on function public.potato_presale_create(text,date,bigint,bigint,jsonb,text) from public,anon,authenticated;
revoke all on function public.potato_market_allocate_and_price(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.potato_market_full_context() from public,anon,authenticated;
grant execute on function public.potato_presale_create(text,date,bigint,bigint,jsonb,text) to authenticated;
grant execute on function public.potato_market_allocate_and_price(uuid,text,uuid,jsonb,text) to authenticated;
grant execute on function public.potato_market_full_context() to authenticated;
