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
