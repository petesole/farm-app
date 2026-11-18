-- Irrigation phone entry: records belong to authenticated Admin or Irrigator roles.
-- Preserve existing records and Admin correction policies.
drop policy if exists irrigation_applied_add on public.irrigation_applied;
create policy irrigation_applied_add on public.irrigation_applied
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (
      array_position((select public.my_farm_app_roles()), 'admin') is not null
      or (
        array_position((select public.my_farm_app_roles()), 'irrigation') is not null
        and (start_at at time zone 'Africa/Harare')::date between
          (now() at time zone 'Africa/Harare')::date - 9 and
          (now() at time zone 'Africa/Harare')::date
      )
    )
  );

drop policy if exists irrigation_pan_add on public.irrigation_pan;
create policy irrigation_pan_add on public.irrigation_pan
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (
      array_position((select public.my_farm_app_roles()), 'admin') is not null
      or (
        array_position((select public.my_farm_app_roles()), 'irrigation') is not null
        and irrigation_pan_date between
          (now() at time zone 'Africa/Harare')::date - 9 and
          (now() at time zone 'Africa/Harare')::date
      )
    )
  );

-- Pan changes affect evap and irrigation requirements. The cache must be
-- refreshed only after the reading has been committed to the base table.
create or replace function public.trg_refresh_irrigation_dashboard_after_pan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_irrigation_dashboard_cache();
  return null;
end
$$;

drop trigger if exists irrigation_pan_refresh_dashboard on public.irrigation_pan;
create trigger irrigation_pan_refresh_dashboard
after insert or update or delete on public.irrigation_pan
for each statement
execute function public.trg_refresh_irrigation_dashboard_after_pan();
