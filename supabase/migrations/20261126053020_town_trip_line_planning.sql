-- Line allocations coexist with historical whole-order trips.
alter table stock_v2.town_trip add column line_plan boolean not null default false,
 add column plan_version integer not null default 0;

create table stock_v2.trip_plan_line (
 trip_id uuid not null references stock_v2.town_trip, order_line_id bigint not null references stock_v2.order_line,
 quantity numeric not null check(quantity>0), payment_basis text not null check(payment_basis in ('Cash','Transfer','Account')),
 terms_note text not null default '', primary key(trip_id,order_line_id)
);
create index trip_plan_order_line on stock_v2.trip_plan_line(order_line_id);
create table stock_v2.trip_supplier_visit (
 trip_id uuid not null references stock_v2.town_trip,supplier text not null,visited_by uuid not null references auth.users,
 visited_at timestamptz not null default now(), primary key(trip_id,supplier)
);
create table stock_v2.trip_terms_change (
 id bigint generated always as identity primary key,trip_id uuid not null references stock_v2.town_trip,
 order_line_id bigint not null references stock_v2.order_line,quantity numeric not null,previous_terms text,new_terms text not null,
 reason text not null,changed_by uuid not null references auth.users,changed_at timestamptz not null default now()
);
create index trip_terms_by_trip on stock_v2.trip_terms_change(trip_id);
alter table stock_v2.trip_plan_line enable row level security;
alter table stock_v2.trip_supplier_visit enable row level security;
alter table stock_v2.trip_terms_change enable row level security;
revoke all on stock_v2.trip_plan_line,stock_v2.trip_supplier_visit,stock_v2.trip_terms_change from public,anon,authenticated;

-- Historical free-text terms are only categorised when their meaning is explicit.
create function stock_v2.po_payment_basis(terms text) returns text language sql immutable set search_path='' as $$
 select case when lower(btrim(terms)) ~ '^cash($|[ :·-])' then 'Cash'
 when lower(btrim(terms)) ~ '^(bank )?transfer($|[ :·-])' then 'Transfer'
 when lower(btrim(terms)) ~ '^(account|on account|net [0-9]+|[0-9]+ days)($|[ :·-])' then 'Account' end
$$;
create function stock_v2.po_receipt_rows(action text,p jsonb)
returns table(order_line_id bigint,qty numeric,price numeric) language sql immutable set search_path='' as $$
 select (z->>'order_line_id')::bigint,(coalesce(z->>'quantity',z->>'qty'))::numeric,(z->>'unit_price')::numeric
 from jsonb_array_elements(case when action='combined_grv' then coalesce(p->'po_allocations','[]')
 else coalesce(p->'lines','[]') end) z where z->>'order_line_id' is not null
$$;
create view stock_v2.trip_receipt_quantities with(security_invoker=true) as
 select v.id,v.town_trip_id,v.status,v.request_number,v.receipt_action,v.decided_at,v.payload->>'invoice_number' as invoice,
 coalesce(v.payload->>'receipt_date',v.payload->>'date',v.decided_at::date::text) as receipt_date,
 r.order_line_id,r.qty,r.price,v.payload->'trip_terms'->(r.order_line_id::text)->>'basis' as basis,
 v.payload->'trip_terms'->(r.order_line_id::text)->>'note' as note
 from stock_v2.receipt_verification v cross join lateral stock_v2.po_receipt_rows(v.receipt_action,v.payload) r
 where v.status in ('posted','pending');
create view stock_v2.trip_plan_detail with(security_invoker=true) as
 select p.*,t.trip_number,t.finalised_at,h.order_id,h.order_number,h.supplier_name,h.payment_terms,
 l.ordered_quantity,l.ordered_unit_price,coalesce(i.item_name,s.description) as item_name,
 coalesce(i.item_code,s.ref) as item_code,s.kind,s.ref,coalesce(i.base_unit,'each') as unit,
 v.visited_at,q.posted,q.pending,greatest(0,p.quantity-q.posted-q.pending) as to_receive
 from stock_v2.trip_plan_line p join stock_v2.town_trip t on t.id=p.trip_id
 join stock_v2.order_line l using(order_line_id) join stock_v2.order_header h using(order_id)
 left join stock_v2.item i using(item_id) left join stock_v2.job_supplier_line s on s.id=l.supplier_line_id
 left join stock_v2.trip_supplier_visit v on v.trip_id=p.trip_id and v.supplier=h.supplier_name
 cross join lateral(select coalesce(sum(r.qty) filter(where status='posted'),0) posted,coalesce(sum(r.qty) filter(where status='pending'),0) pending
 from stock_v2.trip_receipt_quantities r where r.town_trip_id=p.trip_id and r.order_line_id=p.order_line_id) q;
