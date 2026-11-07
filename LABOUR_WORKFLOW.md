# JSPL Labour V2 workflow

This is the shared workflow specification for Labour V2 on `development`. Business rules come from the [verified Access parity specification](docs/labour/ACCESS_PARITY_SOURCE_OF_TRUTH.md), based on the Access `FE.zip` export. The [compulsory JSPL rules](AGENTS.md) govern the interface, saves and verification. The [implementation checkpoint](docs/labour/IMPLEMENTATION_CHECKPOINT_20261104.md) and [parity test results](docs/labour/ACCESS_PARITY_TEST_RESULTS.md) record evidence and gaps. Where older preview notes show a right-hand logo or CSV, use the shared header and the current native XLSX requirement.

## Provisional responsibilities

| Responsibility | Proposed assignment and access |
| --- | --- |
| Daily capture | Labour Inputter verifies the work date and source figures, drafts and checks the lines, then submits the full day. After submission the inputter can review authorised records, with no ability to add, edit or delete lines for that day. |
| Corrections | Authorised Admin investigates discrepancies, records the reason and corrects submitted app records through Input History. The Admin checks the revised totals and audit trail. |
| Report review | Designated supervisor or management reviewer checks daily quantities and weekly costs, including Agri Orange. View, print and export access follow the approved reporting scope. |
| Business sign-off | JSPL confirms named staff, reporting and cost visibility, any approval handoffs, exception owners and final Access reconciliation. |

These assignments are provisional. The verified inputter lock and Admin-only correction rule apply independently of the final staff assignments. Enforce permissions at both the UI and data boundary. Test unauthenticated and out-of-scope users, including direct route and data-operation attempts. This workflow introduces no mandatory approval stage.

## Navigation and interface

Main Dashboard → Labour dashboard → working screen. Access `LabourMainF` has five actions: **Labour Input**, **Daily Report**, **Weekly Report**, **Input History** and **AO Weekly**. Labour Form is a heading. Embed current- and previous-week cost and job summaries in the dashboard, using the same week and costing rules as the reports.

Use shared dark-green JSPL styling, white working surfaces and a single header row with the logo at top-left, heading and one return control at top-right. Use **Back to Main** on the Labour dashboard, **Back to Labour** on its working screens, **Back to Labour Form** in the unsaved-line editor and return from corrections to the parent Input History list. Keep the selected history context when returning. Check for duplicate headers, legacy routes, bottom tabs and clipping at desktop and mobile widths.

Use searchable selectors. Each dependent filter offers choices present under all other active filters, with invalid choices cleared or repaired when selections change. Default to active master records for entry and retain authorised historical access. Display dates as `dd/mm/yyyy`. Accept `2/2` as 2 February in the current local year, validate real dates and persist a date-only value without UTC day shifts. Show business identifiers in the UI. The historical ID is the Access LabourID, not an internal UUID.

## Capture and submit a day

1. The Labour Inputter opens Labour Input (`LabourF` / `LabourSubform`) and enters the date the work occurred. If the date exists in Access history or has already been submitted in the app, show it read-only.
2. For a new date, build one draft day with multiple lines. Select an active, applicable Trace and an actual Access activity using its numeric ID. Capture Labour Qty, optional Kgs and Unit Cost. Include legitimate support cost centres where applicable. Confirm exact activity filtering and general/COS trace behaviour against Access before sign-off.
3. Review the lines and totals. Add, edit or remove draft lines without losing the other lines or the selected date. Cancel or leave with an explicit choice before discarding an unsaved draft.
4. Final Save submits the entire day atomically. Revalidate the date and lines at submission. The date lock covers concurrent submissions, retries and historical dates. A rejected submission creates neither a partial day nor stray lines.
5. After confirmed success, return to Labour and refresh the affected history, reports and summaries. The day is immediately visible and read-only to the inputter. On rejection or timeout, stay on the form with the draft intact. For an uncertain result, verify whether the day persisted before offering a retry.

On the current shared FarmingMain connection, retain the development preview guard and simulate Final Save locally with a clear no-write notice. Reloading must clear the simulated submission. Use an authorised isolated environment for persistent save and correction acceptance tests.

## History and corrections

Input History (`LabourInputF` / `LabourInputQ`) shows ID, Date, Field, Crop, Labour Activity, Qty, Kgs and Unit Cost, in descending LabourID order for Access rows. Distinguish original Access archive rows from newly submitted app rows. Preserve the archive as read-only, including rows without a report mapping.

