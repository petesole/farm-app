# Stock V2 delivery rules

Use development only. Preserve main and live.

- Show short persisted document numbers and dates in dd/mm/yyyy format.
- Open selected documents in their own focused view. Never expand edit forms beneath a long list.
- Do not edit a D-Note after any invoice/GRV has been linked.
- Do not edit quantities already received against a purchase order. Only its outstanding balance may be cancelled.
- Posted stock movements remain immutable; corrections use linked, audited transactions.
- Supplier returns must include physical dispatch, partial or combined credit notes, real credit values and reconciliation.
- Stocktake must support printed sheets, entered counts, administrator review and separately numbered stock adjustments.
- Operators handle physical tasks; Admin handles accounting and exceptions.
- Do not call a workflow complete without integration testing and ledger reconciliation.
- Keep existing records until a controlled cleanup is approved.

Audit rectification acceptance:
- Admin may cancel only the outstanding PO quantity after partial receipt; preserve received quantities and record the cancelled balance and original ordered quantity.
- One D-Note line may be covered by multiple invoices. Each invoice matches its allocated physical quantity; the remaining quantity stays outstanding. Keep receipt valuation provisional until fully invoiced, then confirm the quantity-weighted invoice cost.
- Previewing or cancelling printing must not mark an issue as printed. The operator confirms a legible physical slip before its print lock is recorded.
- Plan/issue/return retries use the persisted operation ledger and retain inputs until the previous save is resolved.
