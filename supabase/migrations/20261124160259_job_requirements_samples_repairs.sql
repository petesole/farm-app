-- Physical items sent to a supplier belong to a particular Job Card, even before identification.
create table stock_v2.job_supplier_line (
 id bigint generated always as identity primary key, job_id uuid not null references stock_v2.job_card,
 kind text not null check(kind in ('sample','repair')), ref text not null unique,
 category_id bigint not null references stock_v2.buying_category,
 description text not null check(length(btrim(description)) between 1 and 500),
 quantity numeric not null check(quantity>0 and quantity<=100000),
 supplier_id bigint references stock_v2.supplier, sent_on date, returned_on date,
 item_id bigint references stock_v2.item, unit_price numeric check(unit_price between 0 and 999999999),
 quote_ref text, quote_work text, created_by uuid not null references auth.users,
 check(sent_on is null or supplier_id is not null),check(returned_on is null or returned_on>=sent_on),
 check(unit_price is null or supplier_id is not null)
);
create index job_supplier_card on stock_v2.job_supplier_line(job_id);
create index job_supplier_lookup on stock_v2.job_supplier_line(supplier_id);
alter table stock_v2.job_supplier_line enable row level security;
alter table stock_v2.job_card_part add column sourcing_supplier_id bigint references stock_v2.supplier;

create table stock_v2.job_order_allocation (
 document_id uuid not null references stock_v2.approval_document, position integer not null,
 part_id bigint references stock_v2.job_card_part, supplier_line_id bigint references stock_v2.job_supplier_line,
 quantity numeric not null check(quantity>0),order_line_id bigint unique references stock_v2.order_line,
 primary key(document_id,position),check(num_nonnulls(part_id,supplier_line_id)=1)
);
create index job_order_part on stock_v2.job_order_allocation(part_id);
create index job_order_supplier_line on stock_v2.job_order_allocation(supplier_line_id);
alter table stock_v2.job_order_allocation enable row level security;
alter table stock_v2.order_line add column supplier_line_id bigint references stock_v2.job_supplier_line,
 alter column item_id drop not null,add check(item_id is not null or supplier_line_id is not null);
alter table stock_v2.accounting_grv_line add column job_order_line_id bigint references stock_v2.order_line,
 alter column item_id drop not null,add check(item_id is not null or job_order_line_id is not null);
-- Keep every verified direct-to-job receipt and its actual cost independently of the authorised PO snapshot.
create table stock_v2.job_delivery_line (
 receipt_id uuid not null references stock_v2.receipt_verification,order_line_id bigint not null references stock_v2.order_line,
 item_id bigint references stock_v2.item, quantity numeric not null check(quantity>0),unit_price numeric not null check(unit_price>=0),
 primary key(receipt_id,order_line_id)
);
alter table stock_v2.job_delivery_line enable row level security;
alter table stock_v2.receipt_verification drop constraint receipt_verification_receipt_action_check,
 add check(receipt_action in ('unplanned_dnote','multi_po_dnote','combined_grv','grv','direct_grv','job_delivery'));
revoke all on stock_v2.job_supplier_line,stock_v2.job_order_allocation,stock_v2.job_delivery_line from public,anon,authenticated;

create view stock_v2.job_requirements with(security_invoker=true) as
with source as (
 select 'P'||p.id as key,p.id as part_id,null::bigint as supplier_line_id,p.job_id,'part'::text as kind,
 i.item_name as description,i.buying_part_number as part_number,p.category_id,p.requested_quantity as quantity,
 p.unit_price,coalesce(p.price_supplier_id,p.sourcing_supplier_id) as supplier_id,p.owner_id,i.item_code,
 null::text as ref,null::date as sent_on,null::date as returned_on,null::text as quote_ref,null::text as quote_work,
 coalesce(c.quantity,0) as cancelled,coalesce(u.issued_quantity,0)+coalesce(r.quantity,0) as issued_reserved,i.buying_direct_expense as expense
 from stock_v2.job_card_part p join stock_v2.item i using(item_id)
 left join stock_v2.job_part_cancellation c on c.part_id=p.id left join stock_v2.job_part_usage u on u.part_id=p.id
 left join stock_v2.job_part_reserved r on r.part_id=p.id
 union all
 select 'S'||s.id,null,s.id,s.job_id,s.kind,s.description,i.buying_part_number,s.category_id,s.quantity,s.unit_price,
 s.supplier_id,null,i.item_code,s.ref,s.sent_on,s.returned_on,s.quote_ref,s.quote_work,0,0,true
 from stock_v2.job_supplier_line s left join stock_v2.item i using(item_id)
)
select x.*,j.job_number,j.card_type,j.closed_at,coalesce(v.vehicle_name,t.tracecode_name) as destination,
 bc.category_name,su.supplier_name,coalesce(po.owner_code,co.stock_owner_code,mo.owner_code) as owner_code,
 case when x.kind='part' and x.expense and exists(select from cash_book.job_expense e join cash_book.entry en on en.id=e.entry_id where e.part_id=x.part_id and en.status in ('draft','confirmed') and not exists(select from cash_book.entry rev where rev.reversal_of=en.id and rev.status='confirmed')) then 0
 else greatest(0,x.quantity-x.cancelled-greatest(x.issued_reserved,committed.qty+legacy.qty)) end as remaining,
 verified.qty as verified_quantity,verified.cost as verified_cost
