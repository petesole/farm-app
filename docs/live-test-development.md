# JSPL FarmingMainLive: development and publishing

## Permanent branches
- `main`: published production only. Do not develop or experiment here.
- `dev`: all ongoing module development (Weighbridge, Cashbook, Stock V2, and other modules).
- Existing feature branches are backups/integration sources until merged; do not delete prematurely.

## Windows setup (run once in FarmingMainLive)
```powershell
cd "C:\Users\Pete Sole\Documents\FarmingMainLive"
git fetch origin
git worktree add -b dev-local "..\FarmingMainDev" origin/dev
```
The command above creates a local tracking *branch* named dev-local. For the simpler exact `dev` branch, use:
```powershell
git worktree remove "..\FarmingMainDev"
git branch -D dev-local
git worktree add -b dev "..\FarmingMainDev" origin/dev
```
If `dev` already exists locally, instead run `git worktree add "..\FarmingMainDev" dev`. Do not use `git worktree add -f` to override an occupied directory.

## Required isolated database
The `dev` source refuses to start unless `FarmingMainDev/.env.local` contains TEST Supabase credentials. It also rejects the current production project ID. The user must provision a *separate Supabase test project*, migrate the necessary schema, and seed safe test data before running `dev`. This is deliberate fail-closed protection.

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-TEST-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-TEST-PUBLISHABLE-KEY
```
Do not commit .env.local. Test deployments must use test credentials. Never copy production service-role credentials into the web app.

## Local app
```powershell
cd "C:\Users\Pete Sole\Documents\FarmingMainDev"
npm install
npx expo start --web --port 8082 --clear
```
Changes made in the development folder should be committed and pushed to `dev`.

## Publish
1. Confirm the dev branch builds, and test app workflows and database migrations.
2. Ensure unfinished modules are deliberately excluded from a release, not just hidden in the UI.
3. Open and review a pull request `dev` -> `main`; merge only when the whole dev branch is ready. Otherwise selectively cherry-pick approved commits.
4. In FarmingMainLive: `git pull --ff-only origin main`; `npx expo export --platform web`; `npx eas-cli@latest deploy --prod`.
5. Production always uses existing production credentials from main, and must not automatically pick up dev's test values.

## Preview site
Preview Expo hosting must use TEST database credentials. Do not deploy dev to production. Verify EAS Hosting preview's assigned URL before distributing it; publishing preview is a separate step.

## Existing Stock V2
The existing Stock V2 branch diverges significantly from main, including changes to shared weighbridge and navigation files. A draft PR tracks reconciliation. Do not merge the old branch wholesale without resolving conflicts and testing the recent production functions.
