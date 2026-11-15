-- Additive adjustment history; existing documents and movements are preserved.
create table stock_v2.stock_adjustment_source(
 line_id bigint primary key references stock_v2.document_line(line_id),
 sheet_id bigint references stock_v2.combined_stocktake(sheet_id),
 owner_code text not null check(owner_code in ('HS','AO')),
 item_code text not null,item_name text not null,required_quantity numeric,actual_quantity numeric not null
);
create index stock_adjustment_source_sheet_idx on stock_v2.stock_adjustment_source(sheet_id);
alter table stock_v2.stock_adjustment_source enable row level security;
revoke all on stock_v2.stock_adjustment_source from public,anon,authenticated;

create function stock_v2.stock_on_date(p_item bigint,p_owner bigint,p_location bigint,p_date date) returns numeric
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(m.quantity_delta),0) from stock_v2.movement m
 join stock_v2.document_line l on l.line_id=m.document_line_id join stock_v2.document d using(document_id)
 where d.status='posted' and d.document_date<=p_date and l.item_id=p_item and m.owner_id=p_owner and m.location_id=p_location
$$;
create view stock_v2.stocktake_adjustment_pending with(security_invoker=true) as
 select t.sheet_id,t.take_number,t.take_date,t.groups,t.version,l.item_id,l.item_code,l.item_name,l.category,l.position,i.base_unit,
 x.owner_code,x.required_quantity
 from stock_v2.combined_stocktake t join stock_v2.combined_stocktake_line l using(sheet_id) join stock_v2.item i using(item_id)
 cross join lateral(values ('HS',l.counted_hs-stock_v2.stock_on_date(l.item_id,(select owner_id from stock_v2.owner where owner_code='TEST_JS'),(select location_id from stock_v2.location where location_code='TEST_WH'),t.take_date)),('AO',l.counted_ao-stock_v2.stock_on_date(l.item_id,(select owner_id from stock_v2.owner where owner_code='TEST_AO'),(select location_id from stock_v2.location where location_code='TEST_WH'),t.take_date))) x(owner_code,required_quantity)
 where t.status='counted' and x.required_quantity<>0;
revoke all on stock_v2.stocktake_adjustment_pending from public,anon,authenticated;

