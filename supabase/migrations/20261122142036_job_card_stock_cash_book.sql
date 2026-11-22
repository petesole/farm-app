create table if not exists stock_v2.buying_category (
  category_id bigint generated always as identity primary key,
  catalogue_group text not null check (catalogue_group in ('general', 'vehicle', 'implement', 'irrigation')),
  category_name text not null check (category_name = btrim(category_name) and length(category_name) between 1 and 120)
);

create unique index if not exists buying_category_group_name_key
  on stock_v2.buying_category (catalogue_group, lower(category_name));

create table if not exists stock_v2.buying_item_category (
  item_id bigint not null references stock_v2.item(item_id),
  category_id bigint not null references stock_v2.buying_category(category_id),
  primary key (item_id, category_id)
);

create index if not exists buying_item_category_category_idx
  on stock_v2.buying_item_category (category_id, item_id);

alter table stock_v2.buying_category enable row level security;
alter table stock_v2.buying_item_category enable row level security;
revoke all on stock_v2.buying_category, stock_v2.buying_item_category from public, anon, authenticated;

insert into stock_v2.buying_category (catalogue_group, category_name) values
  ('vehicle', 'Filters'),
  ('vehicle', 'Tyres, Tubes & Wheels'),
  ('vehicle', 'Bearings, Bushes & Seals'),
  ('vehicle', 'Belts, Pulleys & Tensioners'),
  ('vehicle', 'Engine & Gaskets'),
  ('vehicle', 'Fuel System'),
  ('vehicle', 'Cooling System'),
  ('vehicle', 'Electrical & Lighting'),
  ('vehicle', 'Brakes'),
  ('vehicle', 'Steering & Suspension'),
  ('vehicle', 'Clutch, Transmission & Drivetrain'),
  ('vehicle', 'Hydraulics'),
  ('vehicle', 'PTO & Linkage'),
  ('vehicle', 'Exhaust & Emissions'),
  ('vehicle', 'Body, Cab & Controls'),
  ('vehicle', 'Fasteners & Fittings'),
  ('implement', 'Bearings, Bushes & Seals'),
  ('implement', 'Belts, Chains & Sprockets'),
  ('implement', 'Tyres, Wheels & Hubs'),
  ('implement', 'Gearboxes & Drives'),
  ('implement', 'PTO & Linkage'),
  ('implement', 'Hydraulics'),
  ('implement', 'Tillage & Wear Parts'),
  ('implement', 'Planting & Metering'),
  ('implement', 'Sprayer Components'),
  ('implement', 'Cutting & Harvesting Parts'),
  ('implement', 'Frames, Guards & Mounts'),
  ('implement', 'Electrical & Controls'),
  ('implement', 'Fasteners & Fittings'),
  ('irrigation', 'Sprinklers & Nozzles'),
  ('irrigation', 'Drip & Micro-Irrigation'),
  ('irrigation', 'Pipes & Fittings'),
  ('irrigation', 'Valves & Controls'),
  ('irrigation', 'Filtration'),
  ('irrigation', 'Pumps & Pump Spares'),
  ('irrigation', 'Motors & Drives'),
  ('irrigation', 'Pivot Drive & Alignment'),
  ('irrigation', 'Pivot Structure & Water Delivery'),
  ('irrigation', 'Electrical & Protection'),
  ('irrigation', 'Gauges, Meters & Sensors'),
  ('irrigation', 'Hoses & Portable Irrigation'),
  ('irrigation', 'Bearings, Bushes & Seals')
on conflict (catalogue_group, lower(category_name)) do nothing;

