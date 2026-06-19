$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for BACKEND-FAST" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$fastRoot = Join-Path $repoRoot "backend-fast"
if (-not (Test-Path $fastRoot)) { throw "backend-fast/ does not exist." }

Set-Location -Path $fastRoot
$env:CARGO_TARGET_DIR = "C:\Users\Public\Documents\ESTsoft\CreatorTemp\laborflow-cargo-target"
New-Item -ItemType Directory -Force -Path $env:CARGO_TARGET_DIR | Out-Null
cargo check
if ($LASTEXITCODE -ne 0) { throw "cargo check failed" }

Write-Host "BACKEND-FAST Verification Completed Successfully" -ForegroundColor Green
