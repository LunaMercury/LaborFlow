[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArguments
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$options = @{
    NoOpen = $false
    NoPause = $false
    DryRun = $false
    Stop = $false
}

foreach ($argument in $ScriptArguments) {
    switch ($argument.ToLowerInvariant()) {
        "--no-open" { $options.NoOpen = $true }
        "--no-pause" { $options.NoPause = $true }
        "--dry-run" { $options.DryRun = $true }
        "--stop" { $options.Stop = $true }
        default { throw "Unknown argument: $argument" }
    }
}

$ports = @{
    Web = 15580
    Core = 15581
    Fast = 15582
    Database = 55432
    Redis = 56379
}

$logsDirectory = Join-Path $PSScriptRoot "logs"
$statePath = Join-Path $logsDirectory "windows-services.json"

function Test-LocalPortAvailable {
    param([Parameter(Mandatory = $true)][int]$Port)

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

function Select-ApplicationPorts {
    $webCandidates = @(15580)
    foreach ($webPort in $webCandidates) {
        if ((Test-LocalPortAvailable $webPort) -and
            (Test-LocalPortAvailable ($webPort + 1)) -and
            (Test-LocalPortAvailable ($webPort + 2))) {
            $ports.Web = $webPort
            $ports.Core = $webPort + 1
            $ports.Fast = $webPort + 2
            return
        }
    }

    throw "LaborFlow ports 15580-15582 are unavailable. Stop the existing listeners and try again."
}

function Import-DotEnv {
    $envPath = Join-Path $PSScriptRoot ".env"
    if (-not (Test-Path -LiteralPath $envPath)) {
        return
    }

    Write-Host "Loading environment from .env..."
    foreach ($line in Get-Content -LiteralPath $envPath) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separator = $trimmed.IndexOf("=")
        if ($separator -le 0) {
            continue
        }

        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1)
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Set-DefaultEnvironmentVariable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, "Process"))) {
        [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    }
}

function Initialize-Environment {
    Import-DotEnv

    Set-DefaultEnvironmentVariable "POSTGRES_DB" "laborflow_db"
    Set-DefaultEnvironmentVariable "POSTGRES_USER" "admin"
    Set-DefaultEnvironmentVariable "POSTGRES_PASSWORD" "admin"
    Set-DefaultEnvironmentVariable "REDIS_PASSWORD" "admin"
    Set-DefaultEnvironmentVariable "LABORFLOW_FAST_BIND_ADDR" "127.0.0.1:$($ports.Fast)"
    Set-DefaultEnvironmentVariable "SPRING_DATASOURCE_URL" "jdbc:postgresql://localhost:$($ports.Database)/$env:POSTGRES_DB"
    Set-DefaultEnvironmentVariable "SPRING_DATASOURCE_USERNAME" $env:POSTGRES_USER
    Set-DefaultEnvironmentVariable "SPRING_DATASOURCE_PASSWORD" $env:POSTGRES_PASSWORD
    Set-DefaultEnvironmentVariable "SPRING_DATA_REDIS_HOST" "localhost"
    Set-DefaultEnvironmentVariable "SPRING_DATA_REDIS_PORT" "$($ports.Redis)"
    Set-DefaultEnvironmentVariable "SPRING_DATA_REDIS_PASSWORD" $env:REDIS_PASSWORD
    Set-DefaultEnvironmentVariable "VITE_API_BASE_URL" "http://localhost:$($ports.Core)"
    Set-DefaultEnvironmentVariable "VITE_FAST_API_BASE_URL" "http://localhost:$($ports.Fast)"
    Set-DefaultEnvironmentVariable "VITE_REALTIME_WS_URL" "ws://localhost:$($ports.Fast)/ws"
    $env:SERVER_PORT = "$($ports.Core)"
}

function Read-ServiceState {
    if (-not (Test-Path -LiteralPath $statePath)) {
        return @{}
    }

    try {
        $savedState = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
        $state = @{}
        foreach ($property in $savedState.PSObject.Properties) {
            $state[$property.Name] = $property.Value
        }
        return $state
    }
    catch {
        Write-Warning "Ignoring unreadable service state: $statePath"
        return @{}
    }
}

