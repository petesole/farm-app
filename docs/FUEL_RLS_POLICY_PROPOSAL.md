# Important compatibility finding — 25 October 2026

**HOLD production execution** of the original six-table SQL below until Fuel RPC permissions are fixed. Read-only inspection confirmed:
- `fuel_insert_dip(date,integer,numeric)`: SECURITY DEFINER; allows anonymous EXECUTE; inserts directly into `public.fuel_dip` without checking `auth.uid()`.
- `get_fuel_dashboard()`: SECURITY DEFINER; allows anonymous EXECUTE; reads fuel issues, receipts, vehicles, supplier and allocation data.
- `fuel_missing_closing_days()`: SECURITY INVOKER; allows anonymous EXECUTE; reads fuel issues and receipts.

These RPCs would undermine the planned table restrictions if left public. Recommended release changes are to revoke anonymous EXECUTE for all three, require a verified assigned role to view dashboard reports, and permit only admin/manager/fuel to insert dips. The privileged dip insertion function must check role server-side and use a hardened search_path. Test authenticated Fuel screens before changing live permissions.

**Do not enable RLS on only six tables and treat Fuel as secured.** Verify other publicly exposed views/functions and the fuel_dip table as well.

---

# JSPL Fuel database access — reviewed SQL, NOT applied
Prepared 25 October 2026. The published Fuel app has NOT been proven compatible with this change. Do not execute on FarmingMain until client cutover and workflow tests are complete.

## Approved target permissions
- Anonymous: no access to the six tables.
- Signed-in assigned staff: read Fuel, Vehicle and Supplier records as needed across modules.
- Fuel operator, manager or admin: create fuel issues, receipts and allocations.
- Manager or admin: edit or delete fuel transactions; manage vehicle, vehicle-job and supplier master records.
- All other authenticated users: read-only for these six tables if they have at least one assigned farm role.

## Production transaction — KEEP UNEXECUTED until compatibility verified

```sql
BEGIN;

-- Eligibility is derived from auth.uid() via existing, reviewed role function.
-- The function is SECURITY DEFINER with a fixed search_path.
ALTER TABLE public.fuel_issue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier ENABLE ROW LEVEL SECURITY;

-- Existing tables have no policies as checked on 25 October 2026.
-- Read allowed to anyone who has an assigned farm app role.
CREATE POLICY fuel_issue_read ON public.fuel_issue FOR SELECT TO authenticated
USING (cardinality((select public.my_farm_app_roles())) > 0);
CREATE POLICY fuel_allocation_read ON public.fuel_allocation FOR SELECT TO authenticated
USING (cardinality((select public.my_farm_app_roles())) > 0);
CREATE POLICY fuel_received_read ON public.fuel_received FOR SELECT TO authenticated
USING (cardinality((select public.my_farm_app_roles())) > 0);
CREATE POLICY vehicle_read ON public.vehicle FOR SELECT TO authenticated
USING (cardinality((select public.my_farm_app_roles())) > 0);
CREATE POLICY vehicle_job_read ON public.vehicle_job FOR SELECT TO authenticated
USING (cardinality((select public.my_farm_app_roles())) > 0);
CREATE POLICY supplier_read ON public.supplier FOR SELECT TO authenticated
USING (cardinality((select public.my_farm_app_roles())) > 0);

-- Fuel operators can create transactions; administrators/managers can too.
CREATE POLICY fuel_issue_create ON public.fuel_issue FOR INSERT TO authenticated
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager','fuel']::text[]);
CREATE POLICY fuel_allocation_create ON public.fuel_allocation FOR INSERT TO authenticated
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager','fuel']::text[]);
CREATE POLICY fuel_received_create ON public.fuel_received FOR INSERT TO authenticated
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager','fuel']::text[]);

-- Correcting historical fuel transactions is management-only.
CREATE POLICY fuel_issue_update ON public.fuel_issue FOR UPDATE TO authenticated
USING ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[])
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[]);
CREATE POLICY fuel_allocation_update ON public.fuel_allocation FOR UPDATE TO authenticated
USING ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[])
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[]);
CREATE POLICY fuel_received_update ON public.fuel_received FOR UPDATE TO authenticated
USING ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[])
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[]);

-- Master changes reserved for management; review any non-management authoring flows.
CREATE POLICY vehicle_manage ON public.vehicle FOR ALL TO authenticated
USING ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[])
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[]);
CREATE POLICY vehicle_job_manage ON public.vehicle_job FOR ALL TO authenticated
USING ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[])
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[]);
CREATE POLICY supplier_manage ON public.supplier FOR ALL TO authenticated
USING ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[])
WITH CHECK ((select public.my_farm_app_roles()) && ARRAY['admin','manager']::text[]);

-- No DELETE policy on fuel transactions; corrections should be tracked and reversed.
REVOKE ALL ON TABLE public.fuel_issue, public.fuel_allocation,
 public.fuel_received, public.vehicle, public.vehicle_job, public.supplier FROM anon;
-- Preserve authenticated privileges already present. Explicitly remove fuel DELETE permissions;
-- table privileges are broader than RLS policies, which supply final row-level restriction.
REVOKE DELETE ON TABLE public.fuel_issue, public.fuel_allocation, public.fuel_received FROM authenticated;

COMMIT;
```

## Tests REQUIRED before deploying
- Test each role, anonymous access, missing role, CRUD for fuel issues/receipts/allocations.
- Fuel correction screens now use verified Auth roles in dev but have NOT been tested.
- Check fuel_insert_dip, fuel_missing_closing_days, get_fuel_dashboard and every dependent view/RPC under new RLS; security-definer RPCs might bypass it.
- Stock, R+M and other modules may write supplier, vehicle or job masters; confirm before restricting.
- Existing published app may still use legacy mobile authentication. If so, the new rules can interrupt operations.
- Consider update/delete policies with audit trail, correction reasons and reversals as a separate enhancement; DO NOT enable ad hoc destructive changes.
- When publishing, ensure user Auth accounts and app_user_role assignments exist for all operators.

## Post-release verification
```sql
SELECT c.relname, c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
 has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
 has_table_privilege('anon',c.oid,'UPDATE') AS anon_update
FROM pg_class c
WHERE c.oid IN ('public.fuel_issue'::regclass,'public.fuel_allocation'::regclass,
 'public.fuel_received'::regclass,'public.vehicle'::regclass,
 'public.vehicle_job'::regclass,'public.supplier'::regclass)
ORDER BY c.relname;
```
Expected RLS=true, anon_* all false.

## Rollback
Prepare validated backup/restore before production change. Any rollback must avoid reopening unauthenticated access; restore with carefully audited client compatibility rather than blindly disabling RLS.