-- Persist a reported receipt without posting inventory. The approval transaction
-- records its decision and posts through the existing receiving routines.
create table stock_v2.receipt_verification (
  id uuid primary key,
  request_number bigint generated always as identity unique,
  receipt_action text not null check (receipt_action in ('unplanned_dnote', 'multi_po_dnote', 'combined_grv', 'grv', 'direct_grv')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  submitted_by uuid not null references auth.users(id),
  replaces_id uuid unique references stock_v2.receipt_verification(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'posted', 'returned')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  posting_result jsonb,
  check (
    (status = 'pending' and decided_by is null and decided_at is null and decision_reason is null and posting_result is null)
    or (status = 'posted' and decided_by is not null and decided_at is not null and decision_reason is null and posting_result is not null)
    or (status = 'returned' and decided_by is not null and decided_at is not null and nullif(btrim(decision_reason), '') is not null and posting_result is null)
  )
);

alter table stock_v2.receipt_verification enable row level security;
revoke all on stock_v2.receipt_verification from public, anon, authenticated;
create index receipt_verification_pending_idx
  on stock_v2.receipt_verification (request_number)
  where status = 'pending';

create table stock_v2.job_card (
  id uuid primary key,
  job_number bigint generated always as identity unique,
  vehicle_id bigint not null references public.vehicle(vehicle_id),
  work_description text not null check (length(btrim(work_description)) between 1 and 1000),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now()
);

create table stock_v2.job_card_part (
  id bigint generated always as identity primary key,
  job_id uuid not null references stock_v2.job_card(id),
  owner_id bigint not null references stock_v2.owner(owner_id),
  item_id bigint not null references stock_v2.item(item_id),
  requested_quantity numeric not null check (requested_quantity between 0.000001 and 100000),
  sample_details text check (length(sample_details) <= 500),
  unique (job_id, owner_id, item_id)
);

alter table stock_v2.job_card enable row level security;
alter table stock_v2.job_card_part enable row level security;
revoke all on stock_v2.job_card, stock_v2.job_card_part from public, anon, authenticated;

create table stock_v2.job_part_quote (
  id uuid primary key,
  part_id bigint not null references stock_v2.job_card_part(id),
  supplier_id bigint not null references stock_v2.supplier(supplier_id),
  quote_reference text not null check (length(btrim(quote_reference)) between 1 and 120),
  quote_date date not null,
  currency text not null check (currency in ('USD','ZiG')),
  unit_price numeric(18,4) not null check (unit_price>0),
  quoted_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  unique (part_id,supplier_id,quote_reference)
);
create index job_part_quote_part_idx on stock_v2.job_part_quote(part_id);
alter table stock_v2.job_part_quote enable row level security;
revoke all on stock_v2.job_part_quote from public, anon, authenticated;

create table stock_v2.job_part_reservation_event (
  id uuid primary key,
  part_id bigint not null references stock_v2.job_card_part(id),
  quantity_delta numeric not null check (quantity_delta between -100000 and 100000 and quantity_delta <> 0),
  actor uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index job_part_reservation_event_part_idx on stock_v2.job_part_reservation_event(part_id);
alter table stock_v2.job_part_reservation_event enable row level security;
revoke all on stock_v2.job_part_reservation_event from public, anon, authenticated;

create view stock_v2.job_part_reserved with (security_invoker=true) as
  select p.id as part_id,p.owner_id,p.item_id,coalesce(sum(e.quantity_delta),0) as quantity
  from stock_v2.job_card_part p left join stock_v2.job_part_reservation_event e on e.part_id=p.id
  group by p.id;
revoke all on stock_v2.job_part_reserved from public, anon, authenticated;

create function stock_v2.available_after_job_reservations(p_owner bigint,p_item bigint,p_location bigint)
returns numeric language sql stable security invoker set search_path='' as $$
  select coalesce((select q.quantity from stock_v2.quantity_balance q
    where q.owner_id=p_owner and q.item_id=p_item and q.location_id=p_location),0)
    - case when exists(select 1 from stock_v2.location where location_id=p_location and location_code='TEST_WH')
      then coalesce((select sum(r.quantity) from stock_v2.job_part_reserved r
        where r.owner_id=p_owner and r.item_id=p_item),0)
      else 0 end;
$$;
revoke all on function stock_v2.available_after_job_reservations(bigint,bigint,bigint) from public, anon, authenticated;

create function stock_v2.protect_job_reservations_on_post()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.status<>'posted' or old.status='posted' or new.document_type not in ('issue','ownership_transfer','return') then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('stock_v2_inventory_posting'));
  if exists(
    select 1 from stock_v2.document_line l join stock_v2.movement m on m.document_line_id=l.line_id
    join stock_v2.location loc on loc.location_id=m.location_id and loc.location_code='TEST_WH'
    where l.document_id=new.document_id
    group by m.owner_id,l.item_id,m.location_id
    having sum(m.quantity_delta)<0 and exists(
      select 1 from stock_v2.job_part_reserved r where r.owner_id=m.owner_id and r.item_id=l.item_id and r.quantity>0
    ) and stock_v2.available_after_job_reservations(m.owner_id,l.item_id,m.location_id)+sum(m.quantity_delta)<0
  ) then raise exception 'Quantity is reserved for a Job Card'; end if;
  return new;
end $$;
revoke all on function stock_v2.protect_job_reservations_on_post() from public, anon, authenticated;
create trigger job_reservations_before_stock_post
before update of status on stock_v2.document for each row
execute function stock_v2.protect_job_reservations_on_post();

create table stock_v2.job_part_issue (
  part_id bigint not null references stock_v2.job_card_part(id),
  line_id bigint primary key references stock_v2.document_line(line_id),
  issued_by uuid not null references auth.users(id),
  operation_id uuid not null unique
);
create index job_part_issue_part_idx on stock_v2.job_part_issue(part_id);
alter table stock_v2.job_part_issue enable row level security;
revoke all on stock_v2.job_part_issue from public, anon, authenticated;

create view stock_v2.job_part_usage with (security_invoker=true) as
  select j.part_id,sum(l.quantity) as issued_quantity,
    sum(-c.movement_value) as repair_cost,
    count(*) filter (where c.movement_value is null or c.provisional) as pending_cost_lines
  from stock_v2.job_part_issue j join stock_v2.document_line l using(line_id)
  join stock_v2.movement m on m.document_line_id=l.line_id
  left join lateral (
    select e.movement_value,e.provisional from stock_v2.cost_entry e
    join stock_v2.cost_run r using(run_id)
    where e.movement_id=m.movement_id and r.status='complete'
    order by e.run_id desc limit 1
  ) c on true
  group by j.part_id;
revoke all on stock_v2.job_part_usage from public, anon, authenticated;

create function stock_v2.post_job_part_issue(p_operation uuid,p_actor uuid,p_part bigint,p_quantity numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  part record;
  document_id bigint;
  issue_line_id bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('stock_v2_inventory_posting'));
  if exists(select from stock_v2.job_part_issue where operation_id=p_operation) then
    select l.document_id into document_id from stock_v2.job_part_issue j join stock_v2.document_line l using(line_id)
      where j.operation_id=p_operation and j.part_id=p_part and j.issued_by=p_actor and l.quantity=p_quantity;
    if not found then raise exception 'Issue reference reused with different values'; end if;
    return jsonb_build_object('document_id',document_id,'part_id',p_part,'issued',p_quantity);
  end if;
  select p.item_id,p.owner_id,r.quantity as reserved,loc.location_id,
    j.job_number,j.tracecode_id,v.vehicle_id,v.vehicle_name
    into part
    from stock_v2.job_card_part p join stock_v2.job_part_reserved r on r.part_id=p.id
    join stock_v2.job_card j on j.id=p.job_id left join public.vehicle v using(vehicle_id)
    join stock_v2.item i on i.item_id=p.item_id
    cross join stock_v2.location loc where p.id=p_part and loc.location_code='TEST_WH' and not i.buying_direct_expense
    for update of p;
  if not found or p_quantity is null or p_quantity not between 0.000001 and part.reserved then
    raise exception 'Issue quantity must be within the Job Card reservation';
  end if;
  if p_quantity > (
    select coalesce(sum(m.quantity_delta),0)
    from stock_v2.movement m join stock_v2.document_line l on l.line_id=m.document_line_id
    join stock_v2.document d on d.document_id=l.document_id
    where m.owner_id=part.owner_id and m.location_id=part.location_id and l.item_id=part.item_id
      and d.status='posted' and d.document_date<=(current_timestamp at time zone 'Africa/Harare')::date
  ) then raise exception 'Insufficient stock posted on or before the Job Card issue date'; end if;
  insert into stock_v2.job_part_reservation_event(id,part_id,quantity_delta,actor)
    values(p_operation,p_part,-p_quantity,p_actor);
  insert into stock_v2.document(document_type,document_number,document_date,status,reason)
    values('issue','DEMO-ISS-JOB-'||p_operation,(current_timestamp at time zone 'Africa/Harare')::date,'draft','Job Card '||part.job_number)
    returning stock_v2.document.document_id into document_id;
  insert into stock_v2.document_line(document_id,item_id,quantity,note,equipment_id,equipment_name)
    values(document_id,part.item_id,p_quantity,'Job Card '||part.job_number,part.vehicle_id,part.vehicle_name)
    returning line_id into issue_line_id;
  insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta,external_tracecode_id)
    values(issue_line_id,part.owner_id,part.location_id,-p_quantity,part.tracecode_id);
  perform stock_v2.post_draft(document_id);
  insert into stock_v2.job_part_issue(part_id,line_id,issued_by,operation_id) values(p_part,issue_line_id,p_actor,p_operation);
  begin
    perform stock_v2.recalculate_demo_item_costs(part.item_id,'Job Card '||part.job_number||' stock issue');
  exception when raise_exception then
    if sqlerrm not like 'Opening or GRV cost missing for line %'
      and sqlerrm not like 'Source transfer cost missing for line %'
      and sqlerrm not like 'Return cost missing for line %'
      and sqlerrm not like 'WA cost unavailable for issue or adjustment line %' then
      raise;
    end if;
  end;
  return jsonb_build_object('document_id',document_id,'part_id',p_part,'issued',p_quantity);
end $$;
revoke all on function stock_v2.post_job_part_issue(uuid,uuid,bigint,numeric) from public, anon, authenticated;

alter table stock_v2.job_card
  alter column vehicle_id drop not null,
  add column card_type text not null default 'asset' check(card_type in ('general','asset','irrigation')),
  add column tracecode_id bigint references public.tracecode(tracecode_id),
  add constraint job_card_destination_check check (
    (card_type='asset' and vehicle_id is not null and tracecode_id is null)
    or (card_type='general' and vehicle_id is null and tracecode_id is not null)
    or (card_type='irrigation' and ((vehicle_id is null) <> (tracecode_id is null)))
  );

alter table stock_v2.job_card_part
  add column category_id bigint references stock_v2.buying_category(category_id),
  add column unit_price numeric(18,4) check(unit_price>=0);

alter table stock_v2.item
  add column buying_part_number text,
  add column buying_direct_expense boolean not null default false;
create unique index buying_item_part_number_key
  on stock_v2.item (lower(buying_part_number)) where buying_part_number is not null;

insert into stock_v2.buying_category(catalogue_group,category_name)
values('general','Stationery') on conflict (catalogue_group,lower(category_name)) do nothing;
insert into stock_v2.item(item_code,item_name,base_unit,input_type,input_category,buying_direct_expense)
values('GENERAL-STATIONERY','General stationery','purchase','General','Stationery',true)
on conflict(item_code) do nothing;
insert into stock_v2.buying_item_category(item_id,category_id)
select i.item_id,c.category_id from stock_v2.item i cross join stock_v2.buying_category c
where i.item_code='GENERAL-STATIONERY' and c.catalogue_group='general' and c.category_name='Stationery'
on conflict do nothing;

