-- Chemical active ingredients: product metadata only, no inventory postings.
create table if not exists stock_v2.item_active_ingredient (
 id bigint generated always as identity primary key,
 item_id bigint not null references stock_v2.item(item_id) on delete cascade,
 active_name text not null check(length(btrim(active_name))>0),
 concentration numeric(18,6) not null check(concentration>0),
 concentration_unit text not null check(concentration_unit in ('g/L','g/kg')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid,
 unique(item_id,active_name)
);
create index if not exists item_active_ingredient_item_idx on stock_v2.item_active_ingredient(item_id);
create table if not exists stock_v2.item_active_ingredient_audit (
 audit_id bigint generated always as identity primary key,
 item_id bigint not null,
 actor uuid not null,
 old_ingredients jsonb not null,
 new_ingredients jsonb not null,
 changed_at timestamptz not null default now()
);
-- The API uses the existing verified stock_v2.workflow_require gate;
-- no direct client table grants or writes are added.
