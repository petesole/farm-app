# Combined GRV: existing stock engine integration smoke checks (24 October 2026)

## Real Stock V2 posting engine verified, rollback-only

Project: FarmingMain; existing `stock_v2.demo_multi` backend. Tests were run inside a SQL `BEGIN ... ROLLBACK` transaction. No persisted inventory transactions.

1. **Direct receipt on permitted test owner (AO):** call `demo_multi('direct_grv', request UUID, receipt_mode='dnote', 5 units DEMO_COMPOUND_D)`; assertion checked one positive `stock_v2.movement` for quantity **5**.
2. **Idempotent repeat:** identical UUID and payload returned `replayed=true`, with no second stock receipt.
3. **Persistence:** after rollback, `stock_v2.grv_detail` rows with unique test DNote number: **0**.
4. **Owner policy:** attempted Direct GRV on JS, where `allow_direct_grv=false`, was rejected; zero denied test documents persisted.

## Significant integration observation

Existing owner policy permits Direct GRV for `TEST_AO` but blocks `TEST_JS`. Do not turn on mixed direct receipts for JS without an explicit business decision and secured change to policy. A combined GRV containing previous DNotes but no new receipt could still be supported independently.

## Not yet passed

- Atomic single-transaction integration of **existing live DNote line allocations** and the actual `demo_multi` new receipt engine into a true accounting GRV (the current combined GRV accounting tables remain isolated test fixtures).
- Partial matching against existing `stock_v2.document_line` rather than test fixture receipt lines.
- Weighted average repricing and disputed supplier invoice costing.
- Concurrent posting and full permission checks at the Edge Function boundary.

Until passed, continue to leave the combined GRV screen preview-only. Do not migrate unfinished drafts to `stock_v2` or publish to `main`.
