# JSPL minimal authentication security cutover — reviewed 25 Oct 2026

## Verified live function (read-only review)
`public.my_farm_app_roles()` returns a text[] containing role_name for `auth.uid()` from `public.app_user_role`. It is STABLE, SECURITY DEFINER and sets an empty search_path, and the SQL qualifies its table references.
Existing EXECUTE grants include `anon`, `authenticated`, and `service_role`.

## Smallest independent hardening change (NOT EXECUTED)
This only removes anonymous ability to invoke the role-lookup function. It does not alter role assignments, RLS, login credentials or table data:

```sql
REVOKE EXECUTE ON FUNCTION public.my_farm_app_roles() FROM anon;
```

Post-change verification:
```sql
SELECT
  has_function_privilege('anon','public.my_farm_app_roles()','EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated','public.my_farm_app_roles()','EXECUTE') AS authenticated_can_execute;
```
Expected: false, true. Note that PUBLIC-level grants could defeat a revocation from anon; inspect all effective grants in the verification.

## Function safety assessment
The role function itself is narrowly written: it uses auth.uid() and accesses the role table by authenticated user UUID, with a fixed search_path. However SECURITY DEFINER makes the function a privileged API. It needs role mapping, dependency and effective-grant verification. The function does NOT enforce RLS on unrelated tables.

## Remaining deployment blockers
- Current production `app/login.tsx` native branch still queries `public.login` with username/password. `dev` has replaced this with Supabase Auth, but migration of operators has not been tested.
- Production public.login has RLS disabled with anonymous read/write grants. **Urgent** and must be restricted after migration; changing it prematurely may lock out old native devices.
- Dev deliberately refuses the production Supabase URL, and no free isolated FarmingMain test database was verified. Do not circumvent this protection to test credentials.
- Session/role checks in dev are UI guards, not substitutes for table-level RLS.
- Existing legacy app code reads AsyncStorage role in multiple components; review any privileged action carefully.
- No production SQL or published app changes should be made automatically based on this file.

## Zero-cost path forward
1. Inspect read-only dependencies, identify operator devices and the version they run.
2. Build/run local static checks; use mocked clients for authentication UI tests without live keys.
3. Have admin create / identify Supabase Auth identities for operators and onboard/reset passwords after an approved production cutover plan.
4. Schedule an approved short release with backups and rollback, verified access for every staff role, and no fallback to plaintext login.
5. Migrate table access with narrow policies module by module, after dependency mapping.

## Mandatory release gate
Do NOT publish the new native login until operators have Auth identities and assigned roles, and their sign-ins have been tested. Do NOT revoke public.login while old native clients are still in use.
