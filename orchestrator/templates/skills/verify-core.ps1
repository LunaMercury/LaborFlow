$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for BACKEND-CORE" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$coreRoot = Join-Path $repoRoot "backend-core"
if (-not (Test-Path $coreRoot)) {
    Write-Host "Skipping BACKEND-CORE verification because backend-core/ does not exist." -ForegroundColor DarkYellow
    exit 0
}

Set-Location -Path $coreRoot
if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat --no-daemon --console=plain classes
    if ($LASTEXITCODE -ne 0) { throw "gradlew classes failed" }
} else {
    throw "backend-core/gradlew.bat is missing. Update .skills/verify-core.ps1 for this project."
}

Write-Host "BACKEND-CORE Verification Completed Successfully" -ForegroundColor Green

