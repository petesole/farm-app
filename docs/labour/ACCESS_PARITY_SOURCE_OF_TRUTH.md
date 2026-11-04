# JSPL Labour V2 — authoritative Access parity rules

**Last checked: 04/11/2026**. Primary reference: the original uploaded `FE.zip` Access front-end export. Access forms and query names below are verified against it. Do not invent alternative workflows. This file supersedes earlier draft screen maps when they disagree.

## Labour Main — actual Access LabourMainF
`Labour Form` is a **heading**, not a sixth button. There are exactly five button actions:
- `Labour Input` → `LabourF` (new app `/labour-entry`).
- `Daily Report` → `DailyLabourSearchF` → `LabourDailyR`.
- `Weekly Report` → `WeeklyLabourSearchF` → `LabourWeeklyR`.
- `Input History` → `LabourInputF` (historical register).
- `AO Weekly` → `WeeklyLabourSearchAOF` → `LabourWeeklyAOR`.

The dashboard embeds current-week and previous-week cost/job summaries.
**Navigation:** Labour Main has the single Back to Main Dashboard control. Each sub-screen has only one Back to Labour Main control. Do not add duplicate Main controls.

## Labour entry — LabourF / LabourSubform
LabourDateT header; multiple LabourT lines. Access columns: Trace Code, Labour Activity, Labour Qty, Kgs, Unit Cost. Activity is stored by numeric ID. Choose an active Trace and actual Access Activity. Date format dd/mm/yyyy. User rule established in conversation: once Labour Inputter saves a day, they cannot add/change/delete **any** lines on that day. Admin-only corrections are audited.
Development UI includes a no-write simulated Final Save because the Development branch still points to shared FarmingMain Supabase.
For unsaved lines, edit/delete is available before final save.

## Input History — LabourInputF / LabourInputQ
Show original columns: ID, Date, Field, Crop, Labour Activity, Qty, Kgs, Unit Cost, ordered by LabourID descending. Access historical entries are read-only.

## Daily — LabourDailyR / LabourDailyQ
Select **existing date** descending; Open Report; **Print Preview**.
Columns: Field, Crop, LabourActivity, Qty, Kgs, Unit, Value. Report grouped by **Farm**, then Trace, with farm and grand totals.
Access DAILY farm rule is `Florinova` when FarmName exactly Florinova, otherwise `Heyshott`. **Do not use AO farm classification for Daily.**

## Weekly — LabourWeeklyR / LabourWeeklyQ
Select existing `yy/ww` week; Open Report; **Print and Excel** controls. Group by Farm then Trace and Activity, with totals. Columns: Field, Crop, Activity, Labour Qty, Kgs, Unit Cost, Kgs/Person, Value. Group by unit cost; preserve the Date+1 Access week convention and `24/53`→`25/01` special case. For Kgs activities `Value = Kgs * Unit Cost`; otherwise `Qty * Unit Cost`.

## AO Weekly — LabourWeeklyAOR / LabourWeeklyAOQ
Same as Weekly but include only farm `AgriOrange`. Access AO rule: `FieldQ.AO=1 AND LabourActivityT.NotAO IS NULL`; a nonnull false is not equivalent to null. The other farm categories revert to Florinova / Heyshott.

## Printing and Excel
The **Print** and **Excel** buttons belong beside the selected report controls, not buried below data. Current browser Excel export creates an Excel-compatible **CSV**, not a native XLSX; do not claim otherwise. The final print layout still requires visual comparison with an Access report.

## Safety / sign-off
- Do not edit, merge or publish production.
- Never retain fake Labour transactions in FarmingMain. The code's Development preview explicitly blocks submit writes.
- The reports use 21,610 historical Access records as source, but some Access FieldQ joins exclude general/unmapped historical records; keep exclusions visible for reconciliation.
- Previous SQL rollback tests verified submitted-date locking and audited corrections; actual Expo browser and print/Excel UI are not yet independently end-to-end verified.
- Require Labour TypeScript gate and Expo Web Export success before user testing.
