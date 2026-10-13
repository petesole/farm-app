-- Optional free-text description for an individual fuel budget activity.
-- Examples: Pre Land Prep, Planting, Fert Fert.
alter table public.fuel_budget_activity
  add column if not exists description text;