create table stock_v2.town_trip (
  id uuid primary key,
  trip_number bigint generated always as identity unique,
  trip_date date not null,
  driver_id uuid not null references auth.users(id),
  created_by uuid not null references auth.users(id),
  finalised_at timestamptz,
  finalised_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index town_trip_driver_idx on stock_v2.town_trip(driver_id,trip_date);

create table stock_v2.town_trip_order (
  trip_id uuid not null references stock_v2.town_trip(id),
  order_id bigint not null references stock_v2.order_header(order_id),
  outcome text not null default 'pending' check (outcome in ('pending','collected','unavailable')),
  driver_note text check (length(driver_note)<=500),
  checked_at timestamptz,
  checked_by uuid references auth.users(id),
  primary key (trip_id,order_id),
  check ((outcome='pending' and checked_at is null and checked_by is null) or
    (outcome<>'pending' and checked_at is not null and checked_by is not null))
);
create unique index town_trip_pending_order_idx on stock_v2.town_trip_order(order_id) where outcome='pending';

alter table stock_v2.town_trip enable row level security;
alter table stock_v2.town_trip_order enable row level security;
revoke all on stock_v2.town_trip,stock_v2.town_trip_order from public,anon,authenticated;

alter table stock_v2.receipt_verification
  add column town_trip_id uuid references stock_v2.town_trip(id);
create index receipt_verification_town_trip_idx on stock_v2.receipt_verification(town_trip_id)
  where town_trip_id is not null;

create function stock_v2.buying_validate_po(p jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare
  own stock_v2.owner;
  line jsonb;
  supplier text := nullif(btrim(p->>'supplier'), '');
begin
  select * into own from stock_v2.owner where owner_code='TEST_'||(p->>'owner_code') and active;
  if not found or nullif(p->>'order_date','') is null then
    raise exception 'Stock owner and PO date required';
  end if;
  if supplier is null and p->>'owner_code' is distinct from 'AO' then
    raise exception 'Select an active supplier';
  end if;
  perform (p->>'order_date')::date;
  if supplier is not null and not exists(
    select 1 from stock_v2.supplier s where s.active and lower(btrim(s.supplier_name))=lower(supplier)
  ) then raise exception 'Select an active supplier'; end if;
  if exists(select 1 from stock_v2.owner_policy where owner_id=own.owner_id and po_requires_contract) and
    not exists(select 1 from stock_v2.contracts where contract_id=coalesce(
      (select default_contract_id from stock_v2.owner_policy where owner_id=own.owner_id),
      nullif(p->>'contract_id','')::bigint) and active)
    then raise exception 'Select an active contract'; end if;
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 30 then
    raise exception 'Enter 1–30 PO lines';
  end if;
  if (select count(distinct x->>'item_code') from jsonb_array_elements(p->'lines') x)<>jsonb_array_length(p->'lines') then
    raise exception 'Repeated product on PO';
  end if;
  for line in select value from jsonb_array_elements(p->'lines') loop
    if not exists(select 1 from stock_v2.item where item_code=line->>'item_code' and active)
      or not coalesce((line->>'quantity')::numeric between .000001 and 1000000000,false)
      then raise exception 'Select an active product and positive finite quantity'; end if;
    if line->>'unit_price' is not null and not coalesce((line->>'unit_price')::numeric between 0 and 1000000000,false)
      then raise exception 'PO price must be nonnegative and finite'; end if;
  end loop;
end $$;

create function stock_v2.receipt_supplier_matches(owner_code text, order_supplier text, receipt_supplier text)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce(lower(btrim(order_supplier))=lower(btrim(receipt_supplier)),false)
    or (owner_code='AO' and order_supplier is null and exists(
      select 1 from stock_v2.supplier s
      where s.active and lower(btrim(s.supplier_name))=lower(btrim(receipt_supplier))
    ));
$$;
revoke all on function stock_v2.receipt_supplier_matches(text,text,text) from public,anon,authenticated;

create function stock_v2.buying_post_multi_po_dnote(p_request uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'stock_v2', 'pg_temp'
AS $function$
declare v_owner bigint; v_loc bigint; v_doc bigint; v_docline bigint; v_line jsonb; v_order_line bigint; v_item bigint; v_qty numeric; v_supplier text; v_prev jsonb; v_result jsonb; v_date date; v_ref text;
begin
 if p_data->>'owner_code' not in ('JS','AO') then raise exception 'Invalid test stock owner';end if;
 v_supplier:=btrim(coalesce(p_data->>'supplier',''));v_ref:=btrim(coalesce(p_data->>'delivery_note',''));v_date:=(p_data->>'receipt_date')::date;
 if v_supplier='' or v_ref='' or v_date is null then raise exception 'Supplier, D-Note and date required';end if;
 if not jsonb_typeof(p_data->'lines')='array' or jsonb_array_length(p_data->'lines')=0 then raise exception 'Select PO lines';end if;
 select owner_id into v_owner from stock_v2.owner where owner_code='TEST_'||(p_data->>'owner_code') and active;
 select location_id into v_loc from stock_v2.location where location_code='TEST_WH';
 if v_owner is null or v_loc is null then raise exception 'Test owner or warehouse missing';end if;
 perform pg_advisory_xact_lock(hashtextextended('stock-v2-dnote:'||v_owner||':'||v_supplier||':'||v_ref,0));
 if exists(select 1 from stock_v2.grv_detail g join stock_v2.document d using(document_id) join stock_v2.movement m on m.document_line_id in (select dl.line_id from stock_v2.document_line dl where dl.document_id=d.document_id) where g.supplier_name=v_supplier and g.delivery_note=v_ref and m.owner_id=v_owner and d.status='posted') then raise exception 'This supplier D-Note has already been received';end if;
 if exists(select 1 from stock_v2.document where document_number='DEMO-MULTIPO-'||p_request) then raise exception 'Request already posted';end if;
 insert into stock_v2.document(document_type,document_number,document_date,status,reason) values('grv','DEMO-MULTIPO-'||p_request,v_date,'draft','D-Note received against multiple POs') returning document_id into v_doc;
 insert into stock_v2.grv_detail(document_id,supplier_name,delivery_note,delivery_note_date,price_status) values(v_doc,v_supplier,v_ref,v_date,'pending');
 for v_line in select value from jsonb_array_elements(p_data->'lines') loop
  v_order_line:=(v_line->>'order_line_id')::bigint;v_qty:=(v_line->>'quantity')::numeric;
  if v_qty is null or v_qty<=0 or v_qty>100000 then raise exception 'Invalid received quantity';end if;
  select ol.item_id into v_item from stock_v2.order_line ol join stock_v2.order_header h using(order_id) where ol.order_line_id=v_order_line and h.owner_id=v_owner and h.status='approved' and stock_v2.receipt_supplier_matches(p_data->>'owner_code',h.supplier_name,v_supplier) and ol.ordered_quantity-ol.received_quantity>=v_qty for update of ol;
  if v_item is null then raise exception 'PO line unavailable, wrong supplier or quantity too high';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'lines') e where (e->>'order_line_id')::bigint=v_order_line group by (e->>'order_line_id') having count(*)>1) then raise exception 'Duplicate PO line';end if;
  insert into stock_v2.document_line(document_id,item_id,quantity,note) values(v_doc,v_item,v_qty,'D-Note received pending pricing') returning line_id into v_docline;
  insert into stock_v2.movement(document_line_id,owner_id,location_id,quantity_delta) values(v_docline,v_owner,v_loc,v_qty);
  update stock_v2.order_line set received_quantity=received_quantity+v_qty where order_line_id=v_order_line;
  insert into stock_v2.demo_grv_line_link(document_id,order_line_id,qty,received_unit_price) values(v_doc,v_order_line,v_qty,case when nullif(btrim(v_line->>'unit_price'),'') is not null then (v_line->>'unit_price')::numeric else null end);
  insert into stock_v2.grv_line_price(line_id,actual_unit_cost) values(v_docline,case when nullif(btrim(v_line->>'unit_price'),'') is not null then (v_line->>'unit_price')::numeric else null end);
 end loop;
 update stock_v2.document set status='posted',posted_at=now() where document_id=v_doc;
 return jsonb_build_object('document_id',v_doc,'status','posted','receipt_mode','dnote');
end; $function$;

create function stock_v2.buying_post_combined_grv(p_request uuid, p_data jsonb)
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
 if exists(select 1 from jsonb_array_elements(coalesce(p_data->'po_allocations','[]')) x group by x->>'order_line_id' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_data->'new_receipts') x group by x->>'item_code' having count(*)>1) then raise exception 'Combine repeated receipt or order lines'; end if;
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
  if not found or v_po.owner_id<>own or not stock_v2.receipt_supplier_matches(p_data->>'owner_code',v_po.supplier_name,v_supplier)
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

