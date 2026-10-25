# JSPL Farm App — Development Agent Policy

Applies to **all modules and all branches**, including production, development and Stock V2.

## Master data and new records
1. Every new Add/Create feature must be paired with a working list/table view that displays the saved record immediately, without requiring a browser reload.
2. After successful insert/update/delete/activation, refresh or invalidate the relevant list data. In Expo Router/React Navigation, reload on screen focus (for example `useFocusEffect`) when users return from detail forms. Don't rely solely on a component's first mount.
3. Include active/inactive status in master-data lists where applicable. New records must appear under the correct active filter; never silently hide successful saves.
4. Verify the full flow: create → save → return → visible in list → edit → save → updated in list. Include any filtering, sorting and error states in that verification.
5. Do not report success until the backend confirms the write. Handle errors visibly.

## Navigation
1. Every new screen must expose a clearly labelled **Back** action to its own module's parent/home screen or list, in addition to any global Main navigation.
2. Detail/add/edit screens return to their parent list; module lists return to the relevant module Control Panel/home, not an unrelated screen.
3. Avoid duplicate active/legacy routes and broken back navigation. Verify the route actually resolves.

## Delivery/checklist
- Check create, update, list refresh, active/inactive visibility, filters, and parent-screen navigation before calling work complete.
- Apply this policy whenever building or modifying screens, not only when explicitly reminded.
- Preserve existing data and business logic; don't introduce unnecessary production schema changes.
- If testing cannot be completed, say precisely what remains unverified.

This document is a standing instruction for repository coding agents and maintainers.
