$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for MOBILE" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot "mobile"
if (-not (Test-Path $mobileRoot)) {
    Write-Host "Skipping MOBILE verification because mobile/ does not exist." -ForegroundColor DarkYellow
    exit 0
}

Set-Location -Path $mobileRoot
if (Test-Path ".\gradlew.bat") {
    .\gradlew.bat --no-daemon --console=plain :app:compileDebugSources
    if ($LASTEXITCODE -ne 0) { throw "gradlew compileDebugSources failed" }
} else {
    throw "mobile/gradlew.bat is missing. Update .skills/verify-mobile.ps1 for this project."
}

Write-Host "MOBILE Verification Completed Successfully" -ForegroundColor Green

