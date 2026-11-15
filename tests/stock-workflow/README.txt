Stock approvals and corrections regression checks

From the repository root:
  npm ci
  npm ci --prefix tests/stock-workflow
  node tests/stock-workflow/run.cjs

Requires Node 22 or newer. No Supabase credentials, network calls or real data are
used by the tests. Fixtures contain schema definitions captured read-only from
the existing development Stock schema, plus synthetic transactions and users.

PGlite executes the actual PostgreSQL routines, constraints, triggers and views.
The Edge harness executes the checked-in handlers with a PGlite SQL adapter.
JWT validation and the Deno runtime are mocked. UI checks use React and jsdom,
with native controls mocked, and exercise the actual screens against that local
handler/database combination. These checks do not verify real staff sign-ins,
physical devices, native layouts, deployed Edge runtime or live Supabase RLS.

The SQL under supabase/drafts is deliberately not applied by this test or CI.
It belongs to the Stock development release only. Do not apply it to Main as a
side effect of a web build.
