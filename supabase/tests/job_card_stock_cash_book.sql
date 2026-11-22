-- Run as database administrator on FarmingMain. All test documents roll back.
begin;
set local lock_timeout='3s';
set local statement_timeout='55s';
do $accept$
declare
  admin_user uuid; buyer uuid; vehicle bigint; own bigint; owner_code_text text;
  supplier_id_test bigint; supplier text; trace bigint; category bigint; part_item bigint; part bigint;
  job uuid:=gen_random_uuid(); quote uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid();
  authorisation uuid:=gen_random_uuid(); trip uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid();
  account uuid:=gen_random_uuid(); advance uuid:=gen_random_uuid(); change_id uuid:=gen_random_uuid();
  general_job uuid:=gen_random_uuid(); stationery bigint; expense_line bigint; expense uuid:=gen_random_uuid();
  code text:='QA-'||job; day date:=(current_timestamp at time zone 'Africa/Harare')::date;
  submitted jsonb; approval jsonb; ordered jsonb; order_id_test bigint; purchased_line_id bigint; posted jsonb; invoice bigint;
  ineligible_asset bigint; returned_receipt uuid:=gen_random_uuid(); issue_id uuid:=gen_random_uuid(); issued jsonb;
begin
  select user_id into strict admin_user from public.app_user_role where lower(role_name)='admin' order by user_id limit 1;
  select user_id into strict buyer from public.app_user_role where lower(role_name)='fuel' order by user_id limit 1;
  insert into stock_v2.buying_staff_role(user_id,role_name,assigned_by) values(buyer,'buyer',admin_user),(buyer,'driver',admin_user) on conflict do nothing;
  select v.vehicle_id,o.owner_id,c.stock_owner_code into strict vehicle,own,owner_code_text
    from public.vehicle v join public.company c on c.company_id=v.owner_company_id
    join stock_v2.owner o on o.owner_code='TEST_'||c.stock_owner_code
    join public.vehicle_type t using(vehicle_type_id)
    where v.ownership_status='owned' and not v.vehicle_discontinued and not v.is_other and c.owns_vehicles and c.owns_stock
      and t.active and stock_v2.job_asset_group(v.vehicle_id)='vehicle' and o.active order by v.vehicle_id limit 1;
  select supplier_id,supplier_name into strict supplier_id_test,supplier from stock_v2.supplier where active order by supplier_id limit 1;
  select vehicle_id into ineligible_asset from public.vehicle where ownership_status='hired' or vehicle_discontinued order by vehicle_id limit 1;
  if ineligible_asset is not null then
    begin
      insert into stock_v2.job_card(id,vehicle_id,work_description,requested_by) values(gen_random_uuid(),ineligible_asset,'Unavailable equipment',buyer);
      raise exception 'Accepted an ineligible asset' using errcode='23514';
    exception when raise_exception then if sqlerrm<>'Choose active owned equipment with an owner company' then raise; end if; end;
  end if;
  begin
    insert into stock_v2.irrigation_asset_farm select vehicle,farm_id from public.farm limit 1;
    raise exception 'Accepted a fixed farm on mobile equipment' using errcode='23514';
  exception when raise_exception then if sqlerrm<>'A fixed farm applies only to a pump or pivot' then raise; end if; end;
  insert into stock_v2.item(item_code,item_name,base_unit,buying_part_number) values(code,'Acceptance bearing','each',code) returning item_id into part_item;
  select category_id into strict category from stock_v2.buying_category where catalogue_group='vehicle' and category_name ilike '%bearing%' limit 1;
  insert into stock_v2.buying_item_category select part_item,category;
  insert into stock_v2.buying_item_category select part_item,category_id from stock_v2.buying_category where catalogue_group='irrigation' and category_name ilike '%bearing%' limit 1;
  if (select count(*) from stock_v2.buying_item_category where item_id=part_item)<>2 then raise exception 'Shared bearing catalogue failed'; end if;
  insert into stock_v2.job_card(id,vehicle_id,work_description,requested_by) values(job,vehicle,'Replace worn bearing',buyer);
  insert into stock_v2.job_card_part(job_id,item_id,category_id,requested_quantity) values(job,part_item,category,2) returning id into part;
  if not exists(select from stock_v2.job_card_part where id=part and owner_id=own and unit_price is null) then raise exception 'Asset owner or optional price failed'; end if;
  insert into stock_v2.job_part_quote(id,part_id,supplier_id,quote_reference,quote_date,currency,unit_price,quoted_by)
    values(quote,part,supplier_id_test,code,day,'USD',15,admin_user);
  submitted:=stock_v2.buying_workflow_command(buyer,gen_random_uuid(),'submit',jsonb_build_object('id',request_id,'kind','po','payload',
    jsonb_build_object('owner_code',owner_code_text,'supplier',supplier,'order_date',day,'source_job_card_id',job,'source_quote_id',quote,
    'contract_id',(select contract_id from stock_v2.contracts where active limit 1),
    'lines',jsonb_build_array(jsonb_build_object('item_code',code,'quantity',2,'unit_price',15)))));
  approval:=jsonb_build_object('id',request_id,'version',submitted->'version','payment_terms','Cash on collection');
  begin
    perform stock_v2.buying_authorise_po(admin_user,gen_random_uuid(),approval-'payment_terms');
    raise exception 'Authorised PO without payment terms' using errcode='23514';
  exception when raise_exception then if sqlerrm not like 'Enter payment terms%' then raise; end if; end;
  ordered:=stock_v2.buying_authorise_po(admin_user,authorisation,approval);
  order_id_test:=(ordered->>'target_order_id')::bigint;
  if stock_v2.buying_authorise_po(admin_user,authorisation,approval)->>'target_order_id' is distinct from order_id_test::text
    or not exists(select from stock_v2.order_header where order_id=order_id_test and payment_terms='Cash on collection') then raise exception 'PO terms or replay failed'; end if;
  select l.order_line_id into strict purchased_line_id from stock_v2.job_purchase_line l where l.part_id=part and l.quote_id=quote;
  insert into stock_v2.town_trip(id,trip_date,driver_id,created_by) values(trip,day,buyer,admin_user);
  insert into stock_v2.town_trip_order(trip_id,order_id,outcome,checked_by,checked_at) values(trip,order_id_test,'collected',buyer,now());
  insert into cash_book.account(id,name,currency,opening_date,opening_balance,created_by) values(account,code,'USD',day,100,admin_user);
  insert into cash_book.entry(id,kind,currency,account_id,amount,entry_date,value_date,reference,narrative,counterparty,status,created_by,decided_by,decided_at)
    values(advance,'payment','USD',account,50,day,day,code,'Trip advance','QA Buyer','confirmed',admin_user,admin_user,now());
  insert into cash_book.trip_advance values(advance,trip,account,50);
  insert into stock_v2.receipt_verification(id,receipt_action,submitted_by,town_trip_id,payload) values(receipt,'combined_grv',buyer,trip,
    jsonb_build_object('owner_code',owner_code_text,'supplier',supplier,'invoice_number',code,'invoice_date',day,
      'invoice_lines',jsonb_build_array(jsonb_build_object('item_code',code,'invoice_quantity',2,'unit_price',15)),'allocations','[]'::jsonb,
      'new_receipts',jsonb_build_array(jsonb_build_object('item_code',code,'quantity',2)),
      'po_allocations',jsonb_build_array(jsonb_build_object('order_line_id',purchased_line_id,'item_code',code,'quantity',2))));
  begin
    perform stock_v2.buying_decide_receipt(buyer,receipt,'verify');
    raise exception 'Buyer verified a receipt';
  exception when insufficient_privilege then null; end;
  insert into stock_v2.receipt_verification(id,receipt_action,submitted_by,payload) values(returned_receipt,'combined_grv',buyer,'{}');
  perform stock_v2.buying_decide_receipt(admin_user,returned_receipt,'return','Invoice amount needs correction');
  if not exists(select from stock_v2.receipt_verification where id=returned_receipt and status='returned' and posting_result is null) then raise exception 'Returned receipt posted stock'; end if;
  if exists(select from stock_v2.quantity_balance where item_id=part_item and quantity<>0)
     or (select received_quantity from stock_v2.order_line where order_line_id=purchased_line_id)<>0 then raise exception 'Pending receipt changed stock'; end if;
  posted:=stock_v2.buying_decide_receipt(admin_user,receipt,'verify');
  invoice:=(posted->>'grv_id')::bigint;
  if stock_v2.buying_decide_receipt(admin_user,receipt,'verify') is distinct from posted
      or (select sum(quantity) from stock_v2.quantity_balance where item_id=part_item) is distinct from 2::numeric then raise exception 'Receipt verification or replay failed'; end if;
  if not exists(select from stock_v2.job_asset_purchase_history h where h.vehicle_id=vehicle and h.item_id=part_item and h.supplier_name=supplier and h.unit_price=15)
    or exists(select from stock_v2.job_asset_purchase_history h where h.vehicle_id<>vehicle and h.item_id=part_item) then raise exception 'Equipment history attribution failed'; end if;
  insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor) values(gen_random_uuid(),part,2,buyer);
  issued:=stock_v2.post_job_part_issue(issue_id,buyer,part,2);
  if stock_v2.post_job_part_issue(issue_id,buyer,part,2) is distinct from issued then raise exception 'Replayed stock issue differs'; end if;
  if not exists(select from stock_v2.job_part_usage where part_id=part and issued_quantity=2 and repair_cost=30 and pending_cost_lines=0) then raise exception 'Issued part cost is wrong'; end if;
  insert into cash_book.entry(id,kind,currency,account_id,amount,entry_date,value_date,reference,narrative,counterparty,status,created_by,decided_by,decided_at)
    values(change_id,'receipt','USD',account,20,day,day,'R-'||code,'Return trip cash','QA Buyer','confirmed',admin_user,admin_user,now());
  insert into cash_book.trip_settlement(advance_id,id,spend,cash_returned,receipt_reference,return_entry_id,settled_date,settled_by)
    values(advance,gen_random_uuid(),30,20,code,change_id,day,admin_user);
  insert into cash_book.trip_invoice_payment(advance_id,grv_id,amount) values(advance,invoice,30);
  if not exists(select from cash_book.verified_invoice_balance where id=invoice and paid=30 and available=0)
    or not exists(select from cash_book.account_balance where id=account and balance=70) then raise exception 'Trip settlement or invoice balance failed'; end if;
  select tracecode_id into strict trace from public.tracecode where upper(tracecode_name)='ADMINHS' and end_date is null limit 1;
  insert into stock_v2.job_card(id,card_type,tracecode_id,work_description,requested_by) values(general_job,'general',trace,'Office stationery purchase',buyer);
  select i.item_id,c.category_id into strict stationery,category from stock_v2.item i join stock_v2.buying_item_category ic using(item_id)
    join stock_v2.buying_category c using(category_id) where i.item_code='GENERAL-STATIONERY' and c.catalogue_group='general';
  insert into stock_v2.job_card_part(job_id,item_id,category_id,requested_quantity) values(general_job,stationery,category,1) returning id into expense_line;
  insert into cash_book.entry(id,kind,currency,account_id,amount,entry_date,value_date,reference,narrative,counterparty,created_by)
    values(expense,'payment','USD',account,5,day,day,'S-'||code,'One stationery purchase','QA Buyer',admin_user);
  insert into cash_book.job_expense values(expense,expense_line,5);
  update cash_book.entry set status='confirmed',decided_by=admin_user,decided_at=now() where id=expense;
  if not exists(select from cash_book.job_expense_cost where part_id=expense_line and amount=5)
    or not exists(select from cash_book.account_balance where id=account and balance=65)
    or exists(select from stock_v2.quantity_balance where item_id=stationery and quantity<>0) then raise exception 'Direct expense failed'; end if;
  insert into cash_book.entry(id,kind,currency,account_id,amount,entry_date,value_date,reference,narrative,counterparty,status,created_by,decided_by,decided_at,reversal_of)
    values(gen_random_uuid(),'payment','USD',account,5,day,day,'V-'||code,'Reverse test expense','QA Buyer','confirmed',admin_user,admin_user,now(),expense);
  if exists(select from cash_book.job_expense_cost where part_id=expense_line) or not exists(select from cash_book.account_balance where id=account and balance=70) then raise exception 'Expense reversal failed'; end if;
end $accept$;
rollback;
