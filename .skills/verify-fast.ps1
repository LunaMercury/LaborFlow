$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for BACKEND-FAST" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$fastRoot = Join-Path $repoRoot "backend-fast"
if (-not (Test-Path $fastRoot)) { throw "backend-fast/ does not exist." }

Set-Location -Path $fastRoot
if ($env:LABORFLOW_FAST_CARGO_TARGET_DIR) {
    $env:CARGO_TARGET_DIR = $env:LABORFLOW_FAST_CARGO_TARGET_DIR
}
elseif (-not $env:CARGO_TARGET_DIR) {
    $env:CARGO_TARGET_DIR = Join-Path $repoRoot ".cargo-target\backend-fast"
}
New-Item -ItemType Directory -Force -Path $env:CARGO_TARGET_DIR | Out-Null
cargo check
if ($LASTEXITCODE -ne 0) { throw "cargo check failed" }

Write-Host "BACKEND-FAST Verification Completed Successfully" -ForegroundColor Green
