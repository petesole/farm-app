# Stock release to Main

Stock is available from Main Dashboard and `/stock`. Existing `/stock-test`
links remain valid. The release brings the reviewed stock workflows and
similar-active spray allocation onto the current main source, preserving
newer Labour, Rainfall, Trace and Weighbridge functionality.

Stock includes purchasing and approvals, receiving and invoice reconciliation,
balances and movement reports, adjustments, stocktakes, owner transfers,
supplier returns, issue/return workflows and spray planning. Similar-active
allocation retains separate owner balances, per-product stock-use choices,
explicit transfers, whole-area dose calculations and plain mix-sheet rows.

Stock-only accounts gain their existing server-assigned access after sign-in.
Main remains Admin-only. The original Labour-only route restriction is retained
and respects users who also have Stock access. No development role preview or
unfinished Sprayer phone entry is exposed by this browser release.

Shared navigation only exempts Stock pages, which already have their own return
control. Dashboard alert support and shared table/date additions retain existing
call signatures. Four existing Fuel/WB compilation problems receive narrow,
runtime-equivalent fixes; no inventory or matching policies change.

## Validation before publication

- 212 isolated PostgreSQL/handler/React report and workflow checks passed.
- Hosted-browser compatibility fixture passed without the staged phone schema.
- Full TypeScript check and Expo web export passed.
- Stock report quantities display three decimal places.
- Source comparison reviewed against deployed stock service version 84.
- Rollback service source captured before deployment.
- Hosted stock baseline: 77 documents, 440 movement lines, fingerprint
  `de7c6e12b29a8222195c5d5995850b60`.

Tests use synthetic local records and mocked authentication; no live operational
stock transactions are created for release testing. Production deployment and
post-publication observations are recorded separately after completion.

## Data limitations retained

The opening-stock import has 297 products. AO balances are calculated, with no
AO physical stocktake. Missing source units remain unconfirmed in master data;
no units or concentrations are invented. Opening valuation and intercompany
prices require confirmation; no assumed costs are introduced by this release.

No migration, stock reimport or reset is part of publication. The browser uses
the existing JWT-verified Stock service. The optional phone backend is retained
for its isolated tests but is not installed by this release.