create function stock_v2.can_buy(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.app_user_role where user_id=p_actor and lower(role_name)='buyer');
$$;
revoke all on function stock_v2.can_buy(uuid) from public,anon,authenticated;

create function stock_v2.buying_workflow_command(p_actor uuid,p_operation uuid,p_command text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d stock_v2.approval_document; before_doc jsonb; result jsonb; receipt stock_v2.approval_operation;
 p jsonb:=p_data->'payload'; kind text:=p_data->>'kind'; is_admin boolean;
 newid uuid; applied jsonb; line jsonb; oid bigint; item bigint;
begin
 if not coalesce(p_command in ('save','submit') and kind='po' and stock_v2.can_buy(p_actor),false) then
  perform stock_v2.workflow_require(p_actor);
 end if;
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
   perform stock_v2.buying_validate_po(p);
   if before_doc is not null and d.payload->>'source_job_card_id' is distinct from p->>'source_job_card_id' then
    raise exception 'A purchase order cannot be relinked to another Job Card';
   end if;
   if before_doc is not null and d.payload->>'source_quote_id' is distinct from p->>'source_quote_id' then
    raise exception 'A saved purchase order cannot change its quotation';
   end if;
   if p->>'source_job_card_id' is not null then
    if not exists(select 1 from stock_v2.job_card where id=(p->>'source_job_card_id')::uuid) then
     raise exception 'Select a valid Job Card';
    end if;
    if exists(
     select 1 from jsonb_array_elements(p->'lines') l
     where not exists(
      select 1 from stock_v2.job_card_part part join stock_v2.item i using(item_id) left join stock_v2.owner o using(owner_id)
      where part.job_id=(p->>'source_job_card_id')::uuid and i.item_code=l->>'item_code' and not i.buying_direct_expense
       and (part.owner_id is null or o.owner_code='TEST_'||(p->>'owner_code'))
     )
    ) then raise exception 'Linked purchase order lines must match the Job Card parts and owner'; end if;
   end if;
   if p->>'source_quote_id' is not null then
    select jsonb_build_object('quote_currency',q.currency,'quote_reference',q.quote_reference)
     into applied from stock_v2.job_part_quote q join stock_v2.job_card_part part on part.id=q.part_id
     join stock_v2.supplier s using(supplier_id) join stock_v2.item i using(item_id) left join stock_v2.owner o using(owner_id)
     where q.id=(p->>'source_quote_id')::uuid and part.job_id::text=p->>'source_job_card_id'
      and (part.owner_id is null or o.owner_code='TEST_'||(p->>'owner_code')) and lower(btrim(s.supplier_name))=lower(btrim(p->>'supplier'))
      and jsonb_array_length(p->'lines')=1 and p->'lines'->0->>'item_code'=i.item_code
      and (p->'lines'->0->>'unit_price')::numeric=q.unit_price;
    if not found then raise exception 'The purchase order must match the quotation supplier, part and unit price'; end if;
    p:=p||applied;
    applied:=null;
   else
    p:=p-'quote_currency'-'quote_reference';
   end if;
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
    perform stock_v2.buying_validate_po(d.payload);
    update stock_v2.approval_document set status='approved',approved_by=p_actor,approved_at=now(),decision_reason=null where id=d.id;
   else
    applied:=stock_v2.workflow_apply_credit(p_actor,d.payload);
    update stock_v2.approval_document set status='applied',approved_by=p_actor,approved_at=now(),applied_at=now(),target_credit_id=(applied->>'credit_id')::bigint,decision_reason=null where id=d.id;
   end if;
  elsif p_command='finalise' then
   perform stock_v2.workflow_require(p_actor,true);
   if d.kind<>'po' or d.status<>'approved' then raise exception 'Only an approved PO can be finalised';end if;
   if nullif(btrim(d.payload->>'payment_terms'),'') is null then raise exception 'Authorise this PO with payment terms';end if;
   perform stock_v2.buying_validate_po(d.payload);
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

create schema cash_book;
revoke all on schema cash_book from public,anon,authenticated;

create table cash_book.counterparty (
  name text primary key check (length(btrim(name)) between 1 and 120)
);
create unique index cash_book_counterparty_name_idx on cash_book.counterparty(lower(name));
alter table cash_book.counterparty enable row level security;

create table cash_book.account (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 120),
  currency text not null check (currency in ('USD','ZiG')),
  opening_date date not null,
  opening_balance numeric(18,2) not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  unique(id,currency)
);
create unique index cash_book_account_name_idx on cash_book.account(currency,lower(name));

