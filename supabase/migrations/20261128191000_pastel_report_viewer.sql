-- Allow the Pastel role to classify AO traces in the monthly fuel report.
CREATE OR REPLACE FUNCTION public.fuel_trace_is_agri_orange(p_tracecode_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_roles text[];
BEGIN
  v_roles := public.my_farm_app_roles();

  IF COALESCE(
    NOT (v_roles && ARRAY['admin', 'manager', 'fuel', 'pastel']::text[]),
    true
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.labour_v2_trace_map AS m
    WHERE m.supabase_tracecode_id = p_tracecode_id
      AND m.access_ao IS TRUE
  );
END;
$function$;

-- A Pastel-only account can read the Fuel reports and their underlying issue,
-- allocation, vehicle, and job details. Keep unrelated fuel inputs/reference
-- tables out of direct access while retaining existing access for every other
-- role combination.
DROP POLICY IF EXISTS fuel_dip_role_read ON public.fuel_dip;
CREATE POLICY fuel_dip_role_read ON public.fuel_dip
FOR SELECT TO authenticated
USING (
  cardinality(public.my_farm_app_roles()) > 0
  AND (
    NOT (public.my_farm_app_roles() @> ARRAY['pastel']::text[])
    OR cardinality(public.my_farm_app_roles()) > 1
  )
);

DROP POLICY IF EXISTS fuel_received_role_read ON public.fuel_received;
CREATE POLICY fuel_received_role_read ON public.fuel_received
FOR SELECT TO authenticated
USING (
  cardinality(public.my_farm_app_roles()) > 0
  AND (
    NOT (public.my_farm_app_roles() @> ARRAY['pastel']::text[])
    OR cardinality(public.my_farm_app_roles()) > 1
  )
);

DROP POLICY IF EXISTS supplier_role_read ON public.supplier;
CREATE POLICY supplier_role_read ON public.supplier
FOR SELECT TO authenticated
USING (
  cardinality(public.my_farm_app_roles()) > 0
  AND (
    NOT (public.my_farm_app_roles() @> ARRAY['pastel']::text[])
    OR cardinality(public.my_farm_app_roles()) > 1
  )
);

DROP POLICY IF EXISTS vehicle_type_role_read ON public.vehicle_type;
CREATE POLICY vehicle_type_role_read ON public.vehicle_type
FOR SELECT TO authenticated
USING (
  cardinality(public.my_farm_app_roles()) > 0
  AND (
    NOT (public.my_farm_app_roles() @> ARRAY['pastel']::text[])
    OR cardinality(public.my_farm_app_roles()) > 1
  )
);
