-- Potato Market follow-up: derive sale dates from the D-Note, record market
-- payments independently, and expose field receipt / sale attribution reports.
alter table public.potato_market_payment
  add column if not exists customer_id bigint references public.wb_customer(customer_id);
alter table public.potato_market_payment
  alter column sale_id drop not null;

create or replace function public.potato_market_context()
returns jsonb language plpgsql security definer set search_path=''
as $func$
declare result jsonb;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 select jsonb_build_object(
  'dispatches',coalesce((select jsonb_agg(jsonb_build_object(
      'dispatch_id',d.dispatch_id,
      'dnote_number',d.dnote_number,
      'dnote_date',(coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date,
      'counts',(select coalesce(jsonb_object_agg(l.size_code,l.pockets),'{}'::jsonb)
        from public.wb_potato_dispatch_line l where l.dispatch_id=d.dispatch_id))
    order by w.first_at desc,d.dnote_number)
    from public.wb_potato_dispatch d
    join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id
    where d.status='issued'
      and not exists(select 1 from public.potato_market_sale s where s.dispatch_id=d.dispatch_id)),'[]'::jsonb),
  'traces',coalesce((select jsonb_agg(jsonb_build_object('id',t.tracecode_id,'name',t.tracecode_name) order by t.tracecode_name)
    from public.v_active_tracecodes t
    where lower(btrim(t.crop_name))='potatoes'),'[]'::jsonb),
  'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.customer_id,'name',c.customer_name) order by c.customer_name)
    from public.wb_customer c where c.active is true),'[]'::jsonb),
  'sales',coalesce((select jsonb_agg(jsonb_build_object(
      'sale_id',s.sale_id,'dispatch_id',s.dispatch_id,'dnote_number',d.dnote_number,
      'dnote_date',(coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date,
      'lines',(select coalesce(jsonb_object_agg(l.size_code,jsonb_build_object('pockets',l.pockets,'price',l.price_per_pocket)),'{}'::jsonb)
        from public.potato_market_sale_line l where l.sale_id=s.sale_id),
      'allocations',(select coalesce(jsonb_agg(jsonb_build_object('tracecode_id',a.tracecode_id,'size_code',a.size_code,'pockets',a.pockets)),'[]'::jsonb)
        from public.potato_market_field_allocation a where a.sale_id=s.sale_id),
      'total',coalesce((select sum(l.pockets*l.price_per_pocket) from public.potato_market_sale_line l where l.sale_id=s.sale_id),0))
    order by w.first_at desc,s.created_at desc)
    from public.potato_market_sale s
    join public.wb_potato_dispatch d using(dispatch_id)
    join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object(
      'payment_id',p.payment_id,'customer_id',p.customer_id,'customer_name',coalesce(c.customer_name,'Unassigned market'),
      'payment_date',p.payment_date,'amount',p.amount,'note',p.note,'market_reference',p.market_reference)
    order by p.payment_date desc,p.created_at desc)
    from public.potato_market_payment p left join public.wb_customer c using(customer_id)),'[]'::jsonb),
  'transactions',coalesce((select jsonb_agg(q.x order by q.sort_date desc) from (
    select jsonb_build_object('type','Sale','date',(coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date,
      'reference',d.dnote_number,'amount',coalesce((select sum(l.pockets*l.price_per_pocket) from public.potato_market_sale_line l where l.sale_id=s.sale_id),0),
      'note','') as x, (coalesce(w.first_at,w.local_created_at) at time zone 'Africa/Harare')::date as sort_date
      from public.potato_market_sale s join public.wb_potato_dispatch d using(dispatch_id)
      join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id
    union all
    select jsonb_build_object('type','Payment','date',p.payment_date,'reference',coalesce(c.customer_name,'Unassigned market'),
      'amount',p.amount,'note',concat_ws(' � ',nullif(p.market_reference,''),nullif(p.note,''))) as x,p.payment_date as sort_date
      from public.potato_market_payment p left join public.wb_customer c using(customer_id)
  ) q),'[]'::jsonb),
  'field_report',coalesce((select jsonb_agg(jsonb_build_object(
      'tracecode_id',t.tracecode_id,'tracecode_name',t.tracecode_name,
      'incoming_slips',coalesce(h.incoming_slips,0),'incoming_kg',coalesce(h.incoming_kg,0),
      'sold_pockets',coalesce(a.sold_pockets,0),'sold_kg',coalesce(a.sold_kg,0),'sold_value',coalesce(a.sold_value,0))
    order by t.tracecode_name)
    from public.tracecode t join public.crop c using(crop_id)
    left join (
      select a.tracecode_id,count(distinct a.transaction_id) as incoming_slips,sum(a.allocated_kg) as incoming_kg
      from public.wb_scale_field_allocation a
      join public.wb_scale_transaction w using(transaction_id)
      join public.tracecode tc using(tracecode_id)
      join public.crop cc on cc.crop_id=tc.crop_id
      where w.status='completed' and w.owner_type='own' and w.movement_kind='HARVEST_IN'
        and lower(btrim(cc.crop_name))='potatoes'
      group by a.tracecode_id
    ) h on h.tracecode_id=t.tracecode_id
    left join (
      select a.tracecode_id,sum(a.pockets) as sold_pockets,
        sum(a.pockets*sz.pocket_weight_kg) as sold_kg,
        sum(a.pockets*l.price_per_pocket) as sold_value
      from public.potato_market_field_allocation a
      join public.potato_market_sale_line l on l.sale_id=a.sale_id and l.size_code=a.size_code
      join public.wb_potato_size sz using(size_code)
      group by a.tracecode_id
    ) a on a.tracecode_id=t.tracecode_id
    where lower(btrim(c.crop_name))='potatoes'
      and (t.end_date is null or coalesce(h.incoming_kg,0)>0 or coalesce(a.sold_pockets,0)>0)),'[]'::jsonb),
  'stock_by_size',coalesce((select jsonb_agg(jsonb_build_object(
      'season_name',se.season_name,
      'size_name',case when sz.size_code='SMEDIUM' then 'Small-Medium' else sz.display_name end,
      'available_pockets',v.available_pockets,'pocket_weight_kg',sz.pocket_weight_kg)
    order by se.season_name,sz.sort_order)
    from public.wb_potato_stock_v v
    join public.season se using(season_id)
    join public.wb_potato_size sz using(size_code)
    where v.available_pockets>0),'[]'::jsonb)
 ) into result;
 return result;