create table cash_book.entry (
  id uuid primary key,
  entry_number bigint generated always as identity unique,
  kind text not null check (kind in ('payment','receipt','transfer')),
  currency text not null,
  account_id uuid not null,
  destination_id uuid,
  amount numeric(18,2) not null check (amount>0),
  entry_date date not null,
  value_date date not null,
  reference text not null check (length(btrim(reference)) between 1 and 120),
  narrative text not null check (length(btrim(narrative)) between 1 and 500),
  counterparty text not null default '',
  status text not null default 'draft' check (status in ('draft','confirmed','voided')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  reversal_of uuid unique references cash_book.entry(id),
  foreign key(account_id,currency) references cash_book.account(id,currency),
  foreign key(destination_id,currency) references cash_book.account(id,currency),
  check ((kind='transfer' and destination_id is not null and destination_id<>account_id)
    or (kind<>'transfer' and destination_id is null and length(btrim(counterparty)) between 1 and 120)),
  check ((status='draft')=(decided_by is null and decided_at is null)),
  check ((decided_by is null)=(decided_at is null))
);
create unique index cash_book_entry_reference_idx on cash_book.entry(account_id,lower(reference))
  where status<>'voided';

create table cash_book.trip_advance (
  id uuid primary key references cash_book.entry(id),
  trip_id uuid not null references stock_v2.town_trip(id),
  account_id uuid not null references cash_book.account(id),
  amount numeric(18,2) not null check (amount>0),
  unique (trip_id,account_id)
);

create table cash_book.trip_settlement (
  advance_id uuid primary key references cash_book.trip_advance(id),
  id uuid not null unique,
  spend numeric(18,2) not null check (spend>=0),
  cash_returned numeric(18,2) not null check (cash_returned>=0),
  receipt_reference text not null check (length(btrim(receipt_reference)) between 1 and 500),
  return_entry_id uuid unique references cash_book.entry(id),
  settled_date date not null,
  settled_by uuid not null references auth.users(id),
  settled_at timestamptz not null default now(),
  check ((cash_returned>0)=(return_entry_id is not null))
);

create table cash_book.labour_payment_source (
  entry_id uuid not null references cash_book.entry(id),
  source_type text not null,
  source_id text not null,
  amount numeric(18,2) not null check (amount>0),
  active boolean not null default true,
  primary key(entry_id,source_type,source_id)
);
create unique index labour_payment_active_source_idx
  on cash_book.labour_payment_source(source_type,source_id) where active;

create table cash_book.supplier_payment (
  entry_id uuid primary key references cash_book.entry(id),
  grv_id bigint not null references stock_v2.accounting_grv(id)
);
create index supplier_payment_grv_idx on cash_book.supplier_payment(grv_id);
alter table cash_book.supplier_payment enable row level security;

create table cash_book.trip_invoice_payment (
  advance_id uuid not null references cash_book.trip_settlement(advance_id),
  grv_id bigint not null references stock_v2.accounting_grv(id),
  amount numeric(18,2) not null check (amount>0),
  primary key (advance_id,grv_id)
);
create index trip_invoice_payment_grv_idx on cash_book.trip_invoice_payment(grv_id);
alter table cash_book.trip_invoice_payment enable row level security;

create table cash_book.supplier_credit_application (
  id uuid primary key,
  credit_id bigint not null references stock_v2.supplier_credit_note(credit_id),
  grv_id bigint not null references stock_v2.accounting_grv(id),
  currency text not null check (currency in ('USD','ZiG')),
  amount numeric(18,2) not null check (amount>0),
  applied_by uuid not null references auth.users(id),
  applied_at timestamptz not null default now()
);
create index supplier_credit_application_credit_idx on cash_book.supplier_credit_application(credit_id);
create index supplier_credit_application_invoice_idx on cash_book.supplier_credit_application(grv_id);
alter table cash_book.supplier_credit_application enable row level security;

create view cash_book.supplier_credit_balance with (security_invoker=true) as
  select c.credit_id,c.supplier_name,c.owner_code,c.credit_note_number,c.credit_note_date,
    round(c.total_amount,2)-coalesce(sum(a.amount),0) as remaining,min(a.currency) as currency
  from stock_v2.supplier_credit_note c left join cash_book.supplier_credit_application a using(credit_id)
  where c.status='posted' group by c.credit_id;

create view cash_book.verified_invoice_balance with (security_invoker=true) as
  select g.id,g.invoice_number,g.invoice_date,g.supplier_name,gross.amount as invoice_amount,
    replace(owner.owner_code,'TEST_','') as owner_code,linked.credit_id as linked_credit_id,
    coalesce(credit.amount,0) as credited,
    coalesce(paid.amount,0)+coalesce(trip_paid.amount,0) as paid,coalesce(draft.amount,0) as drafted,
    gross.amount-coalesce(paid.amount,0)-coalesce(draft.amount,0)-coalesce(trip_paid.amount,0)-coalesce(credit.amount,0) as available,
    coalesce(paid.currency,draft.currency,trip_paid.currency,credit.currency) as payment_currency,receipt.town_trip_id
  from stock_v2.accounting_grv g
  join stock_v2.owner owner using(owner_id)
  left join stock_v2.grv_credit_link linked on linked.grv_id=g.id
  join lateral (
    select r.town_trip_id from stock_v2.receipt_verification r where r.status='posted'
      and r.receipt_action='combined_grv' and r.posting_result->>'grv_id'=g.id::text
    limit 1
  ) receipt on true
  join lateral (
    select round(sum(l.invoice_quantity*l.invoice_unit_price),2) as amount
    from stock_v2.accounting_grv_line l where l.grv_id=g.id
  ) gross on gross.amount>0
  left join lateral (
    select sum(e.amount) as amount,min(e.currency) as currency
    from cash_book.supplier_payment p join cash_book.entry e on e.id=p.entry_id
    where p.grv_id=g.id and e.status='confirmed'
      and not exists(select 1 from cash_book.entry r where r.reversal_of=e.id)
  ) paid on true
  left join lateral (
    select sum(e.amount) as amount,min(e.currency) as currency
    from cash_book.supplier_payment p join cash_book.entry e on e.id=p.entry_id
    where p.grv_id=g.id and e.status='draft'
  ) draft on true
  left join lateral (
    select sum(p.amount) as amount,min(e.currency) as currency
    from cash_book.trip_invoice_payment p join cash_book.entry e on e.id=p.advance_id
    where p.grv_id=g.id
  ) trip_paid on true
  left join lateral (
    select sum(a.amount) as amount,min(a.currency) as currency
    from cash_book.supplier_credit_application a where a.grv_id=g.id
  ) credit on true
  where g.status='matched';

create view cash_book.supplier_invoice_balance with (security_invoker=true) as
  select invoice.* from cash_book.verified_invoice_balance invoice
  where not exists (
    select 1 from cash_book.trip_advance a where a.trip_id=invoice.town_trip_id
      and not exists(select 1 from cash_book.trip_settlement s where s.advance_id=a.id)
  ) and (invoice.linked_credit_id is null or exists(
    select 1 from cash_book.supplier_credit_application a where a.grv_id=invoice.id and a.credit_id=invoice.linked_credit_id
  ));

create view cash_book.account_balance with (security_invoker=true) as
  select a.id,a.name,a.currency,a.opening_date,a.opening_balance,a.active,
    a.opening_balance+coalesce(sum(leg.amount),0) as balance
  from cash_book.account a left join (
    select account_id,amount*(case when kind='receipt' then 1 else -1 end)
      *(case when reversal_of is null then 1 else -1 end) as amount
      from cash_book.entry where status='confirmed'
    union all
    select destination_id,amount*(case when reversal_of is null then 1 else -1 end)
      from cash_book.entry where status='confirmed' and kind='transfer'
  ) leg on leg.account_id=a.id group by a.id;

alter table cash_book.account enable row level security;
alter table cash_book.entry enable row level security;
alter table cash_book.trip_advance enable row level security;
alter table cash_book.trip_settlement enable row level security;
alter table cash_book.labour_payment_source enable row level security;
revoke all on all tables in schema cash_book from public,anon,authenticated;

-- Operational responsibilities can be combined without changing anyone's existing sign-in role.
create table stock_v2.buying_staff_role (
  user_id uuid not null references auth.users(id),
  role_name text not null check(role_name in ('buyer','driver')),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key(user_id,role_name)
);
alter table stock_v2.buying_staff_role enable row level security;
revoke all on stock_v2.buying_staff_role from public,anon,authenticated;
create or replace function stock_v2.can_buy(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select from public.app_user_role where user_id=p_actor and lower(role_name)='buyer')
      or exists(select from stock_v2.buying_staff_role where user_id=p_actor and role_name='buyer');
$$;

-- Only fixed irrigation assets have a farm assignment. Preserve the farm and owner at request time.
create table stock_v2.irrigation_asset_farm (
  vehicle_id bigint primary key references public.vehicle(vehicle_id),
  farm_id bigint not null references public.farm(farm_id)
);
alter table stock_v2.irrigation_asset_farm enable row level security;
revoke all on stock_v2.irrigation_asset_farm from public,anon,authenticated;
create function stock_v2.job_asset_group(p_vehicle bigint) returns text
language sql stable security invoker set search_path='' as $$
  select case when concat_ws(' ',t.type_code,t.type_name) ~* 'pump|pivot' then 'irrigation'
              when concat_ws(' ',t.type_code,t.type_name) ~* 'impl[ei]ment' then 'implement'
              else 'vehicle' end from public.vehicle v join public.vehicle_type t using(vehicle_type_id)
  where v.vehicle_id=p_vehicle;
$$;
create function stock_v2.check_irrigation_asset_farm() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if stock_v2.job_asset_group(new.vehicle_id) is distinct from 'irrigation' then
    raise exception 'A fixed farm applies only to a pump or pivot';
  end if;
  return new;
end $$;
create trigger check_irrigation_asset_farm before insert or update on stock_v2.irrigation_asset_farm
for each row execute function stock_v2.check_irrigation_asset_farm();
alter table stock_v2.job_card
  add column transaction_date date not null default (current_timestamp at time zone 'Africa/Harare')::date,
  add column owner_company_id bigint references public.company(company_id),
  add column farm_id bigint references public.farm(farm_id),
  add column closed_by uuid references auth.users(id),
  add column closed_at timestamptz,
  add check ((closed_by is null)=(closed_at is null));
alter table stock_v2.job_card_part add column line_purpose text check(length(btrim(line_purpose)) between 1 and 1000);
alter table stock_v2.job_card_part alter column owner_id drop not null;
create index job_card_vehicle_date_idx on stock_v2.job_card(vehicle_id,transaction_date desc,job_number desc);
create index job_card_trace_idx on stock_v2.job_card(tracecode_id) where tracecode_id is not null;
create function stock_v2.check_job_destination() returns trigger
language plpgsql security invoker set search_path='' as $$
declare asset_group text; trace_name text;
begin
  if not stock_v2.can_buy(new.requested_by) then raise exception 'Buyer access required to open a Job Card' using errcode='42501'; end if;
  if new.vehicle_id is not null then
    select v.owner_company_id,stock_v2.job_asset_group(v.vehicle_id),f.farm_id
      into new.owner_company_id,asset_group,new.farm_id
      from public.vehicle v join public.company c on c.company_id=v.owner_company_id and c.owns_vehicles
      join public.vehicle_type vt on vt.vehicle_type_id=v.vehicle_type_id and vt.active
      left join stock_v2.irrigation_asset_farm f on f.vehicle_id=v.vehicle_id
      where v.vehicle_id=new.vehicle_id and v.ownership_status='owned' and not v.vehicle_discontinued and not v.is_other
      for share of v,c;
    if not found then raise exception 'Choose active owned equipment with an owner company'; end if;
    if (new.card_type='irrigation')<>(asset_group='irrigation') then raise exception 'Pumps and pivots use an Irrigation Job Card'; end if;
  else
    new.owner_company_id:=null;
    new.farm_id:=null;
    select t.tracecode_name into trace_name from public.tracecode t left join public.crop c using(crop_id)
      where t.tracecode_id=new.tracecode_id and t.end_date is null and (t.crop_id is null or upper(c.crop_name)='COS') for share of t;
    if not found then raise exception 'Choose an open COS or unclassified trace'; end if;
    if new.card_type='irrigation' and upper(trace_name) not like 'IRR%' then raise exception 'Choose an open irrigation trace'; end if;
  end if;
  return new;
end $$;
create trigger check_job_destination before insert on stock_v2.job_card
for each row execute function stock_v2.check_job_destination();
create function stock_v2.protect_job_allocation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.requested_by is distinct from old.requested_by then raise exception 'Keep the original requesting buyer'; end if;
  if row(new.vehicle_id,new.tracecode_id,new.card_type,new.owner_company_id,new.farm_id)
     is distinct from row(old.vehicle_id,old.tracecode_id,old.card_type,old.owner_company_id,old.farm_id)
     and (old.closed_at is not null or exists(select from stock_v2.job_card_part where job_id=old.id))
  then raise exception 'Existing Job Card lines are allocated to the original destination'; end if;
  return new;
end $$;
create trigger protect_job_allocation before update on stock_v2.job_card for each row execute function stock_v2.protect_job_allocation();
create trigger validate_changed_job_destination before update of vehicle_id,tracecode_id,card_type,owner_company_id,farm_id on stock_v2.job_card
for each row when (row(new.vehicle_id,new.tracecode_id,new.card_type,new.owner_company_id,new.farm_id)
  is distinct from row(old.vehicle_id,old.tracecode_id,old.card_type,old.owner_company_id,old.farm_id))
execute function stock_v2.check_job_destination();
revoke all on function stock_v2.protect_job_allocation() from public,anon,authenticated;
create function stock_v2.check_job_line() returns trigger
language plpgsql security invoker set search_path='' as $$
declare card stock_v2.job_card; expected_owner bigint; expected_group text;
begin
  select * into strict card from stock_v2.job_card where id=new.job_id for share;
  if card.closed_at is not null then raise exception 'Job Card is closed'; end if;
  if card.vehicle_id is not null then
    select o.owner_id into expected_owner from public.company c join stock_v2.owner o on o.owner_code='TEST_'||c.stock_owner_code and o.active
      where c.company_id=card.owner_company_id and c.owns_stock;
    if new.owner_id is not null and new.owner_id is distinct from expected_owner then raise exception 'Use the owner on the equipment record'; end if;
    new.owner_id:=expected_owner;
    expected_group:=stock_v2.job_asset_group(card.vehicle_id);
  else
    expected_group:=card.card_type;
    select m.owner_id into expected_owner from stock_v2.tracecode_owner_map m join stock_v2.owner o using(owner_id)
      where m.external_tracecode_id=card.tracecode_id and m.verified and o.active;
    if expected_owner is not null and new.owner_id is not null and new.owner_id<>expected_owner then raise exception 'Stock owner differs from the verified trace owner'; end if;
    new.owner_id:=coalesce(expected_owner,new.owner_id);
  end if;
  if not exists(select from stock_v2.buying_item_category ic join stock_v2.buying_category c using(category_id)
     join stock_v2.item i using(item_id) where ic.item_id=new.item_id and ic.category_id=new.category_id and c.catalogue_group=expected_group and i.active) then
    raise exception 'Select an active item from a category for this Job Card';
  end if;
  return new;
end $$;
create trigger check_job_line before insert or update of job_id,item_id,category_id,owner_id on stock_v2.job_card_part
for each row execute function stock_v2.check_job_line();
create unique index job_part_unallocated_key on stock_v2.job_card_part(job_id,item_id) where owner_id is null;

alter table stock_v2.order_header add column payment_terms text check(length(btrim(payment_terms)) between 1 and 200);
create table stock_v2.job_purchase_line (
  order_line_id bigint primary key references stock_v2.order_line(order_line_id),
  part_id bigint not null references stock_v2.job_card_part(id),
  quote_id uuid references stock_v2.job_part_quote(id)
);
alter table stock_v2.job_purchase_line enable row level security;
revoke all on stock_v2.job_purchase_line from public,anon,authenticated;
create index job_purchase_line_part_idx on stock_v2.job_purchase_line(part_id);
create function stock_v2.buying_authorise_po(p_actor uuid,p_operation uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare terms text:=nullif(btrim(p_data->>'payment_terms'),''); approved jsonb; ordered jsonb;
begin
  perform stock_v2.workflow_require(p_actor,true);
  if terms is null or length(terms)>200 then raise exception 'Enter payment terms (up to 200 characters)'; end if;
  approved:=stock_v2.buying_workflow_command(p_actor,md5('authorise_po:'||p_operation::text)::uuid,'approve',p_data);
  if approved->>'kind'<>'po' then raise exception 'Select a purchase order'; end if;
  if not coalesce((approved->>'replayed')::boolean,false) then
    update stock_v2.approval_document set payload=payload||jsonb_build_object('payment_terms',terms) where id=(approved->>'id')::uuid;
  end if;
  ordered:=stock_v2.buying_workflow_command(p_actor,p_operation,'finalise',jsonb_build_object('id',approved->'id','version',approved->'version'));
  if not coalesce((ordered->>'replayed')::boolean,false) then
    update stock_v2.order_header set payment_terms=terms,
      supplier_name=case when ordered#>>'{payload,owner_code}'='AO' and nullif(btrim(ordered#>>'{payload,supplier}'),'') is null then null else supplier_name end
      where order_id=(ordered->>'target_order_id')::bigint;
    if ordered#>>'{payload,source_job_card_id}' is not null then
      update stock_v2.job_card_part p set owner_id=h.owner_id from stock_v2.order_header h join stock_v2.order_line l using(order_id)
        where h.order_id=(ordered->>'target_order_id')::bigint and p.job_id=(ordered#>>'{payload,source_job_card_id}')::uuid
          and p.owner_id is null and p.item_id=l.item_id;
      insert into stock_v2.job_purchase_line(order_line_id,part_id,quote_id)
        select l.order_line_id,p.id,(ordered#>>'{payload,source_quote_id}')::uuid from stock_v2.order_line l
        join stock_v2.order_header h using(order_id) join stock_v2.job_card_part p on p.item_id=l.item_id and p.owner_id=h.owner_id
        where h.order_id=(ordered->>'target_order_id')::bigint and p.job_id=(ordered#>>'{payload,source_job_card_id}')::uuid;
    end if;
  end if;
  return ordered;
end $$;

create function stock_v2.buying_decide_receipt(p_actor uuid,p_receipt uuid,p_decision text,p_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r stock_v2.receipt_verification; result jsonb;
begin
  perform stock_v2.workflow_require(p_actor,true);
  perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
  select * into strict r from stock_v2.receipt_verification where id=p_receipt for update;
  if r.status<>'pending' then
    if r.decided_by=p_actor and r.status='posted' and p_decision='verify' then return r.posting_result; end if;
    if r.decided_by=p_actor and r.status='returned' and p_decision='return' and r.decision_reason=btrim(p_reason) then return jsonb_build_object('status','returned'); end if;
    raise exception 'Receipt already decided';
  end if;
  if p_decision='return' and length(btrim(p_reason))>=5 then
    update stock_v2.receipt_verification set status='returned',decided_by=p_actor,decided_at=now(),decision_reason=btrim(p_reason) where id=p_receipt;
    return jsonb_build_object('status','returned');
  elsif p_decision is distinct from 'verify' then raise exception 'Select Verify or Return with a reason'; end if;
  case r.receipt_action
    when 'combined_grv' then result:=stock_v2.buying_post_combined_grv(r.id,r.payload||jsonb_build_object('actor_id',p_actor));
    when 'multi_po_dnote' then result:=stock_v2.buying_post_multi_po_dnote(r.id,r.payload);
    when 'unplanned_dnote' then result:=stock_v2.demo_post_unplanned_dnote(r.id,r.payload);
    else result:=stock_v2.demo_multi(r.receipt_action,r.id,r.payload);
  end case;
  update stock_v2.receipt_verification set status='posted',decided_by=p_actor,decided_at=now(),posting_result=result where id=p_receipt;
  return result;
end $$;

-- Cash Book direct-expense allocations refer to the original request; they never create stock movements.
create table cash_book.job_expense (
  entry_id uuid not null references cash_book.entry(id),
  part_id bigint not null references stock_v2.job_card_part(id),
  amount numeric(18,2) not null check(amount>0 and amount<>'NaN'::numeric),
  primary key(entry_id,part_id)
);
alter table cash_book.job_expense enable row level security;
revoke all on cash_book.job_expense from public,anon,authenticated;
create index job_expense_part_idx on cash_book.job_expense(part_id);
create function cash_book.check_job_expense() returns trigger language plpgsql security invoker set search_path='' as $$
declare e cash_book.entry; total numeric;
begin
  if tg_op<>'INSERT' then raise exception 'Reverse the Cash Book entry to correct a posted expense'; end if;
  select * into strict e from cash_book.entry where id=new.entry_id for update;
  if e.kind<>'payment' or e.status<>'draft' or e.reversal_of is not null then raise exception 'Allocate expenses on the original draft payment'; end if;
  if not exists(select from stock_v2.job_card_part p join stock_v2.item i using(item_id) where p.id=new.part_id and i.buying_direct_expense) then raise exception 'Select a direct expense Job Card line'; end if;
  select coalesce(sum(amount),0) into total from cash_book.job_expense where entry_id=e.id;
  if total+new.amount>e.amount then raise exception 'Allocations exceed the payment'; end if;
  return new;
end $$;
create trigger check_job_expense before insert or update or delete on cash_book.job_expense
for each row execute function cash_book.check_job_expense();
create view cash_book.job_expense_cost with(security_invoker=true) as
select a.part_id,e.currency,sum(a.amount) as amount from cash_book.job_expense a join cash_book.entry e on e.id=a.entry_id
where e.status='confirmed' and not exists(select from cash_book.entry r where r.reversal_of=e.id and r.status='confirmed') group by a.part_id,e.currency;
revoke all on cash_book.job_expense_cost from public,anon,authenticated;
create function stock_v2.prevent_direct_expense_movement() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select from stock_v2.document_line l join stock_v2.item i using(item_id)
     where l.line_id=new.document_line_id and i.buying_direct_expense) then raise exception 'Direct expenses do not enter stock'; end if;
  return new;
end $$;
create trigger check_direct_expense_movement before insert or update of document_line_id on stock_v2.movement
for each row execute function stock_v2.prevent_direct_expense_movement();

create view stock_v2.job_asset_purchase_history with(security_invoker=true) as
with receipts as (
  select document_id,order_line_id from stock_v2.demo_grv_line_link
  union select document_id,order_line_id from stock_v2.demo_grv_order_link
), attributed as (
  select j.vehicle_id,r.document_id,p.item_id from receipts r join stock_v2.job_purchase_line l using(order_line_id)
  join stock_v2.job_card_part p on p.id=l.part_id join stock_v2.job_card j on j.id=p.job_id where j.vehicle_id is not null
  union select equipment_id,document_id,item_id from stock_v2.document_line where equipment_id is not null
)
select a.vehicle_id,d.document_date,d.document_id,dl.line_id,i.item_id,i.item_code,i.item_name,i.buying_part_number,
 g.supplier_name,coalesce(pc.confirmed_unit_cost,case when g.price_status='confirmed' then gp.actual_unit_cost end) as unit_price
from attributed a join stock_v2.document d using(document_id) join stock_v2.document_line dl using(document_id,item_id)
join stock_v2.item i using(item_id) join stock_v2.grv_detail g using(document_id)
left join stock_v2.price_confirmation pc on pc.line_id=dl.line_id left join stock_v2.grv_line_price gp on gp.line_id=dl.line_id
where d.status='posted' and d.document_type='grv' and (dl.equipment_id is null or dl.equipment_id=a.vehicle_id)
order by a.vehicle_id,d.document_date desc,d.document_id desc,dl.line_id desc;
revoke all on stock_v2.job_asset_purchase_history from public,anon,authenticated;

revoke all on function stock_v2.job_asset_group(bigint),stock_v2.check_irrigation_asset_farm(),
  stock_v2.check_job_destination(),stock_v2.check_job_line(),cash_book.check_job_expense(),
  stock_v2.prevent_direct_expense_movement(),stock_v2.buying_workflow_command(uuid,uuid,text,jsonb),
  stock_v2.buying_validate_po(jsonb),stock_v2.buying_post_multi_po_dnote(uuid,jsonb),stock_v2.buying_post_combined_grv(uuid,jsonb),
  stock_v2.buying_authorise_po(uuid,uuid,jsonb),stock_v2.buying_decide_receipt(uuid,uuid,text,text)
from public,anon,authenticated;

-- Keep payer names reusable, and prevent changes to the amount or source after confirmation.
alter table cash_book.entry add column payer_name text references cash_book.counterparty(name);
create function cash_book.check_entry() returns trigger language plpgsql security invoker set search_path='' as $$
declare original cash_book.entry; source_account cash_book.account;
begin
  if tg_op='DELETE' then raise exception 'Void a draft or reverse a confirmed payment'; end if;
  if tg_op='UPDATE' and old.status<>'draft' then raise exception 'A confirmed or voided entry is locked'; end if;
  if not exists(select from public.app_user_role where user_id=coalesce(new.decided_by,new.created_by) and lower(role_name)='admin') then
    raise exception 'Cash Book Admin access required' using errcode='42501';
  end if;
  select * into strict source_account from cash_book.account where id=new.account_id for share;
  if not source_account.active or least(new.entry_date,new.value_date)<source_account.opening_date
     or new.amount='NaN'::numeric then raise exception 'Check the account, amount and dates'; end if;
  if new.destination_id is not null and not exists(select from cash_book.account where id=new.destination_id and active
      and least(new.entry_date,new.value_date)>=opening_date and currency=new.currency) then raise exception 'Invalid destination account for transfer'; end if;
  if new.reversal_of is not null then
    select * into strict original from cash_book.entry where id=new.reversal_of for update;
    if original.status<>'confirmed' or original.reversal_of is not null or new.status<>'confirmed'
      or row(new.kind,new.amount,new.account_id,new.destination_id,new.currency) is distinct from
         row(original.kind,original.amount,original.account_id,original.destination_id,original.currency)
      or new.entry_date<greatest(original.entry_date,original.value_date)
      or exists(select from cash_book.trip_advance where id=original.id)
      or exists(select from cash_book.trip_settlement where return_entry_id=original.id)
      then raise exception 'Invalid cash reversal'; end if;
  end if;
  if new.kind<>'transfer' then
    new.counterparty:=btrim(new.counterparty);
    insert into cash_book.counterparty(name) values(new.counterparty) on conflict do nothing;
    select name into strict new.payer_name from cash_book.counterparty where lower(name)=lower(new.counterparty);
  end if;
  return new;
end $$;
create trigger check_cash_entry before insert or update or delete on cash_book.entry for each row execute function cash_book.check_entry();

create function cash_book.lock_allocated_payment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (exists(select from cash_book.job_expense where entry_id=old.id)
      or exists(select from cash_book.supplier_payment where entry_id=old.id))
    and row(new.kind,new.account_id,new.amount,new.currency,new.reversal_of,new.counterparty) is distinct from
        row(old.kind,old.account_id,old.amount,old.currency,old.reversal_of,old.counterparty)
  then raise exception 'Void the allocated draft before changing its payment details'; end if;
  return new;
end $$;
create trigger lock_allocated_payment before update on cash_book.entry
for each row execute function cash_book.lock_allocated_payment();
revoke all on function cash_book.lock_allocated_payment() from public,anon,authenticated;

create function stock_v2.check_job_reservation() returns trigger language plpgsql security invoker set search_path='' as $$
declare part stock_v2.job_card_part; reserved numeric; issued numeric; warehouse bigint;
begin
  perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
  select * into strict part from stock_v2.job_card_part where id=new.part_id for update;
  if part.owner_id is null or exists(select from stock_v2.item where item_id=part.item_id and buying_direct_expense) then
    raise exception 'Select a stocked part with an owner'; end if;
  select quantity into strict reserved from stock_v2.job_part_reserved where part_id=part.id;
  if new.quantity_delta<0 and reserved+new.quantity_delta<0 then raise exception 'Cannot release more than reserved'; end if;
  if new.quantity_delta>0 then
    if exists(select from stock_v2.job_card where id=part.job_id and closed_at is not null) then raise exception 'Job Card is closed'; end if;
    select issued_quantity into issued from stock_v2.job_part_usage where part_id=part.id;
    select location_id into strict warehouse from stock_v2.location where location_code='TEST_WH';
    if reserved+coalesce(issued,0)+new.quantity_delta>part.requested_quantity
      or new.quantity_delta>stock_v2.available_after_job_reservations(part.owner_id,part.item_id,warehouse) then
      raise exception 'Reservation exceeds the request or available stock'; end if;
  end if;
  return new;
end $$;
create trigger check_job_reservation before insert on stock_v2.job_part_reservation_event
for each row execute function stock_v2.check_job_reservation();
revoke all on function stock_v2.check_job_reservation() from public,anon,authenticated;

create function cash_book.check_advance() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select from cash_book.entry e where e.id=new.id and e.kind='payment' and e.status='confirmed'
        and e.reversal_of is null and e.amount=new.amount and e.account_id=new.account_id) then raise exception 'Advance must match its confirmed cash payment'; end if;
  if not exists(select from stock_v2.town_trip where id=new.trip_id and finalised_at is null for share) then raise exception 'Trip has already been finalised'; end if;
  return new;
end $$;
create trigger check_advance before insert or update on cash_book.trip_advance for each row execute function cash_book.check_advance();
create function cash_book.check_settlement() returns trigger language plpgsql security invoker set search_path='' as $$
declare advance cash_book.trip_advance; payment cash_book.entry;
begin
  select * into strict advance from cash_book.trip_advance where id=new.advance_id for update;
  select * into strict payment from cash_book.entry where id=advance.id;
  if new.spend+new.cash_returned<>advance.amount or new.settled_date<payment.entry_date then raise exception 'Spend and returned cash must reconcile to the advance'; end if;
  if new.cash_returned>0 and not exists(select from cash_book.entry e where e.id=new.return_entry_id and e.status='confirmed'
    and e.kind='receipt' and e.account_id=advance.account_id and e.amount=new.cash_returned and e.reversal_of is null and e.entry_date=new.settled_date)
    then raise exception 'Cash return must match its confirmed cash receipt'; end if;
  return new;
end $$;
create trigger check_settlement before insert on cash_book.trip_settlement for each row execute function cash_book.check_settlement();
create function cash_book.check_invoice_payment() returns trigger language plpgsql security invoker set search_path='' as $$
declare invoice cash_book.verified_invoice_balance; paid cash_book.entry; settlement cash_book.trip_settlement; advance cash_book.trip_advance;
begin
  perform 1 from stock_v2.accounting_grv where id=new.grv_id for update;
  select * into strict invoice from cash_book.verified_invoice_balance where id=new.grv_id;
  if tg_table_name='supplier_payment' then
    select * into strict paid from cash_book.entry where id=new.entry_id for update;
    if paid.kind<>'payment' or paid.status<>'draft' or paid.reversal_of is not null or paid.amount>invoice.available
       or paid.entry_date<invoice.invoice_date or lower(paid.counterparty)<>lower(invoice.supplier_name)
       or (invoice.payment_currency is not null and invoice.payment_currency<>paid.currency)
       or not exists(select from cash_book.supplier_invoice_balance where id=invoice.id)
       then raise exception 'Invalid supplier payment or insufficient invoice balance'; end if;
  else
    select * into strict settlement from cash_book.trip_settlement where advance_id=new.advance_id for update;
    select * into strict advance from cash_book.trip_advance where id=new.advance_id;
    select * into strict paid from cash_book.entry where id=advance.id;
    if invoice.town_trip_id is distinct from advance.trip_id or new.amount>invoice.available or new.amount='NaN'::numeric
       or settlement.settled_date<invoice.invoice_date or (invoice.payment_currency is not null and invoice.payment_currency<>paid.currency)
       or new.amount+(select coalesce(sum(amount),0) from cash_book.trip_invoice_payment where advance_id=new.advance_id)>settlement.spend
       then raise exception 'Trip allocation exceeds the verified invoice balance or advance spend'; end if;
  end if;
  return new;
end $$;
create trigger check_supplier_payment before insert on cash_book.supplier_payment for each row execute function cash_book.check_invoice_payment();
create trigger check_trip_invoice before insert on cash_book.trip_invoice_payment for each row execute function cash_book.check_invoice_payment();
revoke all on function cash_book.check_entry(),cash_book.check_advance(),cash_book.check_settlement(),cash_book.check_invoice_payment() from public,anon,authenticated;
