-- Field report precisely follows the user's original Processed | Stock | Sold layout.
-- Sales include graded pre-sales at contract price. Diversions reverse that component.
create or replace view public.potato_field_report_v2 with (security_invoker=true) as
with incoming as (
 select a.tracecode_id,sum(a.allocated_kg) raw_kg
 from public.wb_scale_field_allocation a
 join public.wb_scale_transaction w using(transaction_id)
 where w.status='completed' and w.owner_type='own' and w.movement_kind='HARVEST_IN'
 group by a.tracecode_id
), processed as (
 select b.tracecode_id,l.size_code,sum(l.pockets)::bigint pockets
 from public.wb_potato_grading_batch b
 join public.wb_potato_grading_line l using(grading_id)
 where b.status='posted' group by b.tracecode_id,l.size_code
), waste as (
 select b.tracecode_id,sum(w.waste_kg) waste_kg
 from public.wb_potato_grading_batch b
 join public.wb_potato_grading_waste w using(grading_id)
 where b.status='posted' group by b.tracecode_id
), stock as (
 select tracecode_id,size_code,sum(normal_available+reserved_available)::bigint pockets
 from public.potato_grade_pool_v group by tracecode_id,size_code
), sold_normal as (
 select a.tracecode_id,a.size_code,sum(a.pockets)::bigint pockets,
        sum(a.pockets*l.price_per_pocket) as value
 from public.potato_market_field_allocation a
 join public.potato_market_sale_line l
   on l.sale_id=a.sale_id and l.size_code=a.size_code
 group by a.tracecode_id,a.size_code
), sold_presale as (
 select tracecode_id,size_code,sum(allocated_to_contract)::bigint pockets,
        sum(sales_value) as value
 from public.potato_presale_position_v
 group by tracecode_id,size_code
)
select t.tracecode_id,t.tracecode_name,t.season_id,t.tracecode_size as hectares,
  coalesce(i.raw_kg,0) as raw_kg,
  coalesce(w.waste_kg,0) as waste_kg,
  sz.size_code,sz.display_name as size_name,sz.sort_order,
  coalesce(p.pockets,0) as processed_pockets,
  coalesce(p.pockets,0)*sz.pocket_weight_kg as processed_kg,
  coalesce(st.pockets,0) as stock_pockets,
  coalesce(st.pockets,0)*sz.pocket_weight_kg as stock_kg,
  coalesce(sn.pockets,0)+coalesce(sp.pockets,0) as sold_pockets,
  (coalesce(sn.pockets,0)+coalesce(sp.pockets,0))*sz.pocket_weight_kg as sold_kg,
  coalesce(sn.value,0)+coalesce(sp.value,0) as sold_value,
  coalesce(sp.pockets,0) as presale_sold_pockets,
  coalesce(sp.value,0) as presale_sold_value
from public.tracecode t
join public.crop c using(crop_id)
cross join public.wb_potato_size sz
left join incoming i on i.tracecode_id=t.tracecode_id
left join waste w on w.tracecode_id=t.tracecode_id
left join processed p on p.tracecode_id=t.tracecode_id and p.size_code=sz.size_code
left join stock st on st.tracecode_id=t.tracecode_id and st.size_code=sz.size_code
left join sold_normal sn on sn.tracecode_id=t.tracecode_id and sn.size_code=sz.size_code
left join sold_presale sp on sp.tracecode_id=t.tracecode_id and sp.size_code=sz.size_code
where lower(btrim(c.crop_name))='potatoes';

-- Unified market transaction source; the contract is not double counted on collection.
create or replace view public.potato_market_transaction_v with (security_invoker=true) as
select 'normal_sale'::text as entry_type,s.sale_id::text as entry_id,
 s.sale_date as entry_date,d.dnote_number as reference,
 coalesce(c.customer_id,0) as customer_id,
 coalesce(c.customer_name,'Unassigned market') as market_name,
 sum(l.pockets*l.price_per_pocket)::numeric as signed_amount,
 null::text as notes
from public.potato_market_sale s join public.wb_potato_dispatch d using(dispatch_id)
join public.wb_scale_transaction w on w.transaction_id=d.wb_transaction_id
left join public.wb_customer c on c.customer_id=w.customer_id
join public.potato_market_sale_line l using(sale_id)
group by s.sale_id,s.sale_date,d.dnote_number,c.customer_id,c.customer_name
union all
select 'presale_'||a.kind,a.allocation_id::text,a.created_at::date,s.reference,
 s.customer_id,c.customer_name,
 (case when a.kind='reserve' then 1 else -1 end)*a.pockets*l.price_per_pocket as signed_amount,
 concat(a.pockets,' ',a.size_code,' @ ',l.price_per_pocket,
        case when a.kind='divert' then concat(' — reallocated: ',coalesce(a.reason,'')) else '' end)
from public.potato_stock_allocation a
join public.potato_presale s on s.presale_id=a.presale_id
join public.potato_presale_line l on l.presale_id=s.presale_id and l.size_code=a.size_code
join public.wb_customer c on c.customer_id=s.customer_id
where a.kind in ('reserve','divert')
union all
select 'payment',p.payment_id::text,p.payment_date,coalesce(p.market_reference,'Payment'),
 coalesce(p.customer_id,0),coalesce(c.customer_name,'Unassigned market'),
 -p.amount::numeric,p.note
from public.potato_market_payment p
left join public.wb_customer c on c.customer_id=p.customer_id;

-- Extend app context without changing legacy WB/UI RPC.
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
 result:=jsonb_set(result,'{contract_fields}',coalesce((
   select jsonb_agg(jsonb_build_object('id',t.tracecode_id,'name',t.tracecode_name,'season_id',t.season_id)
     order by t.tracecode_name)
   from public.v_active_tracecodes t where lower(btrim(t.crop_name))='potatoes'),'[]'::jsonb),true);
 result:=jsonb_set(result,'{field_report_v2}',coalesce((
    select jsonb_agg(to_jsonb(r) order by r.tracecode_name,r.sort_order)
    from public.potato_field_report_v2 r),'[]'::jsonb),true);
 result:=jsonb_set(result,'{transaction_rows}',coalesce((
    select jsonb_agg(to_jsonb(r) order by r.entry_date,r.entry_id)
    from public.potato_market_transaction_v r),'[]'::jsonb),true);
 return result;
end $fn$;
