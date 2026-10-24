# Combined GRV deployment gate (Stock V2 only)

Status: **staged, not deployed**. Database changes are in `supabase/drafts/20261024_stock_v2_combined_grv.sql`.

## Accounting rules
- Original DNote movement is the inventory source of truth.
- Multiple DNote lines, including different receipt dates, may allocate to one accounting GRV.
- Partial allocations are per physical receipt line; remaining units stay available for future GRVs.
- Today's direct receipt uses `stock_v2.demo_multi('direct_grv', ...)` exactly once in the same database transaction as the GRV reconciliation.
- Invoice quantity can differ from physical receipt quantity. Variances are recorded with disputed status, never translated into stock adjustments.
- GRV accounting approval, Pastel output and stock cost recalculation require a separate reviewed step.

## Deployment prerequisites
1. Provision an isolated database or test schema and apply draft there, NOT to FarmingMain live data.
2. Validate SQL compilation and permissions; confirm private-only access and application role checks.
3. Run transaction tests: two historical DNotes + today's direct receipt + one invoice.
4. Test partial matching, duplicate invoice/request, owner mismatch, supplier mismatch, product mismatch, concurrency and rollback.
5. Validate approved accounting amount/stock cost allocation; avoid pricing an earlier receipt with incorrect total-invoice costs.
6. Add a secured Edge Function action to call the reviewed database routine. Do not expose raw SQL RPC to public clients.
7. Enable posting button in `stock-v2-grv-outstanding.tsx` only once full tests pass.
8. Verify UI desktop/mobile and check original DNote, GRV and movement ledgers after a test posting.

No existing production Supabase functions have been modified.
