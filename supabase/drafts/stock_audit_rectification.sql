-- Development only. Apply once before deploying the updated Edge handler. No historical quantities or values change.
create or replace function stock_v2.workflow_command(p_actor uuid,p_operation uuid,p_command text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d stock_v2.approval_document; before_doc jsonb; result jsonb; receipt stock_v2.approval_operation;
 p jsonb:=p_data->'payload'; kind text:=p_data->>'kind'; is_admin boolean;
 newid uuid; applied jsonb; line jsonb; oid bigint; item bigint;
begin
 perform stock_v2.workflow_require(p_actor);
 is_admin:=(stock_v2.workflow_access(p_actor)->>'is_admin')::boolean;
 if p_operation is null or p_data is null then raise exception 'Operation reference and payload required';end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select * into receipt from stock_v2.approval_operation where id=p_operation;
 if found then
  if receipt.actor is distinct from p_actor or receipt.request is distinct from jsonb_build_object('command',p_command,'data',p_data) then raise exception 'Operation reference reused with different values';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 newid:=(p_data->>'id')::uuid;
 select * into d from stock_v2.approval_document where id=newid for update;
 before_doc:=case when found then to_jsonb(d) else null end;
 if before_doc is not null and d.version is distinct from (p_data->>'version')::integer then raise exception 'Document changed. Reload before continuing';end if;
 if p_command in ('save','submit') then
  if coalesce(kind,'') not in ('po','credit') or jsonb_typeof(p) is distinct from 'object' then raise exception 'Document kind and entries required';end if;
  if before_doc is not null then
   if d.kind<>kind or d.status='cancelled' or (d.status='applied' and kind='credit') then raise exception 'Document is locked';end if;
   if d.status in ('approved','applied') and not is_admin then raise exception 'Admin access required after approval' using errcode='42501';end if;
   if d.status in ('approved','applied') and length(btrim(coalesce(p_data->>'reason','')))<8 then raise exception 'Admin correction reason required (8 characters)';end if;
   if d.target_order_id is not null and exists(select 1 from stock_v2.order_line where order_id=d.target_order_id and received_quantity>0) then raise exception 'PO is locked after stock is received';end if;
  end if;
  if kind='po' then
   perform stock_v2.workflow_validate_po(p);
   p:=p||jsonb_build_object('contract_id',coalesce((select op.default_contract_id from stock_v2.owner_policy op join stock_v2.owner ow using(owner_id) where ow.owner_code='TEST_'||(p->>'owner_code')),nullif(p->>'contract_id','')::bigint));
   p:=jsonb_set(p,'{lines}',(select jsonb_agg(l||jsonb_build_object('item_name',i.item_name) order by n) from jsonb_array_elements(p->'lines') with ordinality x(l,n) join stock_v2.item i on i.item_code=l->>'item_code'));
  else
   perform stock_v2.workflow_validate_credit(p);
   if p->>'action'='return_credit' then
    p:=jsonb_set(p,'{allocations}',(select jsonb_agg(l||jsonb_build_object('item_name',i.item_name,'return_number',hd.document_number) order by n) from jsonb_array_elements(p->'allocations') with ordinality x(l,n) join stock_v2.document_line dl on dl.line_id=(l->>'return_line_id')::bigint join stock_v2.item i using(item_id) join stock_v2.document hd using(document_id)));
   else
    p:=p||jsonb_build_object('receipt_label',(select hd.document_number||' · '||i.item_name from stock_v2.document hd cross join stock_v2.item i where hd.document_id=(p->>'receipt_document_id')::bigint and i.item_id=(p->>'item_id')::bigint));
   end if;
   if coalesce(p->>'action','') not in ('return_credit','price_credit') or nullif(btrim(p->>'supplier_name'),'') is null or nullif(btrim(p->>'credit_note_number'),'') is null or coalesce(p->>'owner_code','') not in ('JS','AO')
    or not coalesce((p->>'total_amount')::numeric between 0 and 1000000000,false) then raise exception 'Enter complete supplier credit details';end if;
   if nullif(p->>'credit_note_date','') is null then raise exception 'Credit date required';end if;
   perform (p->>'credit_note_date')::date;
  end if;
  if before_doc is null then
   insert into stock_v2.approval_document(id,kind,status,payload,created_by,updated_by)
   values(newid,kind,case when p_command='submit' then 'pending' else 'draft' end,p,p_actor,p_actor) returning * into d;
  else
   if d.target_order_id is not null then
    update stock_v2.order_header set supplier_name=p->>'supplier',order_date=(p->>'order_date')::date,contract_id=nullif(p->>'contract_id','')::bigint where order_id=d.target_order_id;
    if (select owner_code from stock_v2.owner o join stock_v2.order_header h using(owner_id) where h.order_id=d.target_order_id) is distinct from 'TEST_'||(p->>'owner_code') then raise exception 'Cannot reassign the stock owner of a final PO';end if;
    for line in select value from jsonb_array_elements(p->'lines') loop
     select item_id into item from stock_v2.item where item_code=line->>'item_code';
     if exists(select 1 from stock_v2.order_line where order_id=d.target_order_id and item_id=item) then
      update stock_v2.order_line set ordered_quantity=(line->>'quantity')::numeric,ordered_unit_price=nullif(line->>'unit_price','')::numeric where order_id=d.target_order_id and item_id=item;
     else insert into stock_v2.order_line(order_id,item_id,ordered_quantity,ordered_unit_price) values(d.target_order_id,item,(line->>'quantity')::numeric,nullif(line->>'unit_price','')::numeric);end if;
    end loop;
    delete from stock_v2.order_line where order_id=d.target_order_id and item_id not in (select i.item_id from jsonb_array_elements(p->'lines') l join stock_v2.item i on i.item_code=l->>'item_code');
   end if;
   update stock_v2.approval_document set payload=p,status=case when status in ('approved','applied') then status when p_command='submit' then 'pending' else 'draft' end,
    version=version+1,updated_by=p_actor,updated_at=now() where id=d.id returning * into d;
  end if;
 elsif p_command in ('approve','reject','finalise','cancel') then
  if before_doc is null then raise exception 'Document not found';end if;
  if p_command in ('approve','reject') then
   perform stock_v2.workflow_require(p_actor,true);
   if d.status<>'pending' then raise exception 'Document is not awaiting approval';end if;
   if p_command='reject' then
    if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Reason required when returning a document';end if;
    update stock_v2.approval_document set status='rejected',decision_reason=p_data->>'reason' where id=d.id;
   elsif d.kind='po' then
    perform stock_v2.workflow_validate_po(d.payload);
    update stock_v2.approval_document set status='approved',approved_by=p_actor,approved_at=now(),decision_reason=null where id=d.id;
   else
    applied:=stock_v2.workflow_apply_credit(p_actor,d.payload);
    update stock_v2.approval_document set status='applied',approved_by=p_actor,approved_at=now(),applied_at=now(),target_credit_id=(applied->>'credit_id')::bigint,decision_reason=null where id=d.id;
   end if;
  elsif p_command='finalise' then
   if d.kind<>'po' or d.status<>'approved' then raise exception 'Only an approved PO can be finalised';end if;
   perform stock_v2.workflow_validate_po(d.payload);
   applied:=stock_v2.demo_multi('order',p_operation,d.payload);
   oid:=(applied->>'order_id')::bigint;
   update stock_v2.order_header set order_number='PO-'||oid where order_id=oid;
   update stock_v2.approval_document set status='applied',target_order_id=oid,applied_at=now() where id=d.id;
  else
   if d.status in ('approved','applied') then perform stock_v2.workflow_require(p_actor,true);end if;
   if d.kind='credit' and d.status='applied' then raise exception 'Approved and applied credit notes are locked';end if;
   if d.status='cancelled' then raise exception 'Document already cancelled';end if;
   if d.target_order_id is not null then
    if not exists(select 1 from stock_v2.order_line where order_id=d.target_order_id and ordered_quantity>received_quantity) then raise exception 'PO has no outstanding balance to cancel';end if;
    insert into stock_v2.order_line_cancellation(order_line_id,quantity,original_ordered_quantity,reason,created_by)
     select order_line_id,ordered_quantity-received_quantity,ordered_quantity,p_data->>'reason',p_actor
     from stock_v2.order_line where order_id=d.target_order_id and ordered_quantity>received_quantity;
    update stock_v2.order_line set ordered_quantity=received_quantity where order_id=d.target_order_id and ordered_quantity>received_quantity;
    update stock_v2.order_header set status='cancelled' where order_id=d.target_order_id;
   end if;
   if length(btrim(coalesce(p_data->>'reason','')))<5 then raise exception 'Cancellation reason required';end if;
   update stock_v2.approval_document set status='cancelled',decision_reason=p_data->>'reason' where id=d.id;
  end if;
  update stock_v2.approval_document set version=version+1,updated_by=p_actor,updated_at=now() where id=d.id returning * into d;
 else raise exception 'Unknown workflow command';end if;
 result:=to_jsonb(d)||jsonb_build_object('application',applied);
 insert into stock_v2.approval_audit(document_id,actor,action,before_values,after_values,reason)
 values(d.id,p_actor,p_command,before_doc,to_jsonb(d),p_data->>'reason');
 insert into stock_v2.approval_operation values(p_operation,p_actor,jsonb_build_object('command',p_command,'data',p_data),result,now());
 return result;
end $$;

-- Stable presentation numbers without rewriting immutable source documents.
create table stock_v2.business_document_number(
 document_id bigint primary key references stock_v2.document(document_id),
 number bigint generated always as identity unique
);
alter table stock_v2.business_document_number enable row level security;
revoke all on stock_v2.business_document_number from public,anon,authenticated;
insert into stock_v2.business_document_number(document_id) select document_id from stock_v2.document order by document_id;
create function stock_v2.assign_business_document_number() returns trigger language plpgsql security invoker set search_path='' as $$
begin insert into stock_v2.business_document_number(document_id) values(new.document_id);return new;end $$;
create trigger assign_business_number after insert on stock_v2.document for each row execute function stock_v2.assign_business_document_number();
create function stock_v2.business_number(p_document bigint) returns text language sql stable security invoker set search_path='' as $$
 select case when d.document_number like 'DEMO-%' then
  case d.document_type when 'issue' then 'ISS-' when 'grv' then 'GRV-' when 'ownership_transfer' then 'TR-' else 'DOC-' end||n.number
  else d.document_number end
 from stock_v2.document d join stock_v2.business_document_number n using(document_id) where d.document_id=p_document
$$;
revoke all on function stock_v2.assign_business_document_number(),stock_v2.business_number(bigint) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION stock_v2.demo_post_combined_grv(p_request uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'stock_v2'
AS $function$
declare own bigint; gid bigint; lid bigint; itm bigint; src bigint; newdoc bigint; result jsonb; oldres record;
rowdata jsonb; v_cost record; v_cost_run bigint; v_po record; v_po_qty numeric; v_po_count numeric; v_invoice text;v_supplier text;v_qty numeric;v_price numeric;v_code text;v_status text:='matched';v_request uuid;
begin
 if p_request is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request';end if;
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select wr.action,wr.result into oldres from stock_v2.demo_workflow_requests wr where wr.request_id=p_request;
 if found then
  if oldres.action<>'combined_grv' then raise exception 'Request identifier already used';end if;
  return oldres.result||jsonb_build_object('replayed',true);
 end if;
 select owner_id into own from stock_v2.owner where owner_code='TEST_'||coalesce(p_data->>'owner_code','') and active;
 if own is null then raise exception 'Unknown demo owner';end if;
 v_supplier:=nullif(btrim(p_data->>'supplier'),'');
 v_invoice:=nullif(btrim(p_data->>'invoice_number'),'');
 if v_supplier is null or v_invoice is null or nullif(p_data->>'invoice_date','') is null then raise exception 'Supplier and invoice details required';end if;
 if jsonb_typeof(p_data->'invoice_lines')<>'array' or jsonb_array_length(p_data->'invoice_lines')<1
 or jsonb_typeof(p_data->'allocations')<>'array'
 or jsonb_typeof(p_data->'new_receipts')<>'array' then raise exception 'Invoice lines, allocations and new receipts arrays required';end if;
 if jsonb_array_length(p_data->'new_receipts')=0 and jsonb_array_length(p_data->'allocations')=0 then raise exception 'No physical receipts selected';end if;
 insert into stock_v2.accounting_grv(owner_id,supplier_name,invoice_number,invoice_date)
 values(own,v_supplier,v_invoice,(p_data->>'invoice_date')::date) returning id into gid;
 for rowdata in select value from jsonb_array_elements(p_data->'invoice_lines') loop
  v_code:=rowdata->>'item_code';v_qty:=(rowdata->>'invoice_quantity')::numeric;v_price:=(rowdata->>'unit_price')::numeric;
  if v_qty is null or v_qty<=0 or v_price is null or v_price<=0 then raise exception 'Invalid invoice quantities or prices';end if;
  select item_id into itm from stock_v2.item where item_code=v_code and active;
  if itm is null then raise exception 'Unknown or inactive item %',v_code;end if;
  insert into stock_v2.accounting_grv_line(grv_id,item_id,invoice_quantity,invoice_unit_price)
  values(gid,itm,v_qty,v_price);
 end loop;
 if nullif(p_data->>'source_credit_id','') is not null then
  perform stock_v2.workflow_require((p_data->>'actor_id')::uuid);
  if length(btrim(coalesce(p_data->>'credit_link_reason','')))<8 or not exists(select 1 from stock_v2.supplier_credit_note c join stock_v2.owner o on o.owner_code='TEST_'||c.owner_code where c.credit_id=(p_data->>'source_credit_id')::bigint and c.status='posted' and o.owner_id=own and lower(btrim(c.supplier_name))=lower(v_supplier)) then raise exception 'Select an applied credit for this owner and supplier, and explain the linked GRV';end if;
  insert into stock_v2.grv_credit_link(grv_id,credit_id,reason,actor) values(gid,(p_data->>'source_credit_id')::bigint,p_data->>'credit_link_reason',(p_data->>'actor_id')::uuid);
 end if;
 -- Direct GRV PO allocations are mandatory and must match physical receipt quantities.
 if jsonb_typeof(p_data->'po_allocations') is distinct from 'array' then
   if jsonb_array_length(p_data->'new_receipts')>0 then raise exception 'PO allocations required for direct receipts';end if;
 end if;
 for rowdata in select value from jsonb_array_elements(coalesce(p_data->'po_allocations','[]'::jsonb)) loop
  if coalesce((rowdata->>'quantity')::numeric,0)<=0 then raise exception 'Direct PO quantity must be positive';end if;
  select ol.order_line_id,ol.item_id,ol.ordered_quantity,ol.received_quantity,h.owner_id,h.supplier_name,h.status,i.item_code
  into v_po from stock_v2.order_line ol join stock_v2.order_header h on h.order_id=ol.order_id
  join stock_v2.item i on i.item_id=ol.item_id
  where ol.order_line_id=(rowdata->>'order_line_id')::bigint for update of ol;
  if not found or v_po.owner_id<>own or lower(btrim(v_po.supplier_name))<>lower(btrim(v_supplier))
    or v_po.status<>'approved' or v_po.item_code<>rowdata->>'item_code'
    or v_po.received_quantity+(rowdata->>'quantity')::numeric>v_po.ordered_quantity
  then raise exception 'Invalid or exceeded supplier PO line';end if;
 end loop;
 if exists(
  select 1 from jsonb_array_elements(p_data->'new_receipts') x
  where (x->>'quantity')::numeric<>coalesce(
    (select sum((a->>'quantity')::numeric) from jsonb_array_elements(coalesce(p_data->'po_allocations','[]'::jsonb)) a
     where a->>'item_code'=x->>'item_code'),0)
 ) then raise exception 'PO line quantities do not match direct stock receipts';end if;
 if exists(
  select 1 from jsonb_array_elements(coalesce(p_data->'po_allocations','[]'::jsonb)) a
  where not exists(select 1 from jsonb_array_elements(p_data->'new_receipts') x where x->>'item_code'=a->>'item_code')
 ) then raise exception 'PO allocation has no matching direct receipt';end if;
 if jsonb_array_length(p_data->'new_receipts')>0 then
  v_request:=md5(p_request::text||':new-receipt')::uuid;
  select stock_v2.demo_multi('direct_grv',v_request,jsonb_build_object(
   'owner_code',p_data->>'owner_code','supplier',v_supplier,
   'receipt_mode','dnote','delivery_note','COMBINED-'||p_request::text,
   'receipt_date',coalesce(p_data->>'receipt_date',p_data->>'invoice_date'),
   'lines',p_data->'new_receipts')) into result;
  newdoc:=(result->>'document_id')::bigint;
 end if;
 -- Apply direct GRV quantities to the selected approved PO line(s) in the same transaction.
 if newdoc is not null then
 for rowdata in select value from jsonb_array_elements(coalesce(p_data->'po_allocations','[]'::jsonb)) loop
  update stock_v2.order_line
   set received_quantity=received_quantity+(rowdata->>'quantity')::numeric
   where order_line_id=(rowdata->>'order_line_id')::bigint;
  insert into stock_v2.demo_grv_order_link(document_id,order_line_id,qty,received_unit_price)
  values(newdoc,(rowdata->>'order_line_id')::bigint,(rowdata->>'quantity')::numeric,
    (select l.invoice_unit_price from stock_v2.accounting_grv_line l
     join stock_v2.item i on i.item_id=l.item_id where l.grv_id=gid and i.item_code=rowdata->>'item_code'));
 end loop;
 end if;
 for rowdata in
  select value from jsonb_array_elements(p_data->'allocations')
  union all
  select jsonb_build_object('line_id',line_id,'quantity',quantity)
  from stock_v2.document_line where document_id=newdoc
 loop
  src:=(rowdata->>'line_id')::bigint;v_qty:=(rowdata->>'quantity')::numeric;
  if src is null or v_qty is null or v_qty<=0 then raise exception 'Invalid receipt allocation';end if;
  select item_id into itm from stock_v2.document_line where line_id=src;
  select id into lid from stock_v2.accounting_grv_line where grv_id=gid and item_id=itm;
  if lid is null then raise exception 'Receipt product missing from invoice';end if;
  insert into stock_v2.accounting_grv_allocation(grv_line_id,receipt_line_id,quantity) values(lid,src,v_qty);
 end loop;
 -- Final GRVs must match all allocated physical quantities exactly.
 if exists(select 1 from stock_v2.accounting_grv_line l where l.grv_id=gid
 and l.invoice_quantity<>coalesce((select sum(a.quantity) from stock_v2.accounting_grv_allocation a where a.grv_line_id=l.id),0))
 then raise exception 'Final GRV quantity must match selected physical receipt quantities';end if;
 -- Record partial invoice allocations; finalise the receipt price only when fully invoiced.
 for v_cost in
  select a.receipt_line_id,dl.document_id,stock_v2.workflow_physical_quantity(dl.line_id) as quantity,al.item_id,al.invoice_unit_price
  from stock_v2.accounting_grv_allocation a
  join stock_v2.accounting_grv_line al on al.id=a.grv_line_id
  join stock_v2.document_line dl on dl.line_id=a.receipt_line_id
  where al.grv_id=gid
 loop
  if (select coalesce(sum(quantity),0) from stock_v2.accounting_grv_allocation where receipt_line_id=v_cost.receipt_line_id)
     <v_cost.quantity then continue;end if;
  if exists(select 1 from stock_v2.price_confirmation where line_id=v_cost.receipt_line_id)
  then raise exception 'Receipt already has a final price';end if;
  insert into stock_v2.price_confirmation(line_id,confirmed_unit_cost,invoice_number)
  select v_cost.receipt_line_id,sum(a.quantity*al.invoice_unit_price)/sum(a.quantity),v_invoice
  from stock_v2.accounting_grv_allocation a join stock_v2.accounting_grv_line al on al.id=a.grv_line_id where a.receipt_line_id=v_cost.receipt_line_id;
  update stock_v2.grv_detail set invoice_number=v_invoice,invoice_date=(p_data->>'invoice_date')::date,price_status='confirmed'
  where document_id=v_cost.document_id
  and not exists(select 1 from stock_v2.document_line dl2 where dl2.document_id=v_cost.document_id
    and not exists(select 1 from stock_v2.price_confirmation pc where pc.line_id=dl2.line_id));
 end loop;
 for v_cost in select distinct item_id from stock_v2.accounting_grv_line where grv_id=gid loop
   v_cost_run:=stock_v2.recalculate_demo_item_costs(v_cost.item_id,'Combined GRV '||v_invoice);
 end loop;
 if exists(select 1 from stock_v2.accounting_grv_line l where l.grv_id=gid and l.invoice_quantity<>
   coalesce((select sum(a.quantity) from stock_v2.accounting_grv_allocation a where a.grv_line_id=l.id),0)) then
  v_status:='disputed';
 end if;
 update stock_v2.accounting_grv set status=v_status where id=gid;
 result:=jsonb_build_object('kind','combined_grv','grv_id',gid,'status',v_status,'new_receipt_document_id',newdoc,'valuation_pending',exists(select 1 from stock_v2.accounting_grv_allocation a join stock_v2.accounting_grv_line al on al.id=a.grv_line_id where al.grv_id=gid and not exists(select 1 from stock_v2.price_confirmation pc where pc.line_id=a.receipt_line_id)));
 insert into stock_v2.demo_workflow_requests(request_id,action,result) values(p_request,'combined_grv',result);
 return result;
end $function$;
