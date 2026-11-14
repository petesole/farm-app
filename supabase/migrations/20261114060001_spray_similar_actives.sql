-- Development/test only. No inventory postings or historical rate rewrites.
-- PR #18 active ingredient migration must be installed first.
alter table stock_v2.spray_job add column if not exists allocation_groups jsonb;
-- Preserve the dependent view definition, owner, options and privileges while widening rates.
-- No CASCADE: an unexpected dependency aborts the migration without removing it.
do $precision$
declare definition text; view_owner text; options text; grant_row record; grants jsonb; triggers jsonb; trigger_row record;
begin
 select pg_get_viewdef(c.oid),pg_get_userbyid(c.relowner),array_to_string(c.reloptions,','),
 (select jsonb_agg(jsonb_build_object('grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable)) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)
 into definition,view_owner,options,grants from pg_class c where c.oid='stock_v2.spray_job_outstanding'::regclass;
 select jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid),'enabled',tgenabled)) into triggers from pg_trigger where tgrelid='stock_v2.spray_job_input'::regclass and not tgisinternal;
 for trigger_row in select * from jsonb_to_recordset(triggers) as t(name text,definition text,enabled text) loop
 execute format('drop trigger %I on stock_v2.spray_job_input',trigger_row.name);
 end loop;
 drop view stock_v2.spray_job_outstanding;
 alter table stock_v2.spray_job_input alter column rate_per_ha type numeric(24,12);
 for trigger_row in select * from jsonb_to_recordset(triggers) as t(name text,definition text,enabled text) loop
 execute trigger_row.definition;
 if trigger_row.enabled<>'O' then execute format('alter table stock_v2.spray_job_input %s trigger %I',case trigger_row.enabled when 'D' then 'disable' when 'R' then 'enable replica' else 'enable always' end,trigger_row.name);end if;
 end loop;
 execute 'create view stock_v2.spray_job_outstanding'||case when options is null then '' else ' with ('||options||')' end||' as '||definition;
 execute format('alter view stock_v2.spray_job_outstanding owner to %I',view_owner);
 -- Remove any CREATE-time default grants before restoring the original ACL exactly.
 for grant_row in select distinct a.grantee from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='stock_v2.spray_job_outstanding'::regclass loop
 execute format('revoke all on stock_v2.spray_job_outstanding from %s',case when grant_row.grantee=0 then 'public' else quote_ident(pg_get_userbyid(grant_row.grantee)) end);
 end loop;
 for grant_row in select * from jsonb_to_recordset(grants) as g(grantee oid,privilege text,grantable boolean) loop
 execute format('grant %s on stock_v2.spray_job_outstanding to %s%s',grant_row.privilege,case when grant_row.grantee=0 then 'public' else quote_ident(pg_get_userbyid(grant_row.grantee)) end,case when grant_row.grantable then ' with grant option' else '' end);
 end loop;
end $precision$;

