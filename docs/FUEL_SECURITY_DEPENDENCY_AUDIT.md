# JSPL Fuel security hardening — dependency audit (2026-10-25)
Production inspected READ ONLY. No live permission changes made.

## Tables and exposure
Each of the following public tables has RLS disabled and currently grants anon SELECT, INSERT, UPDATE and DELETE: fuel_issue, fuel_allocation, fuel_received, vehicle, vehicle_job, supplier.
Do not indiscriminately enable RLS on these tables while production clients still use anonymous database access.

## Confirmed frontend dependencies in main branch
- app/(tabs)/home/fuel_issue_edit.tsx: direct SELECT on fuel_issue and vehicle; issue edit form.
- app/(tabs)/home/fuel_received_edit.tsx: direct SELECT on fuel_received and supplier; receipt edit form.
- app/(tabs)/home/fuel_report_day.tsx: direct SELECT on fuel_issue.
Other dependencies may exist in database views, RPCs and further frontend files; these are NOT an exhaustive dependency inventory.

## Required server-side authorisation strategy
1. Migrate all Fuel screens to verified Supabase Auth session; deny unauthenticated app users.
2. Define role matrix: admin/manager can manage fuel and reference tables; fuel user can create and read fuel issues/receipts/allocations; define who may edit or reverse confirmed records; viewer read-only only if required.
3. Protect vehicle and supplier reference records from unauthorised edits. Administrative management alone should update masters.
4. Create narrowly scoped policies on six tables under a tested migration; check nested select/upsert and reporting views. Review SECURITY DEFINER functions and view privileges separately.
5. When clients and workflows are verified, enable RLS and remove anonymous GRANTs as a controlled production release.
6. Test negative access (anon, unrelated signed-in role), positive actions (fuel staff), duplicate submissions, and failed network recovery. Verify fuel register, daily report, allocations, receipts, corrections.

## Why not change live permissions now?
Code references show direct API access and the published app may still depend on anonymous queries. The requested zero-cost/no-disruption approach requires a compatibility-tested migration; no separate non-production database currently exists.
Production's credentials-table fix is independent and was already verified.
