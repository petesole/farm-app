-- JSPL Labour V2 | development-only schema preparation
-- Based on Access LabourT, LabourActivityT, LabourDepartmentT and reports.
-- Deliberately does NOT modify the pre-existing public.labour/public.labour_activity.
-- Roll out only after validating with sample transactions and role access.
BEGIN;

CREATE TABLE IF NOT EXISTS public.labour_v2_department (
  department_id bigint PRIMARY KEY,
  department_name text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.labour_v2_activity (
  activity_id bigint PRIMARY KEY,
  activity_name text NOT NULL,
  labour_measure text NOT NULL CHECK (labour_measure IN ('Kgs','Unit')),
  labour_change boolean,
  labour_service boolean,
  labour_crop_id bigint,
  labour_budget_value numeric,
  department_id bigint REFERENCES public.labour_v2_department(department_id),
  not_ao boolean,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.labour_v2_transaction (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  labour_date date NOT NULL,
  tracecode_id bigint REFERENCES public.tracecode(tracecode_id),
  activity_id bigint NOT NULL REFERENCES public.labour_v2_activity(activity_id),
  labour_qty numeric NOT NULL DEFAULT 0 CHECK (labour_qty >= 0),
  kgs numeric CHECK (kgs IS NULL OR kgs >= 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  crop_id bigint,
  access_labour_id bigint UNIQUE,
  access_labour_date_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  CONSTRAINT labour_v2_quantity_valid CHECK (labour_qty > 0 OR coalesce(kgs,0) > 0)
);
CREATE INDEX IF NOT EXISTS labour_v2_transaction_date_idx
  ON public.labour_v2_transaction (labour_date DESC, tracecode_id);
CREATE INDEX IF NOT EXISTS labour_v2_transaction_activity_idx
  ON public.labour_v2_transaction (activity_id);

-- Capture one transaction per date; the Access LabourDateT table is not reproduced.
-- Preserve original Access identifiers for import reconciliation.
CREATE OR REPLACE VIEW public.labour_v2_costs
WITH (security_invoker = true) AS
SELECT t.id, t.labour_date, t.tracecode_id, t.activity_id,
  a.activity_name, a.labour_measure, a.not_ao,
  t.labour_qty, t.kgs, t.unit_cost,
  CASE WHEN a.labour_measure = 'Kgs'
    THEN coalesce(t.kgs,0) * t.unit_cost
    ELSE t.labour_qty * t.unit_cost END AS total_cost,
  CASE WHEN a.labour_measure = 'Kgs' AND t.labour_qty > 0
    THEN t.kgs / t.labour_qty ELSE NULL END AS kgs_per_person,
  tc.tracecode_size,
  CASE WHEN tc.tracecode_size > 0
    THEN (CASE WHEN a.labour_measure = 'Kgs'
      THEN coalesce(t.kgs,0) * t.unit_cost
      ELSE t.labour_qty * t.unit_cost END) / tc.tracecode_size
    ELSE NULL END AS cost_per_ha,
  t.crop_id, t.access_labour_id
FROM public.labour_v2_transaction t
JOIN public.labour_v2_activity a ON a.activity_id = t.activity_id
LEFT JOIN public.tracecode tc ON tc.tracecode_id = t.tracecode_id;

-- All three new tables require signed-in users with an assigned app role;
-- no anonymous access, and writes limited to farm managers/admin.
ALTER TABLE public.labour_v2_department ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour_v2_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour_v2_transaction ENABLE ROW LEVEL SECURITY;

CREATE POLICY labour_v2_department_read ON public.labour_v2_department
  FOR SELECT TO authenticated
  USING (cardinality((SELECT public.my_farm_app_roles())) > 0);
CREATE POLICY labour_v2_activity_read ON public.labour_v2_activity
  FOR SELECT TO authenticated
  USING (cardinality((SELECT public.my_farm_app_roles())) > 0);
CREATE POLICY labour_v2_transaction_read ON public.labour_v2_transaction
  FOR SELECT TO authenticated
  USING (cardinality((SELECT public.my_farm_app_roles())) > 0);
CREATE POLICY labour_v2_transaction_insert ON public.labour_v2_transaction
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.my_farm_app_roles()) && ARRAY['admin','manager','labour']::text[]);
CREATE POLICY labour_v2_transaction_update ON public.labour_v2_transaction
  FOR UPDATE TO authenticated
  USING ((SELECT public.my_farm_app_roles()) && ARRAY['admin','manager']::text[])
  WITH CHECK ((SELECT public.my_farm_app_roles()) && ARRAY['admin','manager']::text[]);

-- Explicit grants for REST API. RLS above controls rows.
GRANT SELECT ON public.labour_v2_department, public.labour_v2_activity, public.labour_v2_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.labour_v2_transaction TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.labour_v2_transaction_id_seq TO authenticated;
COMMIT;
