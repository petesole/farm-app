# JSPL Farm Management — Mandatory Security & Development Policy
Version 1.0 | 25 October 2026 | Applies to all new features, bug fixes, schema changes and releases

## 1. Core principle
Do not compromise live farm operations while improving security. No change is considered complete without security controls, validation and rollback. This policy is the default for GitHub, Supabase, Access imports, Weighbridge, Stock, Fuel, Irrigation, R+M and Cashbook work.

## 2. Environments and deployment
- `main` / published app and live FarmingMain Supabase are production; `dev` is for development **code**, not automatically an isolated database.
- Database-changing tests require a separate Supabase test project/database with representative NON-SENSITIVE test data. Do not point feature-development migrations at the production database.
- Never deploy directly to production without a reviewed change summary, dependency impact assessment, verification evidence and rollback plan.
- No blanket RLS enablement or bulk permission revocation on live tables.
- Schema migrations must be versioned, reproducible and tested in isolation before production. Backups require a restore test.

## 3. Authentication and authorization
- All new modules use Supabase Auth with per-user identity; do not compare user-supplied passwords in application SQL queries, use custom plaintext-password tables or store credentials in app storage.
- Do not trust a role stored in AsyncStorage, client UI state or user-editable JWT metadata for authorization. Enforce permissions on the database/server.
- Deny anonymous access to all nonpublic operational and financial data; define least-privilege permissions for roles (admin, manager, finance, stock, workshop, fuel, WB, etc.) based on approved workflows.
- A login screen or hidden menu item does **not** confer database security.
- Never put Supabase secret/service-role credentials in any client, repository, log or exported artifact. Publishable keys are public and must not be treated as a security boundary.
- Enforce separation of duties for finance approvals, payment confirmation and reversals. Record who did what and when.

## 4. Data access, RLS and database code
- Every newly created table in an exposed schema must have RLS enabled **before** granting client access; add explicit narrowly scoped SELECT/INSERT/UPDATE/DELETE policies for the authorised users and operations. Check parent, child, upsert and return-select flows.
- Avoid permissive `TO authenticated USING (true)` for private farm records.
- Default to least-privilege GRANTs for `anon`, `authenticated` and functions; review `EXECUTE` access before releasing RPCs.
- Use security-invoker views where practical; security-definer functions only with documented necessity, hardened search_path, explicit access checking and narrow EXECUTE grants.
- Protect Storage buckets and object-level access as rigorously as tables.
- Do not run untrusted dynamic SQL or embed secrets in functions.

## 5. Integrity, audit and payments
- Every write is validated server-side (amount, quantity, currency, dates, ownership, references).
- No destructive or unaudited edits to confirmed financial, stock or weighbridge transactions. Use void/reversal/correction with actor, reason and immutable link to original.
- Prevent duplicates with stable identifiers and uniqueness/idempotency controls; protect concurrent posting.
- Maintain separate invoice, order, receipt, stock movement and payment states. Avoid double-counting expenditure.
- Pastel remains the formal accounting source of record unless explicitly changed by management.

## 6. Required testing for each change
- Verify anonymous users cannot read/write protected data.
- Verify normal user can perform only assigned operations; manager/admin can perform authorised tasks.
- Confirm affected workflows work end-to-end; include unhappy paths, partial actions, deleted/voided items, duplicate submissions and failed network requests.
- Run Supabase security advisor and examine changes in errors/warnings; don't silently waive high-risk findings.
- Confirm web and native app sign-in and session behaviour if authentication is touched.
- Verify no changes in current live Weighbridge, Fuel, Stock and Irrigation operations before release.

## 7. Release checklist (required)
- [ ] Task scope, affected screens/tables/RPCs documented
- [ ] Production vs test app AND database verified
- [ ] Authentication and authorization reviewed
- [ ] RLS and GRANT checks performed
- [ ] Secrets scan and sensitive data review completed
- [ ] Test evidence and negative-permission checks recorded
- [ ] Schema migration and restore/rollback instructions prepared
- [ ] Affected module owner approves production change
- [ ] Release monitoring and rollback trigger identified

## 8. Current security remediation work (existing legacy modules)
1. Establish tested database sandbox and dependency inventory.
2. Replace native `public.login` password-table check with Supabase Auth; test each role before retiring legacy login.
3. Revoke anonymous grants and enable appropriate RLS module by module with application compatibility tests.
4. Review public SECURITY DEFINER views/functions and EXECUTE grants; harden or restrict safely.
5. Enable leaked-password protection and review Auth and Storage settings.
6. Deploy in small, approved production releases with backups and rollback readiness.

## 9. Stop-the-line condition
If anonymous access to credentials or financial transactions is discovered, treat it as urgent; do not publish new sensitive functionality until an effective mitigation is in place. When a safety fix risks outages, first prepare the tested replacement and a short coordinated release window.

## 10. Ownership
The app owner approves production releases and security exceptions. Exceptions must be documented, time-limited and accompanied by compensating controls. Developers/agents must not make silent production security changes.
