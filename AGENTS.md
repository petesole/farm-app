# JSPL Farm Management UI Standards

All new or updated UI must follow `constants/jspl-design.ts`, `utils/jspl-input.ts` and reusable components in `components/jspl/`.

## Required conventions
- Preserve business logic, existing Supabase database schemas, permissions, queries and routing when changing presentation.
- Use light workspaces, dark green navigation and central design tokens. Never improvise colours, sizes, spacing, column widths or form control dimensions.
- Text left; numeric quantities, rates, weights and currency right with tabular digits; date, status and action table columns centred.
- Standard date **display and manual input** is **DD/MM/YYYY** throughout the application. Accept D/M or DD/MM and expand to the **current calendar year on input commit** (e.g. 01/01 -> 01/01/2026 in 2026). Validate actual calendar dates. Existing explicit 4-digit years must be retained. Do not infer crop-season years. Persist ISO YYYY-MM-DD to APIs and Supabase; never alter historical database dates.
- Any new crop filter defaults to **active crops only**; any trace-code filter defaults to **active trace codes only**. An explicit user option/requirement may include inactive records. Determine the actual active field and its truth mapping from the existing schema; don't guess property names.
- Crop, trace-code and product selectors must be **searchable combo boxes**, with a visible result list as users type. Filter **case-insensitive from the beginning** of the option label (typing A shows options starting A), with an optional explicit mode for other matching behaviour. Product list defaults to all available products unless the screen specifies another product status rule. User should be able to type, choose one item, clear and use keyboard/touch; don't silently select the first match.
- Use a single shared combo component and filtering helpers. If option names are duplicated, use stable IDs as values.
- Check desktop and mobile widths, long names, loading/empty lists and disabled states. Do not silently truncate numeric values.
- Reuse the JSPL form, table, dashboard, master-detail and planning-grid patterns. No new styling frameworks unless confirmed compatible with Expo / React Native Web.
