# Stock V2 isolated GRV integration status — 24/10/2026

## Database
- Supabase project: FarmingMain (existing project)
- PRIVATE schema: `stock_v2_grv_test` created via migration `isolated_stock_v2_combined_grv_test_harness`.
- Objects: `receipt_line`, `accounting_grv`, `grv_line`, `allocation`, and `guard_allocation()`.
- Schema, tables and functions denied to `public`, `anon`, and `authenticated`. No Data API or public endpoint added.
- **This is a test fixture, not the production implementation.** Never connect production UI to these tables.

## Verified tests
Executed in a transaction and ROLLED BACK:
- Older and same-day DNotes allocated to one invoice (5+5=10).
- Attempt to exceed physical receipt quantity rejected.
- Attempt to allocate a different grower's DNote rejected.
- Verified fixture `receipt_line` persisted record count: 0.

## Remaining before implementation
1. Fully review `supabase/drafts/20261024_stock_v2_combined_grv.sql`: it remains an unexecuted design draft, not an approved migration.
2. Correct the draft's validation/locking, numeric, duplicate-entry and update constraints.
3. Test partial allocations across multiple invoices, mismatched suppliers/products, invoices exceeding receipts, duplicate replay and concurrency.
4. Add a secured, private transactional backend action with tests for combined old+DNote plus direct physical receipt and stock rollback.
5. Separate supplier payable, cost valuation and accounting approval so invoice quantity variances cannot affect physical stock or distort weighted-average costing.
6. Only then enable the GRV page's combined posting button and run visual/UI checks.

Keep `main` and Weighbridge untouched. Existing live Stock V2 workflows remain unchanged.

## Additional isolated test backend — 24 October 2026
- Migration applied: `isolated_stock_v2_grv_atomic_post_test` in PRIVATE `stock_v2_grv_test` schema.
- Created `request_log` and `post_combined_grv(uuid,jsonb)`, accessible to trusted database roles only; no authenticated/anon/Public grants.
- Atomic test transaction supports previously received DNotes, newly recorded direct receipts, invoice quantity and price, per-line allocations, disputed variance status, and idempotent replay.
- Verified transactionally with ROLLBACK: 5 old + 5 new = 10; duplicate request made only one new receipt; excess allocation rejected; partial 4+6 across invoices; wrong supplier rejected; unmatched invoice quantity flagged disputed.
- Final SELECT results: zero persisted test receipts, zero persisted GRVs and zero persisted requests.
- **Not production ready:** this function writes to isolated test fixture tables rather than actual `stock_v2` physical ledger; live function integration, authorization, stock valuation, deployment and browser workflow still pending. Do not enable the live posting button yet.
