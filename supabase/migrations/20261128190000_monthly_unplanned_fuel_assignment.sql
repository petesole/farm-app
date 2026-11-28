-- Assign individual unplanned fuel issues from the monthly report.
-- Allocation is recorded as one TRIP row and the report moves those litres
-- from the unplanned trip to the selected crop/category in the same transaction.

CREATE OR REPLACE FUNCTION public.get_monthly_fuel_allocations(p_month date)
RETURNS TABLE(bucket text, total_liters numeric)
LANGUAGE sql
STABLE
AS $function$
WITH bounds AS (
  SELECT
    date_trunc('month', p_month)::date AS d1,
    (date_trunc('month', p_month) + interval '1 month')::date AS d2
),
sole_vehicles AS (
  SELECT 'Mr & Mrs Sole'::text AS bucket, sum(fi.fuel_issued)::numeric AS liters
  FROM public.fuel_issue fi
  JOIN bounds b ON fi.fuel_issue_date >= b.d1 AND fi.fuel_issue_date < b.d2
  WHERE fi.vehicle_id IN (44, 71)
  GROUP BY 1
),
assign2_general AS (
  SELECT 'General'::text AS bucket, sum(fi.fuel_issued)::numeric AS liters
  FROM public.fuel_issue fi
  JOIN public.vehicle v ON v.vehicle_id = fi.vehicle_id
  JOIN bounds b ON fi.fuel_issue_date >= b.d1 AND fi.fuel_issue_date < b.d2
  WHERE v.vehicle_assignment_id = 2
    AND fi.vehicle_id <> 50
    AND fi.vehicle_id NOT IN (44, 71)
  GROUP BY 1
),
a4_no_alloc_general AS (
  SELECT 'General'::text AS bucket, sum(fi.fuel_issued)::numeric AS liters
  FROM public.fuel_issue fi
  JOIN public.vehicle v ON v.vehicle_id = fi.vehicle_id
  JOIN bounds b ON fi.fuel_issue_date >= b.d1 AND fi.fuel_issue_date < b.d2
  WHERE fi.vehicle_id <> 50
    AND fi.vehicle_id NOT IN (44, 71)
    AND v.vehicle_assignment_id = 4
    AND NOT EXISTS (
      SELECT 1 FROM public.fuel_allocation fa
      WHERE fa.fuel_issue_id = fi.fuel_issue_id
    )
),
normal_alloc AS (
  SELECT
    CASE
      WHEN public.fuel_trace_is_agri_orange(fa.tracecode_id) THEN 'Agri Orange'
      WHEN tc.crop_id = 19 THEN 'General'
      ELSE coalesce(c.crop_name, 'General')
    END AS bucket,
    sum(fa.fuel_allocated)::numeric AS liters
  FROM public.fuel_allocation fa
  JOIN public.fuel_issue fi ON fi.fuel_issue_id = fa.fuel_issue_id
  JOIN public.vehicle v ON v.vehicle_id = fi.vehicle_id
  LEFT JOIN public.tracecode tc ON tc.tracecode_id = fa.tracecode_id
  LEFT JOIN public.crop c ON c.crop_id = tc.crop_id
  JOIN bounds b ON fi.fuel_issue_date >= b.d1 AND fi.fuel_issue_date < b.d2
  WHERE fi.vehicle_id = 50
     OR (fi.vehicle_id NOT IN (44, 71) AND v.vehicle_assignment_id <> 2)
  GROUP BY 1
),
gen_usage AS (
  SELECT fgu.fuel_gen_usage_id,
         (fgu.hours_used::numeric) * (v.consumption::numeric) AS gen_liters
  FROM public.fuel_gen_usage fgu
  JOIN public.vehicle v ON v.vehicle_id = fgu.vehicle_id
  JOIN bounds b ON fgu.generator_date::date >= b.d1 AND fgu.generator_date::date < b.d2
  WHERE v.vehicle_assignment_id = 3
),
gen_rows AS (
  SELECT gu.fuel_gen_usage_id, gu.gen_liters, fga.tracecode_id,
         coalesce(tc.tracecode_size, 0)::numeric AS tracecode_size,
         CASE
           WHEN public.fuel_trace_is_agri_orange(fga.tracecode_id) THEN 'Agri Orange'
           WHEN tc.crop_id = 19 THEN 'General'
           ELSE coalesce(c.crop_name, 'General')
         END AS bucket
  FROM gen_usage gu
  JOIN public.fuel_gen_allocation fga ON fga.fuel_gen_usage_id = gu.fuel_gen_usage_id
  LEFT JOIN public.tracecode tc ON tc.tracecode_id = fga.tracecode_id
  LEFT JOIN public.crop c ON c.crop_id = tc.crop_id
),
gen_totals AS (
  SELECT fuel_gen_usage_id, sum(tracecode_size)::numeric AS total_size
  FROM gen_rows
  GROUP BY fuel_gen_usage_id
),
gen_scaled AS (
  SELECT gr.bucket,
         sum(CASE WHEN gt.total_size > 0
                  THEN gr.gen_liters * (gr.tracecode_size / gt.total_size)
                  ELSE 0 END)::numeric AS liters
  FROM gen_rows gr
  JOIN gen_totals gt ON gt.fuel_gen_usage_id = gr.fuel_gen_usage_id
  GROUP BY gr.bucket
)
SELECT bucket, sum(liters)::numeric AS total_liters
FROM (
  SELECT * FROM sole_vehicles
  UNION ALL SELECT * FROM assign2_general
  UNION ALL SELECT * FROM a4_no_alloc_general
  UNION ALL SELECT * FROM normal_alloc
  UNION ALL SELECT * FROM gen_scaled
) x
GROUP BY bucket
ORDER BY
  CASE
    WHEN bucket = 'Agri Orange' THEN 1
    WHEN bucket = 'Mr & Mrs Sole' THEN 2
    ELSE 0
  END,
  lower(bucket);
