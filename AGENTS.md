# JSPL Farm Management UI Standards

All new or updated UI must follow the JSPL design system in `constants/jspl-design.ts` and use reusable UI primitives from `components/jspl/` when appropriate.

## Required conventions
- Preserve existing business logic, routing, Supabase queries, database schemas and permissions when modifying presentation.
- Use a clean light workspace and dark green navigation. Do not introduce individual feature-specific palettes.
- Never improvise font sizes, field heights, button heights, border radii or spacing. Use the exported design tokens.
- Labels and free-text values align left; quantities, rates, weights, volumes and currency align right with tabular digits; dates and statuses align centre in tables.
- Use consistent column widths and header/body alignment; horizontal scrolling is acceptable on narrow screens rather than compressing values into illegibility.
- Display numeric values with an explicit unit and agreed decimal precision. Store and calculate from raw numbers, not formatted display strings.
- Display dates as DD/MM/YYYY, accept D/M as day/month in the current year where applicable, and preserve ISO YYYY-MM-DD for data transfer.
- Prefer accessible input labels and minimum 44 px touch targets. Never truncate numbers silently.
- Check desktop web and mobile widths and verify long labels, empty states, loading states and error messages.
- Reuse the JSPL form, table, dashboard, master-detail and planning-grid patterns rather than hand-positioning individual elements.
- Avoid adding another UI framework before verifying compatibility with Expo / React Native Web.
