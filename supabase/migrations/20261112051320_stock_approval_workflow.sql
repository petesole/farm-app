-- Stock development only. Existing posted transactions are preserved.
begin;
create table stock_v2.approval_document(
 id uuid primary key, request_number bigint generated always as identity unique,
 kind text not null check(kind in ('po','credit')),
 status text not null check(status in ('draft','pending','approved','applied','rejected','cancelled')),
 payload jsonb not null, version integer not null default 1,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 approved_by uuid references auth.users(id), approved_at timestamptz,
 applied_at timestamptz, target_order_id bigint unique references stock_v2.order_header(order_id),
 target_credit_id bigint unique references stock_v2.supplier_credit_note(credit_id), decision_reason text
);
create table stock_v2.approval_audit(
 id bigint generated always as identity primary key,
 document_id uuid not null references stock_v2.approval_document(id),
 actor uuid not null references auth.users(id), action text not null,
 before_values jsonb,after_values jsonb not null,reason text,
 created_at timestamptz not null default now()
);
create table stock_v2.approval_operation(
 id uuid primary key,actor uuid not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default now()
);
create table stock_v2.grv_correction(
 id bigint generated always as identity primary key,
 operation_id uuid not null unique,grv_line_id bigint references stock_v2.accounting_grv_line(id),
 receipt_line_id bigint references stock_v2.document_line(line_id),
 check((grv_line_id is null)<>(receipt_line_id is null)),
 old_invoice_quantity numeric not null,new_invoice_quantity numeric not null,
 old_unit_price numeric not null,new_unit_price numeric not null,
 physical_quantity numeric not null,quantity_variance numeric not null,
 reason text not null,actor uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index stock_approval_pending_idx on stock_v2.approval_document(status,kind,created_at);
alter table stock_v2.approval_document enable row level security;
alter table stock_v2.approval_audit enable row level security;
alter table stock_v2.approval_operation enable row level security;
alter table stock_v2.grv_correction enable row level security;
revoke all on stock_v2.approval_document,stock_v2.approval_audit,stock_v2.approval_operation,stock_v2.grv_correction from public,anon,authenticated;

create function stock_v2.workflow_access(p_actor uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('can_main',exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin'),'is_admin',p_actor is not null and (
  exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin')
  or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name='admin')),
 'is_stock',p_actor is not null and (
  exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='admin')
  or exists(select 1 from stock_v2.staff_role where user_id=p_actor and active and role_name in ('clerk','supervisor','admin'))))
