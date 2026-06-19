$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for WEB (React)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repoRoot "web"
if (-not (Test-Path $webRoot)) { throw "web/ does not exist." }

Set-Location -Path $webRoot
$npmCmd = "C:\Program Files\nodejs\npm.cmd"

if (-not (Test-Path "node_modules")) {
    Write-Host "Running npm install..." -ForegroundColor Yellow
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

Write-Host "Running TypeScript and Vite build..." -ForegroundColor Yellow
& $npmCmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

Write-Host "WEB Verification Completed Successfully" -ForegroundColor Green