CREATE OR REPLACE FUNCTION stock_v2.demo_multi(p_action text, p_request uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'stock_v2'
AS $function$
declare own bigint;loc bigint;doc bigint;ord bigint;job bigint;ln bigint;it bigint;ol bigint;req bigint;tr bigint;contract bigint;targetown bigint;qty numeric;rate numeric;area numeric;old_qty numeric;avail numeric;el jsonb;code text;res jsonb;arr jsonb:='[]'::jsonb;ct int:=0; recost_item bigint; cost_run_id bigint; cost_runs jsonb:='[]'::jsonb; cost_pending jsonb:='[]'::jsonb;
begin
 if p_action not in ('order','grv','direct_grv','spray','planned_issue','direct_issue','ownership_transfer') or p_request is null then raise exception 'Invalid operation';end if;
 if jsonb_typeof(p_data->'lines') is distinct from 'array' then raise exception 'Product lines are required';end if;
  if jsonb_array_length(p_data->'lines') not between 1 and 30 then raise exception 'Provide 1-30 product lines';end if;
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select result into res from stock_v2.demo_workflow_requests where request_id=p_request; if found then return res||jsonb_build_object('replayed',true);end if;
 select owner_id into own from stock_v2.owner where owner_code='TEST_'||coalesce(nullif(p_data->>'owner_code',''),'JS') and active;
 if own is null then raise exception 'Unknown test stock owner';end if;
 if p_action in ('grv','direct_grv') then
  if coalesce(p_data->>'receipt_mode','') not in ('dnote','invoice') then raise exception 'Choose DNote or Invoice GRV';end if;
  if p_data->>'receipt_mode'='dnote' and nullif(btrim(p_data->>'delivery_note'),'') is null then raise exception 'Delivery Note Number required';end if;
  if p_data->>'receipt_mode'='invoice' and nullif(btrim(p_data->>'invoice_number'),'') is null then raise exception 'Supplier Invoice Number required';end if;
  if p_data->>'receipt_mode'='invoice' and exists(select 1 from jsonb_array_elements(p_data->'lines') x where nullif(x->>'unit_price','') is null or (x->>'unit_price')::numeric<=0) then raise exception 'Invoice GRVs require positive unit prices for every line';end if;
  if nullif(p_data->>'receipt_date','') is null then raise exception 'Receipt date required';end if;
 end if;
 if p_action='direct_grv' and not exists(select 1 from stock_v2.owner_policy where owner_id=own and allow_direct_grv) then raise exception 'This stock owner requires a PO-linked GRV';end if;
 if p_action in ('spray','planned_issue','direct_issue') and own not in (select owner_id from stock_v2.owner where owner_code in ('TEST_JS','TEST_AO')) then raise exception 'Choose HS or AO test stock owner';end if;
 if p_action='ownership_transfer' then
  select owner_id into targetown from stock_v2.owner where owner_code='TEST_'||coalesce(nullif(p_data->>'to_owner_code',''),'') and active;
  if targetown is null or targetown=own then raise exception 'Choose another active test stock owner';end if;
 end if;
 if p_action in ('order','direct_grv') then
  select default_contract_id into contract from stock_v2.owner_policy where owner_id=own;
  if contract is null then contract:=nullif(p_data->>'contract_id','')::bigint;end if;
 end if;
 select location_id into loc from stock_v2.location where location_code='TEST_WH';
 if p_action in ('spray','planned_issue','direct_issue') then
  tr:=nullif(p_data->>'tracecode_id','')::bigint;
  if p_action='planned_issue' then
   job:=(p_data->>'job_id')::bigint;
   select external_tracecode_id into tr from stock_v2.spray_job where job_id=job and owner_id=own and status='planned';
  end if;
  if tr is null or not exists(select 1 from public.tracecode where tracecode_id=tr) then raise exception 'Valid tracecode required';end if;
 end if;
 if p_action='order' then
  insert into stock_v2.order_header(order_number,owner_id,supplier_name,status,order_date)
  values('DEMO-PO-'||p_request,own,coalesce(nullif(p_data->>'supplier',''),'DEMO Supplier'),'approved',coalesce(nullif(p_data->>'order_date','')::date,current_date)) returning order_id into ord;
  if exists(select 1 from stock_v2.owner_policy where owner_id=own and po_requires_contract) and (contract is null or not exists(select 1 from stock_v2.contracts where contract_id=contract and active)) then raise exception 'Active contract required';end if;
  update stock_v2.order_header set contract_id=contract where order_id=ord;
 elsif p_action='grv' then
  ord:=(p_data->>'order_id')::bigint;
  if not exists(select 1 from stock_v2.order_header where order_id=ord and owner_id=own and status='approved') then raise exception 'Outstanding test order required';end if;
  select contract_id into contract from stock_v2.order_header where order_id=ord;
  -- Older demo POs may predate contract assignment. Keep those receivable; new orders require contracts according to owner policy.
  insert into stock_v2.document(document_type,document_number,document_date,status,reason)
  values('grv','DEMO-GRV-'||p_request,(p_data->>'receipt_date')::date,'draft','Test GRV against order '||ord) returning document_id into doc;
  insert into stock_v2.grv_detail(document_id,supplier_name,delivery_note,price_status)
  select doc,supplier_name,coalesce(nullif(p_data->>'delivery_note',''),'DEMO-DN-'||p_request),'pending'
  from stock_v2.order_header where order_id=ord;
  update stock_v2.document set contract_id=contract where document_id=doc;
  update stock_v2.grv_detail set invoice_number=nullif(p_data->>'invoice_number',''),
    delivery_note_date=case when p_data->>'receipt_mode'='dnote' then (p_data->>'receipt_date')::date else null end,
    invoice_date=case when p_data->>'receipt_mode'='invoice' then (p_data->>'receipt_date')::date else null end,
    price_status=case when p_data->>'receipt_mode'='invoice' then 'confirmed' else 'pending' end where document_id=doc;
 elsif p_action='direct_grv' then
  insert into stock_v2.document(document_type,document_number,document_date,status,reason,contract_id)
  values('grv','DEMO-DIRECT-GRV-'||p_request,(p_data->>'receipt_date')::date,'draft','Direct GRV',contract) returning document_id into doc;
  insert into stock_v2.grv_detail(document_id,supplier_name,delivery_note,price_status)
  values(doc,coalesce(nullif(p_data->>'supplier',''),'Direct supplier'),coalesce(nullif(p_data->>'delivery_note',''),'DEMO-DIRECT-'||p_request),case when p_data->>'receipt_mode'='invoice' then 'confirmed' else 'pending' end);
  update stock_v2.grv_detail set invoice_number=nullif(p_data->>'invoice_number',''),
    delivery_note_date=case when p_data->>'receipt_mode'='dnote' then (p_data->>'receipt_date')::date else null end,
    invoice_date=case when p_data->>'receipt_mode'='invoice' then (p_data->>'receipt_date')::date else null end where document_id=doc;
 elsif p_action='ownership_transfer' then
  insert into stock_v2.document(document_type,document_number,document_date,status,reason)
  values('ownership_transfer','DEMO-TR-'||p_request,current_date,'draft',coalesce(p_data->>'owner_code','')||' to '||coalesce(p_data->>'to_owner_code','')) returning document_id into doc;
 elsif p_action='spray' then
  area:=(p_data->>'area_ha')::numeric;
  if (p_data->>'part_label') is null then raise exception 'Part required'; end if;
  if (p_data->>'spray_type') is null then raise exception 'Spray Type required'; end if;
  if not exists(select 1 from stock_v2.access_spray_type_catalog where spray_type_name=p_data->>'spray_type') then raise exception 'Unknown spray type'; end if;
  if area > (select tracecode_size from public.tracecode where tracecode_id=tr) then raise exception 'Spray part area exceeds tracecode hectares';end if;
  if area<=0 or area>10000 then raise exception 'Invalid area';end if;
  insert into stock_v2.spray_job(external_tracecode_id,owner_id,planned_week_start,area_ha,spray_type,job_tracking_code,water_litres_per_ha)
  values(tr,own,coalesce(nullif(p_data->>'planned_week_start','')::date,date_trunc('week',current_date)::date),area,coalesce(p_data->>'spray_type','DEMO Boom'),'DEMO',coalesce((p_data->>'water_rate')::numeric,200))
  returning job_id into job;
  update stock_v2.spray_job set sprayer_asset_code=nullif(p_data->>'sprayer_asset_code',''),part_label=nullif(p_data->>'part_label',''),
  setup_id=(select setup_id from stock_v2.sprayer_setup where setup_name=p_data->>'spray_type' and active=true limit 1)
  where job_id=job;
  update stock_v2.spray_job set allocation_groups=p_data->'allocation_groups' where job_id=job;
 elsif p_action in ('planned_issue','direct_issue') then
  insert into stock_v2.document(document_type,document_number,document_date,status,reason)
  values('issue','DEMO-ISS-'||p_request,current_date,'draft',p_action) returning document_id into doc;
 end if;
 for el in select value from jsonb_array_elements(p_data->'lines') loop
  code:=el->>'item_code';
  if code is null or length(code)=0 then raise exception 'Product code required';end if;
  if exists(select 1 from jsonb_array_elements(arr) x where x->>'item_code'=code) then raise exception 'Duplicate product %',code;end if;
  select item_id into it from stock_v2.item where item_code=code and active=true;
  if it is null then raise exception 'Product unavailable';end if;
  if p_action='spray' then
   rate:=(el->>'rate_per_ha')::numeric;
   if rate<=0 or rate>10000 then raise exception 'Invalid rate for %',code;end if;
   insert into stock_v2.spray_job_input(job_id,item_id,rate_per_ha) values(job,it,rate);
   qty:=rate*area;
  else
   qty:=(el->>'quantity')::numeric;
   if qty<=0 or qty>100000 then raise exception 'Invalid quantity for %',code;end if;
  end if;
  if p_action='order' then
   insert into stock_v2.order_line(order_id,item_id,ordered_quantity,received_quantity,ordered_unit_price)
   values(ord,it,qty,0,(el->>'unit_price')::numeric);
  elsif p_action='direct_grv' then
   insert into stock_v2.document_line(document_id,item_id,quantity,note) values(doc,it,qty,'Direct GRV') returning line_id into ln;
   insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(ln,own,loc,qty);
   insert into stock_v2.grv_line_price(line_id,actual_unit_cost) values(ln,
      case when p_data->>'receipt_mode'='invoice' then (el->>'unit_price')::numeric else null end);
  elsif p_action='ownership_transfer' then
   if coalesce((select sum(quantity_delta) from stock_v2.movement m join stock_v2.document_line d on d.line_id=m.document_line_id where m.owner_id=own and m.location_id=loc and d.item_id=it),0)<qty then raise exception 'Insufficient source owner stock for %',code;end if;
   insert into stock_v2.document_line(document_id,item_id,quantity,note) values(doc,it,qty,'JS/AO ownership transfer') returning line_id into ln;
   insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(ln,own,loc,-qty);
   insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(ln,targetown,loc,qty);
   insert into stock_v2.owner_charge(document_line_id,from_owner_id,to_owner_id,quantity,charge_status,valuation_amount)
   values(ln,own,targetown,qty,'unpriced',null);
  elsif p_action='grv' then
   select order_line_id,ordered_quantity-received_quantity into ol,avail
   from stock_v2.order_line where order_id=ord and item_id=it for update;
   if ol is null or qty>avail then raise exception 'Quantity exceeds outstanding order for %',code;end if;
   insert into stock_v2.document_line(document_id,item_id,quantity,note) values(doc,it,qty,'Test GRV') returning line_id into ln;
   insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(ln,own,loc,qty);
   update stock_v2.order_line set received_quantity=received_quantity+qty where order_line_id=ol;
   insert into stock_v2.demo_grv_line_link(document_id,order_line_id,qty,received_unit_price)
   values(doc,ol,qty,case when p_data->>'receipt_mode'='invoice' then (el->>'unit_price')::numeric else null end);
   insert into stock_v2.grv_line_price(line_id,actual_unit_cost) values(ln,
      case when p_data->>'receipt_mode'='invoice' then (el->>'unit_price')::numeric else null end);
  elsif p_action in ('planned_issue','direct_issue') then
   if p_action='planned_issue' then
    select ji.requirement_id,ji.rate_per_ha*j.area_ha into req,avail from stock_v2.spray_job_input ji
    join stock_v2.spray_job j on j.job_id=ji.job_id where j.job_id=job and ji.item_id=it;
    if req is null then raise exception 'Product % not in spray programme',code;end if;
    select coalesce(sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end),0) into old_qty from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id
    where dl.requirement_id=req and d.status='posted' and d.document_type in ('issue','return');
    if qty>avail-old_qty+0.000001 then raise exception 'Issue exceeds outstanding spray quantity for %',code;end if;
   else req:=null;end if;
   insert into stock_v2.document_line(document_id,item_id,quantity,requirement_id,note) values(doc,it,qty,req,case when p_action='direct_issue' then nullif(el->>'mix_instruction','') else 'DEMO issue' end) returning line_id into ln;
   insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta,external_tracecode_id) values(ln,own,loc,-qty,tr);
  end if;
  arr:=arr||jsonb_build_array(jsonb_build_object('item_code',code,'quantity',qty));ct:=ct+1;
 end loop;
 if ct=0 then raise exception 'Cannot post an empty document';end if;
 if doc is not null then perform stock_v2.post_draft(doc);end if;
 if p_action='planned_issue' then
 update stock_v2.spray_job set status='completed' where job_id=job and not exists(
  select 1 from stock_v2.spray_job_input ji where ji.job_id=job and ji.rate_per_ha*(select area_ha from stock_v2.spray_job where job_id=job)>
  coalesce((select sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end) from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id
   where dl.requirement_id=ji.requirement_id and d.status='posted' and d.document_type in ('issue','return')),0)+0.000001);
 end if;
 if p_action in ('grv','direct_grv') and p_data->>'receipt_mode'='invoice' then
  for recost_item in select distinct item_id from stock_v2.document_line where document_id=doc loop
    begin
      cost_run_id:=stock_v2.recalculate_demo_item_costs(recost_item,'Invoice '||(p_data->>'invoice_number')||' GRV '||doc);
      cost_runs:=cost_runs||jsonb_build_array(jsonb_build_object('item_id',recost_item,'run_id',cost_run_id));
    exception when others then
      cost_pending:=cost_pending||jsonb_build_array(jsonb_build_object('item_id',recost_item,'reason',sqlerrm));
    end;
  end loop;
 end if;
 res:=jsonb_build_object('order_id',ord,'document_id',doc,'job_id',job,'lines',arr,'cost_runs',cost_runs,'cost_pending',cost_pending);
 insert into stock_v2.demo_workflow_requests(request_id,action,result) values(p_request,p_action,res);
 return res;
