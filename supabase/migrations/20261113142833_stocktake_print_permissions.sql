create or replace function stock_v2.can_print_stocktake(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((stock_v2.workflow_access(p_actor)->>'is_admin')::boolean,false)
 or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name='clerk')
$$;
revoke all on function stock_v2.can_print_stocktake(uuid) from public,anon,authenticated;

create or replace function stock_v2.combined_stocktake_command(p_actor uuid,p_operation uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t stock_v2.combined_stocktake; prior stock_v2.approval_operation;
 result jsonb; before_doc jsonb; after_doc jsonb; rowdata jsonb; entry record; request_groups text[];
 hs bigint; ao bigint; loc bigint; sid bigint; seq bigint; did bigint; dl bigint;
 hs_delta numeric;ao_delta numeric;qty_hs numeric;qty_ao numeric; reason text:=btrim(coalesce(p_data->>'reason',''));
 changed_items bigint[]:='{}';
begin
 perform stock_v2.workflow_require(p_actor);
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
  left join stock_v2.quantity_balance h on h.item_id=i.item_id and h.owner_id=hs and h.location_id=loc
  left join stock_v2.quantity_balance a on a.item_id=i.item_id and a.owner_id=ao and a.location_id=loc
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
   if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines')<>(select count(*) from stock_v2.combined_stocktake_line where sheet_id=sid) then raise exception 'Enter both HS and AO counts for every product';end if;
   if (select count(distinct value->>'item_code') from jsonb_array_elements(p_data->'lines'))<>jsonb_array_length(p_data->'lines') then raise exception 'Duplicate product counts';end if;
   for rowdata in select value from jsonb_array_elements(p_data->'lines') loop
    if nullif(rowdata->>'hs','') is null or nullif(rowdata->>'ao','') is null then raise exception 'Enter both counts; use 0 where none is found';end if;
    qty_hs:=(rowdata->>'hs')::numeric;qty_ao:=(rowdata->>'ao')::numeric;
    if not (qty_hs between 0 and 1000000000000 and qty_ao between 0 and 1000000000000) then raise exception 'Counts must be finite and nonnegative';end if;
    update stock_v2.combined_stocktake_line set counted_hs=qty_hs,counted_ao=qty_ao where sheet_id=sid and item_code=rowdata->>'item_code';
    if not found then raise exception 'Product is not part of this printed sheet';end if;
   end loop;
   update stock_v2.combined_stocktake set status='counted',version=version+1,counted_by=p_actor,counted_at=now() where sheet_id=sid returning * into t;
  else
   perform stock_v2.workflow_require(p_actor,true);
   if t.status<>'counted' then raise exception 'Only completed counts can be approved';end if;
   for entry in select l.*,coalesce(h.quantity,0) current_hs,coalesce(a.quantity,0) current_ao
    from stock_v2.combined_stocktake_line l
    left join stock_v2.quantity_balance h on h.item_id=l.item_id and h.owner_id=hs and h.location_id=loc
    left join stock_v2.quantity_balance a on a.item_id=l.item_id and a.owner_id=ao and a.location_id=loc where l.sheet_id=sid order by l.position
   loop
    if entry.counted_hs is null or entry.counted_ao is null then raise exception 'Both columns must be counted';end if;
    if entry.applied_hs is null and (entry.current_hs<>entry.system_hs or entry.current_ao<>entry.system_ao) then raise exception 'Stock has moved since this sheet was printed. Reconcile movements before approving';end if;
    hs_delta:=entry.counted_hs-coalesce(entry.applied_hs,entry.system_hs);ao_delta:=entry.counted_ao-coalesce(entry.applied_ao,entry.system_ao);
    if hs_delta<>0 or ao_delta<>0 then
     if did is null then
      seq:=nextval('stock_v2.adjustment_number_seq');
      insert into stock_v2.document(document_type,document_number,document_date,status,reason)
      values('adjustment','ADJ-'||seq,current_date,'draft','Stocktake '||t.take_number||case when t.posted_at is not null then ' correction' else '' end) returning document_id into did;
      insert into stock_v2.stock_adjustment_meta(document_id,reason_code,created_by) values(did,'STOCKTAKE',p_actor);
     end if;
     if hs_delta<>0 then
      insert into stock_v2.document_line(document_id,item_id,quantity,note) values(did,entry.item_id,abs(hs_delta),'HS stocktake '||t.take_number) returning line_id into dl;
      insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(dl,hs,loc,hs_delta);
     end if;
     if ao_delta<>0 then
      insert into stock_v2.document_line(document_id,item_id,quantity,note) values(did,entry.item_id,abs(ao_delta),'AO stocktake '||t.take_number) returning line_id into dl;
      insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(dl,ao,loc,ao_delta);
     end if;
     changed_items:=array_append(changed_items,entry.item_id);
    end if;
   end loop;
   if did is not null then
    perform stock_v2.post_draft(did);
    for entry in select distinct unnest(changed_items) item_id loop perform stock_v2.recalculate_demo_item_costs(entry.item_id,'Stocktake '||t.take_number);end loop;
   end if;
   update stock_v2.combined_stocktake_line set applied_hs=counted_hs,applied_ao=counted_ao where sheet_id=sid;
   update stock_v2.combined_stocktake set status='posted',posted_at=coalesce(posted_at,now()),version=version+1,adjustment_document_id=coalesce(did,adjustment_document_id) where sheet_id=sid returning * into t;
  end if;
  select jsonb_build_object('header',to_jsonb(t),'lines',(select jsonb_agg(to_jsonb(l) order by position) from stock_v2.combined_stocktake_line l where sheet_id=sid)) into after_doc;
  insert into stock_v2.combined_stocktake_audit(sheet_id,actor,action,reason,before_values,after_values) values(sid,p_actor,p_action,nullif(reason,''),before_doc,after_doc);
 else raise exception 'Unknown stocktake operation';end if;
 result:=jsonb_build_object('sheet_id',t.sheet_id,'take_number',t.take_number,'take_date',t.take_date,'groups',t.groups,'status',t.status,'version',t.version,'adjustment_document_id',t.adjustment_document_id);
 insert into stock_v2.approval_operation(id,actor,request,result) values(p_operation,p_actor,jsonb_build_object('action',p_action,'data',p_data),result);
 return result;
end $$;
revoke all on function stock_v2.combined_stocktake_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
