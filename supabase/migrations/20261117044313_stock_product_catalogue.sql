-- Catalogue metadata only. No movements, balances, or historical document changes.
create table stock_v2.product_metadata (
 item_id bigint primary key references stock_v2.item(item_id),
 pastel_stock_code text,
 version integer not null default 1 check(version>0)
);
create table stock_v2.product_audit (
 audit_id bigint generated always as identity primary key,
 item_id bigint not null references stock_v2.item(item_id),
 actor uuid not null,
 operation_id uuid not null unique,
 old_values jsonb,
 new_values jsonb not null,
 changed_at timestamptz not null default now()
);
alter table stock_v2.product_metadata enable row level security;
alter table stock_v2.product_audit enable row level security;
revoke all on stock_v2.product_metadata, stock_v2.product_audit from anon, authenticated;
