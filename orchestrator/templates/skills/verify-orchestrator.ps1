$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for ORCHESTRATOR" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path (Join-Path $repoRoot "orchestrator")

function Resolve-NpmCommand {
    $candidates = @($env:npm_execpath, "npm.cmd", "npm") | Where-Object { $_ }
    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    throw "npm was not found on PATH."
}

$npmCmd = Resolve-NpmCommand

if (-not (Test-Path "node_modules")) {
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

& $npmCmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

& $npmCmd run demo:mock -- "auth flow check"
if ($LASTEXITCODE -ne 0) { throw "mock orchestration demo failed" }

Write-Host "ORCHESTRATOR Verification Completed Successfully" -ForegroundColor Green
