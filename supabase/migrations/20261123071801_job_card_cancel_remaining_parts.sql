-- Cancelling unneeded parts records the original request and leaves stock movements intact.
create table stock_v2.job_part_cancellation (
  part_id bigint primary key references stock_v2.job_card_part(id),
  quantity numeric not null check (quantity > 0),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  cancelled_by uuid not null references auth.users(id),
  cancelled_at timestamptz not null default now()
);
alter table stock_v2.job_part_cancellation enable row level security;
revoke all on stock_v2.job_part_cancellation from public, anon, authenticated;

create function stock_v2.cancel_job_part_balance(p_actor uuid,p_part bigint,p_expected numeric,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  part record;
  remaining numeric;
begin
  if not coalesce(stock_v2.can_buy(p_actor),false) then raise exception 'Buyer or Admin access required'; end if;
  if nullif(btrim(p_reason),'') is null or length(btrim(p_reason))>500 then raise exception 'Enter a cancellation reason of up to 500 characters.'; end if;
  perform pg_advisory_xact_lock(hashtext('stock_v2_inventory_posting'));
  select p.*,i.item_code,i.buying_direct_expense,j.closed_at into strict part from stock_v2.job_card_part p
    join stock_v2.job_card j on j.id=p.job_id join stock_v2.item i using(item_id) where p.id=p_part for update of p,j;
  if part.closed_at is not null or part.buying_direct_expense then raise exception 'Select a stock part on an open Job Card.'; end if;
  if exists(select from stock_v2.job_part_cancellation where part_id=p_part) then raise exception 'This part balance has already been cancelled.'; end if;
  if exists(select from stock_v2.job_part_reserved where part_id=p_part and quantity>0) then raise exception 'Release the reserved stock before cancelling the balance.'; end if;
  if exists(select from stock_v2.approval_document d where d.kind='po' and d.payload->>'source_job_card_id'=part.job_id::text
    and ((d.status in ('draft','pending','approved') and exists(select from jsonb_array_elements(d.payload->'lines') l where l->>'item_code'=part.item_code))
      or (d.status='applied' and exists(select from stock_v2.order_line l join stock_v2.order_header h using(order_id)
          where l.order_id=d.target_order_id and l.item_id=part.item_id and h.status='approved' and l.ordered_quantity>l.received_quantity)))) then
    raise exception 'Complete or cancel the outstanding purchase order for this part first.';
  end if;
  remaining:=part.requested_quantity-coalesce((select issued_quantity from stock_v2.job_part_usage where part_id=p_part),0);
  if remaining<=0 or remaining is distinct from p_expected then raise exception 'The balance changed. Refresh the Job Card before cancelling.'; end if;
  insert into stock_v2.job_part_cancellation(part_id,quantity,reason,cancelled_by) values(p_part,remaining,btrim(p_reason),p_actor);
  return jsonb_build_object('part_id',p_part,'cancelled_quantity',remaining);
end $$;

create function stock_v2.protect_cancelled_job_part() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select from stock_v2.job_part_cancellation where part_id=new.part_id) then
    raise exception 'The remaining Job Card quantity has been cancelled.';
  end if;
  return new;
end $$;
create trigger protect_cancelled_job_reservation before insert on stock_v2.job_part_reservation_event
  for each row when (new.quantity_delta>0) execute function stock_v2.protect_cancelled_job_part();

create function stock_v2.prevent_cancelled_job_order() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select from stock_v2.job_card_part p join stock_v2.job_part_cancellation c on c.part_id=p.id
    join stock_v2.item i using(item_id) where p.job_id::text=new.payload->>'source_job_card_id'
    and exists(select from jsonb_array_elements(new.payload->'lines') line where line->>'item_code'=i.item_code)) then
    raise exception 'Remove the cancelled Job Card part from this purchase order.';
  end if;
  return new;
end $$;
create trigger prevent_cancelled_job_order before insert or update of payload,status on stock_v2.approval_document
  for each row when(new.kind='po' and new.status in ('draft','pending','approved') and new.payload->>'source_job_card_id' is not null)
  execute function stock_v2.prevent_cancelled_job_order();

create function stock_v2.keep_cancelled_job_request() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if exists(select from stock_v2.job_part_cancellation where part_id=old.id) then
    raise exception 'Keep the original request for a cancelled part.';
  end if;
  return new;
end $$;
create trigger keep_cancelled_job_request before update of requested_quantity,item_id,job_id,category_id on stock_v2.job_card_part
  for each row when ((old.requested_quantity,old.item_id,old.job_id,old.category_id) is distinct from
    (new.requested_quantity,new.item_id,new.job_id,new.category_id)) execute function stock_v2.keep_cancelled_job_request();

revoke all on function stock_v2.cancel_job_part_balance(uuid,bigint,numeric,text),stock_v2.protect_cancelled_job_part(),
  stock_v2.prevent_cancelled_job_order(),stock_v2.keep_cancelled_job_request() from public, anon, authenticated;
