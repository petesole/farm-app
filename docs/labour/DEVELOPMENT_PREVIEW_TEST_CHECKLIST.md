# JSPL Labour — Development Preview Acceptance Test
04/11/2026

**DO NOT PUBLISH OR MERGE THIS BRANCH YET.** The Expo development branch connects to shared FarmingMain Supabase. Labour Entry is protected by the temporary `LABOUR_DEVELOPMENT_PREVIEW_ONLY=true` guard, which simulates Final Save locally without any database write. That guard MUST be reviewed before eventual release.

## Preconditions
- Open the app built from GitHub branch `development`, **not main/production**.
- Log in as an Admin and open Main Dashboard → Labour.
- The screen must display `DEVELOPMENT PREVIEW — NO LABOUR DATA WILL BE SAVED`.
- Use the historical dates for read-only report verification. For the **entry simulation**, use a date that has no Access Labour history and no previously submitted Labour day. The demo date is never stored.

## Labour entry preview (no database writes)
1. Verify JSPL logo top right, green theme, Back to Dashboard and dd/mm/yyyy.
2. Enter a valid unsaved date; confirm the line editor appears.
3. Select an active Trace (incl. one with no crop where applicable); select an Activity from the Access numeric-ID master; enter Labour Qty, Kgs when relevant, Unit Cost.
4. Add two or more lines to the unsaved list. Confirm totals, remove/edit before Final Save (editing an already-added line is still limited to remove-and-readd and needs review for Access parity).
5. Press **Simulate Final Save (No Database Write)**. Confirm the date becomes read-only, previous lines display, and a clear warning says nothing was saved.
6. Reload Development preview and confirm the simulated lines are gone. The same unsaved date is available again; this proves no database persistence, not the database permissions.
7. Enter a date used in historical Access Labour, e.g. 07/03/2026; confirm it is locked before entry.

## History and Reports (read only)
8. Open Labour Input History. Search `07/03/2026`; confirm the Access records are visible and there are no **Correct** buttons on Access archive rows.
9. Open Daily Report for `07/03/2026` and compare with the actual Access printout.
10. Choose Weekly, check both recent and oldest entries in the week dropdown (all 150 distinct historical weeks must be available).
11. AO Weekly: compare `26/33` USD 854, `26/40` USD 977, `26/44` USD 348, `26/45` USD 836 with the original Access report.
12. Desktop browser: try Print Preview and Excel CSV; check dates, headings, grouping, subtotals and page breaks against original Access printouts.
13. Open Current/Previous Week Summaries and validate grouped daily and activity totals.

## Database tests already completed
- In rolled-back SQL transactions: multi-line atomic Save; duplicate saved-date rejection; historical Access date lock; Admin UPDATE, INSERT and DELETE audit.
- Latest database check: 0 `labour_v2_transaction`, 0 `labour_v2_day`, 0 `labour_v2_correction_audit` rows; all 21,610 imported Access historical records preserved.
- One issue found and corrected during Development review: the weekly dropdown had limited to 5,000 of 7,498 grouped records. It now reads 150 unique week options.

## Outstanding acceptance
- **Running browser/mobile Expo build has not been independently tested from this environment**; GitHub code and SQL results are not a substitute.
- Budget vs Actual and Access print-layout parity need finishing/verification.
- The Admin correction UI on actual new app records cannot be safely E2E-tested on the shared database without an isolated Supabase test project. The backend correction function has passed rollback-only tests.
- Historical Access records with no valid field map remain in the immutable archive; do not silently remap them.
- Don't merge or publish until runtime tests and all report parity checks pass.