end
$func$;

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
 for k in select size_code from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id loop
   select pockets into expected from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id and size_code=k;
   if coalesce(p_lines->k->>'price','') !~ '^([0-9]+)(\.[0-9]{1,2})?$'
      or coalesce((p_lines->k->>'pockets')::integer,-1)<>expected then
     raise exception 'Enter a price for every D-Note size';
   end if;
   select coalesce(sum((a->>'pockets')::integer),0) into got
     from jsonb_array_elements(p_allocations) a where a->>'size_code'=k;
   if got<>expected then raise exception 'Field allocations must equal the D-Note pockets for every size'; end if;
 end loop;
 if (select count(*) from jsonb_object_keys(p_lines))<>(select count(*) from public.wb_potato_dispatch_line where dispatch_id=p_dispatch_id) then
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

create or replace function public.potato_market_save_payment(
  p_payment_id uuid,p_customer_id bigint,p_payment_date date,p_amount numeric,
  p_note text,p_market_reference text,p_reason text default null)
returns uuid language plpgsql security definer set search_path=''
as $func$
declare pid uuid:=coalesce(p_payment_id,gen_random_uuid()); old jsonb;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if not exists(select 1 from public.wb_customer where customer_id=p_customer_id and active is true)
    or p_payment_date is null or p_amount is null or p_amount<=0 then
   raise exception 'Choose an active customer or market and enter a valid date and amount';
 end if;
 if p_payment_id is null then
   insert into public.potato_market_payment(payment_id,sale_id,customer_id,payment_date,amount,note,market_reference)
   values(pid,null,p_customer_id,p_payment_date,p_amount,nullif(btrim(p_note),''),nullif(btrim(p_market_reference),''));
 else
   select to_jsonb(p) into old from public.potato_market_payment p where p.payment_id=p_payment_id for update;
   if old is null then raise exception 'Payment not found'; end if;
   if nullif(btrim(p_reason),'') is null then raise exception 'Enter a reason for this change'; end if;
   insert into public.potato_market_audit(record_type,record_id,before_data,change_reason) values('payment',pid,old,btrim(p_reason));
   update public.potato_market_payment set sale_id=null,customer_id=p_customer_id,payment_date=p_payment_date,
     amount=p_amount,note=nullif(btrim(p_note),''),market_reference=nullif(btrim(p_market_reference),''),updated_at=now()
     where payment_id=pid;
 end if;
 return pid;
end
$func$;

create or replace function public.potato_market_add_market(p_market_name text)
returns bigint language plpgsql security definer set search_path=''
as $func$
declare market_name text:=regexp_replace(btrim(coalesce(p_market_name,'')),'\s+',' ','g');
  market_key text;
  existing_id bigint;
  existing_active boolean;
  created_id bigint;
begin
 if not potato_market_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if market_name='' then raise exception 'Enter a market name'; end if;
 market_key:=upper(market_name);
 select customer_id,active into existing_id,existing_active
   from public.wb_customer where customer_name_key=market_key;
 if found then
   if not existing_active then raise exception 'This customer exists but is inactive; activate it before using it as a market'; end if;
   return existing_id;
 end if;
 insert into public.wb_customer(customer_name,customer_name_key,active)
   values(market_name,market_key,true) returning customer_id into created_id;
 return created_id;
end
$func$;

revoke all on function public.potato_market_save_sale(uuid,uuid,date,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.potato_market_save_payment(uuid,uuid,date,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.potato_market_save_sale(uuid,uuid,jsonb,jsonb,text) from public,anon;
revoke all on function public.potato_market_save_payment(uuid,bigint,date,numeric,text,text,text) from public,anon;
revoke all on function public.potato_market_add_market(text) from public,anon;
grant execute on function public.potato_market_context(),public.potato_market_save_sale(uuid,uuid,jsonb,jsonb,text),
  public.potato_market_save_payment(uuid,bigint,date,numeric,text,text,text),public.potato_market_add_market(text) to authenticated;

