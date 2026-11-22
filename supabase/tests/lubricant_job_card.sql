-- Run on FarmingMain. This transaction leaves no stock movements or Job Cards.
begin;
set local lock_timeout='4s';
set local statement_timeout='55s';
do $test$
declare
  buyer uuid; stores uuid; tractor bigint; own bigint; own_code text; wh bigint; trace bigint; petrol bigint;
  job uuid:=gen_random_uuid(); code text:='QA-LUB-'||job; day date:=(now() at time zone 'Africa/Harare')::date;
  oil bigint; cat bigint; line bigint; doc bigint; movement_line bigint; part bigint;
  posted jsonb; op uuid:=gen_random_uuid(); general_job uuid:=gen_random_uuid(); general_part bigint; before_petrol numeric;
begin
  select u.id into strict buyer from auth.users u where stock_v2.can_buy(u.id) and not (stock_v2.workflow_access(u.id)->>'is_admin')::boolean limit 1;
  select user_id into strict stores from stock_v2.staff_role where role_name='stock' and active and not stock_v2.can_buy(user_id) limit 1;
  select v.vehicle_id,o.owner_id,replace(o.owner_code,'TEST_','') into strict tractor,own,own_code from public.vehicle v
    join public.company c on c.company_id=v.owner_company_id join stock_v2.owner o on o.owner_code='TEST_'||c.stock_owner_code and o.active
    join public.vehicle_type t using(vehicle_type_id) where c.owns_stock and c.owns_vehicles and t.active and v.ownership_status='owned'
    and not v.vehicle_discontinued and not v.is_other and stock_v2.job_asset_group(v.vehicle_id)='vehicle' limit 1;
  select location_id into strict wh from stock_v2.location where location_code='TEST_WH';
  select tracecode_id into strict trace from public.tracecode where upper(tracecode_name)='WORKSHOPHS' and end_date is null;
  select item_id into strict petrol from stock_v2.item where item_name='Petrol' and active limit 1;
  if exists(select from stock_v2.item where item_name='Diesel' and active) or
    not exists(select from stock_v2.item where item_id=petrol and input_type='Fuel') or
    exists(select from stock_v2.item where item_code='CHE425' and input_type='Lubricants') then raise exception 'Fuel or spray oil classification changed'; end if;
  insert into stock_v2.item(item_code,item_name,base_unit,input_type,input_category) values(code,'Gear oil '||code,'L','Fuel','Fuel') returning item_id into oil;
  if not exists(select from stock_v2.item where item_id=oil and input_type='Lubricants') or
     (select count(*) from stock_v2.buying_item_category ic join stock_v2.buying_category c using(category_id) where item_id=oil and c.category_name='Lubricants')<>4
     then raise exception 'New oil was not shared across Job Card catalogues'; end if;
  select category_id into strict cat from stock_v2.buying_category where catalogue_group='vehicle' and category_name='Lubricants';
  insert into stock_v2.job_card(id,vehicle_id,work_description,requested_by) values(job,tractor,'Oil top-up',buyer);
  if exists(select from stock_v2.job_lubricant_inputs where item_id=oil) then raise exception 'Catalogue-only oil reached the Stock Input picker'; end if;
  begin
    insert into stock_v2.job_card_part(job_id,item_id,category_id,requested_quantity) values(job,oil,cat,1);
    raise exception 'Job Card accepted an unregistered lubricant' using errcode='23514';
  exception when raise_exception then if sqlerrm not like 'Choose an active lubricant Stock Input%' then raise; end if; end;
  begin
    insert into stock_v2.buying_item_category(item_id,category_id) values(petrol,cat) on conflict do nothing;
    insert into stock_v2.job_card_part(job_id,item_id,category_id,requested_quantity) values(job,petrol,cat,1);
    raise exception 'Stale category mapping allowed petrol as a lubricant' using errcode='23514';
  exception when raise_exception then if sqlerrm not like 'Choose an active lubricant Stock Input%' then raise; end if; end;
  -- Stock Balances > New Product registers the stock master in the same save.
  insert into stock_v2.product_metadata(item_id,version) values(oil,1);
  if not exists(select from stock_v2.job_lubricant_inputs where item_id=oil) then raise exception 'New Stock Input missing at zero balance'; end if;
  update stock_v2.item set active=false where item_id=oil;
  if exists(select from stock_v2.job_lubricant_inputs where item_id=oil) then raise exception 'Inactive lubricant still offered'; end if;
  update stock_v2.item set active=true where item_id=oil;
  insert into stock_v2.document(document_type,document_number,document_date,status,reason) values('opening',code,day,'draft','Rolled back lubricant fixture') returning document_id into doc;
  foreach line in array array[oil,petrol] loop
    insert into stock_v2.document_line(document_id,item_id,quantity) values(doc,line,10) returning line_id into movement_line;
    insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(movement_line,own,wh,10);
  end loop;
  perform stock_v2.post_draft(doc);
  select quantity into strict before_petrol from stock_v2.quantity_balance where item_id=petrol and owner_id=own and location_id=wh;
  begin
    perform stock_v2.demo_multi('direct_issue',gen_random_uuid(),jsonb_build_object('owner_code',own_code,'tracecode_id',trace,
      'lines',jsonb_build_array(jsonb_build_object('item_code',(select item_code from stock_v2.item where item_id=petrol),'quantity',1,'equipment_other','Workshop'),
      jsonb_build_object('item_code',code,'quantity',1,'equipment_id',tractor))));
    raise exception 'Mixed direct issue accepted' using errcode='23514';
  exception when raise_exception then if sqlerrm not like 'Issue lubricants%' then raise; end if; end;
  if (select quantity from stock_v2.quantity_balance where item_id=petrol and owner_id=own and location_id=wh)<>before_petrol then raise exception 'Rejected issue deducted petrol'; end if;

  begin
    insert into stock_v2.document(document_type,document_number,document_date,status,reason) values('issue',code,day,'draft','Job Card 123') returning document_id into doc;
    insert into stock_v2.document_line(document_id,item_id,quantity,equipment_id) values(doc,oil,1,tractor) returning line_id into movement_line;
    insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(movement_line,own,wh,-1);
    perform stock_v2.post_draft(doc);
    raise exception 'Issue posted without a matching Job Card line' using errcode='23514';
  exception when raise_exception then if sqlerrm not like 'Issue lubricants%' then raise; end if; end;

  perform stock_v2.demo_multi('direct_issue',gen_random_uuid(),jsonb_build_object('owner_code',own_code,'tracecode_id',trace,
    'lines',jsonb_build_array(jsonb_build_object('item_code',(select item_code from stock_v2.item where item_id=petrol),'quantity',1,'equipment_other','Workshop'))));
  if (select quantity from stock_v2.quantity_balance where item_id=petrol and owner_id=own and location_id=wh)<>before_petrol-1 then raise exception 'Petrol Direct Issue failed'; end if;

  insert into stock_v2.job_card_part(job_id,item_id,category_id,requested_quantity) values(job,oil,cat,5) returning id into part;
  insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor) values(gen_random_uuid(),part,5,stores);
  posted:=stock_v2.post_job_part_issue(op,stores,part,3);
  perform stock_v2.post_job_part_issue(op,stores,part,3);
  if (select quantity from stock_v2.quantity_balance where item_id=oil and owner_id=own and location_id=wh)<>7
    or (select quantity from stock_v2.job_part_reserved where part_id=part)<>2
    or not exists(select from stock_v2.job_part_issue x join stock_v2.document_line l using(line_id)
      where x.operation_id=op and x.issued_by=stores and l.quantity=3 and l.equipment_id=tractor) then raise exception 'Equipment partial issue or replay failed'; end if;

  insert into stock_v2.job_card(id,card_type,tracecode_id,work_description,requested_by) values(general_job,'general',trace,'Workshop top-up',buyer);
  insert into stock_v2.job_card_part(job_id,item_id,category_id,requested_quantity) select general_job,oil,category_id,1 from stock_v2.buying_category
    where catalogue_group='general' and category_name='Lubricants' returning id into general_part;
  update stock_v2.job_card_part set owner_id=own where id=general_part and owner_id is null;
  insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor) values(gen_random_uuid(),general_part,1,stores);
  posted:=stock_v2.post_job_part_issue(gen_random_uuid(),stores,general_part,1);
  if not exists(select from stock_v2.document_line l join stock_v2.movement m on m.document_line_id=l.line_id
      where l.document_id=(posted->>'document_id')::bigint and l.item_id=oil and m.owner_id=own and m.external_tracecode_id=trace and m.quantity_delta=-1) then raise exception 'Workshop issue lost its trace or stock owner'; end if;
end $test$;
rollback;
