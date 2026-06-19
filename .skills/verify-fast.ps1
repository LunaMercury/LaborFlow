$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for BACKEND-FAST" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$fastRoot = Join-Path $repoRoot "backend-fast"
if (-not (Test-Path $fastRoot)) {
    Write-Host "Skipping BACKEND-FAST verification because backend-fast/ does not exist." -ForegroundColor DarkYellow
    exit 0
}

Set-Location -Path $fastRoot
cargo check
if ($LASTEXITCODE -ne 0) { throw "cargo check failed" }

Write-Host "BACKEND-FAST Verification Completed Successfully" -ForegroundColor Green

