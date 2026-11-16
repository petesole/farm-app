-- Prepared for development testing; does not post any stock or fuel movements.
alter table public.vehicle add column fuel_type text;
update public.vehicle set fuel_type='DIESEL'; -- Existing register confirmed diesel-only by owner.
alter table public.vehicle alter column fuel_type set not null;
alter table public.vehicle add constraint vehicle_fuel_type_check check(fuel_type in ('DIESEL','PETROL','NONE'));
alter table public.vehicle add column is_other boolean not null default false;
update public.vehicle set is_other=true where vehicle_id=50 and lower(btrim(vehicle_name))='other';
-- Explicit choice required for all new equipment. NONE permits future non-powered implements.
alter table public.vehicle_type enable row level security;
create policy vehicle_type_role_read on public.vehicle_type for select to authenticated
 using(cardinality(public.my_farm_app_roles())>0);
create policy vehicle_type_admin_manage on public.vehicle_type for all to authenticated
 using('admin'=any(public.my_farm_app_roles())) with check('admin'=any(public.my_farm_app_roles()));
grant select,insert,update on public.vehicle_type to authenticated;
do $$declare seq text;begin
 seq:=pg_get_serial_sequence('public.vehicle_type','vehicle_type_id');
 if seq is not null then execute format('grant usage,select on sequence %s to authenticated',seq);end if;
end $$;

-- Reject petrol/non-powered equipment in the separate diesel ledger, also on API writes.
-- Ordinary corrections to historical issues are permitted even if equipment was reclassified.
create function public.validate_diesel_equipment() returns trigger language plpgsql
 set search_path=pg_catalog,public as $$
declare v public.vehicle%rowtype;begin
 select * into v from public.vehicle where vehicle_id=new.vehicle_id;
 if tg_op='INSERT' or new.vehicle_id is distinct from old.vehicle_id then
  if not found or v.fuel_type<>'DIESEL' or v.vehicle_discontinued then raise exception 'Select active diesel equipment';end if;
 end if;
 if v.is_other and nullif(btrim(regexp_replace(coalesce(new.notes,''),'^\[UNPLANNED\]\s*','','i')),'') is null then
  raise exception 'Description required for Other diesel issue';
 end if;
 return new;end $$;
create trigger validate_diesel_equipment before insert or update on public.fuel_issue
 for each row execute function public.validate_diesel_equipment();

alter table stock_v2.document_line add column equipment_id bigint references public.vehicle(vehicle_id);
alter table stock_v2.document_line add column equipment_other text;
alter table stock_v2.document_line add column equipment_name text;
alter table stock_v2.document_line add constraint equipment_one_destination check(equipment_id is null or equipment_other is null);

create function stock_v2.equipment_issue_kind(p_item bigint) returns text language sql stable
 set search_path=pg_catalog,stock_v2 as $$
 select case when lower(btrim(item_name))='diesel' then 'DIESEL'
 when lower(btrim(item_name))='petrol' then 'PETROL'
 when item_name ~* '\moil\M|lubricant|grease' then 'OIL' end
 from stock_v2.item where item_id=p_item
 and (lower(btrim(input_type))='fuel' or lower(btrim(input_category))='fuel')
$$;
revoke all on function stock_v2.equipment_issue_kind(bigint) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION stock_v2.demo_multi(p_action text, p_request uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'stock_v2'
AS $function$
declare issue_kind text; equipment bigint; other_description text; equipment_label text; machine public.vehicle%rowtype; own bigint;loc bigint;doc bigint;ord bigint;job bigint;ln bigint;it bigint;ol bigint;req bigint;tr bigint;contract bigint;targetown bigint;qty numeric;rate numeric;area numeric;old_qty numeric;avail numeric;el jsonb;code text;res jsonb;arr jsonb:='[]'::jsonb;ct int:=0; recost_item bigint; cost_run_id bigint; cost_runs jsonb:='[]'::jsonb; cost_pending jsonb:='[]'::jsonb;
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
   equipment:=null;other_description:=null;equipment_label:=null;
   if p_action='direct_issue' then
    issue_kind:=stock_v2.equipment_issue_kind(it);
    if issue_kind is not null then
     equipment:=nullif(el->>'equipment_id','')::bigint;
     other_description:=nullif(btrim(el->>'equipment_other'),'');
     if (equipment is null)=(other_description is null) then raise exception 'Select specific equipment or describe Other for %',code;end if;
     if equipment is not null then
      select * into machine from public.vehicle where vehicle_id=equipment for share;
      if not found or machine.vehicle_discontinued or machine.is_other or
       (issue_kind<>'OIL' and machine.fuel_type<>issue_kind) then raise exception 'Equipment fuel type does not match %',code;end if;
      equipment_label:=machine.vehicle_name;
     else equipment_label:='Other: '||other_description;end if;
    elsif nullif(el->>'equipment_id','') is not null or nullif(el->>'equipment_other','') is not null then
     raise exception 'Equipment destination is only available for fuel and machinery oils';
    end if;
   end if;
   insert into stock_v2.document_line(document_id,item_id,quantity,requirement_id,note,equipment_id,equipment_other,equipment_name)
   values(doc,it,qty,req,case when p_action='direct_issue' then
    concat_ws(' · ',equipment_label,nullif(el->>'mix_instruction','')) else 'DEMO issue' end,equipment,other_description,equipment_label) returning line_id into ln;
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


-- Keep the existing private posting boundary. No direct browser execution.
revoke all on function stock_v2.demo_multi(text,uuid,jsonb) from public,anon,authenticated;