function Write-ServiceState {
    param([Parameter(Mandatory = $true)][hashtable]$State)

    New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null
    $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Stop-LegacyWindow {
    param([Parameter(Mandatory = $true)][string]$Title)

    & taskkill.exe /FI "WINDOWTITLE eq $Title" /T /F 2>$null | Out-Null
}

function Stop-PortProcess {
    param(
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $lines = & netstat.exe -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING\s+(\d+)\s*$"
    foreach ($line in $lines) {
        if ($line.Matches.Count -eq 0) {
            continue
        }

        $processId = [int]$line.Matches[0].Groups[1].Value
        if ($processId -eq 0) {
            continue
        }

        Write-Host "  Stopping $DisplayName on port $Port (PID $processId)..."
        & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    }
}

function Stop-TrackedService {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $state = Read-ServiceState
    $portToStop = $Port
    if ($state.ContainsKey($Name)) {
        $entry = $state[$Name]
        if ($entry.port) {
            $portToStop = [int]$entry.port
        }
        $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($process) {
            $recordedStart = [DateTime]::Parse($entry.startedAt).ToUniversalTime()
            $actualStart = $process.StartTime.ToUniversalTime()
            if ([Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -lt 2) {
                Write-Host "  Stopping $DisplayName (PID $($entry.pid))..."
                & taskkill.exe /PID $entry.pid /T /F 2>$null | Out-Null
            }
        }
        $state.Remove($Name)
        Write-ServiceState $state
    }

    Stop-PortProcess -DisplayName $DisplayName -Port $portToStop
}

function Stop-ApplicationProcesses {
    Stop-LegacyWindow "LF-Core"
    Stop-LegacyWindow "LF-Fast"
    Stop-LegacyWindow "LF-Web"
    Stop-TrackedService -Name "core" -DisplayName "Backend Core" -Port $ports.Core
    Stop-TrackedService -Name "fast" -DisplayName "Backend Fast" -Port $ports.Fast
    Stop-TrackedService -Name "web" -DisplayName "Frontend" -Port $ports.Web
}

function Start-HiddenService {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$ArgumentList,
        [Parameter(Mandatory = $true)][int]$Port
    )

    New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $stdoutPath = Join-Path $logsDirectory "$Name-$timestamp.out.log"
    $stderrPath = Join-Path $logsDirectory "$Name-$timestamp.err.log"

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    $state = Read-ServiceState
    $state[$Name] = @{
        pid = $process.Id
        startedAt = $process.StartTime.ToUniversalTime().ToString("o")
        port = $Port
        stdout = $stdoutPath
        stderr = $stderrPath
    }
    Write-ServiceState $state
    Write-Host "  $DisplayName started in background (PID $($process.Id), port $Port)."
}

function Start-Web {
    Stop-TrackedService -Name "web" -DisplayName "Frontend" -Port $ports.Web
    Start-HiddenService -Name "web" -DisplayName "Frontend" -WorkingDirectory (Join-Path $PSScriptRoot "web") -FilePath "npm.cmd" -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$($ports.Web)") -Port $ports.Web
}

function Start-Core {
    Stop-TrackedService -Name "core" -DisplayName "Backend Core" -Port $ports.Core
    Start-HiddenService -Name "core" -DisplayName "Backend Core" -WorkingDirectory (Join-Path $PSScriptRoot "backend-core") -FilePath (Join-Path $PSScriptRoot "backend-core\gradlew.bat") -ArgumentList @("bootRun") -Port $ports.Core
}

function Start-Fast {
    Stop-TrackedService -Name "fast" -DisplayName "Backend Fast" -Port $ports.Fast
    Start-HiddenService -Name "fast" -DisplayName "Backend Fast" -WorkingDirectory (Join-Path $PSScriptRoot "backend-fast") -FilePath "cargo.exe" -ArgumentList @("run") -Port $ports.Fast
}

function Start-ApplicationServices {
    Write-Host "Starting Backend Core, Backend Fast, and Frontend..."
    Start-Core
    Start-Fast
    Start-Web
}

function Wait-ForInfrastructure {
    Write-Host "Starting PostgreSQL and Redis (Docker)..."
    & docker.exe compose up -d postgres redis
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed to start PostgreSQL or Redis."
    }

    Write-Host "Waiting for PostgreSQL to accept connections..."
    $databaseReady = $false
    foreach ($attempt in 1..60) {
        & docker.exe exec laborflow_db pg_isready -U $env:POSTGRES_USER -d $env:POSTGRES_DB 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $databaseReady = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $databaseReady) {
        throw "PostgreSQL did not become ready in time."
    }

    Write-Host "Waiting for Redis to accept connections..."
    $redisReady = $false
    foreach ($attempt in 1..60) {
        & docker.exe exec laborflow_redis redis-cli --no-auth-warning -a $env:REDIS_PASSWORD ping 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $redisReady = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $redisReady) {
        throw "Redis did not become ready in time."
    }
}

function Stop-AllServices {
    Write-Host "=========================================="
    Write-Host "Stopping LaborFlow Services..."
    Write-Host "=========================================="

    Stop-ApplicationProcesses

    Write-Host "  Stopping PostgreSQL and Redis containers..."
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "SilentlyContinue"
        & docker.exe compose down 2>&1 | Out-Null
        $dockerExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($dockerExitCode -ne 0) {
        Write-Warning "Docker Compose shutdown was skipped or failed. Docker Desktop may already be stopped."
    }

    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "backend-core\gradlew.bat")) {
        Push-Location (Join-Path $PSScriptRoot "backend-core")
        try { & cmd.exe /d /c "gradlew.bat --stop >nul 2>nul" } finally { Pop-Location }
    }
    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "mobile\gradlew.bat")) {
        Push-Location (Join-Path $PSScriptRoot "mobile")
        try { & cmd.exe /d /c "gradlew.bat --stop >nul 2>nul" } finally { Pop-Location }
    }

    Write-Host "LaborFlow services have been stopped."
}

