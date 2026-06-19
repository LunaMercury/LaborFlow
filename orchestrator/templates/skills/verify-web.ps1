$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for WEB" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repoRoot "web"
if (-not (Test-Path $webRoot)) {
    Write-Host "Skipping WEB verification because web/ does not exist." -ForegroundColor DarkYellow
    exit 0
}

Set-Location -Path $webRoot
$npmCmd = "C:\Program Files\nodejs\npm.cmd"

if (-not (Test-Path "node_modules")) {
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

& $npmCmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

Write-Host "WEB Verification Completed Successfully" -ForegroundColor Green