create view stock_v2.trip_order_availability with(security_invoker=true) as
 select l.order_line_id,h.order_id,h.order_number,h.supplier_name,coalesce(i.item_name,s.description) item_name,
 l.ordered_quantity,l.ordered_unit_price,h.payment_terms,stock_v2.po_payment_basis(h.payment_terms) as payment_basis,
 greatest(0,l.ordered_quantity-l.received_quantity-coalesce((select sum(d.quantity-d.posted) from stock_v2.trip_plan_detail d where d.order_line_id=l.order_line_id and d.finalised_at is null),0)
 -coalesce((select sum(r.qty) from stock_v2.trip_receipt_quantities r where r.order_line_id=l.order_line_id and r.status='pending'
 and not exists(select from stock_v2.trip_plan_line p where p.trip_id=r.town_trip_id and p.order_line_id=r.order_line_id)),0)) as available
 from stock_v2.order_line l join stock_v2.order_header h using(order_id) left join stock_v2.item i using(item_id)
 left join stock_v2.job_supplier_line s on s.id=l.supplier_line_id where h.status='approved' and l.ordered_quantity>l.received_quantity
 and not exists(select from stock_v2.town_trip_order e join stock_v2.town_trip t on t.id=e.trip_id where e.order_id=l.order_id and t.finalised_at is null and e.outcome<>'unavailable');

