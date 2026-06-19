$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for MOBILE (Android Kotlin)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot "mobile"
if (-not (Test-Path $mobileRoot)) { throw "mobile/ does not exist." }

Set-Location -Path $mobileRoot
if (Test-Path ".\gradlew.bat") {
    $requiredJavaMajor = 26
    if (-not $env:JAVA_HOME) {
        throw "JAVA_HOME must point to JDK $requiredJavaMajor."
    }

    $javaBin = Join-Path $env:JAVA_HOME "bin"
    $javaExe = Join-Path $javaBin "java.exe"
    if (-not (Test-Path $javaExe)) {
        throw "java.exe was not found under JAVA_HOME: $env:JAVA_HOME"
    }

    $env:Path = "$javaBin;$env:Path"
    $javaVersionOutput = & cmd.exe /c "`"$javaExe`" -version 2>&1"
    $javaVersionText = $javaVersionOutput -join " "
    if ($javaVersionText -notmatch '"26(\.|")') {
        throw "MOBILE requires JDK $requiredJavaMajor. JAVA_HOME reports: $javaVersionText"
    }
    Write-Host "Using JAVA_HOME=$env:JAVA_HOME" -ForegroundColor Yellow
    Write-Host ($javaVersionOutput -join "`n") -ForegroundColor DarkGray

    if ($env:LABORFLOW_MOBILE_GRADLE_USER_HOME) {
        $env:GRADLE_USER_HOME = $env:LABORFLOW_MOBILE_GRADLE_USER_HOME
    }
    elseif (-not $env:GRADLE_USER_HOME) {
        $env:GRADLE_USER_HOME = Join-Path $mobileRoot ".gradle-user-home"
    }
    New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null
    .\gradlew.bat --stop | Out-Host
    try {
        .\gradlew.bat --no-daemon --console=plain :app:compileDebugSources
        if ($LASTEXITCODE -ne 0) { throw "gradlew compileDebugSources failed" }
    }
    finally {
        .\gradlew.bat --stop | Out-Host
    }
} else {
    throw "mobile/gradlew.bat is missing. Update .skills/verify-mobile.ps1 for this project."
}

Write-Host "MOBILE Verification Completed Successfully" -ForegroundColor Green