function Show-ServiceMenu {
    while ($true) {
        Write-Host ""
        Write-Host "=========================================="
        Write-Host "LaborFlow Service Manager"
        Write-Host "=========================================="
        Write-Host "1. Restart Frontend"
        Write-Host "2. Restart Backend Core"
        Write-Host "3. Restart Backend Fast"
        Write-Host "4. Restart all application services"
        Write-Host "5. Stop all services and exit"
        Write-Host "0. Close this menu (services keep running)"
        Write-Host ""

        $selection = Read-Host "Select an option"
        try {
            switch ($selection) {
                "1" { Start-Web }
                "2" { Start-Core }
                "3" { Start-Fast }
                "4" { Start-ApplicationServices }
                "5" { Stop-AllServices; return }
                "0" { Write-Host "The services will continue running in the background."; return }
                default { Write-Warning "Enter a number from 0 to 5." }
            }
        }
        catch {
            Write-Warning $_.Exception.Message
        }
    }
}

try {
    if ($options.Stop) {
        Initialize-Environment
        Stop-AllServices
        if (-not $options.NoPause) {
            Read-Host "Press Enter to close"
        }
        exit 0
    }

    Write-Host "=========================================="
    Write-Host "Starting LaborFlow Services..."
    Write-Host "=========================================="

    if ($options.DryRun) {
        Write-Host "Dry run completed. No services were started."
        Write-Host "Web App:  http://localhost:$($ports.Web)"
        Write-Host "Core API: http://localhost:$($ports.Core)/api/health"
        Write-Host "Fast API: http://localhost:$($ports.Fast)/health"
        exit 0
    }

    Stop-ApplicationProcesses
    Select-ApplicationPorts
    Initialize-Environment
    Wait-ForInfrastructure
    Start-ApplicationServices

    Write-Host ""
    Write-Host "Core API: http://localhost:$($ports.Core)/api/health"
    Write-Host "Fast API: http://localhost:$($ports.Fast)/health"
    Write-Host "Web App:  http://localhost:$($ports.Web)"
    Write-Host "Logs:     $logsDirectory"

    if (-not $options.NoOpen) {
        Start-Sleep -Seconds 3
        Start-Process "http://localhost:$($ports.Web)"
    }

    if (-not $options.NoPause) {
        Show-ServiceMenu
    }
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    if (-not $options.NoPause) {
        Read-Host "Press Enter to close"
    }
    exit 1
}
