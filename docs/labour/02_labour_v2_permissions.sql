-- Applied to FarmingMain Supabase after creating Labour V2.
-- Revokes inherited anonymous privileges; permits only admin/manager/labour reads.
REVOKE ALL ON public.labour_v2_transaction,public.labour_v2_activity,public.labour_v2_department,public.labour_v2_costs FROM PUBLIC,anon;
REVOKE ALL ON SEQUENCE public.labour_v2_transaction_id_seq FROM PUBLIC,anon;
GRANT SELECT ON public.labour_v2_activity,public.labour_v2_department,public.labour_v2_costs TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.labour_v2_transaction TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.labour_v2_transaction_id_seq TO authenticated;
DROP POLICY IF EXISTS labour_v2_department_read ON public.labour_v2_department;
DROP POLICY IF EXISTS labour_v2_activity_read ON public.labour_v2_activity;
DROP POLICY IF EXISTS labour_v2_transaction_read ON public.labour_v2_transaction;
CREATE POLICY labour_v2_department_read ON public.labour_v2_department FOR SELECT TO authenticated
USING ((SELECT public.my_farm_app_roles()) && ARRAY['admin','manager','labour']::text[]);
CREATE POLICY labour_v2_activity_read ON public.labour_v2_activity FOR SELECT TO authenticated
USING ((SELECT public.my_farm_app_roles()) && ARRAY['admin','manager','labour']::text[]);
CREATE POLICY labour_v2_transaction_read ON public.labour_v2_transaction FOR SELECT TO authenticated
USING ((SELECT public.my_farm_app_roles()) && ARRAY['admin','manager','labour']::text[]);
