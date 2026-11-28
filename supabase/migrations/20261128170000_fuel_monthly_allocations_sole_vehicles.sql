-- Report fuel for Vehicle IDs 44 and 71 as Mr & Mrs Sole, separately from General.
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

/* Vehicle 50: litres from fuel_issue, label = notes */
veh50 AS (
  SELECT
    coalesce(nullif(trim(fi.notes), ''), 'Fuel') AS bucket,
    sum(fi.fuel_issued)::numeric AS liters
  FROM public.fuel_issue fi
  JOIN bounds b
    ON fi.fuel_issue_date >= b.d1
   AND fi.fuel_issue_date <  b.d2
  WHERE fi.vehicle_id = 50
  GROUP BY 1
),

/* Mr & Mrs Sole's vehicles are reported separately from General and crop allocations. */
sole_vehicles AS (
  SELECT
    'Mr & Mrs Sole'::text AS bucket,
    sum(fi.fuel_issued)::numeric AS liters
  FROM public.fuel_issue fi
  JOIN bounds b
    ON fi.fuel_issue_date >= b.d1
   AND fi.fuel_issue_date <  b.d2
  WHERE fi.vehicle_id IN (44, 71)
  GROUP BY 1
),

/* Assignment 2: always General from fuel_issue (full litres, no allocations required) */
assign2_general AS (
  SELECT
    'General'::text AS bucket,
    sum(fi.fuel_issued)::numeric AS liters
  FROM public.fuel_issue fi
  JOIN public.vehicle v ON v.vehicle_id = fi.vehicle_id
  JOIN bounds b
    ON fi.fuel_issue_date >= b.d1
   AND fi.fuel_issue_date <  b.d2
  WHERE v.vehicle_assignment_id = 2
    AND fi.vehicle_id <> 50
    AND fi.vehicle_id NOT IN (44, 71)
  GROUP BY 1
),

/* Assignment 4: if issue has no allocations, report General (full fuel_issued) */
a4_no_alloc_general AS (
  SELECT
    'General'::text AS bucket,
    sum(fi.fuel_issued)::numeric AS liters
  FROM public.fuel_issue fi
  JOIN public.vehicle v ON v.vehicle_id = fi.vehicle_id
  JOIN bounds b
    ON fi.fuel_issue_date >= b.d1
   AND fi.fuel_issue_date <  b.d2
  WHERE fi.vehicle_id <> 50
    AND fi.vehicle_id NOT IN (44, 71)
    AND v.vehicle_assignment_id = 4
    AND NOT EXISTS (
      SELECT 1
      FROM public.fuel_allocation fa
      WHERE fa.fuel_issue_id = fi.fuel_issue_id
    )
),

/* Normal allocations: AO traces report separately; all others remain grouped by crop. */
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
  JOIN bounds b
    ON fi.fuel_issue_date >= b.d1
   AND fi.fuel_issue_date <  b.d2
  WHERE fi.vehicle_id <> 50
    AND fi.vehicle_id NOT IN (44, 71)
    AND v.vehicle_assignment_id <> 2
  GROUP BY 1
),

/* Generator litres per usage: hours_used * vehicle consumption */
gen_usage AS (
  SELECT
    fgu.fuel_gen_usage_id,
    (fgu.hours_used::numeric) * (v.consumption::numeric) AS gen_liters
  FROM public.fuel_gen_usage fgu
  JOIN public.vehicle v ON v.vehicle_id = fgu.vehicle_id
  JOIN bounds b
    ON fgu.generator_date::date >= b.d1
   AND fgu.generator_date::date <  b.d2
  WHERE v.vehicle_assignment_id = 3
),

gen_rows AS (
  SELECT
    gu.fuel_gen_usage_id,
    gu.gen_liters,
    fga.tracecode_id,
    coalesce(tc.tracecode_size, 0)::numeric AS tracecode_size,
    CASE
      WHEN public.fuel_trace_is_agri_orange(fga.tracecode_id) THEN 'Agri Orange'
      WHEN tc.crop_id = 19 THEN 'General'
      ELSE coalesce(c.crop_name, 'General')
    END AS bucket
  FROM gen_usage gu
  JOIN public.fuel_gen_allocation fga
    ON fga.fuel_gen_usage_id = gu.fuel_gen_usage_id
  LEFT JOIN public.tracecode tc ON tc.tracecode_id = fga.tracecode_id
  LEFT JOIN public.crop c ON c.crop_id = tc.crop_id
),

gen_totals AS (
  SELECT fuel_gen_usage_id, sum(tracecode_size)::numeric AS total_size
  FROM gen_rows
  GROUP BY fuel_gen_usage_id
),

gen_scaled AS (
  SELECT
    gr.bucket,
    sum(
      CASE
        WHEN gt.total_size > 0
          THEN gr.gen_liters * (gr.tracecode_size / gt.total_size)
        ELSE 0
      END
    )::numeric AS liters
  FROM gen_rows gr
  JOIN gen_totals gt ON gt.fuel_gen_usage_id = gr.fuel_gen_usage_id
  GROUP BY gr.bucket
)

SELECT bucket, sum(liters)::numeric AS total_liters
FROM (
  SELECT * FROM veh50
  UNION ALL
  SELECT * FROM sole_vehicles
  UNION ALL
  SELECT * FROM assign2_general
  UNION ALL
  SELECT * FROM a4_no_alloc_general
  UNION ALL
  SELECT * FROM normal_alloc
  UNION ALL
  SELECT * FROM gen_scaled
) x
GROUP BY bucket
ORDER BY total_liters DESC;
$function$;
