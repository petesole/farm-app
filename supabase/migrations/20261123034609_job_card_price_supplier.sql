alter table stock_v2.job_card_part
  add column price_supplier_id bigint references stock_v2.supplier(supplier_id);
create index job_card_part_price_supplier_idx on stock_v2.job_card_part(price_supplier_id)
  where price_supplier_id is not null;

create function stock_v2.check_job_price_supplier() returns trigger
language plpgsql security invoker set search_path = '' as $function$
begin
  -- Keep historical prices readable and allow unrelated edits on older cards.
  if tg_op = 'UPDATE' then
    if new.item_id = old.item_id and new.unit_price is not distinct from old.unit_price
       and new.price_supplier_id is not distinct from old.price_supplier_id then
      return new;
    end if;
  end if;

  if new.unit_price is null then
    if new.price_supplier_id is not null then
      raise exception 'Clear the price supplier when clearing the unit price.' using errcode='23514';
    end if;
    return new;
  end if;

  if new.price_supplier_id is null then
    raise exception 'Choose a supplier for the Job Card item price.' using errcode='23514';
  end if;
  perform 1 from stock_v2.supplier where supplier_id = new.price_supplier_id and active for share;
  if not found then
    raise exception 'Choose an active supplier for the Job Card item price.' using errcode='23514';
  end if;
  return new;
end;
$function$;

revoke all on function stock_v2.check_job_price_supplier() from public, anon, authenticated;
create trigger check_job_price_supplier before insert or update of item_id,unit_price,price_supplier_id
  on stock_v2.job_card_part for each row execute function stock_v2.check_job_price_supplier();
