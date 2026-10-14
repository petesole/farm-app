-- Persist the jobs deliberately chosen for each weekly fuel issue plan.
-- Budget activities remain unchanged; selection is specific to a calendar week.
CREATE TABLE IF NOT EXISTS public.fuel_weekly_selected_job (
  week_start date NOT NULL,
  tracecode_id bigint NOT NULL,
  vehicle_job_id bigint NOT NULL,
  target_dap integer NOT NULL,
  sequence_no integer NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  selected_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (week_start,tracecode_id,vehicle_job_id,target_dap,sequence_no)
);

ALTER TABLE public.fuel_weekly_selected_job ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_weekly_selected_job_admin_select ON public.fuel_weekly_selected_job;
DROP POLICY IF EXISTS fuel_weekly_selected_job_admin_insert ON public.fuel_weekly_selected_job;
DROP POLICY IF EXISTS fuel_weekly_selected_job_admin_delete ON public.fuel_weekly_selected_job;
CREATE POLICY fuel_weekly_selected_job_admin_select ON public.fuel_weekly_selected_job
 FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.fuel_plan_admin WHERE user_id=auth.uid())
 );
CREATE POLICY fuel_weekly_selected_job_admin_insert ON public.fuel_weekly_selected_job
 FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.fuel_plan_admin WHERE user_id=auth.uid())
 );
CREATE POLICY fuel_weekly_selected_job_admin_delete ON public.fuel_weekly_selected_job
 FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.fuel_plan_admin WHERE user_id=auth.uid())
 );
GRANT SELECT,INSERT,DELETE ON public.fuel_weekly_selected_job TO authenticated;
NOTIFY pgrst, 'reload schema';
