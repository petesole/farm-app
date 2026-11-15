# Stock V2 credit notes & Admin corrections — backend progress (25/10/2026)

## Implemented in existing test Stock V2 schema
- `stock_v2.demo_save_credit_note(...)`: creates a **draft** credit note with per-item quantities and amounts only for products on the associated accounting GRV. Creates no stock movement.
- `stock_v2.demo_request_admin_correction(...)`: records a **pending** request for an edit/disregard/reopen, with reason and proposed values. Does NOT execute a stock or accounting correction.
- Both functions are private: direct EXECUTE revoked from `public`, `anon`, `authenticated`.

## Tests performed
- Atomic draft credit note creation attached to a test GRV, then SQL rollback: zero persisted credit notes.
- Pending correction request for an existing demo DNote, then rollback: zero persisted requests.
- **No irreversible stock adjustment and no published UI changes.**

## Still required before operational use
1. Authenticated Edge Function handler with server-side Admin role verification; never trust caller-supplied user UUID or app-only Admin restrictions.
2. Add functional credit note and correction forms to GRV screen, not mock controls.
3. Credit-note confirmation/void flow; approved supplier payable calculation, disputes and safeguards against over-crediting.
4. For posted DNotes: authorise adjustment, check issued/transferred stock, preserve original movement, post new reversing/adjusting document and recalculate weighted-average costs; block when unsafe.
5. Audit before/after values, event time and actor identity derived from verified server session.
6. Test duplicate requests, idempotency, cross-owner access, invalid targets and concurrent adjustments.

Pastel is not involved. Do not enable save/approval actions until these checks pass.
