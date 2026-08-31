$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for BACKEND-CORE (Java/Spring)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$coreRoot = Join-Path $repoRoot "backend-core"
if (-not (Test-Path $coreRoot)) { throw "backend-core/ does not exist." }

Set-Location -Path $coreRoot
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
        throw "BACKEND-CORE requires JDK $requiredJavaMajor. JAVA_HOME reports: $javaVersionText"
    }
    Write-Host "Using JAVA_HOME=$env:JAVA_HOME" -ForegroundColor Yellow
    Write-Host ($javaVersionOutput -join "`n") -ForegroundColor DarkGray

    if ($env:LABORFLOW_CORE_GRADLE_USER_HOME) {
        $env:GRADLE_USER_HOME = $env:LABORFLOW_CORE_GRADLE_USER_HOME
    }
    elseif (-not $env:GRADLE_USER_HOME) {
        if ($env:LOCALAPPDATA) {
            $env:GRADLE_USER_HOME = Join-Path $env:LOCALAPPDATA "LaborFlow\gradle\backend-core"
        }
        else {
            $env:GRADLE_USER_HOME = Join-Path $repoRoot ".gradle-user-home\backend-core"
        }
    }
    New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null
    if ($env:LABORFLOW_CORE_BUILD_DIR) {
        $coreBuildDir = $env:LABORFLOW_CORE_BUILD_DIR
    }
    elseif ($env:LOCALAPPDATA) {
        $coreBuildDir = Join-Path $env:LOCALAPPDATA "LaborFlow\build\backend-core"
    }
    else {
        $coreBuildDir = Join-Path $coreRoot "build"
    }
    New-Item -ItemType Directory -Force -Path $coreBuildDir | Out-Null
    $buildDirArgument = "-PlaborflowBuildDir=$coreBuildDir"
    .\gradlew.bat --stop | Out-Host
    try {
        .\gradlew.bat --no-daemon --console=plain $buildDirArgument test
        if ($LASTEXITCODE -ne 0) { throw "gradlew test failed" }
    }
    finally {
        .\gradlew.bat --stop | Out-Host
    }
} else {
    throw "backend-core/gradlew.bat is missing. Update .skills/verify-core.ps1 for this project."
}

Write-Host "BACKEND-CORE Verification Completed Successfully" -ForegroundColor Green
