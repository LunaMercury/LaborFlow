$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-VerificationScript {
    param(
        [Parameter(Mandatory = $true)]
        [string] $ScriptName
    )

    $scriptPath = Join-Path $scriptDir $ScriptName
    & powershell -ExecutionPolicy Bypass -File $scriptPath
    if ($LASTEXITCODE -ne 0) { throw "$ScriptName failed" }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "STARTING FULL PROJECT VERIFICATION" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Invoke-VerificationScript -ScriptName "verify-web.ps1"
Invoke-VerificationScript -ScriptName "verify-fast.ps1"
Invoke-VerificationScript -ScriptName "verify-core.ps1"
Invoke-VerificationScript -ScriptName "verify-mobile.ps1"
Invoke-VerificationScript -ScriptName "verify-orchestrator.ps1"

Write-Host "ALL CHECKS PASSED SUCCESSFULLY" -ForegroundColor Green

