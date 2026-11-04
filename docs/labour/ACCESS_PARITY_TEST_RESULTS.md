# JSPL Labour V2 — Access parity testing (04/11/2026)

## Safety controls
- GitHub development branch only for Labour UI; no Expo main/production branch changes.
- FarmingMain Supabase project is **shared with the live app**, not a separate test project.
- The `labour_v2_day` table stores submitted dates, with a unique primary key on `labour_date`.
- `labour_v2_submit_day(date,jsonb)` submits all draft lines in one transaction; duplicates fail atomically.
- Direct INSERT on `labour_v2_transaction` is revoked from authenticated users. RLS UPDATE remains reserved for admin/manager.
- A two-line atomic submission and duplicate-date rejection were exercised in SQL with an explicit ROLLBACK. Post-test checks: **0** rows in `labour_v2_transaction`, **0** rows in `labour_v2_day`.
- No fake Labour data retained.

## Access historical read-only checks
Original exported Access CSVs (`LabourT`, `LabourDateT`, `LabourActivityT`, `AFQ`) used to independently compute expected quantities and costs. Compare against `labour_v2_access_history_costs`:
- Ten dates: 07/12/2024, 15/04/2025, 01/07/2025, 31/12/2025, 02/01/2026, 07/03/2026, 15/04/2026, 16/05/2026, 10/07/2026, 15/10/2026. All matched by row count, quantity, kg and cost.
- Thirteen week keys tested, including year-end `25/01`, match historical source calculations for counts, totals and AO amounts after including no-crop support cost centres.
- AO weekly values verified: `26/33` $854 (10 entries), `26/40` $977 (14), `26/44` $348 (7), `26/45` $836 (10).
- Week grouping mirrors Access: Date+1 day, Sunday-first week numbering, special `24/53` to `25/01`.
- `NotAO IS NULL` is deliberately distinct from False.
- `Kgs` remains optional for submission, matching the Access Save macro; 83 historical kg-measured activity rows have blank kgs.

## Read-only reporting views added
- `public.labour_v2_report_rows`: per-line values, source, week, Trace, cost per ha, AO farm classification.
- `public.labour_v2_weekly_report`: grouped by week, farm, crop, Trace, activity, **unit cost**; quantity, kilograms, cost and cost/ha.
- `public.labour_v2_weekly_ao_report`: AO subset of weekly report.
- All views use `security_invoker=true` and do not update source records.

## Remaining gaps before release / declaring Access-identical
1. **Report labels**: 4,014 Labour entries belong to legitimate support cost centres (Irrigation, Administration, Packshed etc.) but have null `tracecode.crop_id` in Supabase. These entries now remain included with the temporary visible label `Access crop not mapped`. Restore the original Access crop/category names from the complete Access CropT export or verified ID crosswalk without inventing names.
2. Complete the separate Input History screen and match printable Daily, Weekly and AO report layouts/Excel export to Access.
3. Implement a separate audited **Admin correction** workflow. Labour Inputter dates remain immutable after Final Save.
4. Test authenticated Labour Inputter and Admin sessions through Expo. Current DB transaction test proves atomic/unique-date behaviour, not a mobile E2E pass. There is currently no dedicated isolated Supabase test project; don't conduct persistent fake writes in FarmingMain.
5. Reconcile the 31 remaining missing Access Trace mappings; do not silently drop them from exception reporting.
6. Review Access-specific activity dropdown filtering, general/COS trace handling, page pagination and multi-day reports before claiming perfect UI parity.

## Code
- `app/(tabs)/labour.tsx` on GitHub branch `development`: one date header; multiple locally drafted lines; final atomic save; saved dates display read-only; Access IDs shown alongside Supabase IDs.