end $function$
;

CREATE OR REPLACE FUNCTION stock_v2.demo_edit_spray(p_job_id bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'stock_v2'
AS $function$
declare j stock_v2.spray_job%rowtype; own bigint; trarea numeric; area numeric; line jsonb; code text; itemid bigint; n int:=0; names text[]:=array[]::text[]; resultlines jsonb:='[]'::jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select owner_id into own from stock_v2.owner where owner_code='TEST_'||coalesce(nullif(p_data->>'owner_code',''),'JS') and active and owner_code in ('TEST_JS','TEST_AO');
 select * into j from stock_v2.spray_job where job_id=p_job_id and owner_id=own for update;
 if not found or j.status<>'planned' then raise exception 'Editable planned spray not found';end if;
 if exists(select 1 from stock_v2.spray_job_input ji join stock_v2.document_line dl on dl.requirement_id=ji.requirement_id join stock_v2.document d on d.document_id=dl.document_id where ji.job_id=p_job_id and d.document_type='issue' and d.status='posted') then raise exception 'Cannot edit spray once any product has been issued';end if;
 if jsonb_typeof(p_data->'lines')<>'array' or jsonb_array_length(p_data->'lines') not between 1 and 30 then raise exception 'Provide 1–30 inputs';end if;
 area:=nullif(p_data->>'area_ha','')::numeric;
 select tracecode_size into trarea from public.tracecode where tracecode_id=coalesce(nullif(p_data->>'tracecode_id','')::bigint,j.external_tracecode_id);
 if area is null or area<=0 or area>trarea then raise exception 'Invalid spray hectares';end if;
 if not exists(select 1 from stock_v2.access_spray_type_catalog where spray_type_name=p_data->>'spray_type') then raise exception 'Choose a valid spray type';end if;
 if nullif(p_data->>'water_rate','')::numeric<=0 then raise exception 'Water rate must be positive';end if;
 update stock_v2.spray_job set external_tracecode_id=coalesce(nullif(p_data->>'tracecode_id','')::bigint,j.external_tracecode_id),job_tracking_code=nullif(p_data->>'job_tracking_code',''),planned_week_start=coalesce(nullif(p_data->>'planned_week_start','')::date,planned_week_start),area_ha=area,part_label=coalesce(nullif(p_data->>'part_label',''),part_label),spray_type=p_data->>'spray_type',setup_id=(select setup_id from stock_v2.sprayer_setup where setup_name=p_data->>'spray_type' and active limit 1),water_litres_per_ha=(p_data->>'water_rate')::numeric,sprayer_asset_code=nullif(p_data->>'sprayer_asset_code','') where job_id=p_job_id;
 update stock_v2.spray_job set allocation_groups=p_data->'allocation_groups' where job_id=p_job_id;
 delete from stock_v2.spray_job_input where job_id=p_job_id;
 for line in select value from jsonb_array_elements(p_data->'lines') loop
  code:=line->>'item_code';
  if code is null or length(code)=0 then raise exception 'Choose a product';end if;
  if code=any(names) then raise exception 'Duplicate input %',code;end if;
  names:=array_append(names,code);
  select item_id into itemid from stock_v2.item where item_code=code and active;
  if itemid is null or (line->>'rate_per_ha')::numeric<=0 then raise exception 'Invalid input or rate';end if;
  insert into stock_v2.spray_job_input(job_id,item_id,rate_per_ha) values(p_job_id,itemid,(line->>'rate_per_ha')::numeric);
  n:=n+1;resultlines:=resultlines||jsonb_build_array(jsonb_build_object('item_code',code));
 end loop;
 return jsonb_build_object('job_id',p_job_id,'lines',resultlines);
end $function$
;

CREATE OR REPLACE FUNCTION stock_v2.demo_return_spray(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'stock_v2'
AS $function$
declare v_job bigint; v_issue bigint; v_complete boolean; v_owner bigint; v_wh bigint; v_doc bigint; v_trace bigint; v_line jsonb; v_source bigint; v_qty numeric; v_issued numeric; v_returned numeric; v_item bigint; v_requirement bigint; v_num text; v_count int:=0;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 v_job:=nullif(p_data->>'job_id','')::bigint;
 v_issue:=nullif(p_data->>'issue_document_id','')::bigint;
 v_complete:=coalesce((p_data->>'spray_complete')::boolean,false);
 if v_job is null or v_issue is null then raise exception 'Spray and original issue required';end if;
 if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 30 then raise exception 'Choose return lines';end if;
 select j.owner_id into v_owner from stock_v2.spray_job j join stock_v2.owner o using(owner_id) where j.job_id=v_job and o.owner_code in ('TEST_JS','TEST_AO');
 select location_id into v_wh from stock_v2.location where location_code='TEST_WH';
 select external_tracecode_id into v_trace from stock_v2.spray_job where job_id=v_job and owner_id=v_owner for update;
 if v_trace is null then raise exception 'Spray not found';end if; if not exists(select 1 from stock_v2.spray_job where job_id=v_job and status='completed') then raise exception 'Spray must be completed before returning stock';end if;
 if not exists(select 1 from stock_v2.document d join stock_v2.document_line dl on dl.document_id=d.document_id join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id where d.document_id=v_issue and d.document_type='issue' and d.status='posted' and ji.job_id=v_job) then raise exception 'Issue does not belong to the selected spray';end if;
 v_num:='SR-'||nextval('stock_v2.spray_return_number_seq');
 insert into stock_v2.document(document_type,document_number,document_date,status,parent_document_id,reason)
 values('return',v_num,current_date,'draft',v_issue,case when v_complete then 'Spray complete - unused stock returned' else 'Spray incomplete - unused stock returned' end) returning document_id into v_doc;
 for v_line in select value from jsonb_array_elements(p_data->'lines') loop
  v_source:=nullif(v_line->>'source_line_id','')::bigint;v_qty:=nullif(v_line->>'quantity','')::numeric;
  if v_qty is null or v_qty<=0 then raise exception 'Return quantities must be positive';end if;
  select dl.item_id,dl.requirement_id,dl.quantity into v_item,v_requirement,v_issued from stock_v2.document_line dl join stock_v2.spray_job_input ji on ji.requirement_id=dl.requirement_id
  where dl.line_id=v_source and dl.document_id=v_issue and ji.job_id=v_job;
  if v_item is null then raise exception 'Selected line does not belong to this issue';end if;
  select coalesce(sum(rl.quantity),0) into v_returned from stock_v2.document_line rl join stock_v2.document rd on rd.document_id=rl.document_id where rl.source_line_id=v_source and rd.document_type='return' and rd.status='posted';
  if v_qty>v_issued-v_returned then raise exception 'Return exceeds unreturned issue quantity';end if;
  insert into stock_v2.document_line(document_id,item_id,quantity,requirement_id,source_line_id,note)
  values(v_doc,v_item,v_qty,v_requirement,v_source,case when v_complete then 'Spray complete' else 'Spray incomplete' end);
  insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta,external_tracecode_id)
  values(currval(pg_get_serial_sequence('stock_v2.document_line','line_id')),v_owner,v_wh,v_qty,v_trace);
  v_count:=v_count+1;
 end loop;
 perform stock_v2.post_draft(v_doc);
 update stock_v2.spray_job set status=case when v_complete then 'completed' else 'planned' end where job_id=v_job;
 return jsonb_build_object('document_id',v_doc,'document_number',v_num,'job_id',v_job,'spray_complete',v_complete,'lines',v_count);
end $function$
;

-- Follow the PR #18 migration in dependency order.
-- Stock browser testing does not require installing the separate Sprayer phone feature.
create or replace function stock_v2.spray_physical_completed_date(p_job bigint) returns date
language plpgsql stable security invoker set search_path='' as $completed$
declare result date;
begin
 if to_regclass('stock_v2.sprayer_completion') is null then return null;end if;
 execute 'select completed_date from stock_v2.sprayer_completion where job_id=$1' into result using p_job;
 return result;
end $completed$;
revoke all on function stock_v2.spray_physical_completed_date(bigint) from public,anon,authenticated;

do $optional_phone$
begin
 if to_regclass('stock_v2.sprayer_completion') is not null
 and to_regprocedure('stock_v2.sprayer_payload(bigint,boolean)') is not null then
 execute $phone_definition$create or replace function stock_v2.sprayer_payload(p_job bigint,p_include_closed boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',j.job_id::text,'trace_id',t.tracecode_id::text,'trace',t.tracecode_name,
 'week',j.planned_week_start::text,'area',j.area_ha,'spray_type',j.spray_type,'water_rate',coalesce(j.water_litres_per_ha,s.water_litres_per_ha),
 'tank_capacity',coalesce(s.tank_litres,typ.spray_tank_size),'part',j.part_label,
 'fully_issued',coalesce(a.full_issue,false),'last_issue_date',a.last_issue_date::text,
 'completed_date',c.completed_date::text,'completion_version',coalesce(c.version,0),'lines',coalesce(a.lines,'[]'::jsonb))
 from stock_v2.spray_job j join stock_v2.owner o using(owner_id) join public.tracecode t on t.tracecode_id=j.external_tracecode_id
 left join stock_v2.sprayer_setup s on s.setup_id=j.setup_id
 left join lateral(select x.spray_tank_size from stock_v2.access_spray_type_catalog x where x.spray_type_name=j.spray_type order by x.access_spray_type_id limit 1) typ on true
 left join stock_v2.sprayer_completion c using(job_id)
 left join lateral(
  select count(*)>0 and bool_and(ji.rate_per_ha>0 and x.issued+0.000001>=ji.rate_per_ha*j.area_ha) as full_issue,max(x.last_issue_date) as last_issue_date,
   jsonb_agg(jsonb_build_object('code',i.item_code,'name',i.item_name,'unit',i.base_unit,'rate',ji.rate_per_ha) order by coalesce(i.mix_sequence,9999),i.item_name,i.item_code) as lines
  from stock_v2.spray_job_input ji join stock_v2.item i using(item_id)
  cross join lateral(select coalesce(sum(case when d.document_type='issue' then dl.quantity when d.document_type='return' then -dl.quantity else 0 end),0) as issued,
   max(d.document_date) filter(where d.document_type='issue') as last_issue_date
   from stock_v2.document_line dl join stock_v2.document d using(document_id) where dl.requirement_id=ji.requirement_id and d.status='posted' and d.document_type in ('issue','return')) x
  where ji.job_id=j.job_id
 ) a on true
 where j.job_id=p_job and o.owner_code in ('TEST_JS','TEST_AO') and j.status in ('planned','completed') and (p_include_closed or t.end_date is null)
$$;$phone_definition$;
 end if;
end $optional_phone$;
