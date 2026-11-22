-- Stock saves register products in product_metadata; imported inputs retain their source IDs.
create view stock_v2.job_lubricant_inputs with (security_invoker=true) as
select i.item_id,i.item_code from stock_v2.item i
where i.active and i.input_type='Lubricants' and not i.buying_direct_expense
  and (i.access_input_id is not null or i.existing_input_id is not null
    or exists(select from stock_v2.product_metadata m where m.item_id=i.item_id));
revoke all on stock_v2.job_lubricant_inputs from public,anon,authenticated;

-- Older cards may use the Oils category. New cards use the canonical Lubricants category.
create function stock_v2.is_job_lubricant_category(p_name text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select lower(btrim(p_name)) in ('lubricants','lubricant','oils','oil','grease','greases')
$$;
create function stock_v2.require_job_lubricant_input() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and row(new.job_id,new.item_id,new.category_id) is not distinct from
    row(old.job_id,old.item_id,old.category_id) then return new; end if;
  if (exists(select from stock_v2.buying_category c where c.category_id=new.category_id and stock_v2.is_job_lubricant_category(c.category_name))
      or exists(select from stock_v2.item i where i.item_id=new.item_id and i.input_type='Lubricants'))
    and not exists(select from stock_v2.job_lubricant_inputs i where i.item_id=new.item_id)
    then raise exception 'Choose an active lubricant Stock Input. Add missing products in Stock Balances first.'; end if;
  return new;
end $$;
create trigger check_job_lubricant_input before insert or update of job_id,item_id,category_id on stock_v2.job_card_part
for each row execute function stock_v2.require_job_lubricant_input();
revoke all on function stock_v2.is_job_lubricant_category(text), stock_v2.require_job_lubricant_input() from public,anon,authenticated;