$function$;

CREATE OR REPLACE FUNCTION public.get_monthly_unplanned_fuel_issues(p_month date)
RETURNS TABLE(
  fuel_issue_id bigint,
  fuel_issue_date date,
  vehicle_name text,
  notes text,
  fuel_issued numeric,
  fuel_allocated numeric,
  fuel_unallocated numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $function$
WITH bounds AS (
  SELECT date_trunc('month', p_month)::date AS d1,
         (date_trunc('month', p_month) + interval '1 month')::date AS d2
)
SELECT fi.fuel_issue_id,
       fi.fuel_issue_date,
       coalesce(v.vehicle_name, 'Other')::text AS vehicle_name,
       coalesce(nullif(trim(fi.notes), ''), 'Unplanned trip')::text AS notes,
       fi.fuel_issued::numeric,
       coalesce(sum(fa.fuel_allocated), 0)::numeric AS fuel_allocated,
       greatest(fi.fuel_issued - coalesce(sum(fa.fuel_allocated), 0), 0)::numeric AS fuel_unallocated
FROM public.fuel_issue fi
JOIN public.vehicle v ON v.vehicle_id = fi.vehicle_id
JOIN bounds b ON fi.fuel_issue_date >= b.d1 AND fi.fuel_issue_date < b.d2
LEFT JOIN public.fuel_allocation fa ON fa.fuel_issue_id = fi.fuel_issue_id
WHERE fi.vehicle_id = 50
GROUP BY fi.fuel_issue_id, fi.fuel_issue_date, v.vehicle_name, fi.notes, fi.fuel_issued
HAVING greatest(fi.fuel_issued - coalesce(sum(fa.fuel_allocated), 0), 0) > 0
ORDER BY fi.fuel_issue_date, fi.fuel_issue_id;
$function$;

REVOKE ALL ON FUNCTION public.get_monthly_unplanned_fuel_issues(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_monthly_unplanned_fuel_issues(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_unplanned_fuel_issue(
  p_fuel_issue_id bigint,
  p_tracecode_id bigint,
  p_vehicle_job_id bigint
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_issue public.fuel_issue%ROWTYPE;
  v_trace public.tracecode%ROWTYPE;
  v_job public.vehicle_job%ROWTYPE;
  v_allocated numeric;
  v_remaining numeric;
BEGIN
  IF NOT (public.my_farm_app_roles() @> ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'Only Admin can assign an unplanned fuel trip'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_issue
  FROM public.fuel_issue
  WHERE fuel_issue_id = p_fuel_issue_id
  FOR UPDATE;

  IF NOT FOUND OR v_issue.vehicle_id <> 50 THEN
    RAISE EXCEPTION 'Unplanned fuel trip was not found';
  END IF;

  SELECT * INTO v_trace
  FROM public.tracecode
  WHERE tracecode_id = p_tracecode_id;

  IF NOT FOUND OR v_trace.crop_id IS NULL
     OR v_trace.start_date IS NULL
     OR v_trace.start_date > v_issue.fuel_issue_date
     OR (v_trace.end_date IS NOT NULL AND v_trace.end_date < v_issue.fuel_issue_date) THEN
    RAISE EXCEPTION 'Choose a trace code that was active on the trip date';
  END IF;

  SELECT * INTO v_job
  FROM public.vehicle_job
  WHERE vehicle_job_id = p_vehicle_job_id
    AND discontinue IS NOT TRUE
    AND (crop_id IS NULL OR crop_id = v_trace.crop_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active vehicle job that matches the trace crop';
  END IF;

  SELECT coalesce(sum(fuel_allocated), 0) INTO v_allocated
  FROM public.fuel_allocation
  WHERE fuel_issue_id = p_fuel_issue_id;

  v_remaining := v_issue.fuel_issued - v_allocated;
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'This trip has already been fully assigned';
  END IF;

  INSERT INTO public.fuel_allocation(
    fuel_issue_id, tracecode_id, vehicle_job_id, fuel_allocated, allocation_kind
  )
  VALUES (
    p_fuel_issue_id, p_tracecode_id, p_vehicle_job_id, v_remaining, 'TRIP'
  );

  RETURN v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_assign_unplanned_fuel_issue(bigint, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_unplanned_fuel_issue(bigint, bigint, bigint) TO authenticated;
