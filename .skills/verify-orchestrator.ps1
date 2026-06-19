$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for ORCHESTRATOR" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path (Join-Path $repoRoot "orchestrator")
$npmCmd = "C:\Program Files\nodejs\npm.cmd"

if (-not (Test-Path "node_modules")) {
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

& $npmCmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

& $npmCmd run demo:mock -- "auth flow check"
if ($LASTEXITCODE -ne 0) { throw "mock orchestration demo failed" }

Write-Host "ORCHESTRATOR Verification Completed Successfully" -ForegroundColor Green

