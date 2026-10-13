-- One-off admin clearance of historical planned jobs.
-- Register authorised auth.users IDs in fuel_plan_admin before use.
create table if not exists public.fuel_plan_admin (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.fuel_plan_admin enable row level security;
revoke all on public.fuel_plan_admin from anon, authenticated;

create table if not exists public.fuel_historical_completion (
  tracecode_id bigint not null,
  vehicle_job_id bigint not null,
  target_dap integer not null,
  sequence_no integer not null,
  completed_at timestamptz not null default now(),
  completed_by uuid not null default auth.uid(),
  primary key (tracecode_id, vehicle_job_id, target_dap, sequence_no)
);
alter table public.fuel_historical_completion enable row level security;
grant select, insert, delete on public.fuel_historical_completion to authenticated;
create policy "Admin can view historical completions"
  on public.fuel_historical_completion for select to authenticated
  using (exists (select 1 from public.fuel_plan_admin a where a.user_id=auth.uid()));
create policy "Admin can add historical completions"
  on public.fuel_historical_completion for insert to authenticated
  with check (completed_by=auth.uid() and exists (select 1 from public.fuel_plan_admin a where a.user_id=auth.uid()));
create policy "Admin can undo historical completions"
  on public.fuel_historical_completion for delete to authenticated
  using (exists (select 1 from public.fuel_plan_admin a where a.user_id=auth.uid()));
-- For the admin to read their own permissions, allow only membership self-lookup.
grant select on public.fuel_plan_admin to authenticated;
create policy "Users can see their own fuel admin membership"
  on public.fuel_plan_admin for select to authenticated
  using (user_id=auth.uid());
