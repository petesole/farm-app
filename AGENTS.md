# JSPL Farm ERP — Compulsory Development Agent Rules

**Authority and scope:** These rules apply to every module, screen, workflow, branch, and coding agent working on the JSPL Farm ERP (Expo/React Native/TypeScript and Supabase), including Stock V2, Labour V2, Fuel, Weighbridge, Irrigation, Trace, and future integrations. Follow them without repeated reminders. Preserve existing working business rules and data. Where an existing implementation conflicts, record the noncompliance and plan a safe correction; do not silently redesign it.

## 1. Agree the complete workflow before building

- If the user starts specifying individual screens or features before defining the complete business process, **stop implementation and establish the end-to-end workflow first**. Do not treat a collection of screen requests as a workflow.
- Map: transaction origin; who inputs each type of data; each user role and its view/edit/approval/report permissions; sequence and handoffs; statuses; exceptions; corrections, returns, cancellations, partial transactions and reversals; accounting/stock/cost consequences; and required reports, exports and reconciliation.
- Show the full workflow in plain operational language and agree it with the user before coding. Research and reuse proven ERP patterns and existing JSPL/Access workflows rather than inventing new ones.
- Fixes within an already agreed workflow may proceed after checking their effects on the entire process. Never invent a new business policy to solve a technical inconvenience.

## 2. Compulsory consistent user interface

- Use the established JSPL dark-green theme, white working surfaces and shared design tokens/components. Do not create independent colour schemes or layouts.
- Place the **JSPL logo at the top-left**. Use **one navigation control at the top-right**; do not duplicate Back/Main controls at the top, bottom, or in a global bar. Main dashboard contains module/project launch buttons.
- Main dashboard → module dashboard → individual screen. Show **Back to Main** on a module dashboard only for users whose assigned role has access to Main. Hide it for users assigned to a specific job or module, such as Labour Inputters. Working screens still have **Back to their module dashboard** (or the agreed parent list). Use at most one visible return control, with the correct destination. Avoid legacy/duplicate routes.
- **All filters use searchable combo boxes/dropdown selectors**, never a screenful of filter buttons, unless the user explicitly requests an exception. This includes filters for crop, trace, date, product, supplier, status, and other dimensions.
- **Dependent filters must reflect actual matching records under every other active selection.** Example: selecting a trace narrows dates to dates with records for that trace; selecting a date likewise narrows trace/product choices. No irrelevant or empty choices. Recompute and clear/repair invalid selections when upstream filters change.
- Default to active crops, traces and applicable master records, with clearly designated historical/inactive access when required. Sort intelligibly (A–Z for named options unless the workflow requires otherwise).
- Display dates as **dd/mm/yyyy** throughout. Accept shorthand such as `2/2` and interpret it as `02/02` in the current year; validate real calendar dates. Store database dates in appropriate native/ISO formats, and format only at UI boundaries.
- Show simple sequential business document numbers, not internal UUIDs/database IDs, except in explicitly technical admin diagnostics. Treat D-Note/reference numbers as **text**, never as dates.
- Keep screens uncluttered: no duplicated headings, duplicate navigation, redundant fields, or giant arrays of action buttons. Choose a clear separate edit window/screen where editing a document inline would confuse the transaction.

### Compulsory report controls

- Every new report must provide both **Print** and **Export to Excel (.xlsx)** beside the report controls.
- Make report table headers filterable with searchable selectors in the header area. Available choices must reflect matching rows under the other active filters.
- Display totals for the applicable measures above the table. Recalculate totals and any subtotals from the filtered rows whenever a filter changes. Print and Excel must use the same filtered rows and totals as the screen.
- Give every print preview a **Close** button that returns to the originating report with its filters preserved. Hide preview controls from the printed output.
- Verify that changing filters updates the table and totals, that print and Excel match the filtered report, and that closing print preview restores the report selections.

## 3. Data entry, saves and corrections

- Capture an operational fact once; reuse linked data across modules and future accounting integration. Never require the same information to be entered twice without a documented reason.
- After a **backend-confirmed successful save**, refresh affected lists/reports/balances and return to the agreed module home or parent list. The saved record must be visible immediately when that list opens, without browser refresh.
- On any failed, timed-out or **uncertain** save, **remain on the screen, preserve all input, and show a useful error/verification path**. Never claim success or navigate away on a timeout. Verify the persisted state before inviting a retry, to avoid duplicates.
- Create/edit screens and reports must support the whole lifecycle: create → save → show in list → edit → save → show updated value, plus cancellation, partial completion, corrections and error handling as applicable.
- Do not mutate posted/financially consequential documents in ways that erase their history. Use linked corrections, returns, credit notes, reversals, adjustments and audit trails; reconcile quantities, valuations, inventory and ownership.
- Protect historical data and traceable transaction-to-source-document relationships. Ensure reports reflect corrections and returns accurately.

## 4. Integrated ERP architecture

- Treat the app as **one integrated ERP**, not unrelated modules. Share master records, identifiers, business definitions and operational events across Stock, Labour, Fuel, Machinery, Trace, Crops, Weighbridge, Irrigation, Cashbook and Agri Orange.
- Preserve the existing Expo/React Native/TypeScript/Supabase architecture unless the user approves a change. Reuse shared JSPL components and existing reliable functionality before introducing new code.
- Pastel is the formal accounting ledger. Design integrations to eliminate duplicate entry while retaining auditability, separation of JSPL and Agri Orange transactions, and clear reconciliation. Do not implement an accounting integration before the workflow has been agreed.
- Apply role permissions consistently at UI and data boundaries. Never use a quick workaround that broadens access or exposes secrets.

## 5. Implementation safety and change discipline

- **Do not modify Expo, Supabase, production data, migrations, configuration or branches unless the user has authorised the relevant implementation.** A request for review or planning is read-only.
- Identify the actual target branch/environment and assess upstream/downstream impact before any change; never assume that a branch or shared Supabase project is isolated from production.
- Do not overwrite working code, delete user data, bypass protections, or silently change established rules. For proposed structural changes, state effects on existing transactions and deployment.
- Use development/test paths and reversible migrations where possible. Protect current production behaviour. Do not deploy or publish without instruction.
- Fix root causes rather than repeated patches. Use available existing tools, libraries and proven workflows where they shorten delivery and improve reliability.

## 6. Verification is mandatory

- Test complete transactions end-to-end with realistic data and the actual intended role: create; save; return; list visibility; edit; refresh; filtering; sorting; partial processing; exceptions; cancellation; corrections; reporting and exports.
- Check balances, totals, dates, ownership, audit records, related modules and regressions against other working screens.
- Test navigation on both web and intended mobile/offline contexts where applicable; check sync and conflict behaviour for offline workflows.
- Never describe a screen, workflow or module as **complete**, **working** or **tested** without the relevant test evidence. State precisely what was changed, tested, passed, failed, and remains unverified. Database table existence or code inspection alone is not a functional test.

## 7. Communication and acceptance criteria

- Keep responses direct, short and operational. Present the whole solution and important consequences rather than a stream of unplanned fixes.
- Do not repeatedly ask for information already provided or override agreed decisions.
- Before implementation, confirm the agreed workflow and acceptance criteria. After implementation, report exact changed files/modules, tests, unresolved problems and deployment status.
- A feature is finished only when it follows the agreed workflow, obeys shared interface rules, preserves data, handles exceptions, and passes relevant tests.

**Overriding principle:** Agree the whole business process first; reuse proven solutions; implement with one consistent JSPL interface; test the entire workflow; then release. Prioritise simplicity, reliability and fast operational use over repeated redesign.
