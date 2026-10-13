-- Clone a fuel budget and its activities atomically.
-- Run in Supabase SQL Editor before using Copy Budget.
create or replace function public.copy_fuel_budget(p_source_id bigint, p_new_name text)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id bigint;
  clean_name text := nullif(btrim(p_new_name), '');
begin
  if clean_name is null then
    raise exception 'A new budget name is required';
  end if;
  if not exists(select 1 from public.fuel_budget where fuel_budget_id = p_source_id) then
    raise exception 'Source fuel budget not found';
  end if;
  insert into public.fuel_budget (fuel_budget_name,crop_id,active,notes)
  select clean_name,crop_id,false,notes
  from public.fuel_budget where fuel_budget_id=p_source_id
  returning fuel_budget_id into new_id;

  insert into public.fuel_budget_activity (
    fuel_budget_id,vehicle_job_id,tractor_class_id,target_dap,sequence_no,
    planned_operations,include_trip_fuel,notes,budget_qty,
    load_capacity_tonnes,input_tonnes_per_ha,hectares_per_trip,
    people_per_ha,people_per_load,area_fraction,description
  )
  select new_id,vehicle_job_id,tractor_class_id,target_dap,sequence_no,
    planned_operations,include_trip_fuel,notes,budget_qty,
    load_capacity_tonnes,input_tonnes_per_ha,hectares_per_trip,
    people_per_ha,people_per_load,area_fraction,description
  from public.fuel_budget_activity
  where fuel_budget_id=p_source_id;
  return new_id;
end $$;
grant execute on function public.copy_fuel_budget(bigint,text) to authenticated;