from source x join stock_v2.job_card j on j.id=x.job_id left join public.vehicle v using(vehicle_id)
left join public.tracecode t on t.tracecode_id=j.tracecode_id left join stock_v2.buying_category bc using(category_id)
left join stock_v2.supplier su using(supplier_id) left join stock_v2.owner po on po.owner_id=x.owner_id
left join public.company co on co.company_id=j.owner_company_id
left join stock_v2.tracecode_owner_map map on map.external_tracecode_id=j.tracecode_id and map.verified
left join stock_v2.owner mo on mo.owner_id=map.owner_id
cross join lateral(select coalesce(sum(case when d.status='cancelled' then coalesce(l.received_quantity,0) else coalesce(l.ordered_quantity,a.quantity) end),0) qty from stock_v2.job_order_allocation a
 join stock_v2.approval_document d on d.id=a.document_id left join stock_v2.order_line l using(order_line_id)
 where (a.part_id=x.part_id or a.supplier_line_id=x.supplier_line_id) and d.status in ('draft','pending','approved','applied','cancelled')) committed
cross join lateral(select coalesce(sum(l.ordered_quantity),0) qty from stock_v2.job_purchase_line pl join stock_v2.order_line l using(order_line_id)
 where pl.part_id=x.part_id and not exists(select from stock_v2.job_order_allocation a where a.order_line_id=l.order_line_id)) legacy
cross join lateral(select coalesce(sum(dl.quantity),0) qty,coalesce(sum(dl.quantity*dl.unit_price),0) cost
 from stock_v2.job_delivery_line dl join stock_v2.job_order_allocation a using(order_line_id)
 where a.part_id=x.part_id or a.supplier_line_id=x.supplier_line_id) verified;

create function stock_v2.save_supplier_line(p_actor uuid,p_job uuid,p jsonb) returns bigint
language plpgsql set search_path='' as $$
declare j stock_v2.job_card; s stock_v2.job_supplier_line; c stock_v2.buying_category; label text; expected text;
begin
 select * into strict j from stock_v2.job_card where id=p_job and closed_at is null for update;
 select * into strict c from stock_v2.buying_category where category_id=(p->>'category_id')::bigint;
 expected:=case when j.vehicle_id is null then j.card_type else stock_v2.job_asset_group(j.vehicle_id) end;
 if c.catalogue_group<>expected or stock_v2.is_job_lubricant_category(c.category_name) then raise exception 'Choose a parts category for this Job Card';end if;
 if nullif(p->>'supplier_line_id','') is not null then
  select * into strict s from stock_v2.job_supplier_line where job_id=p_job and id=(p->>'supplier_line_id')::bigint for update;
  if (s.kind,s.category_id,s.description,s.quantity,s.supplier_id) is not distinct from
   (p->>'kind',c.category_id,btrim(p->>'sample_details'),(p->>'quantity')::numeric,(p->>'supplier_id')::bigint) then return s.id;end if;
  if s.declined_on is not null or s.sent_on is not null or s.unit_price is not null or exists(select from stock_v2.job_order_allocation where supplier_line_id=s.id)
   then raise exception 'The dispatched or ordered line is locked';end if;
  if s.kind<>p->>'kind' then raise exception 'Keep the original sample or repair reference';end if;
 end if;
 if p->>'supplier_id' is not null and not exists(select from stock_v2.supplier where supplier_id=(p->>'supplier_id')::bigint and active) then raise exception 'Choose an active supplier';end if;
 if s.id is null then
  -- The Job Card lock serialises reference assignment. References are never deleted or renumbered.
  select 'JC-'||j.job_number||case p->>'kind' when 'sample' then '-S' else '-R' end||(count(*)+1)
   into label from stock_v2.job_supplier_line where job_id=p_job and kind=p->>'kind';
  insert into stock_v2.job_supplier_line(job_id,kind,ref,category_id,description,quantity,supplier_id,created_by)
   values(p_job,p->>'kind',label,c.category_id,btrim(p->>'sample_details'),(p->>'quantity')::numeric,(p->>'supplier_id')::bigint,p_actor) returning id into s.id;
 else
  update stock_v2.job_supplier_line set description=btrim(p->>'sample_details'),category_id=c.category_id,quantity=(p->>'quantity')::numeric,supplier_id=(p->>'supplier_id')::bigint where id=s.id;
 end if;
 return s.id;