From the history register an authorised Admin can open a separate correction screen for a submitted app day, amend a line, insert a missing line or remove an incorrect line. Require a reason and retain the affected day and line, action, before and after values, actor and timestamp. Apply the correction and audit together. Keep the date locked. After confirmed success, refresh History and the affected report groups and summaries. If rejected or uncertain, preserve the correction input and verify the result before retrying. Any correction to imported Access history requires a separately agreed overlay with reconciliation.

## Reports and costing

| Report | Selection and output | Parity rules |
| --- | --- | --- |
| Daily | Existing work dates, newest first. Open Report and Print Preview. | Field, Crop, Activity, Qty, Kgs, Unit and Value. Group by Farm then Trace, with farm and grand totals. Farm is Florinova only when FarmName is exactly Florinova, otherwise Heyshott. AO status has no effect on Daily. |
| Weekly | Existing Access `yy/ww` weeks. Open Report, Print and native Excel `.xlsx`. | Field, Crop, Activity, Labour Qty, Kgs, Unit Cost, Kgs/Person and Value. Group by Farm, Trace and Activity, keeping distinct unit costs separate. Show group and report totals. |
| AO Weekly | Same controls and output as Weekly. | Include only AgriOrange rows. Classify as AgriOrange when `FieldQ.AO = 1` and `LabourActivityT.NotAO IS NULL`. False is a non-null value and fails the test. Other Weekly rows fall back to Florinova or Heyshott. |

Place Print and Excel next to the report selectors. Include all applicable dates and weeks across pagination. Preserve the Access week convention of work date + 1 day with Sunday-first week numbering, including the `24/53` → `25/01` exception. Use local work dates and the same convention in current and previous summaries.

For kg-measured activities, line value is Kgs × Unit Cost. Otherwise it is Qty × Unit Cost. Use the recorded historical unit cost, with no substitution of current rates. Preserve blank Kgs and verify its value and display against Access, with no fallback to quantity costing. Sum line values, retain separate rate groups, and verify rounding, Kgs/Person including zero-quantity handling, and cost/ha where shown against Access. Screen, print and Excel must reconcile to the same filtered rows, corrections and totals.

Reconcile reports against the 21,610-row source archive. Keep FieldQ join exclusions visible in the reconciliation, including the checkpoint's 2,742 general/no-Trace rows and 31 missing Trace mappings. Preserve valid support cost centres and their verified Access labels. Confirm the mapping and exclusion counts against the test snapshot before sign-off. Budget vs Actual, archive corrections and any Pastel integration require separately agreed scope.

## Test plan and acceptance

| Check | Evidence required |
| --- | --- |
| Build and interface | Run the source contract check, TypeScript, Expo web build and Playwright per [local testing](docs/LABOUR_LOCAL_TESTING.md). Inspect rendered desktop and mobile views, capture screenshots and check navigation, selector dependencies, sorting and draft retention. |
| Preview safety | Simulate a multi-line day and test reload, historical locking and correction guard. Verify no preview rows persist in shared FarmingMain. |
| Daily transaction | In an approved isolated environment, exercise multi-line draft/edit/remove, confirmed save, immediate list visibility, reload, existing dates, concurrent duplicate submissions, partial failure and uncertain save recovery. Verify date locking and permission denials with actual roles. |
| Corrections | In isolation, exercise Admin amend, insert and remove with reasons, audit and refreshed totals. Check rejection and retry behaviour, non-Admin denial and archive immutability. |
| Historical parity | Repeat the daily and weekly fixtures in the parity test results. Include blank Kgs, different rates, support centres, unmapped traces, both NotAO null and false, and `24/53` → `25/01`. Verify AO weeks `26/33` USD 854, `26/40` USD 977, `26/44` USD 348 and `26/45` USD 836. Check date shorthand, invalid dates and local-time/year boundaries. |
| Outputs | Compare real Access and browser print layouts for Daily, Weekly and AO Weekly, including headings, grouping, subtotals and page breaks. Download and open the weekly XLSX files and reconcile rows and totals to screen and print. |

Record the tested commit, environment, roles, fixtures, screenshots or report comparisons, and pass/fail/unverified results. Existing rollback SQL checks and historical totals are prior evidence. Release acceptance requires passing rendered and role-based workflow tests, reconciled outputs and JSPL confirmation of provisional responsibilities and outstanding Access decisions. Review preview safety and obtain release approval before enabling live writes, merging or publishing.

## Working with local Codex

Use this file and `AGENTS.md` for future Labour changes. Keep local Expo testing in the development checkout and preserve staged and unstaged work. Share the reviewed commit and test evidence through GitHub. If local development and GitHub have diverged, inspect both histories and preserve the local changes before integrating the documentation commit. This specification change is documentation-only.
