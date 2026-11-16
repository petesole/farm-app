# Stock V2 combined GRV — implementation gate (28/10/2026)

## Required business rules
- Physical D-Note is the stock source of truth. A GRV against a D-Note MUST NOT create a second inventory movement.
- Direct GRV against an outstanding PO posts exactly one receipt and values it in the same atomic transaction.
- An accounting GRV is FINAL: EVERY selected physical receipt line must have an actual unit price > 0. A zero/blank price may exist on D-Note only. No draft/disputed unpriced GRV may be saved as final.
- Selected D-Note quantities are locked (unless separately implementing explicit partial invoice allocation); direct PO quantity and price begin at 0 and must be explicitly entered.
- Remaining PO quantity = ordered less ALL physical receipts, whether or not the D-Note is priced.
- One supplier/stock owner per GRV. A GRV may cover several D-Notes and several PO lines. Repeated product codes from different PO lines must retain separate source IDs.
- On successful final save, price confirmation and weighted-average historical costing are completed atomically; failure rolls back both direct receipts and accounting records.

## Verified by read-only inspection on 28/10/2026
- FarmingMain has **no Supabase development branches**. Do not deploy or run write tests on shared production as though it were isolated.
- Installed `stock_v2.demo_post_combined_grv(uuid,jsonb)` accepts zero unit price, creates status 'matched'/'disputed', and does not complete final costing. This fails the user-approved final-GRV business rule.
- The current `stock-v2-demo-workflow` Edge Function exposes `match_invoice`, but does not expose `combined_grv`. No combined-post endpoint exists.
- Existing integration documentation records rollback smoke tests for mixed D-Notes/direct receipts; it explicitly leaves authorization, costing, concurrency and partial matching unfinished.
- Current UI combined selection remains preview-only. The older single-DNote price-match action remains available; this is NOT equivalent to an approved fully combined GRV.

## Before enabling combined posting
1. Isolate a genuine test database/branch (quote/approve any branch cost).
2. Add transaction-level supplier/owner/PO/item checks and approved outstanding PO balance enforcement for each PO line. Use real PO line IDs.
3. Require positive prices before inserts and confirm exact invoice quantities/line-level allocations; do not allow 'matched' with unpriced lines.
4. Implement pricing and WA recost inside atomic DB operation; preserve audit trail and idempotency with payload hash. No partial committed inventory/cost transactions.
5. Add authorized Edge action and user role checks.
6. Execute rollback tests: multiple D-Notes, direct PO, partial PO, duplicate request, duplicate invoice, quantity overage, different supplier/owner, zero unit price, late D-Note, rollback of failed costing and concurrent receipt contention.
7. Run UI/typecheck/browser tests; compare stock ledger before/after, then enable combined save in development.

Do not publish to main or deploy the combined action while these gates fail.
