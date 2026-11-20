-- Run AFTER both draft migrations inside BEGIN; always ROLLBACK at end.
-- Test helper changes ONLY exist inside rollback transaction.
create or replace function potato_market_private.is_admin() returns boolean language sql stable as $test$select true$test$;
do $test$
declare cid uuid; did uuid:=gen_random_uuid(); wid uuid; cpos record; amount numeric;
begin
  perform public.potato_allocate_outgoing(d.dispatch_id,'normal',null,null)
  from (select dispatch_id from public.wb_potato_dispatch where status='issued' order by created_at,dispatch_id) d;
  cid:=public.potato_presale_create('QA-ROLLBACK-ONLY',current_date,1,550,
     '{"LARGE":{"pockets":500,"price":5.00}}'::jsonb,'test');
  select * into cpos from public.potato_presale_position_v where presale_id=cid and size_code='LARGE';
  if cpos.allocated_to_contract<>500 or cpos.sales_value<>2500 then
     raise exception 'Pre-sale reserve failed: % %',cpos.allocated_to_contract,cpos.sales_value; end if;
  select w.transaction_id into wid from public.wb_scale_transaction w
  where w.status='completed' and not exists(select 1 from public.wb_potato_dispatch d where d.wb_transaction_id=w.transaction_id)
  limit 1;
  if wid is null then raise exception 'No spare WB transaction available for test'; end if;
  insert into public.wb_potato_dispatch(dispatch_id,wb_transaction_id,season_id,dnote_number,status)
    values(did,wid,17,'QA-ROLLBACK-ONLY','issued');
  insert into public.wb_potato_dispatch_line(dispatch_id,size_code,pockets)
    values(did,'LARGE',150);
  perform public.potato_market_allocate_and_price(did,'divert',cid,'{"LARGE":{"price":7.00}}'::jsonb,'QA diversion test');
  select * into cpos from public.potato_presale_position_v where presale_id=cid and size_code='LARGE';
  if cpos.allocated_to_contract<>350 or cpos.awaiting_grading<>150
    or cpos.reserved_in_storage<>350 or cpos.sales_value<>1750
  then raise exception 'Diversion did not replenish obligation correctly: %',row_to_json(cpos); end if;
  select sum(l.pockets*l.price_per_pocket) into amount
   from public.potato_market_sale_line l join public.potato_market_sale s using(sale_id)
   where s.dispatch_id=did;
  if amount<>1050 then raise exception 'Third party revenue expected 1050 got %',amount; end if;
  if exists(select 1 from public.potato_grade_pool_v where normal_available<0 or reserved_available<0)
   then raise exception 'Negative stock pool'; end if;
end $test$;
select 'PASS: FIFO historic dispatch + reserve 500 at $5 + divert 150 at $7, contract outstanding 150' as result;
ROLLBACK;