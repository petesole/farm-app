-- Use the same catalogue rule in the purchase picker and the order lifecycle.
create function stock_v2.po_without_job_card(i stock_v2.item) returns boolean
language sql stable security invoker set search_path='' as $$
  select i.active and not i.buying_direct_expense and case i.input_type
    when 'Fertilizer' then true
    when 'Chemical' then true
    when 'Seed' then true
    when 'Lubricants' then exists(select from stock_v2.job_lubricant_inputs l where l.item_id=i.item_id)
    when 'Fuel' then stock_v2.equipment_issue_kind(i.item_id) is not distinct from 'PETROL'
    else false end;
$$;

create function stock_v2.check_po_job_source() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  job uuid;
  invalid_name text;
begin
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
$$;
revoke all on function stock_v2.po_without_job_card(stock_v2.item),stock_v2.check_po_job_source() from public,anon,authenticated;
create trigger check_po_job_source before insert or update of payload,status on stock_v2.approval_document
  for each row execute function stock_v2.check_po_job_source();
