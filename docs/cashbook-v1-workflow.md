# JSPL Cashbook V1 — implementation contract (TEST ONLY)

## Scope and ownership
- Farm office initiates buying and payments; Pastel is the accounting system of record.
- JSPL app provides operational cashbook, R+M cost allocation, requests, commitments, cash advances and payment preparation.
- No Pastel posting, banking integration or live balances in V1.
- Use a **new, isolated schema/tables**. Do not touch WB, Fuel, Stock V2, or existing Access tables.

## Stage A — Cashbook foundation
1. Cash/bank accounts with currency (USD / ZiG), opening date, opening balance, active flag.
2. Transactions: payment, receipt, account transfer; transaction date, value date, reference, counterparty, narrative, transaction status (draft / confirmed / voided), source document, creator, confirmer, timestamps.
3. Transfers always create a linked debit and credit in the **same currency**; use a distinct FX conversion workflow later. Validate account ownership/permissions on server.
4. Running balance = opening balance plus confirmed receipts less confirmed payments and transfers. **Draft or voided entries have no effect**.
5. Multiple allocations per expense line: target type (machine / R+M job / tracecode / irrigation / overhead), target ID, category, amount. Sum of allocations must equal expense amount, or retain explicit unallocated balance.
6. Corrections via reversing transaction with original reference, not silent edit of confirmed records.
7. Prevent duplicate external references by account and source where applicable. Keep complete audit trail.

## Stage B — Supplier obligations and payment control
- Invoice is a liability, not a payment and not an automatic bank transaction.
- One invoice can be paid partially, by multiple disbursements, and through different accounts.
- Payment run: drafted -> approved -> paid -> confirmed. Approval does not mark an invoice paid.
- Support partial receipt and credit notes; invoice and its payment must not count twice as expense.
- Track staff cash advances as receivables until receipts/returns settle them.
- Stock purchases are held as stock cost until issue, not booked to R+M at GRV and again at issue.

## Stage C — Reconciliation and Pastel
- Daily / monthly bank reconciliation against imported statement lines, exceptions and unreconciled items.
- Separate reconciliation of actual bank clearing dates from farm-office payment dates.
- Export confirmed transactions with unique stable IDs, dates, account, supplier, references, category and allocations to a Pastel-compatible format **after validating Pastel edition and supported format**.
- Pastel remains authoritative for formal creditor/tax ledger; reconcile differences, do not claim automatic sync.

## Security / release gates
- Supabase FarmingMain public schema currently includes legacy tables with RLS disabled. Never reuse their permissive access pattern.
- Require identity/role mapping to current JSPL app authentication before adding cashbook SQL.
- New tables must have RLS enabled and narrowly scoped SELECT/INSERT/UPDATE policies; no anon finance access.
- Do not put service-role secret in Expo client.
- Add validations and test cases for: negative amounts, duplicate payments, partial invoice payment, transfers across currencies, cash advances, refunds/reversals, closed periods, and bank reconciliation.
- Review actual authorization model before enabling DB-backed cashbook or publishing.
- Keep the implementation off main until signed off.

## UI progress
- `app/cashbook-v1.tsx` is a standalone route in the test branch using session-only state; it does not persist financial data.
- Initially open the route directly in the Expo web app as `/cashbook-v1`; no navigation link has been added to production tabs.
