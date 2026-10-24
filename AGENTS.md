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

## Approved JSPL theme and navigation standards
- JSPL's approved default is a professional agricultural interface with **dark forest-green sidebar/header navigation, white and very-light-grey content surfaces, restrained green highlights, clean typography, and consistent buttons/forms/tables**. Use tokens from `constants/jspl-design.ts`, not ad-hoc screen CSS.
- A **dashboard** is a navigational home screen for its module by default: show clearly labelled, large, consistent **buttons/cards users can press to open the relevant screens**. KPI summaries can supplement navigation but must not replace the navigation buttons. Only build a different dashboard flow if explicitly requested.
- After a **successful creation or save** in a data-entry screen, default to **navigate back to that module's dashboard**. Do not navigate on failed validation, Supabase error, or pending save. Keep the save feedback meaningful. If the user explicitly requests "save and add another", staying on the screen, returning to a list, or another destination, honour that instead.
- Each module must explicitly identify its correct dashboard route. **Never guess a route or alter save navigation in an existing screen without verifying its workflow**, because some existing flows require consecutive operations.
- Existing screens are **not automatically restyled or rerouted** by this policy. Apply design and navigation updates incrementally, validate web and mobile layouts, and do not change data rules, relationships, database actions or security policies.

## Layout verification for Stock V2 and Cashbook
- When changing forms, check labels, inputs, and adjacent controls do not overlap or crowd each other.
- Use explicit field groups with predictable spacing and responsive wrapping for desktop and narrow viewports.
- Keep related actions (for example, refresh of available purchase orders) beside their corresponding section heading where space permits.
- Do not claim a layout is visually verified without rendering and inspecting the screen; report code-only checks separately.
