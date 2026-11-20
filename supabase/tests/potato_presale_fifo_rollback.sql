-- Run AFTER both draft migrations inside BEGIN; always ROLLBACK at end.
-- Test helper changes ONLY exist inside rollback transaction.
create or replace function potato_market_private.is_admin() returns boolean language sql stable as $test$select true$test$;
do $test$
declare cid uuid; did uuid:=gen_random_uuid(); collection_id uuid:=gen_random_uuid(); normal_id uuid:=gen_random_uuid(); new_grading_id uuid:=gen_random_uuid(); wid uuid; second_wid uuid; third_wid uuid; cpos record; amount numeric; admin_id uuid;
begin
  select user_id into admin_id from public.app_user_role where role_name='admin' limit 1;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
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
  -- Collect 100 already-sold pockets without recording a second sale.
  select w.transaction_id into second_wid from public.wb_scale_transaction w
  where w.status='completed' and w.transaction_id<>wid
  and not exists(select 1 from public.wb_potato_dispatch d where d.wb_transaction_id=w.transaction_id)
  limit 1;
  if second_wid is null then raise exception 'No second WB transaction available for test'; end if;
  insert into public.wb_potato_dispatch(dispatch_id,wb_transaction_id,season_id,dnote_number,status)
    values(collection_id,second_wid,17,'QA-COLLECTION-ONLY','issued');
  insert into public.wb_potato_dispatch_line(dispatch_id,size_code,pockets)
    values(collection_id,'LARGE',100);
  perform public.potato_market_allocate_and_price(collection_id,'presale',cid,'{}'::jsonb,null);
  select * into cpos from public.potato_presale_position_v where presale_id=cid and size_code='LARGE';
  if cpos.allocated_to_contract<>350 or cpos.collected_pockets<>100 or cpos.reserved_in_storage<>250
   then raise exception 'Pre-sale collection balance wrong %',row_to_json(cpos); end if;
  if exists(select 1 from public.potato_market_sale where dispatch_id=collection_id)
   then raise exception 'Pre-sale collection was counted as second sale'; end if;
  -- Later grading from contracted field replenishes the diverted quantity first.
  insert into public.wb_potato_grading_batch(grading_id,grading_date,season_id,batch_reference,status,tracecode_id)
    values(new_grading_id,current_date,17,'QA-GRADING-ROLLBACK','posted',550);
  insert into public.wb_potato_grading_line(grading_id,size_code,pockets)
    values(new_grading_id,'LARGE',150);
  select * into cpos from public.potato_presale_position_v where presale_id=cid and size_code='LARGE';
  if cpos.allocated_to_contract<>500 or cpos.awaiting_grading<>0 or cpos.reserved_in_storage<>400
   then raise exception 'Future grading did not replenish contract %',row_to_json(cpos); end if;
  if (select coalesce(sum(a.pockets),0) from public.potato_stock_allocation a
      where a.grading_id=new_grading_id and a.kind='reserve' and a.presale_id=cid)<>150
   then raise exception 'Later grading was not reserved from the incoming batch'; end if;
  if exists(select 1 from public.potato_grade_pool_v where normal_available<0 or reserved_available<0)
   then raise exception 'Negative stock after additional grading'; end if;
  -- Normal third-party dispatch: price entry and field FIFO must be committed together.
  select w.transaction_id into third_wid from public.wb_scale_transaction w
   where w.status='completed' and w.transaction_id not in (wid,second_wid)
     and not exists(select 1 from public.wb_potato_dispatch d where d.wb_transaction_id=w.transaction_id)
   limit 1;
  if third_wid is null then raise exception 'No third WB transaction available for normal sale test'; end if;
  insert into public.wb_potato_dispatch(dispatch_id,wb_transaction_id,season_id,dnote_number,status)
    values(normal_id,third_wid,17,'QA-NORMAL-ROLLBACK','issued');
  insert into public.wb_potato_dispatch_line(dispatch_id,size_code,pockets)
    values(normal_id,'LARGE',10);
  perform public.potato_market_allocate_and_price(normal_id,'normal',null,
    '{"LARGE":{"price":3.00}}'::jsonb,null);
  select sum(l.pockets*l.price_per_pocket) into amount
   from public.potato_market_sale_line l
   join public.potato_market_sale s using(sale_id) where s.dispatch_id=normal_id;
  if amount<>30 then raise exception 'Normal D-Note price was not saved correctly'; end if;
  -- Both reports must reflect contract-priced allocation and third-party sale,
  -- never the physical pre-sale collection as additional revenue.
  select sold_value into amount from public.potato_field_report_v2
    where tracecode_id=550 and size_code='LARGE';
  if amount<>3550 then raise exception 'Field Report sale value expected 3550 got %',amount; end if;
  select coalesce(sum(signed_amount),0) into amount
    from public.potato_market_transaction_v
    where entry_type<>'payment' and (reference='QA-ROLLBACK-ONLY');
  if amount<>3550 then raise exception 'Market Transaction Report value expected 3550 got %',amount; end if;
end $test$;
select 'PASS: FIFO, pre-sale, diversion, collection, normal-sale price save, later grading and reports' as result;
ROLLBACK;