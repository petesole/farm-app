-- Review on an isolated project before applying to FarmingMain.
BEGIN;
ALTER TABLE public.rainfall ENABLE ROW LEVEL SECURITY;
CREATE POLICY rainfall_read ON public.rainfall FOR SELECT TO authenticated USING (true);
CREATE POLICY rainfall_insert ON public.rainfall FOR INSERT TO authenticated WITH CHECK (
  'admin' = ANY ((SELECT public.my_farm_app_roles())::text[]) OR (
    'rainfall' = ANY ((SELECT public.my_farm_app_roles())::text[])
    AND created_by = (SELECT auth.uid())
    AND rainfall_received IS NOT NULL AND rainfall_received >= 0
    AND rainfall_received::text NOT IN ('NaN','Infinity','-Infinity')
    AND rainfall_date BETWEEN (now() AT TIME ZONE 'Africa/Harare')::date - 10 AND (now() AT TIME ZONE 'Africa/Harare')::date
    AND EXISTS (
      SELECT 1 FROM public.rain_gauge g WHERE g.rain_gauge_id = rainfall.rain_gauge_id
      AND (g.active_from IS NULL OR g.active_from <= rainfall.rainfall_date)
      AND CASE WHEN g.active_to IS NOT NULL THEN rainfall.rainfall_date <= g.active_to ELSE g.active IS DISTINCT FROM false END
    )
  )
);
CREATE POLICY rainfall_admin_update ON public.rainfall FOR UPDATE TO authenticated
USING ('admin' = ANY ((SELECT public.my_farm_app_roles())::text[]))
WITH CHECK ('admin' = ANY ((SELECT public.my_farm_app_roles())::text[]));
ALTER TABLE public.rain_gauge ENABLE ROW LEVEL SECURITY;
CREATE POLICY rainfall_gauges_read ON public.rain_gauge FOR SELECT TO authenticated USING (true);
CREATE POLICY rainfall_gauges_admin_insert ON public.rain_gauge FOR INSERT TO authenticated
WITH CHECK ('admin' = ANY ((SELECT public.my_farm_app_roles())::text[]));
CREATE POLICY rainfall_gauges_admin_update ON public.rain_gauge FOR UPDATE TO authenticated
USING ('admin' = ANY ((SELECT public.my_farm_app_roles())::text[]))
WITH CHECK ('admin' = ANY ((SELECT public.my_farm_app_roles())::text[]));
COMMIT;
