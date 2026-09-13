$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Verification for BACKEND-CORE (Java/Spring)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$coreRoot = Join-Path $repoRoot "backend-core"
if (-not (Test-Path $coreRoot)) { throw "backend-core/ does not exist." }

function Resolve-CoreGradleCommand {
    param(
        [string]$CoreRoot,
        [string]$GradleUserHome
    )

    $wrapperProperties = Join-Path $CoreRoot "gradle\wrapper\gradle-wrapper.properties"
    if (Test-Path $wrapperProperties) {
        $distributionLine = Get-Content $wrapperProperties |
            Where-Object { $_ -match '^distributionUrl=' } |
            Select-Object -First 1
        if ($distributionLine -match '/(?<distribution>gradle-[^/]+-(?:bin|all))\.zip') {
            $distributionRoot = Join-Path $GradleUserHome "wrapper\dists\$($Matches.distribution)"
            $cachedCommand = Get-ChildItem $distributionRoot -Filter "gradle.bat" -File -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match '\\bin\\gradle\.bat$' } |
                Select-Object -First 1
            if ($cachedCommand) {
                Write-Host "Using cached Gradle distribution: $($cachedCommand.FullName)" -ForegroundColor Yellow
                return $cachedCommand.FullName
            }
        }
    }

    Write-Host "Cached Gradle distribution was not found. The wrapper may download it once." -ForegroundColor Yellow
    return (Join-Path $CoreRoot "gradlew.bat")
}

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
    if ($env:LABORFLOW_CORE_PROJECT_CACHE_DIR) {
        $projectCacheDir = $env:LABORFLOW_CORE_PROJECT_CACHE_DIR
    }
    elseif ($env:LOCALAPPDATA) {
        $projectCacheDir = Join-Path $env:LOCALAPPDATA "LaborFlow\gradle\backend-core-project-cache"
    }
    else {
        $projectCacheDir = Join-Path $repoRoot ".gradle-user-home\backend-core-project-cache"
    }
    New-Item -ItemType Directory -Force -Path $projectCacheDir | Out-Null

    if ($env:LABORFLOW_CORE_BUILD_DIR) {
        $coreBuildDir = $env:LABORFLOW_CORE_BUILD_DIR
    }
    elseif ($env:LOCALAPPDATA) {
        $coreBuildDir = Join-Path $env:LOCALAPPDATA "LaborFlow\build\backend-core-verify"
    }
    else {
        $coreBuildDir = Join-Path $coreRoot "build"
    }
    New-Item -ItemType Directory -Force -Path $coreBuildDir | Out-Null
    $buildDirArgument = "-PlaborflowBuildDir=$coreBuildDir"
    $gradleCommand = Resolve-CoreGradleCommand -CoreRoot $coreRoot -GradleUserHome $env:GRADLE_USER_HOME
    $gradleArguments = @(
        "--no-daemon",
        "--console=plain",
        "--project-cache-dir",
        $projectCacheDir,
        $buildDirArgument,
        "test"
    )

    & $gradleCommand --stop | Out-Host
    try {
        & $gradleCommand @gradleArguments
        if ($LASTEXITCODE -ne 0) { throw "gradlew test failed" }
    }
    finally {
        & $gradleCommand --stop | Out-Host
    }
} else {
    throw "backend-core/gradlew.bat is missing. Update .skills/verify-core.ps1 for this project."
}

Write-Host "BACKEND-CORE Verification Completed Successfully" -ForegroundColor Green