$$;
create function stock_v2.workflow_require(p_actor uuid,p_admin boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
declare access jsonb:=stock_v2.workflow_access(p_actor);
begin
 if not coalesce((access->>'is_stock')::boolean,false) or (p_admin and not coalesce((access->>'is_admin')::boolean,false)) then
  raise exception 'Stock % access required',case when p_admin then 'Admin' else 'staff' end using errcode='42501';
 end if;
end $$;

create function stock_v2.workflow_validate_po(p jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare own stock_v2.owner; l jsonb;
begin
 select * into own from stock_v2.owner where owner_code='TEST_'||(p->>'owner_code') and active;
 if not found or nullif(btrim(p->>'supplier'),'') is null or nullif(p->>'order_date','') is null then raise exception 'Stock owner, supplier and PO date required';end if;
 perform (p->>'order_date')::date;
 if not exists(select 1 from stock_v2.supplier where active and lower(btrim(supplier_name))=lower(btrim(p->>'supplier'))) then raise exception 'Select an active supplier';end if;
 if exists(select 1 from stock_v2.owner_policy where owner_id=own.owner_id and po_requires_contract) and
  not exists(select 1 from stock_v2.contracts where contract_id=coalesce((select default_contract_id from stock_v2.owner_policy where owner_id=own.owner_id),nullif(p->>'contract_id','')::bigint) and active) then raise exception 'Select an active contract';end if;
 if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 30 then raise exception 'Enter 1–30 PO lines';end if;
 if (select count(distinct x->>'item_code') from jsonb_array_elements(p->'lines') x)<>jsonb_array_length(p->'lines') then raise exception 'Repeated product on PO';end if;
 for l in select value from jsonb_array_elements(p->'lines') loop
  if not exists(select 1 from stock_v2.item where item_code=l->>'item_code' and active) or not coalesce((l->>'quantity')::numeric between .000001 and 1000000000,false) then raise exception 'Select an active product and positive finite quantity';end if;
  if l->>'unit_price' is not null and not coalesce((l->>'unit_price')::numeric between 0 and 1000000000,false) then raise exception 'PO price must be nonnegative and finite';end if;
 end loop;
end $$;

create function stock_v2.workflow_validate_credit(p jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare supplier text:=btrim(p->>'supplier_name');own text:=p->>'owner_code';no text:=btrim(p->>'credit_note_number');
 amount numeric:=(p->>'total_amount')::numeric;line jsonb;original record;allocated numeric:=0;
begin
 if nullif(supplier,'') is null or nullif(no,'') is null or coalesce(own,'') not in ('JS','AO') or not coalesce(amount between 0 and 1000000000,false) or nullif(p->>'credit_note_date','') is null then raise exception 'Supplier, owner, credit note number, date and finite amount required';end if;
 perform (p->>'credit_note_date')::date;
 if exists(select 1 from stock_v2.supplier_credit_note where lower(btrim(supplier_name))=lower(supplier) and credit_note_number=no) then raise exception 'Supplier credit note already exists';end if;
 if p->>'action'='return_credit' then
  if jsonb_typeof(p->'allocations') is distinct from 'array' or jsonb_array_length(p->'allocations') not between 1 and 100 then raise exception 'Select return allocations';end if;
  if (select count(distinct a->>'return_line_id') from jsonb_array_elements(p->'allocations') a)<>jsonb_array_length(p->'allocations') then raise exception 'Repeated return allocation';end if;
  for line in select value from jsonb_array_elements(p->'allocations') loop
   if not coalesce((line->>'quantity')::numeric between .000001 and 1000000000,false) or not coalesce((line->>'unit_credit_price')::numeric between 0 and 1000000000,false) then raise exception 'Invalid credit quantity or price';end if;
   select dl.quantity,s.supplier_name,s.owner_code,d.status,d.document_type into original
   from stock_v2.document_line dl join stock_v2.document d using(document_id) join stock_v2.supplier_return s using(document_id)
   where dl.line_id=(line->>'return_line_id')::bigint for update of dl;
   if not found or original.status<>'posted' or original.document_type<>'return' or original.owner_code<>own or lower(btrim(original.supplier_name))<>lower(supplier) then raise exception 'Return does not match supplier and owner';end if;
   if (line->>'quantity')::numeric>original.quantity-coalesce((select sum(quantity) from stock_v2.supplier_credit_allocation where return_line_id=(line->>'return_line_id')::bigint),0) then raise exception 'Credit exceeds uncredited return quantity';end if;
   allocated:=allocated+(line->>'quantity')::numeric*(line->>'unit_credit_price')::numeric;
  end loop;
  if abs(allocated-amount)>.011 and length(btrim(coalesce(p->>'notes','')))<5 then raise exception 'Explain the difference between allocated value and supplier credit total';end if;
 elsif p->>'action'='price_credit' then
  if amount<=0 or length(btrim(coalesce(p->>'reason','')))<5 then raise exception 'Positive credit amount and reason required';end if;
  if not exists(select 1 from stock_v2.document d join stock_v2.grv_detail g using(document_id) join stock_v2.document_line l using(document_id)
   join stock_v2.movement m on m.document_line_id=l.line_id join stock_v2.owner o on o.owner_id=m.owner_id
   where d.document_id=(p->>'receipt_document_id')::bigint and l.item_id=(p->>'item_id')::bigint and d.status='posted' and d.document_type='grv'
    and lower(btrim(g.supplier_name))=lower(supplier) and o.owner_code='TEST_'||own
    and (nullif(btrim(g.invoice_number),'') is not null or exists(select 1 from stock_v2.accounting_grv_allocation where receipt_line_id=l.line_id))) then raise exception 'Original invoiced receipt does not match supplier, owner and product';end if;
 else raise exception 'Unknown credit kind';end if;

end $$;
revoke all on function stock_v2.workflow_validate_credit(jsonb) from public,anon,authenticated;

create function stock_v2.workflow_apply_credit(p_actor uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare supplier text:=btrim(p->>'supplier_name'); own text:=p->>'owner_code'; no text:=btrim(p->>'credit_note_number');
 amount numeric:=(p->>'total_amount')::numeric; line jsonb; original record; cid bigint; allocated numeric:=0; touched record;
begin
 perform stock_v2.workflow_require(p_actor,true);
 perform pg_catalog.pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 perform stock_v2.workflow_validate_credit(p);
 insert into stock_v2.supplier_credit_note(supplier_name,owner_code,credit_note_number,credit_note_date,total_amount,credit_kind,notes,created_by,status)
 values(supplier,own,no,(p->>'credit_note_date')::date,amount,case when p->>'action'='return_credit' then 'return' else 'price_only' end,p->>'notes',p_actor,'draft') returning credit_id into cid;
 if p->>'action'='return_credit' then
  insert into stock_v2.supplier_credit_allocation select cid,(a->>'return_line_id')::bigint,(a->>'quantity')::numeric,(a->>'unit_credit_price')::numeric from jsonb_array_elements(p->'allocations') a;
  for touched in select distinct l.document_id from stock_v2.document_line l join stock_v2.supplier_credit_allocation a on a.return_line_id=l.line_id where a.credit_id=cid loop
   update stock_v2.supplier_return set credit_status=case
    when (select sum(quantity) from stock_v2.document_line where document_id=touched.document_id)<=
      (select coalesce(sum(a.quantity),0) from stock_v2.document_line l join stock_v2.supplier_credit_allocation a on a.return_line_id=l.line_id where l.document_id=touched.document_id) then 'confirmed' else 'partial' end
   where document_id=touched.document_id;
  end loop;
 else
  insert into stock_v2.supplier_credit_price_adjustment values(cid,(p->>'receipt_document_id')::bigint,(p->>'item_id')::bigint,amount,p->>'reason');
 end if;
 update stock_v2.supplier_credit_note set status='posted' where credit_id=cid;
 return jsonb_build_object('credit_id',cid,'credit_note_number',no,'total_amount',amount);
end $$;

create function stock_v2.workflow_credit_lock() returns trigger language plpgsql security invoker set search_path='' as $$
declare state text;
begin
 if tg_table_name='supplier_credit_note' then
  if old.status='posted' then raise exception 'Approved and applied credit notes are locked. Use a new linked GRV';end if;
 else
  if tg_op='UPDATE' and old.credit_id is distinct from new.credit_id and exists(select 1 from stock_v2.supplier_credit_note where credit_id=old.credit_id and status='posted') then raise exception 'Approved and applied credit allocations are locked';end if;
  select status into state from stock_v2.supplier_credit_note where credit_id=case when tg_op='DELETE' then old.credit_id else new.credit_id end;
  if state='posted' then raise exception 'Approved and applied credit allocations are locked';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger workflow_credit_header_lock before update or delete on stock_v2.supplier_credit_note for each row execute function stock_v2.workflow_credit_lock();
create trigger workflow_credit_lines_lock before insert or update or delete on stock_v2.supplier_credit_allocation for each row execute function stock_v2.workflow_credit_lock();
create trigger workflow_credit_price_lock before insert or update or delete on stock_v2.supplier_credit_price_adjustment for each row execute function stock_v2.workflow_credit_lock();

create function stock_v2.workflow_command(p_actor uuid,p_operation uuid,p_command text,p_data jsonb) returns jsonb
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
    if exists(select 1 from stock_v2.order_line where order_id=d.target_order_id and received_quantity>0) then raise exception 'PO is locked after stock is received';end if;
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

create table stock_v2.physical_correction(
 operation_id uuid primary key,receipt_line_id bigint not null references stock_v2.document_line(line_id),
 old_quantity numeric not null,new_quantity numeric not null,adjustment_id bigint references stock_v2.document(document_id),
 actor uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default now()
);
create table stock_v2.staff_role_audit(
 id bigint generated always as identity primary key, actor uuid not null references auth.users(id),
 user_id uuid not null references auth.users(id),before_values jsonb,after_values jsonb,reason text not null,created_at timestamptz not null default now()
);
alter table stock_v2.physical_correction enable row level security;
alter table stock_v2.staff_role_audit enable row level security;
revoke all on stock_v2.physical_correction,stock_v2.staff_role_audit from public,anon,authenticated;


create function stock_v2.workflow_physical_quantity(p_line bigint) returns numeric language sql stable security invoker set search_path='' as $$
 select l.quantity+coalesce((select sum(m.quantity_delta) from stock_v2.document a join stock_v2.document_line al using(document_id)
 join stock_v2.movement m on m.document_line_id=al.line_id where a.document_type='adjustment' and a.status='posted' and a.parent_document_id=l.document_id and al.source_line_id=l.line_id),0)
 from stock_v2.document_line l where l.line_id=p_line
$$;
revoke all on function stock_v2.workflow_physical_quantity(bigint) from public,anon,authenticated;

create function stock_v2.workflow_correct_grv(p_actor uuid,p_operation uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt stock_v2.approval_operation;src record; r record; oldqty numeric; oldprice numeric; physical numeric;
 qty numeric:=(p->>'invoice_quantity')::numeric;price numeric:=(p->>'unit_price')::numeric;
 gid bigint:=nullif(p->>'grv_line_id','')::bigint;rid bigint:=nullif(p->>'receipt_line_id','')::bigint;
 correction_id bigint; result jsonb; reason text:=btrim(p->>'reason');
begin
 perform stock_v2.workflow_require(p_actor,true);
 perform pg_catalog.pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 if p_operation is null then raise exception 'Operation reference required';end if;
 select * into receipt from stock_v2.approval_operation where id=p_operation;
 if found then
  if receipt.actor is distinct from p_actor or receipt.request is distinct from p then raise exception 'Operation reference reused';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if not coalesce(qty between .000001 and 1000000000,false) or not coalesce(price between .000001 and 1000000000,false) or length(coalesce(reason,''))<8 then raise exception 'Positive finite invoice quantity, unit price and correction reason required';end if;
 if (gid is null)=(rid is null) then raise exception 'Select one GRV line';end if;
 if gid is not null then
  select l.*,h.status,h.invoice_number,o.owner_code into src from stock_v2.accounting_grv_line l join stock_v2.accounting_grv h on h.id=l.grv_id join stock_v2.owner o using(owner_id) where l.id=gid;
  if not found or src.status not in ('posted','matched','disputed') or src.owner_code not in ('TEST_JS','TEST_AO') then raise exception 'Posted development GRV required';end if;
  select c.new_invoice_quantity,c.new_unit_price into oldqty,oldprice from stock_v2.grv_correction c where c.grv_line_id=gid order by c.id desc limit 1;
  oldqty:=coalesce(oldqty,src.invoice_quantity);oldprice:=coalesce(oldprice,src.invoice_unit_price);
  select sum(stock_v2.workflow_physical_quantity(receipt_line_id)) into physical from stock_v2.accounting_grv_allocation where grv_line_id=gid;
 else
  select l.*,d.status,g.invoice_number,o.owner_code,coalesce(pc.confirmed_unit_cost,pr.actual_unit_cost) as price
   into src from stock_v2.document_line l join stock_v2.document d using(document_id) join stock_v2.grv_detail g using(document_id)
   join stock_v2.movement m on m.document_line_id=l.line_id join stock_v2.owner o using(owner_id)
   left join stock_v2.price_confirmation pc using(line_id) left join stock_v2.grv_line_price pr using(line_id)
   where l.line_id=rid and d.document_type='grv';
  if not found or src.status<>'posted' or src.owner_code not in ('TEST_JS','TEST_AO') or nullif(btrim(src.invoice_number),'') is null
   or exists(select 1 from stock_v2.accounting_grv_allocation where receipt_line_id=rid) then raise exception 'Select a posted invoiced direct GRV';end if;
  select c.new_invoice_quantity,c.new_unit_price into oldqty,oldprice from stock_v2.grv_correction c where c.receipt_line_id=rid order by c.id desc limit 1;
  oldqty:=coalesce(oldqty,src.quantity);oldprice:=coalesce(oldprice,src.price);physical:=stock_v2.workflow_physical_quantity(rid);
 end if;
 if oldqty is distinct from (p->>'expected_quantity')::numeric or oldprice is distinct from (p->>'expected_price')::numeric then raise exception 'GRV changed. Reload before correcting';end if;
 if oldqty=qty and oldprice=price then raise exception 'No change entered';end if;
 insert into stock_v2.grv_correction(operation_id,grv_line_id,receipt_line_id,old_invoice_quantity,new_invoice_quantity,old_unit_price,new_unit_price,physical_quantity,quantity_variance,reason,actor)
 values(p_operation,gid,rid,oldqty,qty,oldprice,price,physical,qty-physical,reason,p_actor) returning id into correction_id;
 if gid is not null then
  for r in select distinct a.receipt_line_id from stock_v2.accounting_grv_allocation a where a.grv_line_id=gid loop
   insert into stock_v2.price_confirmation(line_id,confirmed_unit_cost,invoice_number)
   select r.receipt_line_id,sum(a.quantity*coalesce((select c.new_unit_price from stock_v2.grv_correction c where c.grv_line_id=al.id order by c.id desc limit 1),al.invoice_unit_price))/sum(a.quantity),src.invoice_number
    from stock_v2.accounting_grv_allocation a join stock_v2.accounting_grv_line al on al.id=a.grv_line_id where a.receipt_line_id=r.receipt_line_id
   on conflict(line_id) do update set confirmed_unit_cost=excluded.confirmed_unit_cost,invoice_number=excluded.invoice_number,confirmed_at=now();
  end loop;
 else
  insert into stock_v2.price_confirmation(line_id,confirmed_unit_cost,invoice_number) values(rid,price,src.invoice_number)
   on conflict(line_id) do update set confirmed_unit_cost=excluded.confirmed_unit_cost,confirmed_at=now();
 end if;
 perform stock_v2.recalculate_demo_item_costs(src.item_id,'GRV correction '||correction_id||': '||reason);
 result:=jsonb_build_object('correction_id',correction_id,'physical_quantity',physical,'invoice_quantity',qty,'quantity_variance',qty-physical,'stock_changed',false);
 insert into stock_v2.approval_operation values(p_operation,p_actor,p,result,now());return result;
end $$;

create function stock_v2.workflow_correct_physical(p_actor uuid,p_operation uuid,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt stock_v2.approval_operation;src record; currentqty numeric;qty numeric:=(p->>'quantity')::numeric;aid bigint;result jsonb;
begin
 perform stock_v2.workflow_require(p_actor);
 perform pg_catalog.pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 if p_operation is null then raise exception 'Operation reference required';end if;
 select * into receipt from stock_v2.approval_operation where id=p_operation;
 if found then
  if receipt.actor is distinct from p_actor or receipt.request is distinct from p then raise exception 'Operation reference reused';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if not coalesce(qty between .000001 and 1000000000,false) or length(btrim(coalesce(p->>'reason','')))<8 then raise exception 'Positive physical quantity and reason required';end if;
 select l.*,d.document_id into src from stock_v2.document_line l join stock_v2.document d using(document_id)
 where l.line_id=(p->>'receipt_line_id')::bigint and d.status='posted' and d.document_type='grv'
 and exists(select 1 from stock_v2.movement m join stock_v2.owner o using(owner_id) where m.document_line_id=l.line_id and o.owner_code in ('TEST_JS','TEST_AO'));
 if not found then raise exception 'Posted development receipt required';end if;
 if exists(select 1 from stock_v2.grv_detail where document_id=src.document_id and nullif(btrim(invoice_number),'') is not null)
 or exists(select 1 from stock_v2.accounting_grv_allocation a join stock_v2.document_line l on l.line_id=a.receipt_line_id where l.document_id=src.document_id) then perform stock_v2.workflow_require(p_actor,true);end if;
 select src.quantity+coalesce(sum(m.quantity_delta),0) into currentqty
 from stock_v2.document d join stock_v2.document_line l using(document_id) join stock_v2.movement m on m.document_line_id=l.line_id
 where d.document_type='adjustment' and d.status='posted' and d.parent_document_id=src.document_id and l.source_line_id=src.line_id;
 if currentqty is distinct from (p->>'expected_quantity')::numeric then raise exception 'Physical quantity changed. Reload';end if;
 if qty<coalesce((select sum(quantity) from stock_v2.supplier_return_source where receipt_line_id=src.line_id),0) then raise exception 'Physical receipt cannot be less than stock already returned against it';end if;
 aid:=stock_v2.admin_correct_quantity(src.line_id,qty,p->>'reason');
 if aid is null then raise exception 'No physical change entered';end if;
 perform stock_v2.recalculate_demo_item_costs(src.item_id,'Physical receipt correction: '||(p->>'reason'));
 insert into stock_v2.physical_correction values(p_operation,src.line_id,currentqty,qty,aid,p_actor,p->>'reason',now());
 result:=jsonb_build_object('adjustment_id',aid,'quantity',qty);
 insert into stock_v2.approval_operation values(p_operation,p_actor,p,result,now());return result;
end $$;

create function stock_v2.workflow_assign_staff(p_actor uuid,p_user uuid,p_role text,p_active boolean,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare before_doc jsonb;after_doc jsonb;
begin
 perform stock_v2.workflow_require(p_actor,true);
 if coalesce(p_role,'') not in ('clerk','supervisor','admin') or p_active is null or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Role, active status and reason required';end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User not found';end if;
 perform pg_catalog.pg_advisory_xact_lock(hashtext('stock_v2_staff_roles'));
 select to_jsonb(s) into before_doc from stock_v2.staff_role s where user_id=p_user;
 insert into stock_v2.staff_role(user_id,role_name,active,assigned_by,note) values(p_user,p_role,p_active,p_actor,p_reason)
 on conflict(user_id) do update set role_name=excluded.role_name,active=excluded.active,assigned_by=p_actor,assigned_at=now(),note=p_reason;
 select to_jsonb(s) into after_doc from stock_v2.staff_role s where user_id=p_user;
 insert into stock_v2.staff_role_audit(actor,user_id,before_values,after_values,reason) values(p_actor,p_user,before_doc,after_doc,p_reason);
end $$;
revoke all on function stock_v2.workflow_correct_grv(uuid,uuid,jsonb),stock_v2.workflow_correct_physical(uuid,uuid,jsonb),stock_v2.workflow_assign_staff(uuid,uuid,text,boolean,text) from public,anon,authenticated;


create table stock_v2.grv_credit_link(
 grv_id bigint primary key references stock_v2.accounting_grv(id),credit_id bigint not null references stock_v2.supplier_credit_note(credit_id),
 reason text not null,actor uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table stock_v2.grv_credit_link enable row level security;
revoke all on stock_v2.grv_credit_link from public,anon,authenticated;
create or replace function stock_v2.guard_grv_details() returns trigger language plpgsql set search_path='' as $$
declare state text;did bigint;
begin
 did:=case when tg_op='DELETE' then old.document_id else new.document_id end;
 select status into state from stock_v2.document where document_id=did for update;
 if state<>'draft' and tg_op<>'UPDATE' then raise exception 'Posted GRV detail locked';end if;
 if state<>'draft' and tg_op='UPDATE' then
  if new.supplier_name is distinct from old.supplier_name or new.document_id is distinct from old.document_id then raise exception 'Posted GRV identity locked';end if;
  if (new.delivery_note is distinct from old.delivery_note or new.delivery_note_date is distinct from old.delivery_note_date) and
   (nullif(btrim(old.invoice_number),'') is not null or exists(select 1 from stock_v2.accounting_grv_allocation a join stock_v2.document_line l on l.line_id=a.receipt_line_id where l.document_id=did)) then raise exception 'D-Note is locked after GRV link';end if;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;

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
 -- Never reprice an existing receipt line and never permit partially priced source lines.
 for v_cost in
  select a.receipt_line_id,dl.document_id,stock_v2.workflow_physical_quantity(dl.line_id) as quantity,al.item_id,al.invoice_unit_price
  from stock_v2.accounting_grv_allocation a
  join stock_v2.accounting_grv_line al on al.id=a.grv_line_id
  join stock_v2.document_line dl on dl.line_id=a.receipt_line_id
  where al.grv_id=gid
 loop
  if (select coalesce(sum(quantity),0) from stock_v2.accounting_grv_allocation where receipt_line_id=v_cost.receipt_line_id)
     <>v_cost.quantity then raise exception 'Final GRV requires full DNote line allocation';end if;
  if exists(select 1 from stock_v2.price_confirmation where line_id=v_cost.receipt_line_id)
  then raise exception 'Receipt already has a final price';end if;
  insert into stock_v2.price_confirmation(line_id,confirmed_unit_cost,invoice_number)
  values(v_cost.receipt_line_id,v_cost.invoice_unit_price,v_invoice);
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
 result:=jsonb_build_object('kind','combined_grv','grv_id',gid,'status',v_status,'new_receipt_document_id',newdoc);
 insert into stock_v2.demo_workflow_requests(request_id,action,result) values(p_request,'combined_grv',result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION stock_v2.accounting_grv_check_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'stock_v2'
AS $function$
declare h record; r record; already numeric;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select g.owner_id,g.supplier_name,g.status,l.item_id into h from stock_v2.accounting_grv_line l
 join stock_v2.accounting_grv g on g.id=l.grv_id where l.id=new.grv_line_id for update of g;
 if not found or h.status not in ('draft','disputed') then raise exception 'GRV is not editable';end if;
 select dl.item_id,stock_v2.workflow_physical_quantity(dl.line_id) as quantity,d.status,gd.supplier_name,m.owner_id into r
 from stock_v2.document_line dl join stock_v2.document d on d.document_id=dl.document_id
 join stock_v2.grv_detail gd on gd.document_id=d.document_id
 join stock_v2.movement m on m.document_line_id=dl.line_id and m.quantity_delta>0
 where dl.line_id=new.receipt_line_id and d.document_number like 'DEMO-%' for update of dl;
 if not found or r.item_id<>h.item_id or r.owner_id<>h.owner_id or r.status<>'posted'
 or lower(btrim(r.supplier_name))<>lower(btrim(h.supplier_name)) then
 raise exception 'Receipt supplier, owner, product or status mismatch';end if;
 select coalesce(sum(a.quantity),0) into already from stock_v2.accounting_grv_allocation a
 where a.receipt_line_id=new.receipt_line_id and a.id<>coalesce(new.id,-1);
 if already+new.quantity>r.quantity then raise exception 'Receipt quantity exceeded';end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION stock_v2.recalculate_demo_item_costs(p_item_id bigint, p_reason text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'stock_v2'
AS $function$
declare r record; q numeric; v numeric; wa numeric; unit_price numeric; mv numeric; rk bigint; provisional_flag boolean; from_mov bigint;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 if not exists(select 1 from stock_v2.item where item_id=p_item_id and active) then raise exception 'Demo products only';end if;
 insert into stock_v2.cost_run(reason,status) values(p_reason,'running') returning run_id into rk;
 for r in
 select m.movement_id,m.quantity_delta,m.owner_id,dl.item_id,dl.line_id,dl.source_line_id,d.document_type,d.document_id,d.document_date,
   coalesce(pc.confirmed_unit_cost,gp.actual_unit_cost) actual_cost,gp.provisional_unit_cost,
   (select m2.movement_id from stock_v2.movement m2 where m2.document_line_id=dl.line_id and m2.quantity_delta<0 limit 1) source_transfer_movement
 from stock_v2.movement m join stock_v2.document_line dl on dl.line_id=m.document_line_id
 join stock_v2.document d on d.document_id=dl.document_id
 left join stock_v2.grv_line_price gp on gp.line_id=dl.line_id
 left join stock_v2.price_confirmation pc on pc.line_id=dl.line_id
 where d.status='posted' and dl.item_id=p_item_id
 order by d.document_date,d.document_id,case when d.document_type='ownership_transfer' and m.quantity_delta<0 then 0 else 1 end,m.movement_id
 loop
 select coalesce(sum(mm.quantity_delta),0),coalesce(sum(ce.movement_value),0) into q,v
 from stock_v2.cost_entry ce
 join stock_v2.movement mm on mm.movement_id=ce.movement_id
 where ce.run_id=rk and ce.owner_id=r.owner_id;
 q:=coalesce(q,0);v:=coalesce(v,0);
 wa:=case when q>0 then v/q else null end;
 provisional_flag:=false;
 if r.document_type in ('opening','grv') then
  unit_price:=coalesce(r.actual_cost,r.provisional_unit_cost,wa,10::numeric);
  if unit_price is null then raise exception 'Opening or GRV cost missing for line % (owner %)',r.line_id,r.owner_id;end if;
  provisional_flag:=r.actual_cost is null;
 elsif r.document_type='ownership_transfer' and r.quantity_delta>0 then
  select ce.unit_cost into unit_price from stock_v2.cost_entry ce
  where ce.run_id=rk and ce.movement_id=r.source_transfer_movement;
  if unit_price is null then raise exception 'Source transfer cost missing for line %',r.line_id;end if;
 elsif r.document_type='return' then
  select ce.unit_cost into unit_price from stock_v2.cost_entry ce
  join stock_v2.movement m2 on m2.movement_id=ce.movement_id
  join stock_v2.document_line dl2 on dl2.line_id=m2.document_line_id
  where ce.run_id=rk and dl2.line_id=r.source_line_id and m2.owner_id=r.owner_id and m2.quantity_delta<0 limit 1;
  unit_price:=coalesce(unit_price,wa);
  if unit_price is null then raise exception 'Return cost missing for line %',r.line_id;end if;
 elsif r.document_type='adjustment' and r.source_line_id is not null and exists(select 1 from stock_v2.document_line sl join stock_v2.document sd using(document_id) where sl.line_id=r.source_line_id and sd.document_type='grv') then
  -- A linked receipt correction reverses/adds the source receipt's cost.
  -- Ordinary stocktakes and direct adjustments continue to use current WA.
  select coalesce(pc.confirmed_unit_cost,gp.actual_unit_cost,gp.provisional_unit_cost,ce.unit_cost),
         coalesce(ce.provisional,true) and pc.confirmed_unit_cost is null and gp.actual_unit_cost is null
  into unit_price,provisional_flag from stock_v2.document_line sl
  left join stock_v2.price_confirmation pc on pc.line_id=sl.line_id
  left join stock_v2.grv_line_price gp on gp.line_id=sl.line_id
  left join lateral(select x.unit_cost,x.provisional from stock_v2.cost_entry x join stock_v2.movement sm on sm.movement_id=x.movement_id where x.run_id=rk and sm.document_line_id=sl.line_id and sm.owner_id=r.owner_id limit 1)ce on true
  where sl.line_id=r.source_line_id;
  if unit_price is null then raise exception 'Source receipt cost missing for correction line %',r.line_id;end if;
 else
  unit_price:=wa;
  if unit_price is null then raise exception 'WA cost unavailable for issue or adjustment line %',r.line_id;end if;
 end if;
 if q+r.quantity_delta < -0.000001 then raise exception 'Negative stock in historical replay for movement %',r.movement_id;end if;
 mv:=r.quantity_delta*unit_price;
 if v+mv < -0.0001 or (abs(q+r.quantity_delta)<0.000001 and abs(v+mv)>0.0001) then
  raise exception 'Receipt correction conflicts with already consumed stock valuation. Reconcile issued costs before posting movement %',r.movement_id;
 end if;
 insert into stock_v2.cost_entry(run_id,movement_id,item_id,owner_id,quantity_after,value_after,unit_cost,movement_value,provisional)
 values(rk,r.movement_id,r.item_id,r.owner_id,q+r.quantity_delta,v+mv,unit_price,mv,provisional_flag);
 end loop;
 update stock_v2.cost_run set status='complete',finished_at=now() where run_id=rk;
 return rk;
end $function$
;

-- Existing approved POs remain approved, represented as already finalised documents.
-- This adds review metadata only; it does not change original orders, receipts or stock.
insert into stock_v2.approval_document(id,kind,status,payload,target_order_id,applied_at)
select gen_random_uuid(),'po',case when h.status='cancelled' then 'cancelled' else 'applied' end,
 jsonb_build_object('owner_code',replace(o.owner_code,'TEST_',''),'supplier',h.supplier_name,'order_date',h.order_date,'contract_id',h.contract_id,
 'lines',(select coalesce(jsonb_agg(jsonb_build_object('item_code',i.item_code,'quantity',l.ordered_quantity,'unit_price',l.ordered_unit_price) order by l.order_line_id),'[]'::jsonb) from stock_v2.order_line l join stock_v2.item i using(item_id) where l.order_id=h.order_id)),h.order_id,now()
from stock_v2.order_header h join stock_v2.owner o using(owner_id) where o.owner_code in ('TEST_JS','TEST_AO');

-- Private database connection only. Browser roles cannot forge an actor argument.
revoke all on function stock_v2.workflow_access(uuid),stock_v2.workflow_require(uuid,boolean),stock_v2.workflow_validate_po(jsonb),stock_v2.workflow_apply_credit(uuid,jsonb),stock_v2.workflow_command(uuid,uuid,text,jsonb),stock_v2.workflow_credit_lock() from public,anon,authenticated;
revoke execute on all functions in schema stock_v2 from public,anon,authenticated;
commit;
