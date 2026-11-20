# Potato module: agreed workflow and Field Report acceptance (20 November 2026)

## Source of truth

The user's original **Potato Report(1).xlsx**, Sheet1, `A1:O19`, is the layout specification. Do not substitute an independently designed report. All displayed values must come from Supabase operational records rather than the example workbook amounts.

### Exact layout map

- `A1`: field/trace name, selected through a dropdown with potato records.
- `A2:B2`: hectares; `A3:B3`: Raw Product in kg.
- `A4:B4`: Yield/Ha Raw (raw kg / ha).
- `A5:B5`: Yield/Ha Processed (sum of graded *15 kg / ha*, **excluding waste**).
- `K5:L5`: Yield/Ha Sold (sold kg / ha).
- `K6:L6`: Price/Ha Sold (sold value / ha).
- `B8:E19`: Processed — B size, C pockets, D kg, E recovery %. Eight sizes on rows 10–17, Waste on row 18 and graded+recorded waste total on row 19.
- `G8:I18`: Stock — G size, H pockets, I kg. Grand totals on **row 18**, aligned with Processed's Waste line.
- `K8:O18`: Sold — K size, L pockets, M kg, N value, O return/kg. Grand totals on **row 18** (pocket total intentionally blank in original workbook).
- Order: Large; Medium; S/Medium; Small; Chats; Cuts; Bullets; Greens. The original workbook has *Bullets before Greens* regardless of master sort order.
- Percent denominator is graded weight **plus separately recorded grading waste**, never ungraded incoming stock. Waste is NOT calculated by subtracting graded from received; the latter may include potatoes waiting for grading.
- Row 19 has only the Processed totals. Do **not** put a second common 'Total' row under Stock/Sold.

## Stock and sales rules

1. WB computer records and syncs outgoing D-Notes without FIFO or contract controls. Potato Module allocates D-Notes afterward.
2. The operator selects **Normal (FIFO by size)**, **Pre-sale collection**, or **Admin diversion**. Earlier unclassified D-Notes must be allocated before newer ones.
3. Each graded batch has one source field/trace; only potato fields with received stock are selectable; if exactly one field has received stock, default that field.
4. Normal stock shares a pool, allocated FIFO by size, retaining grade batch and field attribution. Pre-sale stock is reserved against a specific customer, field, contract and size; it is physically separate.
5. Contracts may predate grading. Newly graded pockets from the contracted field satisfy the outstanding pre-sale quantity before entering normal stock. Surplus enters normal stock.
6. Pre-sale reserved pockets are **counted as sold at the contract price when reserved**. Collection removes physical reserved stock but does not create another sale.
7. Admin diversion from pre-sale to a third party decreases reserved/sold pre-sale allocation, increases quantity owed on the original contract, and creates third-party sale at its separately entered price. Future grading of contracted field replenishes that obligation first, *from the newly graded batch*.
8. Unallocated outgoing D-Notes are already physically dispatched: explicitly warn that unallocated stock makes field balances provisional.
9. Corrections must be audited; no silent rewrites of later FIFO movements or double counting of sales.
10. Report cells draw from the backend ledger; separate grading waste cannot be inferred without recorded waste transactions.

## Actual historical verification: TRIBE

Two outstanding D-Notes have been reconciled from the user's explicitly supplied price list on 20 Nov 2026; this is a **user-supplied price backfill**, not recovery of previously persisted prices.

| D-Note | Date of weighing | Large | Medium | Small | Chats | Pockets | Value |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 06/18 | 14/11/2026 | 90 | 150 | 800 | 160 | 1,200 | $2,645.00 |
| 06/19 | 15/11/2026 | 200 | 340 | 500 | 160 | 1,200 | $3,150.00 |
| Total | | 290 | 490 | 1,300 | 320 | 2,400 | **$5,795.00** |

Applied prices: Large $4.00; Medium $3.50; S/Medium $2.50 (zero pockets); Small $2.00; Chats $1.00. Source field is HSCP4a (tracecode 550); TRIBE is the weighbridge customer. Historical grading and D-Notes must remain unchanged.

## Must-pass end-to-end checks

- New D-Note with zero-pocket sizes prices only positive sizes; save → reload → Transaction Report displays exact value.
- 06/18 and 06/19 total $5,795, with both appearing under TRIBE and field HSCP4a (not $0).
- Grading: 8 posted batches = 12,237 pockets; one void batch remains excluded; all retain tracecode 550.
- Field Report follows the original Excel cell mapping, row positions, headers, size sequence, and formulas above.
- 500 Large pre-sale at $5; grade/reserve 300; divert 150 at $7; outstanding increases 150; no double revenue on collection; later grading replenishes.
- Normal FIFO and pre-sale allocations cannot consume the same pocket; two stock pools never become negative.
- All save actions verify persisted state; errors preserve input and do not claim success.
