# Isolated combined GRV sandbox setup

This folder allows the Supabase CLI to launch a local PostgreSQL 17 instance. It does NOT copy the FarmingMain schema or data automatically.

## Local requirements
- Docker Desktop running
- Supabase CLI
- PostgreSQL psql command-line client

Run from the repository root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/grv-local-preflight.ps1
```

The local DB is on port **55422**. The development team must restore a sanitised `stock_v2` schema, demo posting routines and disposable **TEST_AO** receipt fixtures to the LOCAL instance, and apply the reviewed private bridge schema before running the test.

The existing integration script `supabase/tests/combined_grv_real_engine_rollback.sql` assumes prior demo receipts for AO/Aims glyphosate. Do not execute it without these fixtures.

**Do not connect the local test to live FarmingMain credentials.** Check the connection target and use local PostgreSQL access only.

## Blockers to enabling the GRV save button
- Local test dataset/DDL restore not yet available in the repository
- Complete combined posting routine remains a draft, not a deployed Edge Function operation
- Business approval of JS versus AO direct-GRV policy
- Accounting variance approval and weighted-average stock costing
- End-to-end tests and web UI check

Published `main` and the running Stock V2 backend must remain unchanged.
