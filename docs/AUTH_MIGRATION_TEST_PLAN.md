# Authentication migration — DEV test and release checklist
Prepared 25 October 2026. No production change is authorised by this document.

## Implemented in dev
- Web and native login now both use Supabase Auth signInWithPassword.
- After login, both call my_farm_app_roles; no assigned role -> sign out.
- Removed native query against public.login with password filter.
- UI now requests email rather than username on both platforms.
- Existing dev Supabase client explicitly refuses the FarmingMain production project.

## Blocking prerequisites
1. Provision a **separate FarmingMain test Supabase project**. Existing GoldBuying project is NOT an acceptable substitute.
2. Configure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for test project only.
3. Build sanitized or synthetic copies of roles, permission RPC and required module reference tables. Never copy legacy passwords.
4. Set up test users for admin, manager, fuel, irrigation, scouting and viewer using unique test credentials; verify role-function grants and RLS.
5. Confirm Native Supabase Auth works with AsyncStorage and role RPC. Check auth restoration, logout and expired session handling.

## Required tests
- Correct email/password, role assigned: correct destination on web and native.
- Correct credentials, no role: session signed out and access refused.
- Invalid password or disabled account: login refused.
- Anonymous users unable to call restricted tables/RPCs; auth-only users cannot exceed assigned role.
- Refresh, app restart, offline state, network failure and retry.
- Negative permission tests for fuel issue, stock operations, irrigation and WB.
- Browser and native UI smoke tests with representative operators.
- Verify no stale legacy login call remains in release artifact.
- Verify database permissions separately; UI-level role redirection is NOT database authorization.

## Production migration (separate explicitly approved change)
- Inventory native users and map to Supabase Auth identities without exposing passwords.
- Prepare credential reset/onboarding.
- Deploy verified compatible client before revoking public.login privileges; coordinate cutover to prevent old native clients continuing to use insecure login.
- Block any obsolete client release and schedule forced upgrade if feasible.
- Revoke anon read/write and retire plaintext-style credential use only once no dependencies remain.
- Validate new credentials and monitored rollback path. Retain no insecure fallback.
