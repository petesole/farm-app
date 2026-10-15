# Weighbridge design foundation — review draft

This is a **design branch, not installed Supabase schema**. Do not run the SQL until permissions, transactional posting, validation and live schema checks are complete.

## Confirmed operating process
- Two farm weighings (tare, then loaded gross); each completed farm movement produces a unique farm WB slip.
- Farm movements: field → customer; field → bulk farm stock; bulk farm stock → customer; customer return (new WB slip linked to original dispatch).
- No storage-location tracking. Stock is derived from confirmed movements, not manually overwritten.
- Harvest selection: enabled crop/season in `wb_harvest_control`, and the existing tracecode's start/end dates, determined as of slip date. Closed tracecodes remain readable/editable on historical slips.
- Seed maize on-cob estimates use **60%** shelling factor; keep original measured mass and estimated grain equivalent separate.
- Crop moisture correction requires review of legacy Access formula and configurable rules.
- Wheat grades: Premium, B1, B2, B3, UG; normally one grade per received load.
- Farm WB, receiving WB, GRV are **three** document types; **no D Note**.
- Customer may accept only part of a load. Rejected grain returns on its own new farm WB slip. Never count return as new harvest.
- Report transporter departure-to-receipt differences independently from rejected/returned tonnage. Flag significant variance for review without suggesting guilt.
- Scans first, with human verification; original documents retained in a **private** bucket.
- Select any combination of available WB/receiving WB/GRV documents across multiple loads for Gmail dispatch. Track actual Gmail IDs, sent time, recipients and exact document versions; mark sent only after the provider confirms.

## Live rollout gates (not yet completed)
1. Confirm existing Supabase `crop`, `season`, `tracecode` column types and indexes.
2. Review any prior weighbridge tables/migrations and reconcile naming.
3. Implement authenticated RLS, private storage bucket policy, and user roles.
4. Implement atomic save/confirm transaction: validate gross >= tare, nonnegative net, movements, eligible harvest crop, allocation sum = net (or explicit tolerance), return linkage, duplicate numbers, stock availability.
5. Reconcile mass units and conversion: on-cob factor, moisture, raw weight, field-equivalent, stock movements and GRV.
6. Build scan/review, open weighing, delivery receipt, return, stock and document email screens.
7. Test direct 30t load, 20t accepted + 10t returned, split field loads, mixed bulk-stock dispatch, stale/closed tracecodes, duplicate scans and Gmail send retries.

## Why draft only
The proposed SQL presently illustrates relationships but **does not yet enforce all posting invariants**. Running it early could create tables whose permissions or validations are incomplete.
