-- Stock V2 combined accounting GRV: DRAFT FOR ISOLATED TEST DATABASE ONLY.
-- NOT APPLIED TO FARMINGMAIN. Do not deploy before transaction/rollback tests.
-- Stock remains sourced from physical DNote/direct-receipt movement rows.
create table if not exists stock_v2.accounting_grv (
  accounting_grv_id bigint generated always as identity primary key,
  owner_id bigint not null references stock_v2.owner(owner_id),
  supplier_name text not null check (length(btrim(supplier_name)) > 0),
  invoice_number text not null check (length(btrim(invoice_number)) > 0),
  invoice_date date not null,
  status text not null default 'draft' check(status in ('draft','disputed','approved','void')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (owner_id,supplier_name,invoice_number)
);
create table if not exists stock_v2.accounting_grv_line (
  accounting_line_id bigint generated always as identity primary key,
  accounting_grv_id bigint not null references stock_v2.accounting_grv(accounting_grv_id),
  item_id bigint not null references stock_v2.item(item_id),
  invoice_quantity numeric not null check(invoice_quantity>=0),
  invoice_unit_price numeric not null check(invoice_unit_price>=0),
  unique(accounting_grv_id,item_id)
);
-- Many invoice allocations may point to one physical receipt line.
-- Partial allocation of one delivery to multiple invoices is supported.
create table if not exists stock_v2.accounting_grv_allocation (
  accounting_line_id bigint not null references stock_v2.accounting_grv_line(accounting_line_id),
  received_line_id bigint not null references stock_v2.document_line(line_id),
  allocated_quantity numeric not null check(allocated_quantity>0),
  primary key(accounting_line_id,received_line_id)
);
create index if not exists accounting_grv_alloc_received_idx on stock_v2.accounting_grv_allocation(received_line_id);
-- A fresh direct receipt MUST be posted by the existing inventory posting engine,
-- generating its own document_line/movement. Only then can it be allocated here.
-- Never insert stock_v2.movement from accounting reconciliation.
create or replace function stock_v2.validate_accounting_grv_allocation()
returns trigger language plpgsql set search_path=pg_catalog,stock_v2 as $$
declare
 v_account record;
 v_receipt record;
 v_allocated numeric;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select h.owner_id,h.supplier_name,h.status,l.item_id
 into v_account
 from stock_v2.accounting_grv_line l
 join stock_v2.accounting_grv h using(accounting_grv_id)
 where l.accounting_line_id=new.accounting_line_id
 for update of h;
 if not found or v_account.status not in ('draft','disputed') then
   raise exception 'Accounting GRV not editable';
 end if;
 select dl.item_id,dl.quantity,d.status,g.supplier_name,
        m.owner_id,m.quantity_delta
 into v_receipt
 from stock_v2.document_line dl
 join stock_v2.document d on d.document_id=dl.document_id
 join stock_v2.grv_detail g on g.document_id=d.document_id
 join stock_v2.movement m on m.document_line_id=dl.line_id and m.quantity_delta>0
 where dl.line_id=new.received_line_id
 for update of dl;
 if not found or v_receipt.status<>'posted' or v_receipt.item_id<>v_account.item_id
  or v_receipt.owner_id<>v_account.owner_id
  or lower(btrim(v_receipt.supplier_name))<>lower(btrim(v_account.supplier_name)) then
   raise exception 'Physical receipt must be posted, matching supplier, grower and product';
 end if;
 select coalesce(sum(a.allocated_quantity),0) into v_allocated
 from stock_v2.accounting_grv_allocation a
 where a.received_line_id=new.received_line_id
   and (tg_op='INSERT' or a.accounting_line_id<>new.accounting_line_id);
 if v_allocated+new.allocated_quantity>v_receipt.quantity then
   raise exception 'Invoice allocations exceed physical receipt quantity';
 end if;
 return new;
end $$;
drop trigger if exists check_accounting_grv_allocation on stock_v2.accounting_grv_allocation;
create trigger check_accounting_grv_allocation before insert or update on stock_v2.accounting_grv_allocation
for each row execute function stock_v2.validate_accounting_grv_allocation();
-- The backend must additionally validate invoice-line variance, permissions,
-- idempotency, invoice approval and valuation prior to publishing this feature.
-- Deliberately no grants, no public RPC, no deployed edge handler, no stock writes.

-- Atomic draft builder. Private backend ONLY; edge handler must authenticate and
-- authorise accounting roles before calling via the private DB connection.
-- Input:
-- owner_code JS|AO, supplier, invoice_number, invoice_date,
-- lines:[{item_code,invoice_quantity,invoice_unit_price}],
-- allocations:[{line_id,quantity}], new_receipts:[{item_code,quantity}].
-- Existing DNotes may be allocated partly across different invoices.
create or replace function stock_v2.demo_create_accounting_grv(
 p_request uuid, p_data jsonb
) returns jsonb language plpgsql set search_path=pg_catalog,stock_v2 as $$
declare
 v_owner bigint;
 v_grv bigint;
 v_receipt bigint;
 v_receipt_data jsonb;
 v_doc record;
 v_line record;
 v_invoice record;
 v_alloc jsonb;
 v_new jsonb;
 v_request uuid;
 v_item bigint;
 v_accounting_line bigint;
 v_requested numeric;
 v_total numeric;
 v_result jsonb;
 v_current numeric;
begin
 if p_request is null or jsonb_typeof(p_data->'lines')<>'array'
    or jsonb_array_length(p_data->'lines')=0
    or jsonb_typeof(p_data->'allocations')<>'array'
    or jsonb_typeof(p_data->'new_receipts')<>'array'
 then raise exception 'Malformed combined GRV request';end if;
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select result into v_result from stock_v2.demo_workflow_requests where request_id=p_request;
 if found then
  if v_result->>'kind'<>'combined_accounting_grv' then raise exception 'Request ID already used';end if;
  return v_result||jsonb_build_object('replayed',true);
 end if;
 select owner_id into v_owner from stock_v2.owner
 where owner_code='TEST_'||(p_data->>'owner_code') and active;
 if v_owner is null then raise exception 'Unknown or inactive demo owner';end if;
 if nullif(btrim(p_data->>'supplier'),'') is null or
    nullif(btrim(p_data->>'invoice_number'),'') is null or
    nullif(p_data->>'invoice_date','') is null then
    raise exception 'Supplier, invoice number and date required';
 end if;
 -- All linked physical receipt lines must be for exactly the selected owner/supplier.
 for v_alloc in select value from jsonb_array_elements(p_data->'allocations') loop
  if coalesce((v_alloc->>'quantity')::numeric,0)<=0 then raise exception 'Positive allocation quantity required';end if;
  select dl.line_id,dl.item_id,g.supplier_name,m.owner_id,d.status
    into v_doc from stock_v2.document_line dl
   join stock_v2.document d on d.document_id=dl.document_id
   join stock_v2.grv_detail g on g.document_id=d.document_id
   join stock_v2.movement m on m.document_line_id=dl.line_id and m.quantity_delta>0
   where dl.line_id=(v_alloc->>'line_id')::bigint
   for update of dl;
  if not found or v_doc.status<>'posted' or v_doc.owner_id<>v_owner or
     lower(btrim(v_doc.supplier_name))<>lower(btrim(p_data->>'supplier')) then
     raise exception 'Selected physical DNote does not match supplier/owner';
  end if;
 end loop;
 insert into stock_v2.accounting_grv(owner_id,supplier_name,invoice_number,invoice_date)
 values(v_owner,btrim(p_data->>'supplier'),btrim(p_data->>'invoice_number'),(p_data->>'invoice_date')::date)
 returning accounting_grv_id into v_grv;
 for v_invoice in
  select x->>'item_code' as item_code,
         (x->>'invoice_quantity')::numeric as quantity,
         (x->>'invoice_unit_price')::numeric as unit_price
  from jsonb_array_elements(p_data->'lines') x loop
  if v_invoice.quantity<0 or v_invoice.unit_price<0 then raise exception 'Negative invoice values';end if;
  select item_id into v_item from stock_v2.item where item_code=v_invoice.item_code and active;
  if v_item is null then raise exception 'Unknown item %',v_invoice.item_code;end if;
  insert into stock_v2.accounting_grv_line(accounting_grv_id,item_id,invoice_quantity,invoice_unit_price)
  values(v_grv,v_item,v_invoice.quantity,v_invoice.unit_price)
  returning accounting_line_id into v_accounting_line;
 end loop;
 -- This uses the existing STOCK posting engine, in the SAME DB transaction.
 -- A failed allocation will roll back both new stock and accounting GRV.
 if jsonb_array_length(p_data->'new_receipts')>0 then
  v_request:=p_request; -- separate namespace for existing demo_multi request IDs
  v_request:=md5(p_request::text||':new-receipt')::uuid;
  v_receipt_data:=jsonb_build_object(
   'owner_code',p_data->>'owner_code','supplier',p_data->>'supplier',
   'receipt_mode','dnote','delivery_note','DIRECT-'||p_request::text,
   'receipt_date',coalesce(p_data->>'receipt_date',current_date::text),
   'lines',p_data->'new_receipts'
  );
  v_result:=stock_v2.demo_multi('direct_grv',v_request,v_receipt_data);
  v_receipt:=(v_result->>'document_id')::bigint;
 end if;
 -- Expand new direct receipt into the same allocation mechanism.
 for v_alloc in
  select value from jsonb_array_elements(p_data->'allocations')
  union all
  select jsonb_build_object('line_id',dl.line_id,'quantity',dl.quantity)
  from stock_v2.document_line dl where dl.document_id=v_receipt
 loop
  select dl.item_id into v_item from stock_v2.document_line dl
   where dl.line_id=(v_alloc->>'line_id')::bigint;
  select accounting_line_id into v_accounting_line
  from stock_v2.accounting_grv_line
  where accounting_grv_id=v_grv and item_id=v_item;
  if v_accounting_line is null then raise exception 'Receipt product missing from invoice lines';end if;
  insert into stock_v2.accounting_grv_allocation(accounting_line_id,received_line_id,allocated_quantity)
  values(v_accounting_line,(v_alloc->>'line_id')::bigint,(v_alloc->>'quantity')::numeric);
 end loop;
 -- Variances are explicitly preserved; unequal invoice quantities do not alter stock.
 if exists(
  select 1 from stock_v2.accounting_grv_line al
  where al.accounting_grv_id=v_grv and al.invoice_quantity<>
   coalesce((select sum(a.allocated_quantity) from stock_v2.accounting_grv_allocation a
             where a.accounting_line_id=al.accounting_line_id),0)
 ) then update stock_v2.accounting_grv set status='disputed' where accounting_grv_id=v_grv;end if;
 v_result:=jsonb_build_object('kind','combined_accounting_grv',
   'accounting_grv_id',v_grv,'direct_receipt_document_id',v_receipt,
   'status',(select status from stock_v2.accounting_grv where accounting_grv_id=v_grv));
 insert into stock_v2.demo_workflow_requests(request_id,action,result)
 values(p_request,'combined_accounting_grv',v_result);
 return v_result;
end $$;

-- Do not GRANT or expose this function until a dedicated test run proves:
-- (1) old receipts generate ZERO new movement rows;
-- (2) direct receipts post exactly once, with rollback on any mismatch;
-- (3) allocations cannot exceed physical receipts, including concurrency;
-- (4) duplicate request IDs replay and duplicate invoices are blocked;
-- (5) supplier/owner/product mismatches are rejected;
-- (6) invoice variances are retained for approval and costing;
-- (7) direct_grv owner policy, access control and valuation are correct.
