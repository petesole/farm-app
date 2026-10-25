# Local integration test preflight. NEVER points at FarmingMain.
# Run from repository root in PowerShell.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required.' }
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) { throw 'Supabase CLI is required.' }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'PostgreSQL psql client is required.' }
docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop.' }
if (-not (Test-Path 'supabase/config.toml')) { throw 'Run from repository root.' }
Write-Host 'Starting LOCAL JSPL GRV sandbox...' -ForegroundColor Cyan
supabase start
if ($LASTEXITCODE -ne 0) { throw 'Local Supabase failed to start.' }
Write-Host 'Local environment ready. Restore the reviewed stock_v2 DEMO schema/fixtures before running the bridge test.' -ForegroundColor Yellow
Write-Host 'Test file: supabase/tests/combined_grv_real_engine_rollback.sql'
Write-Host 'Do NOT point psql at FarmingMain. Run only with an explicitly checked localhost:55422 connection.'
