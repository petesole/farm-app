# Labour V2 — implementation checkpoint (04/11/2026)

## Code scope
- Repository: `petesole/farm-app`; changes committed only to branch `development`, not `main`.
- `app/(tabs)/labour.tsx`: Access-style daily date, multiple unsaved lines, one final submit, immutable saved date, historical Access date check, and module links.
- `app/labour-history.tsx`: separate historical input register; Admin correction UI for newly submitted app records, including update, insert missing line, delete with mandatory reason. Original Access history remains an immutable archive.
- `app/labour-reports.tsx`: Daily, Weekly and Agri Orange Weekly read-only report selectors; desktop print preview and Excel-compatible CSV export through `lib/labour-report-export.ts`.
- `app/labour-summary.tsx`: current/previous week daily cost and job quantity summaries.

## Supabase
- Shared FarmingMain database, **not** isolated dev project. Existing unrelated modules unchanged.
- `labour_v2_day` unique date header; `labour_v2_submit_day` atomic multi-line submission.
- `labour_v2_is_date_locked` includes original Access historical dates and newly submitted dates.
- `labour_v2_admin_correct` guarded by actual authenticated admin role and audited in `labour_v2_correction_audit`.
- Authenticated users cannot INSERT, UPDATE or DELETE `labour_v2_transaction` directly. `anon` cannot invoke submit/correction/date-lock functions.
- Read-only reporting views: `labour_v2_report_rows`, `labour_v2_weekly_report`, `labour_v2_weekly_ao_report`, `labour_v2_daily_summary`, `labour_v2_job_summary`.
- Original no-crop support-centre labels recovered using AFQ and known Access crop references; 0 mapped report rows have temporary unknown labels.
- All original 21,610 Access Labour entries preserved. 31 Access historical entries have missing Trace mapping and are not silently reassigned; 2,742 general/no-Trace historical entries preserved in source but excluded by the Access-style FieldQ report join.

## Transaction-safe tests (rolled back)
- Atomic submission of two lines, then second submission of same date rejected.
- Admin correction UPDATE, INSERT, DELETE with audit records checked.
- Original Access historical date rejected as already locked.
- 0 test rows left in live Labour transactions, saved dates and corrections.
- 13 historical weekly calculations compared to source values; four AO weekly totals: 26/33 $854, 26/40 $977, 26/44 $348, 26/45 $836.
- Historical daily samples and source formulas also checked.

## Outstanding — do not publish as Access-identical yet
1. Actual Expo/React Native runtime, build/lint and authenticated user role testing have **not** been performed. Validate UX, navigation, RPC type definitions, and desktop browser print/CSV.
2. Compare real printed Access Daily/Weekly/AO reports against browser print outputs: page layout, grouping/subtotals, week headings, cost per hectare. The new print layout is not yet certified as visually identical.
3. Access budget-vs-actual screens/queries not yet rebuilt. Historical Access data is available to implement them.
4. Admin correction of already imported original Access archive needs an explicit safe override/overlay if required. Currently only newly submitted App rows can be corrected from the UI.
5. Exact current/previous-week labels need year-boundary and local-device-timezone testing.
6. Resolve 31 unmapped Access Trace histories separately. Historical archive remains unchanged.

**No live Labour transactions or test submissions were retained.**
