-- Run on FarmingMain. All companies, documents and stock movements roll back.
begin;
set local lock_timeout='4s';
set local statement_timeout='45s';
do $test$
declare
 test_company bigint; owner bigint; company_code text; tag text:='QA-ISSUE-'||gen_random_uuid();
 wh bigint; item bigint; doc bigint; line bigint; field bigint; workshop bigint; spray_kind text; spray bigint;
 buyer uuid; stores uuid; job uuid:=gen_random_uuid(); part bigint; cat bigint; issued jsonb; direct_op uuid:=gen_random_uuid();
 body jsonb; posted_before bigint;
begin
 insert into public.company(company_name,owns_stock,owns_vehicles) values(tag,false,false) returning company_id into test_company;
 if exists(select from stock_v2.issue_company where company_id=test_company) then raise exception 'Unchecked company offered'; end if;
 update public.company set owns_stock=true where company_id=test_company returning stock_owner_code into company_code;
 select owner_id into strict owner from stock_v2.issue_company where company_id=test_company and enabled and company_name=tag;
 select location_id into strict wh from stock_v2.location where location_code='TEST_WH';
 select tracecode_id into strict field from public.tracecode where end_date is null and tracecode_size>=1 limit 1;
 select tracecode_id into strict workshop from public.tracecode where end_date is null and upper(tracecode_name)='WORKSHOPHS';
 select spray_type_name into strict spray_kind from stock_v2.access_spray_type_catalog limit 1;
 select u.id into strict buyer from auth.users u where stock_v2.can_buy(u.id) and not (stock_v2.workflow_access(u.id)->>'is_admin')::boolean limit 1;
 select user_id into strict stores from stock_v2.staff_role where role_name='stock' and active limit 1;
 insert into stock_v2.item(item_name,item_code,input_type,input_category,base_unit) values(tag,tag,'General','Supplies','each') returning item_id into item;
 insert into stock_v2.document(document_type,document_number,document_date,status) values('opening',tag,current_date,'draft') returning document_id into doc;
 insert into stock_v2.document_line(document_id,item_id,quantity) values(doc,item,20) returning line_id into line;
 insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(line,owner,wh,20);
 perform stock_v2.post_draft(doc);
 body:=jsonb_build_object('owner_code',company_code,'tracecode_id',field,'lines',jsonb_build_array(jsonb_build_object('item_code',tag,'quantity',1)));
 issued:=stock_v2.demo_multi('direct_issue',direct_op,body);
 if not exists(select from stock_v2.issue_item_balances where item_id=item and (owner_quantities->>company_code)::numeric=19) then raise exception 'Incorrect company balance after Direct Issue'; end if;
 perform stock_v2.demo_multi('spray',gen_random_uuid(),body||jsonb_build_object('area_ha',1,'part_label','Whole trace','spray_type',spray_kind,'water_rate',200,
   'lines',jsonb_build_array(jsonb_build_object('item_code',tag,'rate_per_ha',1))));
 select j.job_id into strict spray from stock_v2.spray_job j where j.owner_id=owner;
 perform stock_v2.demo_multi('planned_issue',gen_random_uuid(),body||jsonb_build_object('job_id',spray));
 insert into stock_v2.job_card(id,card_type,tracecode_id,work_description,requested_by) values(job,'general',workshop,'QA stock owner',buyer);
 insert into stock_v2.buying_category(catalogue_group,category_name) values('general',tag) returning category_id into cat;
 insert into stock_v2.buying_item_category(item_id,category_id) values(item,cat);
 insert into stock_v2.job_card_part(job_id,category_id,item_id,owner_id,requested_quantity) values(job,cat,item,owner,5) returning id into part;
 insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor) values(gen_random_uuid(),part,4,stores);
 perform stock_v2.post_job_part_issue(gen_random_uuid(),stores,part,2);
 select count(*) into posted_before from stock_v2.movement where owner_id=owner;
 update public.company set owns_stock=false where company_id=test_company;
 if exists(select from stock_v2.issue_company where company_id=test_company and enabled) then raise exception 'Disabled company selectable'; end if;
 begin
   perform stock_v2.demo_multi('direct_issue',gen_random_uuid(),body);
   raise exception 'Disabled direct issue posted' using errcode='23514';
 exception when raise_exception then if sqlerrm not like 'Choose a company enabled%' then raise; end if; end;
 begin
   perform stock_v2.demo_multi('planned_issue',gen_random_uuid(),body||jsonb_build_object('job_id',spray));
   raise exception 'Disabled planned issue posted' using errcode='23514';
 exception when raise_exception then if sqlerrm not like 'Choose a company enabled%' then raise; end if; end;
 begin
   perform stock_v2.post_job_part_issue(gen_random_uuid(),stores,part,1);
   raise exception 'Disabled Job Card issue posted' using errcode='23514';
 exception when raise_exception then if sqlerrm not like 'Choose a company enabled%' then raise; end if; end;
 begin
   insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor) values(gen_random_uuid(),part,1,stores);
   raise exception 'Disabled company reserved' using errcode='23514';
 exception when raise_exception then if sqlerrm not like 'Choose a company enabled%' then raise; end if; end;
 if (stock_v2.demo_multi('direct_issue',direct_op,body)->>'document_id') is distinct from issued->>'document_id' then raise exception 'Historical replay lost original issue'; end if;
 if (select count(*) from stock_v2.movement where owner_id=owner)<>posted_before
   or not exists(select from stock_v2.quantity_balance where owner_id=owner and item_id=item and location_id=wh and quantity=16)
   then raise exception 'Failed issue changed stock'; end if;
 insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor) values(gen_random_uuid(),part,-1,stores);
 update public.company set owns_stock=true where company_id=test_company;
 if not exists(select from stock_v2.issue_company where company_id=test_company and owner_id=owner and enabled) then raise exception 'Re-enabled company lost its ledger'; end if;
end $test$;
rollback;
