create or replace function stock_v2.po_without_job_card(i stock_v2.item) returns boolean
language sql stable security invoker set search_path='' as $$
  select i.active and not i.buying_direct_expense and case i.input_type
    when 'Fertilizer' then true
    when 'Chemical' then true
    when 'Seed' then true
    when 'Welfare' then true
    when 'Lubricants' then exists(select from stock_v2.job_lubricant_inputs l where l.item_id=i.item_id)
    when 'Fuel' then stock_v2.equipment_issue_kind(i.item_id) is not distinct from 'PETROL'
    else false end;
$$;
