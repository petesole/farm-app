# Combined GRV backend integration results — 25/10/2026

Project: FarmingMain, existing TEST_AO stock demo records. All tests used `BEGIN` / `ROLLBACK`.

## Verified
- Atomic mixed transaction with existing demo receipt line 72: 5 units previously received + 5 units new direct GRV for AO/Aims/DEMO_GLYPHOSATE.
- Database confirmed `status=matched`, two linked physical receipt allocations, aggregate allocated quantity 10, exactly one new positive physical stock movement for the 5-unit direct receipt.
- Existing original receipt line was linked; no second stock movement was generated for it.
- Quantity discrepancy test: supplier invoice quantity 12 vs allocated physical quantity 5 gave `status=disputed`; allocated physical quantity remained 5.
- Post-rollback check: zero surviving accounting GRVs with the test invoice numbers; stock demo receipt was rolled back.

## Backend state
- `stock_v2.accounting_grv`, `accounting_grv_line`, `accounting_grv_allocation`, and `demo_post_combined_grv(uuid,jsonb)` installed in test-only Stock V2 subsystem.
- No new Edge Function endpoint and no live UI posting action.
- Existing Direct GRV owner permission is enforced by `demo_multi`: TEST_AO permitted, TEST_JS blocked.

## Blockers
- **Costing and accounting approval are NOT implemented.** A variance must not automatically alter inventory costs or supplier liability.
- Require server-side role authorization at Edge Function boundary, validation/idempotency replay with payload hashes, race and partial matching tests before enabling.
- Correct the GRV UI preview: only offer available receipt quantities for the same owner/supplier, including fully/partially allocated DNotes.
- Visual/browser testing required.

Keep published `main`, Weighbridge, and all non-Stock V2 schemas unchanged.
