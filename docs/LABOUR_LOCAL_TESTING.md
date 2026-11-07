# JSPL Labour V2 — Local Codex / Expo test workflow

Use the `development` worktree. Do not edit or deploy `main`. Do not modify Supabase or production records. `supabase.ts` targets the shared FarmingMain project.

## Local setup (Windows PowerShell)
```powershell
cd "C:\Users\Pete Sole\Documents\FarmingMainDev"
git status
git pull origin development
npm ci
node scripts/check-labour-ui.mjs
npx tsc --noEmit
npm run build:web
```

## Rendered web validation

Install Playwright locally if it is not installed:
```powershell
npm install --save-dev @playwright/test
npx playwright install chromium
npx playwright test --project=chromium
```

The unauthenticated login smoke test runs without secrets. For read-only, authenticated Labour UI tests, use a **dedicated test account** with Labour access, and set the credentials locally as environment variables (never commit them):
```powershell
$env:LABOUR_TEST_EMAIL="test-account-email"
$env:LABOUR_TEST_PASSWORD="test-account-password"
npx playwright test --project=chromium --headed
```

The Playwright webServer automatically runs Expo on port 19006, or point `EXPO_TEST_URL` to an already running Expo web app. If the local app or backend cannot be accessed, state the blockage; do not claim that visual or end-to-end tests passed.

## Critical rules
- One shared header on every Labour screen: logo at top-left, heading and return button in the **same row**, return button at top-right.
- Labour dashboard: Back to Main. Labour subpages: Back to Labour. Unsaved-line editor: Back to Labour Form.
- No global duplicate return bar, no bottom tab bar.
- Trace/activity dropdowns must be searchable, and available options must reflect applicable records.
- Date is dd/mm/yyyy; do not discard drafted labour lines.
- Current development Labour entry has `LABOUR_DEVELOPMENT_PREVIEW_ONLY = true`; **do not disable** while Supabase is shared. Never execute actual correction or save during UI testing.
- Verify each screen at normal desktop and mobile viewport widths with screenshots, and inspect actual rendered elements for overlap/clipping. Source checks are not a substitute for rendered inspection.

## Delivery
1. Run source contract check, TypeScript, web build and Playwright.
2. Capture screenshots/evidence and report failures.
3. Fix issues in the development worktree and rerun failed tests.
4. Summarise changed files, tests and unverified functionality; only then ask the user to review.
5. Do not merge or publish without explicit approval.