create function stock_v2.stock_adjustment_command(p_actor uuid,p_operation uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior stock_v2.approval_operation;t stock_v2.combined_stocktake;l stock_v2.combined_stocktake_line;
 entry jsonb;oid bigint;loc bigint;iid bigint;did bigint;dl bigint;seq bigint;delta numeric;required numeric;
 code text;name text;own text;date_value date;reason text;result jsonb;before_doc jsonb;
 changed bigint[]:='{}';line_count integer:=0;
begin
 perform stock_v2.workflow_require(p_actor,true);
 if p_operation is null then raise exception 'Save reference required';end if;
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select * into prior from stock_v2.approval_operation where id=p_operation;
 if found then
  if prior.actor<>p_actor or prior.request<>jsonb_build_object('action',p_action,'data',p_data) then raise exception 'Save reference reused with different values';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 select location_id into loc from stock_v2.location where location_code='TEST_WH';
 if loc is null then raise exception 'Stock warehouse not configured';end if;
 if p_action='stocktake_adjustment_save' then
  select * into t from stock_v2.combined_stocktake where sheet_id=(p_data->>'sheet_id')::bigint for update;
  if not found or t.status='draft' then raise exception 'Completed stocktake required';end if;
  if t.version is distinct from (p_data->>'version')::integer then raise exception 'Stocktake changed. Reopen the adjustment report before saving';end if;
  date_value:=t.take_date;reason:='Stocktake '||t.take_number;
  if p_data ? 'adjustment_date' and (p_data->>'adjustment_date')::date<>date_value then raise exception 'Stocktake adjustment date is fixed';end if;
  select jsonb_build_object('header',to_jsonb(t),'lines',(select jsonb_agg(to_jsonb(x) order by position) from stock_v2.combined_stocktake_line x where sheet_id=t.sheet_id)) into before_doc;
 elsif p_action='individual_adjustment_save' then
  date_value:=(p_data->>'adjustment_date')::date;reason:=btrim(coalesce(p_data->>'reason',''));
  if date_value is null or length(reason)<5 then raise exception 'Adjustment date and explanation required';end if;
 else raise exception 'Unknown adjustment action';end if;
 if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 500 then raise exception 'Enter at least one adjustment amount';end if;
 if p_action='individual_adjustment_save' and jsonb_array_length(p_data->'lines')<>1 then raise exception 'Select one product for individual adjustment';end if;
 if (select count(distinct (value->>'owner_code',value->>'item_code')) from jsonb_array_elements(p_data->'lines'))<>jsonb_array_length(p_data->'lines') then raise exception 'Duplicate adjustment lines';end if;
 for entry in select value from jsonb_array_elements(p_data->'lines') loop
  own:=entry->>'owner_code';code:=entry->>'item_code';delta:=(entry->>'quantity')::numeric;required:=null;
  if own not in ('HS','AO') or own is null then raise exception 'Select HS or AO';end if;
  if delta is null or not (delta between -1000000000000 and 1000000000000) then raise exception 'Enter a finite adjustment amount';end if;
  if delta=0 then continue;end if;
  select owner_id into oid from stock_v2.owner where owner_code=case when own='HS' then 'TEST_JS' else 'TEST_AO' end;
  if p_action='stocktake_adjustment_save' then
   select * into l from stock_v2.combined_stocktake_line where sheet_id=t.sheet_id and item_code=code for update;
   if not found then raise exception 'Product not on this stock sheet';end if;
   iid:=l.item_id;name:=l.item_name;
   required:=(case when own='HS' then l.counted_hs else l.counted_ao end)-stock_v2.stock_on_date(l.item_id,oid,loc,t.take_date);
   if required is null or required=0 or sign(required)<>sign(delta) or abs(delta)>abs(required) then raise exception 'Adjustment must have the same sign and not exceed the outstanding amount for % %',code,own;end if;
  else
   select item_id,item_name into iid,name from stock_v2.item where item_code=code and active;
   if not found then raise exception 'Select an active product';end if;
  end if;
  if did is null then
   seq:=nextval('stock_v2.adjustment_number_seq');
   insert into stock_v2.document(document_type,document_number,document_date,status,reason) values('adjustment','ADJ-'||seq,date_value,'draft',reason) returning document_id into did;
   insert into stock_v2.stock_adjustment_meta(document_id,reason_code,created_by) values(did,case when p_action='stocktake_adjustment_save' then 'STOCKTAKE' else 'DIRECT' end,p_actor);
  end if;
  insert into stock_v2.document_line(document_id,item_id,quantity,note) values(did,iid,abs(delta),reason) returning line_id into dl;
  insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(dl,oid,loc,delta);
  insert into stock_v2.stock_adjustment_source(line_id,sheet_id,owner_code,item_code,item_name,required_quantity,actual_quantity) values(dl,t.sheet_id,own,code,name,required,delta);
  if p_action='stocktake_adjustment_save' then
   if own='HS' then update stock_v2.combined_stocktake_line set applied_hs=coalesce(applied_hs,system_hs)+delta where sheet_id=t.sheet_id and item_id=iid;
   else update stock_v2.combined_stocktake_line set applied_ao=coalesce(applied_ao,system_ao)+delta where sheet_id=t.sheet_id and item_id=iid;end if;
  end if;
  changed:=array_append(changed,iid);line_count:=line_count+1;
 end loop;
 if did is null then raise exception 'Enter at least one nonzero adjustment amount';end if;
 perform stock_v2.post_draft(did);
 for iid in select distinct unnest(changed) loop perform stock_v2.recalculate_demo_item_costs(iid,'Stock adjustment ADJ-'||seq);end loop;
 if p_action='stocktake_adjustment_save' then
  update stock_v2.combined_stocktake set version=version+1,adjustment_document_id=did,
   status=case when exists(select 1 from stock_v2.stocktake_adjustment_pending p where p.sheet_id=t.sheet_id) then 'counted' else 'posted' end,
   posted_at=case when not exists(select 1 from stock_v2.stocktake_adjustment_pending p where p.sheet_id=t.sheet_id) then now() else posted_at end
   where sheet_id=t.sheet_id returning * into t;
  insert into stock_v2.combined_stocktake_audit(sheet_id,actor,action,reason,before_values,after_values)
  values(t.sheet_id,p_actor,p_action,reason,before_doc,jsonb_build_object('header',to_jsonb(t),'document_id',did,'lines',p_data->'lines'));
 end if;
 result:=jsonb_build_object('document_id',did,'document_number','ADJ-'||seq,'document_date',date_value,'sheet_id',t.sheet_id,'version',t.version,'lines',line_count);
 insert into stock_v2.approval_operation(id,actor,request,result) values(p_operation,p_actor,jsonb_build_object('action',p_action,'data',p_data),result);
 return result;
end $$;
revoke all on function stock_v2.stock_on_date(bigint,bigint,bigint,date),stock_v2.stock_adjustment_command(uuid,uuid,text,jsonb) from public,anon,authenticated;

create or replace function stock_v2.combined_stocktake_command(p_actor uuid,p_operation uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t stock_v2.combined_stocktake; prior stock_v2.approval_operation;
 result jsonb; before_doc jsonb; after_doc jsonb; rowdata jsonb; entry record; request_groups text[];
 hs bigint; ao bigint; loc bigint; sid bigint; seq bigint; did bigint; dl bigint;
 hs_delta numeric;ao_delta numeric;qty_hs numeric;qty_ao numeric; reason text:=btrim(coalesce(p_data->>'reason',''));
 changed_items bigint[]:='{}';
begin
 perform stock_v2.workflow_require(p_actor);
 if p_action='combined_stocktake_post' then raise exception 'Use Stock Adjustment to enter and save adjustment amounts';end if;
 if p_action='combined_stocktake_create' and not stock_v2.can_print_stocktake(p_actor) then raise exception 'Only Admin and Clerk can print stocktake sheets' using errcode='42501';end if;
 if p_operation is null then raise exception 'Save reference required';end if;
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select * into prior from stock_v2.approval_operation where id=p_operation;
 if found then
  if prior.actor<>p_actor or prior.request<>jsonb_build_object('action',p_action,'data',p_data) then raise exception 'Operation reference reused with different values';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 select owner_id into hs from stock_v2.owner where owner_code='TEST_JS';
 select owner_id into ao from stock_v2.owner where owner_code='TEST_AO';
 select location_id into loc from stock_v2.location where location_code='TEST_WH';
 if hs is null or ao is null or loc is null then raise exception 'Stocktake warehouse is not configured';end if;
 if p_action='combined_stocktake_create' then
  if jsonb_typeof(p_data->'groups') is distinct from 'array' or jsonb_array_length(p_data->'groups') not between 1 and 30 then raise exception 'Select at least one stock group';end if;
  select array_agg(distinct value) into request_groups from jsonb_array_elements_text(p_data->'groups');
  if exists(select 1 from unnest(request_groups) g where not exists(select 1 from stock_v2.item i where i.active and coalesce(nullif(btrim(i.input_type),''),'Other')=g)) then raise exception 'Unknown stock group; reload the list';end if;
  seq:=nextval('stock_v2.stocktake_number_seq');
  insert into stock_v2.combined_stocktake(take_number,take_date,groups,created_by)
  values('ST-'||seq,(p_data->>'take_date')::date,request_groups,p_actor) returning sheet_id into sid;
  insert into stock_v2.combined_stocktake_line(sheet_id,item_id,position,item_code,item_name,category,stock_type,system_hs,system_ao)
  select sid,i.item_id,row_number() over(order by lower(coalesce(nullif(btrim(i.input_category),''),nullif(btrim(i.category),''),'Uncategorised')),lower(i.item_name),i.item_code),
   i.item_code,i.item_name,coalesce(nullif(btrim(i.input_category),''),nullif(btrim(i.category),''),'Uncategorised'),coalesce(nullif(btrim(i.input_type),''),'Other'),coalesce(h.quantity,0),coalesce(a.quantity,0)
  from stock_v2.item i
  cross join lateral(select stock_v2.stock_on_date(i.item_id,hs,loc,(p_data->>'take_date')::date) quantity) h
  cross join lateral(select stock_v2.stock_on_date(i.item_id,ao,loc,(p_data->>'take_date')::date) quantity) a
  where i.active and coalesce(nullif(btrim(i.input_type),''),'Other')=any(request_groups) and (coalesce(h.quantity,0)>0 or coalesce(a.quantity,0)>0);
  if not found then raise exception 'No products for the selected groups';end if;
  select * into t from stock_v2.combined_stocktake where sheet_id=sid;
  insert into stock_v2.combined_stocktake_audit(sheet_id,actor,action,after_values) values(sid,p_actor,'create',to_jsonb(t));
 elsif p_action in ('combined_stocktake_save','combined_stocktake_post') then
  sid:=(p_data->>'sheet_id')::bigint;
  select * into t from stock_v2.combined_stocktake where sheet_id=sid for update;
  if not found then raise exception 'Stock sheet not found';end if;
  if t.version is distinct from (p_data->>'version')::integer then raise exception 'This stock sheet changed. Reopen it before saving';end if;
  select jsonb_build_object('header',to_jsonb(t),'lines',(select jsonb_agg(to_jsonb(l) order by position) from stock_v2.combined_stocktake_line l where sheet_id=sid)) into before_doc;
  if p_action='combined_stocktake_save' then
   if t.status<>'draft' then perform stock_v2.workflow_require(p_actor,true);if length(reason)<8 then raise exception 'Enter a correction reason (at least 8 characters)';end if;end if;
   if t.status='draft' then update stock_v2.combined_stocktake_line set system_hs=stock_v2.stock_on_date(item_id,hs,loc,t.take_date),system_ao=stock_v2.stock_on_date(item_id,ao,loc,t.take_date) where sheet_id=sid;end if;
   if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines')<>(select count(*) from stock_v2.combined_stocktake_line where sheet_id=sid) then raise exception 'Enter both HS and AO counts for every product';end if;
   if (select count(distinct value->>'item_code') from jsonb_array_elements(p_data->'lines'))<>jsonb_array_length(p_data->'lines') then raise exception 'Duplicate product counts';end if;
   for rowdata in select value from jsonb_array_elements(p_data->'lines') loop
    if nullif(rowdata->>'hs','') is null or nullif(rowdata->>'ao','') is null then raise exception 'Enter both counts; use 0 where none is found';end if;
    qty_hs:=(rowdata->>'hs')::numeric;qty_ao:=(rowdata->>'ao')::numeric;
    if not (qty_hs between 0 and 1000000000000 and qty_ao between 0 and 1000000000000) then raise exception 'Counts must be finite and nonnegative';end if;
    update stock_v2.combined_stocktake_line set counted_hs=qty_hs,counted_ao=qty_ao where sheet_id=sid and item_code=rowdata->>'item_code';
    if not found then raise exception 'Product is not part of this printed sheet';end if;
   end loop;
   update stock_v2.combined_stocktake set status=case when exists(select 1 from stock_v2.combined_stocktake_line x where x.sheet_id=sid and (x.counted_hs<>stock_v2.stock_on_date(x.item_id,hs,loc,t.take_date) or x.counted_ao<>stock_v2.stock_on_date(x.item_id,ao,loc,t.take_date))) then 'counted' else 'posted' end,version=version+1,counted_by=p_actor,counted_at=now() where sheet_id=sid returning * into t;
  end if;
  select jsonb_build_object('header',to_jsonb(t),'lines',(select jsonb_agg(to_jsonb(l) order by position) from stock_v2.combined_stocktake_line l where sheet_id=sid)) into after_doc;
  insert into stock_v2.combined_stocktake_audit(sheet_id,actor,action,reason,before_values,after_values) values(sid,p_actor,p_action,nullif(reason,''),before_doc,after_doc);
 else raise exception 'Unknown stocktake operation';end if;
 result:=jsonb_build_object('sheet_id',t.sheet_id,'take_number',t.take_number,'take_date',t.take_date,'groups',t.groups,'status',t.status,'version',t.version,'adjustment_document_id',t.adjustment_document_id);
 insert into stock_v2.approval_operation(id,actor,request,result) values(p_operation,p_actor,jsonb_build_object('action',p_action,'data',p_data),result);
 return result;
end $$;
revoke all on function stock_v2.combined_stocktake_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