end $$;

alter table stock_v2.job_supplier_line add column declined_on date;
create function stock_v2.job_requirements_command(actor uuid, cmd text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r stock_v2.job_requirements; s stock_v2.job_supplier_line; doc stock_v2.approval_document;
 selected jsonb; group_row record; selected_lines jsonb:='[]'; docs jsonb:='[]'; line jsonb; ord bigint;
 supplier stock_v2.supplier; owner stock_v2.owner; price numeric; qty numeric; n integer;
 terms text; oid bigint; ol bigint; sid bigint; number text; quote_item bigint; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 if cmd in ('authorise','cancel_order') then perform stock_v2.workflow_require(actor,true);
 elsif cmd='return_item' then
  if not coalesce((stock_v2.workflow_access(actor)->>'is_stock')::boolean,false) then raise exception 'Stores access required';end if;
 elsif not stock_v2.can_buy(actor) then raise exception 'Buyer or Admin access required';end if;
 if cmd in ('dispatch','source','quote','decline','return_item') then
  select * into strict r from stock_v2.job_requirements where key=p->>'key' and closed_at is null;
  if r.supplier_line_id is not null then select * into strict s from stock_v2.job_supplier_line where id=r.supplier_line_id for update;end if;
  if cmd='return_item' then
   if s.sent_on is null or s.declined_on is null or s.returned_on is not null then raise exception 'Select an outstanding declined item';end if;
   update stock_v2.job_supplier_line set returned_on=(p->>'date')::date where id=s.id and p->>'date' is not null;
   if not found then raise exception 'Enter the return date';end if;
  else
   if r.remaining<=0 or s.returned_on is not null or s.declined_on is not null then raise exception 'This requirement is already covered or closed';end if;
   if cmd='decline' then
    if s.id is null or exists(select from stock_v2.job_order_allocation a join stock_v2.approval_document d on d.id=a.document_id where a.supplier_line_id=s.id and d.status in ('pending','approved','applied','draft')) then raise exception 'Return or cancel the open PO before declining this quote';end if;
    update stock_v2.job_supplier_line set declined_on=current_date where id=s.id;
   else
    select * into strict supplier from stock_v2.supplier where supplier_id=(p->>'supplier_id')::bigint and active;
    if s.sent_on is not null and supplier.supplier_id<>s.supplier_id then raise exception 'This item is with a different supplier';end if;
    if cmd='dispatch' then
     if s.id is null or s.sent_on is not null or p->>'date' is null then raise exception 'Choose an unsent item and dispatch date';end if;
     update stock_v2.job_supplier_line set sent_on=(p->>'date')::date,supplier_id=supplier.supplier_id where id=s.id;
    elsif cmd in ('source','quote') then
     price:=(p->>'unit_price')::numeric;
     if price<0 or price>999999999 then raise exception 'Enter a valid unit price';end if;
     if s.kind='repair' and cmd='quote' and (s.sent_on is null or price is null or nullif(btrim(p->>'work'),'') is null or nullif(btrim(p->>'reference'),'') is null) then raise exception 'Enter the repair quote reference, work and price after dispatch';end if;
     if s.id is not null then
      number:=nullif(btrim(p->>'part_number'),'');
      if number is not null then
       if s.kind<>'sample' or length(number)>100 then raise exception 'Enter a valid sample part number';end if;
       select item_id into quote_item from stock_v2.item where lower(buying_part_number)=lower(number) and active;
       if not found then
        insert into stock_v2.item(item_code,item_name,base_unit,input_type,input_category,buying_part_number)
        values('PART-'||gen_random_uuid(),s.description,'each','Parts',r.category_name,number) returning item_id into quote_item;
       end if;
       insert into stock_v2.buying_item_category(item_id,category_id) values(quote_item,s.category_id) on conflict do nothing;
      end if;
      update stock_v2.job_supplier_line set supplier_id=supplier.supplier_id,unit_price=price,item_id=coalesce(quote_item,item_id),
       quote_ref=nullif(btrim(p->>'reference'),''),quote_work=nullif(btrim(p->>'work'),'') where id=s.id;
     else
      update stock_v2.job_card_part set sourcing_supplier_id=supplier.supplier_id,unit_price=price,price_supplier_id=case when price is not null then supplier.supplier_id end where id=r.part_id;
     end if;
    end if;
   end if;
  end if;
  update stock_v2.job_card set work_description=work_description where id=r.job_id;
  return jsonb_build_object('key',r.key);
 end if;
 if cmd='submit' then
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 100
   or (select count(distinct x->>'key') from jsonb_array_elements(p->'lines') x)<>jsonb_array_length(p->'lines') then raise exception 'Select each outstanding requirement once';end if;
  for selected in select value from jsonb_array_elements(p->'lines') loop
   select * into strict r from stock_v2.job_requirements where key=selected->>'key' and closed_at is null;
   qty:=(selected->>'quantity')::numeric;
   if qty is null or qty<=0 or qty>r.remaining or r.returned_on is not null or exists(select from stock_v2.job_supplier_line where id=r.supplier_line_id and declined_on is not null)
    then raise exception 'Requirement % has changed. Refresh and review the quantity.',r.description;end if;
   if r.kind='repair' and (r.sent_on is null or r.quote_ref is null or r.quote_work is null or r.unit_price is null) then raise exception 'Record the supplier repair quote first';end if;
   if r.kind='sample' and r.sent_on is null then raise exception 'Record the sample dispatch first';end if;
   select * into strict supplier from stock_v2.supplier where supplier_id=r.supplier_id and active;
   select * into strict owner from stock_v2.owner where owner_code='TEST_'||(selected->>'owner') and active and owner_id in(select ic.owner_id from stock_v2.issue_company ic where ic.enabled);
   if r.owner_code is not null and replace(r.owner_code,'TEST_','')<>selected->>'owner' then raise exception 'Use the Job Card company';end if;
   if r.part_id is not null and exists(select from stock_v2.approval_document d,jsonb_array_elements(d.payload->'lines') x where d.kind='po' and d.status in ('pending','draft','approved') and d.payload->>'source_job_card_id'=r.job_id::text and x->>'item_code'=r.item_code) then raise exception 'This part already has an open PO request';end if;
   if (selected->>'supplier_id')::bigint is distinct from r.supplier_id or (selected->>'unit_price')::numeric is distinct from r.unit_price then raise exception 'Supplier or price changed. Refresh the review.';end if;
   selected_lines:=selected_lines||jsonb_build_array(jsonb_build_object('source_key',r.key,'job_number',r.job_number,'job_id',r.job_id,'kind',r.kind,'ref',r.ref,'item_code',coalesce(r.item_code,r.ref),'item_name',r.description,'part_number',r.part_number,'quote_ref',r.quote_ref,'quote_work',r.quote_work,'quantity',qty,'unit_price',r.unit_price,'owner_code',selected->>'owner','supplier',supplier.supplier_name,'supplier_id',supplier.supplier_id));
  end loop;
  perform set_config('jspl.job_po_command','submit',true);
  for group_row in select x->>'owner_code' own,x->>'supplier' supp,jsonb_agg(x order by v.n) lines from jsonb_array_elements(selected_lines) with ordinality v(x,n) group by 1,2 order by 1,2 loop
   insert into stock_v2.approval_document(id,kind,status,payload,created_by,updated_by)
    values(gen_random_uuid(),'po','pending',jsonb_build_object('job_requirements',true,'supplier',group_row.supp,'owner_code',group_row.own,'order_date',(p->>'date')::date,'lines',group_row.lines),actor,actor) returning * into doc;
   n:=0;
   for line in select value from jsonb_array_elements(group_row.lines) loop
    n:=n+1;sid:=substring(line->>'source_key' from 2)::bigint;
    insert into stock_v2.job_order_allocation(document_id,position,part_id,supplier_line_id,quantity) values(doc.id,n,case when left(line->>'source_key',1)='P' then sid end,case when left(line->>'source_key',1)='S' then sid end,(line->>'quantity')::numeric);
   end loop;
   insert into stock_v2.approval_audit(document_id,actor,action,after_values) values(doc.id,actor,'submit',to_jsonb(doc));
   docs:=docs||jsonb_build_array(doc.request_number);
  end loop;
  return jsonb_build_object('requests',docs);
 elsif cmd='cancel_order' then
  select * into strict doc from stock_v2.approval_document where id=(p->>'id')::uuid and status='applied' and payload->>'job_requirements'='true' and version=(p->>'version')::integer for update;
  if length(btrim(coalesce(p->>'reason','')))<5 then raise exception 'Give a cancellation reason';end if;
  if exists(select from stock_v2.receipt_verification where status='pending' and receipt_action='job_delivery' and payload->>'order_id'=doc.target_order_id::text) then raise exception 'Review or return the pending receipt first';end if;
  insert into stock_v2.order_line_cancellation(order_line_id,quantity,original_ordered_quantity,reason,created_by)
   select order_line_id,ordered_quantity-received_quantity,ordered_quantity,btrim(p->>'reason'),actor from stock_v2.order_line where order_id=doc.target_order_id and ordered_quantity>received_quantity;
  if not found then raise exception 'No outstanding quantity';end if;
  update stock_v2.order_header set status='cancelled' where order_id=doc.target_order_id;
  update stock_v2.approval_document set status='cancelled',decision_reason=btrim(p->>'reason'),version=version+1,updated_by=actor,updated_at=now() where id=doc.id returning to_jsonb(approval_document) into result;
  insert into stock_v2.approval_audit(document_id,actor,action,before_values,after_values,reason) values(doc.id,actor,'cancel',to_jsonb(doc),result,p->>'reason');
  return result;
 elsif cmd='authorise' then
  select * into strict doc from stock_v2.approval_document where id=(p->>'id')::uuid and kind='po' and payload->>'job_requirements'='true' and status='pending' and version=(p->>'version')::int for update;
  terms:=nullif(btrim(p->>'payment_terms'),'');if terms is null or length(terms)>200 then raise exception 'Enter payment terms';end if;
  select * into strict owner from stock_v2.owner where owner_code='TEST_'||(doc.payload->>'owner_code') and active;
  insert into stock_v2.order_header(order_number,owner_id,supplier_name,status,order_date,payment_terms) values('JOB-'||doc.id,owner.owner_id,doc.payload->>'supplier','approved',(doc.payload->>'order_date')::date,terms) returning order_id into oid;
  update stock_v2.order_header set order_number='PO-'||oid where order_id=oid;
  for line,ord in select value,ordinality from jsonb_array_elements(doc.payload->'lines') with ordinality loop
   select * into strict r from stock_v2.job_requirements where key=line->>'source_key' and closed_at is null;
   insert into stock_v2.order_line(order_id,item_id,supplier_line_id,ordered_quantity,ordered_unit_price)
    values(oid,case when r.kind='part' then (select item_id from stock_v2.job_card_part where id=r.part_id) end,r.supplier_line_id,(line->>'quantity')::numeric,(line->>'unit_price')::numeric) returning order_line_id into ol;
   update stock_v2.job_order_allocation set order_line_id=ol where document_id=doc.id and position=ord;
   if r.part_id is not null then
    update stock_v2.job_card_part set owner_id=owner.owner_id where id=r.part_id and owner_id is null;
    insert into stock_v2.job_purchase_line(order_line_id,part_id) values(ol,r.part_id);
   end if;
  end loop;
  perform set_config('jspl.job_po_command','authorise',true);
  update stock_v2.approval_document set payload=payload||jsonb_build_object('payment_terms',terms),status='applied',target_order_id=oid,approved_by=actor,approved_at=now(),applied_at=now(),version=version+1,updated_by=actor,updated_at=now() where id=doc.id returning to_jsonb(approval_document) into result;
  insert into stock_v2.approval_audit(document_id,actor,action,before_values,after_values) values(doc.id,actor,'authorise',to_jsonb(doc),result);
  return result;
 end if;
 raise exception 'Unknown requirements action';
end $$;

create function stock_v2.job_delivery_command(actor uuid,cmd text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rec stock_v2.receipt_verification; h stock_v2.order_header; l stock_v2.order_line;
 a stock_v2.job_order_allocation; r stock_v2.job_requirements; x jsonb; rows jsonb:='[]';
 number text; qty numeric; price numeric; observed text; item bigint; actual text; posted jsonb;
 goods jsonb:='[]'; totals jsonb; grv bigint; pending numeric; receipt_date date; verified_qty numeric;
begin
 perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
 if cmd='receive' then
  if not coalesce((stock_v2.workflow_access(actor)->>'is_stock')::boolean,false) then raise exception 'Stores access required';end if;
  select * into strict h from stock_v2.order_header where order_id=(p->>'order_id')::bigint and status='approved' for update;
  if nullif(btrim(p->>'invoice_number'),'') is null or p->>'date' is null or jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 100 then raise exception 'Enter the invoice, date and received lines';end if;
  if (select count(distinct z->>'order_line_id') from jsonb_array_elements(p->'lines') z)<>jsonb_array_length(p->'lines') then raise exception 'Receive each PO line once';end if;
  for x in select value from jsonb_array_elements(p->'lines') loop
   select * into strict l from stock_v2.order_line where order_id=h.order_id and order_line_id=(x->>'order_line_id')::bigint for update;
   select * into strict a from stock_v2.job_order_allocation where order_line_id=l.order_line_id;
   select * into strict r from stock_v2.job_requirements where key=coalesce('S'||a.supplier_line_id,'P'||a.part_id);
   select coalesce(sum((z->>'quantity')::numeric),0) into pending from stock_v2.receipt_verification v cross join jsonb_array_elements(v.payload->'lines') z where v.status='pending' and v.receipt_action='job_delivery' and z->>'order_line_id'=l.order_line_id::text;
   qty:=(x->>'quantity')::numeric;price:=(x->>'unit_price')::numeric;
   if qty is null or qty<=0 or qty+pending+l.received_quantity>l.ordered_quantity or price is null or price<0 or price>999999999 then raise exception 'Check remaining quantity and invoice price for %',r.description;end if;
   if r.kind='repair' and price is distinct from l.ordered_unit_price then raise exception 'Repair price differs from the approved quote. Return for authorisation.';end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('order_line_id',l.order_line_id,'kind',r.kind,'ref',r.ref,'item_name',r.description,'quantity',qty,'unit_price',price,'marking',left(btrim(x->>'marking'),150),'expected_number',(select z->>'part_number' from stock_v2.approval_document d,jsonb_array_elements(d.payload->'lines') z where d.id=a.document_id and z->>'source_key'=r.key)));
  end loop;
  if p->>'trip_id' is not null and not exists(select from stock_v2.town_trip_order where trip_id=(p->>'trip_id')::uuid and order_id=h.order_id and outcome='collected') then raise exception 'Select a collected order on this trip';end if;
  if p->>'replaces_id' is not null and not exists(select from stock_v2.receipt_verification v where v.id=(p->>'replaces_id')::uuid and v.status='returned' and v.receipt_action='job_delivery' and v.payload->>'order_id'=h.order_id::text and v.town_trip_id is not distinct from (p->>'trip_id')::uuid) then raise exception 'Select the original returned receipt';end if;
  insert into stock_v2.receipt_verification(id,receipt_action,town_trip_id,replaces_id,payload,submitted_by) values(gen_random_uuid(),'job_delivery',(p->>'trip_id')::uuid,(p->>'replaces_id')::uuid,jsonb_build_object('order_id',h.order_id,'supplier',h.supplier_name,'owner_code',(select replace(owner_code,'TEST_','') from stock_v2.owner where owner_id=h.owner_id),'receipt_date',(p->>'date')::date,'invoice_date',coalesce(p->>'invoice_date',p->>'date')::date,'invoice_number',btrim(p->>'invoice_number'),'lines',rows),actor) returning * into rec;
  return jsonb_build_object('id',rec.id,'request_number',rec.request_number);
 end if;
 perform stock_v2.workflow_require(actor,true);
 select * into strict rec from stock_v2.receipt_verification where id=(p->>'receipt_id')::uuid and receipt_action='job_delivery' and status='pending' for update;
 if cmd='return_receipt' then
  if length(btrim(coalesce(p->>'reason','')))<5 then raise exception 'Enter the discrepancy or reason';end if;
  update stock_v2.receipt_verification set status='returned',decided_at=now(),decided_by=actor,decision_reason=btrim(p->>'reason') where id=rec.id;
  return jsonb_build_object('id',rec.id,'status','returned');
 end if;
 if cmd<>'verify' then raise exception 'Unknown receipt action';end if;
 select * into strict h from stock_v2.order_header where order_id=(rec.payload->>'order_id')::bigint and status='approved' for update;
 receipt_date:=(rec.payload->>'receipt_date')::date;
 for x in select value from jsonb_array_elements(rec.payload->'lines') loop
  select * into strict l from stock_v2.order_line where order_id=h.order_id and order_line_id=(x->>'order_line_id')::bigint for update;
  select * into strict a from stock_v2.job_order_allocation where order_line_id=l.order_line_id;
  select * into strict r from stock_v2.job_requirements where key=coalesce('S'||a.supplier_line_id,'P'||a.part_id);
  qty:=(x->>'quantity')::numeric;price:=(x->>'unit_price')::numeric;
  if qty+l.received_quantity>l.ordered_quantity then raise exception 'Receipt exceeds the remaining approved quantity';end if;
  if not r.expense then
   goods:=goods||jsonb_build_array(jsonb_build_object('order_line_id',l.order_line_id,'item_code',r.item_code,'quantity',qty,'unit_price',price));
   continue;
  end if;
  item:=l.item_id;
  if r.kind='sample' then
   number:=nullif(btrim(p->'numbers'->>l.order_line_id::text),'');
   if number is null or length(number)>100 then raise exception 'Confirm the part number for %',r.ref;end if;
   if (x->>'expected_number' is not null and lower(number)<>lower(x->>'expected_number')) or (r.part_number is not null and lower(number)<>lower(r.part_number)) then raise exception 'Part number differs for %. Return the discrepancy for review.',r.ref;end if;
   select item_id into item from stock_v2.item where lower(buying_part_number)=lower(number) and active;
   if not found then insert into stock_v2.item(item_code,item_name,base_unit,input_type,input_category,buying_part_number)
    values('PART-'||gen_random_uuid(),r.description,'each','Parts',r.category_name,number) returning item_id into item;end if;
   insert into stock_v2.buying_item_category(item_id,category_id) values(item,r.category_id) on conflict do nothing;
   update stock_v2.job_supplier_line set item_id=item where id=r.supplier_line_id;
  end if;
  update stock_v2.order_line set received_quantity=received_quantity+qty where order_line_id=l.order_line_id;
  insert into stock_v2.job_delivery_line values(rec.id,l.order_line_id,item,qty,price);
  if r.kind='repair' and r.verified_quantity+qty>=r.quantity then update stock_v2.job_supplier_line set returned_on=receipt_date where id=r.supplier_line_id;end if;
 end loop;
 if jsonb_array_length(goods)>0 then
  if exists(select from jsonb_array_elements(goods) z group by z->>'item_code' having min((z->>'unit_price')::numeric)<>max((z->>'unit_price')::numeric)) then raise exception 'Different stock prices for the same product require separate invoice lines or correction';end if;
  select jsonb_agg(jsonb_build_object('item_code',code,'quantity',g.qty,'invoice_quantity',g.qty,'unit_price',g.price)) into totals from
   (select z->>'item_code' code,sum((z->>'quantity')::numeric) qty,min((z->>'unit_price')::numeric) price from jsonb_array_elements(goods) z group by 1) g;
  posted:=stock_v2.buying_post_combined_grv(rec.id,rec.payload||jsonb_build_object('actor_id',actor,'allocations','[]'::jsonb,'po_allocations',goods,'new_receipts',totals,'invoice_lines',totals));
  grv:=(posted->>'grv_id')::bigint;
 else
  insert into stock_v2.accounting_grv(owner_id,supplier_name,invoice_number,invoice_date,status) values(h.owner_id,h.supplier_name,rec.payload->>'invoice_number',(rec.payload->>'invoice_date')::date,'matched') returning id into grv;
  posted:=jsonb_build_object('grv_id',grv);
 end if;
 insert into stock_v2.accounting_grv_line(grv_id,job_order_line_id,invoice_quantity,invoice_unit_price)
 select grv,dl.order_line_id,dl.quantity,dl.unit_price from stock_v2.job_delivery_line dl where dl.receipt_id=rec.id;
 if not exists(select from stock_v2.order_line where order_id=h.order_id and ordered_quantity>received_quantity) then update stock_v2.order_header set status='closed' where order_id=h.order_id;end if;
 update stock_v2.receipt_verification set status='posted',decided_by=actor,decided_at=now(),posting_result=posted where id=rec.id;
 return posted;
end $$;


CREATE OR REPLACE FUNCTION stock_v2.check_po_job_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  job uuid;
  invalid_name text;
begin
  if tg_op='UPDATE' and old.payload->>'job_requirements'='true' then
    if old.status='applied' and new.payload is distinct from old.payload then raise exception 'An authorised Job Card PO is locked';end if;
    if new.payload is distinct from old.payload and coalesce(current_setting('jspl.job_po_command',true),'')<>'authorise' then raise exception 'Review Job Card requirements to change the order';end if;
  end if;
  if new.payload->>'job_requirements'='true' then
    if (tg_op='UPDATE' and old.payload->>'job_requirements' is distinct from 'true') or (tg_op='INSERT' and coalesce(current_setting('jspl.job_po_command',true),'')<>'submit') or
     (tg_op='UPDATE' and new.status in ('approved','applied') and old.status is distinct from new.status and coalesce(current_setting('jspl.job_po_command',true),'')<>'authorise')
     then raise exception 'Use the Job Card requirements approval';end if;
    return new;
  end if;
  if new.kind='po' and new.payload->>'source_job_card_id' is not null and new.status in ('draft','pending','approved') and exists(
    select from stock_v2.job_order_allocation a join stock_v2.approval_document d on d.id=a.document_id join stock_v2.job_card_part p on p.id=a.part_id join stock_v2.item i using(item_id),
     jsonb_array_elements(new.payload->'lines') z where p.job_id::text=new.payload->>'source_job_card_id' and z->>'item_code'=i.item_code and d.status in ('pending','approved','draft','applied'))
     then raise exception 'Use Job Card Requirements for this part';end if;
  if new.kind<>'po' or new.status in ('cancelled','rejected') then return new; end if;
  job:=nullif(new.payload->>'source_job_card_id','')::uuid;
  if tg_op='UPDATE' then
    if job is distinct from nullif(old.payload->>'source_job_card_id','')::uuid then
      raise exception 'A purchase order cannot change its source Job Card';
    end if;
  end if;
  if job is not null and not exists(select from stock_v2.job_card j where j.id=job) then
    raise exception 'Select a valid Job Card';
  end if;
  select coalesce(i.item_name,l->>'item_code','Unknown product') into invalid_name
  from jsonb_array_elements(new.payload->'lines') with ordinality x(l,n)
  left join stock_v2.item i on i.item_code=l->>'item_code'
  where case when job is null then stock_v2.po_without_job_card(i) is not true
    else not exists(
      select from stock_v2.job_card_part p left join stock_v2.owner o using(owner_id)
      where p.job_id=job and p.item_id=i.item_id and not i.buying_direct_expense
        and (p.owner_id is null or o.owner_code='TEST_'||(new.payload->>'owner_code'))
    ) end
  order by n limit 1;
  if found then
    if job is null then raise exception '% requires a Job Card. Start its purchase order from the Job Card.',invalid_name; end if;
    raise exception '% must match a line on the selected Job Card for this stock owner.',invalid_name;
  end if;
  return new;
end;
$function$
;
create or replace view cash_book.verified_invoice_balance with(security_invoker=true) as
 SELECT g.id,
    g.invoice_number,
    g.invoice_date,
    g.supplier_name,
    gross.amount AS invoice_amount,
    replace(owner.owner_code, 'TEST_'::text, ''::text) AS owner_code,
    linked.credit_id AS linked_credit_id,
    COALESCE(credit.amount, 0::numeric) AS credited,
    COALESCE(paid.amount, 0::numeric) + COALESCE(trip_paid.amount, 0::numeric) AS paid,
    COALESCE(draft.amount, 0::numeric) AS drafted,
    gross.amount - COALESCE(paid.amount, 0::numeric) - COALESCE(draft.amount, 0::numeric) - COALESCE(trip_paid.amount, 0::numeric) - COALESCE(credit.amount, 0::numeric) AS available,
    COALESCE(paid.currency, draft.currency, trip_paid.currency, credit.currency) AS payment_currency,
    receipt.town_trip_id
   FROM stock_v2.accounting_grv g
     JOIN stock_v2.owner owner USING (owner_id)
     LEFT JOIN stock_v2.grv_credit_link linked ON linked.grv_id = g.id
     JOIN LATERAL ( SELECT r.town_trip_id
           FROM stock_v2.receipt_verification r
          WHERE r.status = 'posted'::text AND r.receipt_action in ('combined_grv','job_delivery') AND (r.posting_result ->> 'grv_id'::text) = g.id::text
         LIMIT 1) receipt ON true
     JOIN LATERAL ( SELECT round(sum(l.invoice_quantity * l.invoice_unit_price), 2) AS amount
           FROM stock_v2.accounting_grv_line l
          WHERE l.grv_id = g.id) gross ON gross.amount > 0::numeric
     LEFT JOIN LATERAL ( SELECT sum(e.amount) AS amount,
            min(e.currency) AS currency
           FROM cash_book.supplier_payment p
             JOIN cash_book.entry e ON e.id = p.entry_id
          WHERE p.grv_id = g.id AND e.status = 'confirmed'::text AND NOT (EXISTS ( SELECT 1
                   FROM cash_book.entry r
                  WHERE r.reversal_of = e.id))) paid ON true
     LEFT JOIN LATERAL ( SELECT sum(e.amount) AS amount,
            min(e.currency) AS currency
           FROM cash_book.supplier_payment p
             JOIN cash_book.entry e ON e.id = p.entry_id
          WHERE p.grv_id = g.id AND e.status = 'draft'::text) draft ON true
     LEFT JOIN LATERAL ( SELECT sum(p.amount) AS amount,
            min(e.currency) AS currency
           FROM cash_book.trip_invoice_payment p
             JOIN cash_book.entry e ON e.id = p.advance_id
          WHERE p.grv_id = g.id) trip_paid ON true
     LEFT JOIN LATERAL ( SELECT sum(a.amount) AS amount,
            min(a.currency) AS currency
           FROM cash_book.supplier_credit_application a
          WHERE a.grv_id = g.id) credit ON true
  WHERE g.status = 'matched'::text;

-- Keep submitted invoices and unreceived allocations traceable when Admin cancels a balance.
create function stock_v2.guard_job_allocation() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from stock_v2.job_order_allocation a join stock_v2.approval_document d on d.id=a.document_id
  left join stock_v2.order_line l using(order_line_id) where a.part_id=new.part_id and
   (d.status in ('draft','pending','approved') or (d.status='applied' and l.ordered_quantity>l.received_quantity))) then raise exception 'Resolve the outstanding Job Card PO first';end if;
 return new;
end $$;
create trigger guard_job_allocation before insert on stock_v2.job_part_cancellation for each row execute function stock_v2.guard_job_allocation();
create function stock_v2.guard_ordered_job_expense() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from stock_v2.job_order_allocation a join stock_v2.approval_document d on d.id=a.document_id left join stock_v2.order_line l using(order_line_id) where a.part_id=new.part_id and (d.status in ('pending','approved','applied','draft') or l.received_quantity>0))
  then raise exception 'Pay this Job Card purchase through its verified supplier invoice';end if;
 return new;
end $$;
create trigger guard_ordered_job_expense before insert or update of part_id on cash_book.job_expense for each row execute function stock_v2.guard_ordered_job_expense();
revoke all on function stock_v2.guard_job_allocation(),stock_v2.guard_ordered_job_expense() from public,anon,authenticated;
revoke all on stock_v2.job_requirements from public,anon,authenticated;
revoke all on function stock_v2.save_supplier_line(uuid,uuid,jsonb),stock_v2.job_requirements_command(uuid,text,jsonb),stock_v2.job_delivery_command(uuid,text,jsonb) from public,anon,authenticated;