create function stock_v2.trip_terms_note(terms text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(coalesce(terms,''),'^(on account|account|bank transfer|transfer|cash)([[:space:]]*[·:-][[:space:]]*|$)','','i'))
$$;
create function stock_v2.trip_plan_command(actor uuid,cmd text,p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare t stock_v2.town_trip; a record; oldline stock_v2.trip_plan_line; x jsonb; q numeric; used_qty numeric; pending_qty numeric;
 basis text; note text; why text; prev text; supplier text; line_id bigint; driver uuid;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 if cmd<>'visit' then perform stock_v2.workflow_require(actor,true);end if;
 if cmd='create' then
  insert into stock_v2.town_trip(id,trip_date,driver_id,created_by,line_plan)
  values(gen_random_uuid(),(p->>'date')::date,(p->>'driver_id')::uuid,actor,true) returning * into t;
 else
  select * into strict t from stock_v2.town_trip where id=(p->>'trip_id')::uuid and line_plan for update;
  if t.finalised_at is not null then raise exception 'This town list is closed';end if;
 end if;
 if cmd='visit' then
  if t.driver_id<>actor or not exists(select from public.app_user_role where user_id=actor and lower(role_name)='driver'
   union all select from stock_v2.buying_staff_role where user_id=actor and role_name='driver') then raise exception 'Assigned driver required';end if;
  supplier:=p->>'supplier';
  if not exists(select from stock_v2.trip_plan_detail d where d.trip_id=t.id and d.supplier_name=supplier) then raise exception 'Supplier is not on this town list';end if;
  insert into stock_v2.trip_supplier_visit(trip_id,supplier,visited_by) values(t.id,supplier,actor) on conflict do nothing;
 elsif cmd in ('create','edit') then
  if cmd='edit' and t.plan_version is distinct from (p->>'version')::integer then raise exception 'Town list changed. Reload before editing.';end if;
  driver:=(p->>'driver_id')::uuid;
  if not exists(select from public.app_user_role where user_id=driver and lower(role_name)='driver'
   union all select from stock_v2.buying_staff_role where user_id=driver and role_name='driver') then raise exception 'Choose an active driver';end if;
  if driver<>t.driver_id and exists(select from stock_v2.trip_supplier_visit where trip_id=t.id) then raise exception 'Driver already visited a supplier';end if;
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 200 then raise exception 'Select at least one approved PO line';end if;
  if (select count(distinct z->>'id') from jsonb_array_elements(p->'lines') z)<>jsonb_array_length(p->'lines') then raise exception 'Select each line once';end if;
  if exists(select from stock_v2.trip_plan_detail d where d.trip_id=t.id and (d.posted+d.pending>0 or d.visited_at is not null)
   and not exists(select from jsonb_array_elements(p->'lines') z where z->>'id'=d.order_line_id::text)) then raise exception 'Keep visited or received lines on the list';end if;
  delete from stock_v2.trip_plan_line d where d.trip_id=t.id and not exists(select from jsonb_array_elements(p->'lines') z where z->>'id'=d.order_line_id::text);
  for x in select value from jsonb_array_elements(p->'lines') loop
   line_id:=(x->>'id')::bigint;
   perform 1 from stock_v2.order_line where order_line_id=line_id for update;
   select * into oldline from stock_v2.trip_plan_line where trip_id=t.id and order_line_id=line_id;
   select l.ordered_quantity,h.status,h.payment_terms,coalesce(v.available,0) as available into strict a
   from stock_v2.order_line l join stock_v2.order_header h using(order_id)
   left join stock_v2.trip_order_availability v using(order_line_id) where l.order_line_id=line_id;
   select coalesce(sum(r.qty) filter(where r.status='posted'),0),coalesce(sum(r.qty) filter(where r.status='pending'),0)
   into used_qty,pending_qty from stock_v2.trip_receipt_quantities r where r.town_trip_id=t.id and r.order_line_id=line_id;
   q:=(x->>'quantity')::numeric;basis:=x->>'basis';note:=btrim(coalesce(x->>'note',''));why:=btrim(coalesce(x->>'reason',''));
   if q is null or q<=0 or q>coalesce(oldline.quantity,0)+a.available or q<used_qty+pending_qty or
      (a.status<>'approved' and (oldline.quantity is null or q<>oldline.quantity)) then raise exception 'Planned quantity exceeds available or conflicts with a receipt';end if;
   if basis is null or basis not in ('Cash','Transfer','Account') or length(note)>200 then raise exception 'Select valid payment terms';end if;
   if oldline.trip_id is null then
    prev:=a.payment_terms;
   else prev:=concat_ws(' · ',oldline.payment_basis,nullif(oldline.terms_note,''));end if;
   if (oldline.trip_id is null and (basis is distinct from stock_v2.po_payment_basis(prev) or note is distinct from stock_v2.trip_terms_note(prev)))
    or (oldline.trip_id is not null and (basis<>oldline.payment_basis or note<>oldline.terms_note)) then
    if pending_qty>0 or q<=used_qty then raise exception 'Payment terms are locked for submitted or confirmed quantities';end if;
    if length(why) not between 1 and 500 then raise exception 'Record a reason for the payment terms change';end if;
    insert into stock_v2.trip_terms_change(trip_id,order_line_id,quantity,previous_terms,new_terms,reason,changed_by)
    values(t.id,line_id,q-used_qty,prev,concat_ws(' · ',basis,nullif(note,'')),why,actor);
   end if;
   insert into stock_v2.trip_plan_line values(t.id,line_id,q,basis,note)
   on conflict(trip_id,order_line_id) do update set quantity=excluded.quantity,payment_basis=excluded.payment_basis,terms_note=excluded.terms_note;
  end loop;
  update stock_v2.town_trip set trip_date=(p->>'date')::date,driver_id=driver,plan_version=plan_version+1 where id=t.id;
 elsif cmd='close' then
  if t.plan_version is distinct from (p->>'version')::integer then raise exception 'Reload the current town list';end if;
  if exists(select from stock_v2.receipt_verification v where v.town_trip_id=t.id and v.status='returned' and not exists(select from stock_v2.receipt_verification n where n.replaces_id=v.id)) then raise exception 'Resolve returned receipts before closing';end if;
  if exists(select from stock_v2.trip_plan_detail where trip_id=t.id and pending>0) then raise exception 'Resolve receipts awaiting verification first';end if;
  update stock_v2.town_trip set finalised_at=now(),finalised_by=actor,plan_version=plan_version+1 where id=t.id;
 else raise exception 'Unknown town list action';end if;
 return jsonb_build_object('id',t.id,'trip_number',t.trip_number);
end $$;

-- Protect assigned quantities also when another receiving screen posts to the same PO.
create function stock_v2.guard_trip_receipt() returns trigger language plpgsql set search_path='' as $$
declare r record;d record;free numeric;snapshot jsonb:='{}'; planned uuid;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 planned:=nullif(current_setting('jspl.receiving_trip',true),'')::uuid;
 if planned is not null then new.town_trip_id:=planned;end if;
 for r in select * from stock_v2.po_receipt_rows(new.receipt_action,new.payload) loop
  if not exists(select from stock_v2.trip_plan_line where order_line_id=r.order_line_id) and planned is null then continue;end if;
  if planned is not null then
   select * into strict d from stock_v2.trip_plan_detail where trip_id=planned and order_line_id=r.order_line_id and finalised_at is null;
   if r.qty is null or r.qty<=0 or r.qty>d.to_receive then raise exception 'Check quantity assigned to this town list';end if;
   snapshot:=snapshot||jsonb_build_object(r.order_line_id::text,jsonb_build_object('basis',d.payment_basis,'note',d.terms_note));
  else
   select available into free from stock_v2.trip_order_availability where order_line_id=r.order_line_id;
   if r.qty>coalesce(free,0) then raise exception 'Receive the assigned quantity from its town list';end if;
  end if;
 end loop;
 if planned is not null then new.payload:=new.payload||jsonb_build_object('trip_terms',snapshot);end if;
 return new;
end $$;
create trigger plan_receipt_quantities before insert on stock_v2.receipt_verification for each row execute function stock_v2.guard_trip_receipt();
create function stock_v2.guard_trip_order_update() returns trigger language plpgsql set search_path='' as $$
declare held numeric;this_trip uuid:=nullif(current_setting('jspl.receiving_trip',true),'')::uuid;
begin
 if not exists(select from stock_v2.trip_plan_line where order_line_id=old.order_line_id) then return new;end if;
 select coalesce(sum(quantity-posted),0) into held from stock_v2.trip_plan_detail
 where order_line_id=old.order_line_id and finalised_at is null and trip_id is distinct from this_trip;
 if new.ordered_quantity-new.received_quantity<held then raise exception 'Close or amend outstanding town list allocations first';end if;
 return new;
end $$;
create trigger protect_town_list before update of ordered_quantity,received_quantity on stock_v2.order_line for each row execute function stock_v2.guard_trip_order_update();
create function stock_v2.guard_trip_order_cancel() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='cancelled' and old.status is distinct from new.status and exists(select from stock_v2.trip_plan_detail where order_id=old.order_id and finalised_at is null and quantity>posted) then raise exception 'Close or amend the open town list before cancelling the PO';end if;return new;
end $$;
create trigger protect_town_list_cancellation before update of status on stock_v2.order_header for each row execute function stock_v2.guard_trip_order_cancel();

create function stock_v2.trip_receive(actor uuid,p jsonb,confirm_now boolean) returns jsonb
language plpgsql set search_path='' as $$
declare t stock_v2.town_trip;h stock_v2.order_header;r record;x jsonb;rec stock_v2.receipt_verification;priced jsonb:='[]'; totals jsonb;
 terms jsonb;result jsonb;oid bigint:=(p->>'order_id')::bigint;qty numeric;price numeric;payload jsonb;
begin
 if not coalesce((stock_v2.workflow_access(actor)->>'is_stock')::boolean,false) then raise exception 'Stores access required';end if;
 if confirm_now then perform stock_v2.workflow_require(actor,true);end if;
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 select * into strict t from stock_v2.town_trip where id=(p->>'trip_id')::uuid and line_plan and finalised_at is null for update;
 select * into strict h from stock_v2.order_header where order_id=oid and status='approved' for update;
 if nullif(btrim(p->>'invoice_number'),'') is null or (p->>'date')::date is null or (p->>'invoice_date')::date is null or jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 100 then raise exception 'Enter the receipt and invoice dates, invoice number and quantities';end if;
 if (select count(distinct z->>'order_line_id') from jsonb_array_elements(p->'lines') z)<>jsonb_array_length(p->'lines') then raise exception 'Receive each PO line once';end if;
 if p->>'replaces_id' is not null and not exists(select from stock_v2.receipt_verification v where v.id=(p->>'replaces_id')::uuid and v.status='returned' and v.town_trip_id=t.id and v.payload->>'order_id'=oid::text) then raise exception 'Choose the returned receipt on this trip';end if;
 perform set_config('jspl.receiving_trip',t.id::text,true);
 if exists(select from stock_v2.job_order_allocation a join stock_v2.order_line l using(order_line_id) where l.order_id=oid) then
  -- Existing verifier enforces sample identification, approved repair pricing and stock versus direct expense.
  result:=stock_v2.job_delivery_command(actor,'receive',(p-'trip_id'-'replaces_id'));
  select * into strict rec from stock_v2.receipt_verification where id=(result->>'id')::uuid;
  if p->>'replaces_id' is not null then update stock_v2.receipt_verification set replaces_id=(p->>'replaces_id')::uuid where id=rec.id;end if;
  if confirm_now then perform stock_v2.job_delivery_command(actor,'verify',jsonb_build_object('receipt_id',rec.id,'numbers',p->'numbers'));end if;
 else
  for x in select value from jsonb_array_elements(p->'lines') loop
   select * into strict r from stock_v2.trip_plan_detail where trip_id=t.id and order_id=oid and order_line_id=(x->>'order_line_id')::bigint;
   qty:=(x->>'quantity')::numeric;price:=(x->>'unit_price')::numeric;
   if qty is null or qty<=0 or qty>r.to_receive or price is null or price<=0 then raise exception 'Check actual quantities and invoice prices';end if;
   priced:=priced||jsonb_build_array(jsonb_build_object('order_line_id',r.order_line_id,'item_code',r.item_code,'quantity',qty,'unit_price',price));
  end loop;
  if exists(select from jsonb_array_elements(priced) z group by z->>'item_code' having min((z->>'unit_price')::numeric)<>max((z->>'unit_price')::numeric)) then raise exception 'Check invoice prices for repeated items';end if;
  select jsonb_agg(jsonb_build_object('item_code',code,'quantity',qty_sum,'invoice_quantity',qty_sum,'unit_price',cost)) into totals from
   (select z->>'item_code' code,sum((z->>'quantity')::numeric) qty_sum,min((z->>'unit_price')::numeric) cost from jsonb_array_elements(priced) z group by 1) g;
  payload:=jsonb_build_object('order_id',oid,'owner_code',(select replace(owner_code,'TEST_','') from stock_v2.owner where owner_id=h.owner_id),'supplier',h.supplier_name,
    'invoice_number',btrim(p->>'invoice_number'),'invoice_date',p->>'invoice_date','receipt_date',p->>'date','allocations','[]'::jsonb,'po_allocations',priced,'invoice_lines',totals,'new_receipts',totals);
  insert into stock_v2.receipt_verification(id,receipt_action,payload,submitted_by,town_trip_id,replaces_id) values(gen_random_uuid(),'combined_grv',payload,actor,t.id,(p->>'replaces_id')::uuid) returning * into rec;
  if confirm_now then perform stock_v2.buying_decide_receipt(actor,rec.id,'verify',null);end if;
 end if;
 perform set_config('jspl.receiving_trip','',true);
 return jsonb_build_object('id',rec.id,'request_number',rec.request_number,'status',case when confirm_now then 'posted' else 'pending' end);
end $$;

create function stock_v2.guard_legacy_trip_assignment() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 if exists(select from stock_v2.town_trip where id=new.trip_id and line_plan) or exists(select from stock_v2.trip_plan_detail where order_id=new.order_id and finalised_at is null and quantity>posted) then raise exception 'Use the town list line planner for this order';end if;
 return new;
end $$;
create trigger protect_split_trip before insert on stock_v2.town_trip_order for each row execute function stock_v2.guard_legacy_trip_assignment();
revoke all on function stock_v2.guard_legacy_trip_assignment() from public,anon,authenticated;
create view stock_v2.trip_job_progress with(security_invoker=true) as
with links as (
 select coalesce('S'||a.supplier_line_id,'P'||a.part_id) key,a.order_line_id from stock_v2.job_order_allocation a where a.order_line_id is not null
 union all select 'P'||p.part_id,p.order_line_id from stock_v2.job_purchase_line p where not exists(select from stock_v2.job_order_allocation a where a.order_line_id=p.order_line_id)
), legacy_request as (
 select 'P'||p.id key,d.request_number,d.payload->>'supplier' supplier,(z->>'quantity')::numeric qty,(z->>'unit_price')::numeric price
 from stock_v2.approval_document d cross join lateral jsonb_array_elements(d.payload->'lines') z
 join stock_v2.item i on i.item_code=z->>'item_code' join stock_v2.job_card_part p on p.item_id=i.item_id
 where d.kind='po' and d.status in ('draft','pending','approved') and d.payload->>'source_job_card_id'=p.job_id::text
 and d.target_order_id is null and coalesce(d.payload->>'job_requirements','false')<>'true'
), portions as (
 select r.key,case when s.declined_on is not null then 'Awaiting return'
 when r.kind in ('sample','repair') and r.sent_on is null then 'Awaiting dispatch'
 when r.kind='repair' and r.quote_ref is null then 'Awaiting Supplier / Price'
 when r.supplier_id is null then 'Awaiting Supplier / Price' else 'Ready for PO' end as stage,
 greatest(0,r.remaining-coalesce((select sum(lr.qty) from legacy_request lr where lr.key=r.key),0)) as qty,null::text po,null::bigint trip,null::text invoice,null::text receipt_date,r.unit_price as price,r.supplier_name as supplier,true as source
 from stock_v2.job_requirements r left join stock_v2.job_supplier_line s on s.id=r.supplier_line_id
 where r.closed_at is null and r.remaining>0 and (s.declined_on is null or (s.sent_on is not null and s.returned_on is null))
 union all
 select key,'Awaiting PO Approval',qty,'Request '||request_number,null,null,null,price,supplier,false from legacy_request
 union all
 select coalesce('S'||a.supplier_line_id,'P'||a.part_id),'Awaiting PO Approval',a.quantity,'Request '||d.request_number,null,null,null,(z->>'unit_price')::numeric,d.payload->>'supplier',false
 from stock_v2.job_order_allocation a join stock_v2.approval_document d on d.id=a.document_id
 cross join lateral(select d.payload->'lines'->(a.position-1) as z) x where d.status in ('draft','pending','approved') and a.order_line_id is null
 union all
 select k.key,'Awaiting Order',v.available,v.order_number,null,null,null,v.ordered_unit_price,v.supplier_name,false
 from links k join stock_v2.trip_order_availability v using(order_line_id) where v.available>0
 union all
 select k.key,case when d.visited_at is null then 'Town List' else 'Awaiting Receipt' end,d.to_receive,d.order_number,d.trip_number,null,null,d.ordered_unit_price,d.supplier_name,false
 from links k join stock_v2.trip_plan_detail d using(order_line_id) where d.finalised_at is null and d.to_receive>0
 union all
 select k.key,case v.status when 'posted' then 'Received' else 'Awaiting Verification' end,v.qty,h.order_number,t.trip_number,v.invoice,v.receipt_date,v.price,h.supplier_name,false
 from links k join stock_v2.trip_receipt_quantities v using(order_line_id) join stock_v2.order_line l using(order_line_id)
 join stock_v2.order_header h using(order_id) left join stock_v2.town_trip t on t.id=v.town_trip_id
 union all
 select k.key,case e.outcome when 'collected' then 'Awaiting Receipt' else 'Town List' end,
 greatest(0,l.ordered_quantity-l.received_quantity-coalesce((select sum(q.qty) from stock_v2.trip_receipt_quantities q where q.status='pending' and q.order_line_id=l.order_line_id),0)),h.order_number,t.trip_number,null,null,l.ordered_unit_price,h.supplier_name,false
 from links k join stock_v2.order_line l using(order_line_id) join stock_v2.order_header h using(order_id) join stock_v2.town_trip_order e using(order_id)
 join stock_v2.town_trip t on t.id=e.trip_id where t.finalised_at is null and e.outcome<>'unavailable' and h.status='approved'
)
select p.*,r.job_id,r.job_number,r.card_type,r.destination,r.category_name,r.description,r.ref from portions p join stock_v2.job_requirements r using(key)
where p.qty>0 and (r.closed_at is null or p.stage='Received');
revoke all on stock_v2.trip_plan_detail,stock_v2.trip_order_availability,stock_v2.trip_job_progress,stock_v2.trip_receipt_quantities from public,anon,authenticated;
revoke all on function stock_v2.po_payment_basis(text),stock_v2.trip_terms_note(text),stock_v2.po_receipt_rows(text,jsonb),stock_v2.trip_plan_command(uuid,text,jsonb),stock_v2.trip_receive(uuid,jsonb,boolean),stock_v2.guard_trip_receipt(),stock_v2.guard_trip_order_update(),stock_v2.guard_trip_order_cancel() from public,anon,authenticated;
