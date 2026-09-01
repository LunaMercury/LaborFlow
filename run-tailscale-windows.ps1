[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArguments
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

$options = @{
    DryRun = $false
    NoPause = $false
    Stop = $false
    KeepDocker = $false
}

foreach ($argument in $ScriptArguments) {
    switch ($argument.ToLowerInvariant()) {
        "--dry-run" { $options.DryRun = $true }
        "-dryrun" { $options.DryRun = $true }
        "--no-pause" { $options.NoPause = $true }
        "-nopause" { $options.NoPause = $true }
        "--stop" { $options.Stop = $true }
        "-stop" { $options.Stop = $true }
        "--keep-docker" { $options.KeepDocker = $true }
        "-keepdocker" { $options.KeepDocker = $true }
        default { throw "Unknown argument: $argument" }
    }
}

$logDirectory = Join-Path $root "logs"
$statePath = Join-Path $logDirectory "tailscale-services.json"
$script:trackedServices = @{}
$script:tailscaleIp = $null
$script:webPort = 0
$script:corePort = 0
$script:fastPort = 0
$script:lastTailscaleIp = $null
$script:lastWebPort = 0
$script:lastCorePort = 0
$script:lastFastPort = 0

function Import-DotEnv {
    $envPath = Join-Path $root ".env"
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

function Get-EnvOrDefault {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value
}

function Initialize-Environment {
    Import-DotEnv
    if (-not $env:POSTGRES_DB) { $env:POSTGRES_DB = "laborflow_db" }
    if (-not $env:POSTGRES_USER) { $env:POSTGRES_USER = "admin" }
    if (-not $env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD = "admin" }
    if (-not $env:REDIS_PASSWORD) { $env:REDIS_PASSWORD = "admin" }
}

function Resolve-TailscaleIp {
    if ($env:TAILSCALE_IP) {
        return $env:TAILSCALE_IP
    }

    $tailscaleAdapter = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object {
            $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
            ($_.Name -like "*Tailscale*" -or $_.Description -like "*Tailscale*")
        } |
        Select-Object -First 1
    if ($tailscaleAdapter) {
        $address = $tailscaleAdapter.GetIPProperties().UnicastAddresses |
            Where-Object { $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
            Select-Object -First 1
        if ($address) {
            return $address.Address.IPAddressToString
        }
    }

    try {
        $ip = (& tailscale.exe ip -4 2>$null | Select-Object -First 1).Trim()
        if ($ip) {
            return $ip
        }
    }
    catch {
        return $null
    }
    return $null
}

function Get-TcpExcludedPortRanges {
    try {
        $output = & netsh.exe interface ipv4 show excludedportrange protocol=tcp 2>$null
    }
    catch {
        return @()
    }

    $ranges = @()
    foreach ($line in $output) {
        if ($line -match '^\s*(\d+)\s+(\d+)') {
            $ranges += [pscustomobject]@{
                Start = [int]$matches[1]
                End = [int]$matches[2]
            }
        }
    }
    return $ranges
}

function Test-TailscalePortSetAvailable {
    param(
        [Parameter(Mandatory = $true)][int]$WebPort,
        [Parameter(Mandatory = $true)][object[]]$ExcludedRanges
    )

    foreach ($port in @($WebPort, $WebPort + 1, $WebPort + 2)) {
        foreach ($range in $ExcludedRanges) {
            if ($port -ge $range.Start -and $port -le $range.End) {
                return $false
            }
        }

        $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) {
            return $false
        }
    }
    return $true
}

function Resolve-TailscaleServicePorts {
    $explicitWeb = [Environment]::GetEnvironmentVariable("WEB_PORT_TAILSCALE", "Process")
    $explicitCore = [Environment]::GetEnvironmentVariable("CORE_PORT_TAILSCALE", "Process")
    $explicitFast = [Environment]::GetEnvironmentVariable("FAST_PORT_TAILSCALE", "Process")
    $excludedRanges = @(Get-TcpExcludedPortRanges)

    if ($explicitWeb) {
        $web = [int]$explicitWeb
        $core = if ($explicitCore) { [int]$explicitCore } else { $web + 1 }
        $fast = if ($explicitFast) { [int]$explicitFast } else { $web + 2 }
        foreach ($port in @($web, $core, $fast)) {
            $blocked = $false
            foreach ($range in $excludedRanges) {
                if ($port -ge $range.Start -and $port -le $range.End) { $blocked = $true }
            }
            if ($blocked -or (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
                throw "Explicit Tailscale port $port is unavailable."
            }
        }
        return [pscustomobject]@{ Web = $web; Core = $core; Fast = $fast; WasFallback = $false }
    }

    $candidateWebPorts = @(
        16210, 6210, 17210, 18210, 19210, 20210, 21210, 22210, 23210, 24210,
        25210, 26210, 27210, 28210, 29210, 30210, 31210, 32210, 33210, 34210,
        35210, 36210, 37210, 38210, 39210, 40210, 41210, 42210, 43210, 44210,
        45210, 46210, 47210, 48210, 49210
    )

    foreach ($candidate in $candidateWebPorts) {
        if (Test-TailscalePortSetAvailable -WebPort $candidate -ExcludedRanges $excludedRanges) {
            return [pscustomobject]@{
                Web = $candidate
                Core = $candidate + 1
                Fast = $candidate + 2
                WasFallback = $candidate -ne 16210
            }
        }
    }
    throw "No available Tailscale port set was found."
}

function Load-ServiceState {
    if (-not (Test-Path -LiteralPath $statePath)) {
        return
    }

    try {
        $saved = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
        $script:lastTailscaleIp = $saved.tailscaleIp
        if ($saved.webPort) { $script:lastWebPort = [int]$saved.webPort }
        if ($saved.corePort) { $script:lastCorePort = [int]$saved.corePort }
        if ($saved.fastPort) { $script:lastFastPort = [int]$saved.fastPort }
        if ($saved.services) {
            foreach ($property in $saved.services.PSObject.Properties) {
                $script:trackedServices[$property.Name] = $property.Value
            }
        }
    }
    catch {
        Write-Warning "Ignoring unreadable Tailscale service state: $statePath"
    }
}

function Write-ServiceState {
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    $ip = if ($script:tailscaleIp) { $script:tailscaleIp } else { $script:lastTailscaleIp }
    $web = if ($script:webPort) { $script:webPort } else { $script:lastWebPort }
    $core = if ($script:corePort) { $script:corePort } else { $script:lastCorePort }
    $fast = if ($script:fastPort) { $script:fastPort } else { $script:lastFastPort }

    [ordered]@{
        tailscaleIp = $ip
        webPort = $web
        corePort = $core
        fastPort = $fast
        updatedAt = (Get-Date).ToString("o")
        services = $script:trackedServices
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Stop-PortProcess {
    param(
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$Port
    )

    if ($Port -le 0) { return }
    $lines = & netstat.exe -ano -p tcp 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING\s+(\d+)\s*$"
    foreach ($line in $lines) {
        if ($line.Matches.Count -eq 0) { continue }
        $processId = [int]$line.Matches[0].Groups[1].Value
        if ($processId -eq 0) { continue }
        Write-Host "  Stopping $DisplayName on port $Port (PID $processId)..."
        & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
    }
}

function Stop-TrackedService {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][int]$DefaultPort
    )

    $portToStop = $DefaultPort
    if ($script:trackedServices.ContainsKey($Name)) {
        $entry = $script:trackedServices[$Name]
        if ($entry.port) { $portToStop = [int]$entry.port }
        $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($process) {
            $recordedStart = [DateTime]::Parse($entry.startedAt).ToUniversalTime()
            if ([Math]::Abs(($process.StartTime.ToUniversalTime() - $recordedStart).TotalSeconds) -lt 2) {
                Write-Host "  Stopping $DisplayName (PID $($entry.pid))..."
                & taskkill.exe /PID $entry.pid /T /F 2>$null | Out-Null
            }
        }
        $script:trackedServices.Remove($Name)
    }
    Stop-PortProcess -DisplayName $DisplayName -Port $portToStop
    Write-ServiceState
}

function Stop-ApplicationProcesses {
    Stop-TrackedService -Name "core" -DisplayName "Backend Core" -DefaultPort $script:lastCorePort
    Stop-TrackedService -Name "fast" -DisplayName "Backend Fast" -DefaultPort $script:lastFastPort
    Stop-TrackedService -Name "web" -DisplayName "Frontend" -DefaultPort $script:lastWebPort

    # State files created by the previous launcher did not contain PIDs.
    Stop-PortProcess -DisplayName "Backend Core" -Port $script:lastCorePort
    Stop-PortProcess -DisplayName "Backend Fast" -Port $script:lastFastPort
    Stop-PortProcess -DisplayName "Frontend" -Port $script:lastWebPort
}

function Start-LoggedProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][int]$Port
    )

    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $stdoutPath = Join-Path $logDirectory "$Name-tailscale-$timestamp.out.log"
    $stderrPath = Join-Path $logDirectory "$Name-tailscale-$timestamp.err.log"
    $process = Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList "/d", "/s", "/c", $Command `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru

    $script:trackedServices[$Name] = @{
        pid = $process.Id
        startedAt = $process.StartTime.ToUniversalTime().ToString("o")
        port = $Port
        stdout = $stdoutPath
        stderr = $stderrPath
    }
    Write-ServiceState
    Write-Host "  $DisplayName started in background (PID $($process.Id), port $Port)."
}

function Get-CoreCommand {
    $dbPort = [int](Get-EnvOrDefault "DB_PORT" "55432")
    $redisPort = [int](Get-EnvOrDefault "REDIS_PORT" "56379")
    $coreGradleUserHome = if ($env:LABORFLOW_CORE_GRADLE_USER_HOME) {
        $env:LABORFLOW_CORE_GRADLE_USER_HOME
    }
    elseif ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "LaborFlow\gradle\backend-core"
    }
    else {
        Join-Path $root ".gradle-user-home\backend-core"
    }
    New-Item -ItemType Directory -Force -Path $coreGradleUserHome | Out-Null
    $coreBuildDir = if ($env:LABORFLOW_CORE_BUILD_DIR) {
        $env:LABORFLOW_CORE_BUILD_DIR
    }
    elseif ($env:LOCALAPPDATA) {
        Join-Path $env:LOCALAPPDATA "LaborFlow\build\backend-core-runtime"
    }
    else {
        Join-Path $root "backend-core\build"
    }
    New-Item -ItemType Directory -Force -Path $coreBuildDir | Out-Null
    $coreWorkingDirectory = Join-Path $root "backend-core"
    $gradleWrapper = Join-Path $coreWorkingDirectory "gradlew.bat"
    $previousGradleUserHome = $env:GRADLE_USER_HOME
    try {
        $env:GRADLE_USER_HOME = $coreGradleUserHome
        Push-Location $coreWorkingDirectory
        try {
            & $gradleWrapper --no-daemon --console=plain "-PlaborflowBuildDir=$coreBuildDir" bootJar
            $buildExitCode = $LASTEXITCODE
        }
        finally {
            Pop-Location
        }
    }
    finally {
        $env:GRADLE_USER_HOME = $previousGradleUserHome
    }
    if ($buildExitCode -ne 0) {
        throw "Backend Core build failed."
    }

    $coreJar = Get-ChildItem -LiteralPath (Join-Path $coreBuildDir "libs") -Filter "*.jar" |
        Where-Object { $_.Name -notlike "*-plain.jar" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $coreJar) {
        throw "Backend Core executable jar was not found."
    }
    $javaExecutable = if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        Join-Path $env:JAVA_HOME "bin\java.exe"
    }
    else {
        (Get-Command "java.exe" -ErrorAction Stop).Source
    }
    return @(
        "set SERVER_PORT=$script:corePort",
        "set SERVER_ADDRESS=$script:tailscaleIp",
        "set LABORFLOW_WEB_ALLOWED_ORIGINS=http://$script:tailscaleIp`:$script:webPort",
        "set LABORFLOW_WEB_ALLOWED_ORIGIN_PATTERNS=http://localhost:*,http://127.0.0.1:*",
        "set SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:$dbPort/$($env:POSTGRES_DB)",
        "set SPRING_DATASOURCE_USERNAME=$($env:POSTGRES_USER)",
        "set SPRING_DATASOURCE_PASSWORD=$($env:POSTGRES_PASSWORD)",
        "set SPRING_DATA_REDIS_HOST=localhost",
        "set SPRING_DATA_REDIS_PORT=$redisPort",
        "set SPRING_DATA_REDIS_PASSWORD=$($env:REDIS_PASSWORD)",
        "cd /d `"$root\backend-core`"",
        "`"$javaExecutable`" -jar `"$($coreJar.FullName)`""
    ) -join "&& "
}

function Start-Core {
    Stop-TrackedService -Name "core" -DisplayName "Backend Core" -DefaultPort $script:corePort
    Start-LoggedProcess -Name "core" -DisplayName "Backend Core" -Command (Get-CoreCommand) -Port $script:corePort
}

function Start-Fast {
    Stop-TrackedService -Name "fast" -DisplayName "Backend Fast" -DefaultPort $script:fastPort
    $command = @(
        "set LABORFLOW_FAST_BIND_ADDR=$script:tailscaleIp`:$script:fastPort",
        "cd /d `"$root\backend-fast`"",
        "cargo run"
    ) -join "&& "
    Start-LoggedProcess -Name "fast" -DisplayName "Backend Fast" -Command $command -Port $script:fastPort
}

function Start-Web {
    Stop-TrackedService -Name "web" -DisplayName "Frontend" -DefaultPort $script:webPort
    $command = @(
        "set VITE_API_BASE_URL=http://$script:tailscaleIp`:$script:corePort",
        "set VITE_FAST_API_BASE_URL=http://$script:tailscaleIp`:$script:fastPort",
        "set VITE_REALTIME_WS_URL=ws://$script:tailscaleIp`:$script:fastPort/ws",
        "cd /d `"$root\web`"",
        "npm run dev -- --host $script:tailscaleIp --port $script:webPort"
    ) -join "&& "
    Start-LoggedProcess -Name "web" -DisplayName "Frontend" -Command $command -Port $script:webPort
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
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed to start PostgreSQL or Redis." }

    Write-Host "Waiting for PostgreSQL..."
    $databaseReady = $false
    foreach ($attempt in 1..60) {
        & cmd.exe /d /c "docker exec laborflow_db pg_isready -U $($env:POSTGRES_USER) -d $($env:POSTGRES_DB) >nul 2>nul"
        if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $databaseReady) { throw "PostgreSQL did not become ready in time." }

    Write-Host "Waiting for Redis..."
    $redisReady = $false
    foreach ($attempt in 1..60) {
        & cmd.exe /d /c "docker exec laborflow_redis redis-cli --no-auth-warning -a $($env:REDIS_PASSWORD) ping >nul 2>nul"
        if ($LASTEXITCODE -eq 0) { $redisReady = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $redisReady) { throw "Redis did not become ready in time." }
}

function Stop-AllServices {
    Write-Host "=========================================="
    Write-Host "Stopping LaborFlow Tailscale services..."
    Write-Host "=========================================="
    Stop-ApplicationProcesses

    if ($options.KeepDocker) {
        Write-Host "  Keeping Docker containers running."
    }
    else {
        Write-Host "  Stopping PostgreSQL and Redis containers..."
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "SilentlyContinue"
            & docker.exe compose down 2>&1 | Out-Null
            $dockerExitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousPreference
        }
        if ($dockerExitCode -ne 0) {
            Write-Warning "Docker Compose shutdown was skipped or failed."
        }
    }

    if (Test-Path -LiteralPath (Join-Path $root "backend-core\gradlew.bat")) {
        Push-Location (Join-Path $root "backend-core")
        try { & cmd.exe /d /c "gradlew.bat --stop >nul 2>nul" } finally { Pop-Location }
    }
    Write-Host "LaborFlow Tailscale services have been stopped."
}

function Show-ServiceMenu {
    while ($true) {
        Write-Host ""
        Write-Host "=========================================="
        Write-Host "LaborFlow Tailscale Service Manager"
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
    Initialize-Environment
    Load-ServiceState

    if ($options.Stop) {
        Stop-AllServices
        if (-not $options.NoPause) { Read-Host "Press Enter to close" | Out-Null }
        exit 0
    }

    $script:tailscaleIp = Resolve-TailscaleIp
    if (-not $script:tailscaleIp) {
        throw "Tailscale이 실행 중이 아니거나 연결되지 않았습니다. Tailscale을 실행한 뒤 다시 시도해주세요."
    }

    Write-Host "=========================================="
    Write-Host "Starting LaborFlow for Tailscale..."
    Write-Host "=========================================="
    Write-Host "Tailscale IP: $script:tailscaleIp"

    if ($options.DryRun) {
        $ports = Resolve-TailscaleServicePorts
        Write-Host "Dry run completed. No services were stopped or started."
        Write-Host "Web App:  http://$script:tailscaleIp`:$($ports.Web)"
        Write-Host "Core API: http://$script:tailscaleIp`:$($ports.Core)/api/health"
        Write-Host "Fast API: http://$script:tailscaleIp`:$($ports.Fast)/health"
        exit 0
    }

    Stop-ApplicationProcesses
    $ports = Resolve-TailscaleServicePorts
    $script:webPort = [int]$ports.Web
    $script:corePort = [int]$ports.Core
    $script:fastPort = [int]$ports.Fast
    $script:lastTailscaleIp = $script:tailscaleIp
    $script:lastWebPort = $script:webPort
    $script:lastCorePort = $script:corePort
    $script:lastFastPort = $script:fastPort

    if ($ports.WasFallback) {
        Write-Warning "Preferred Tailscale ports 16210-16212 are unavailable. Using $script:webPort-$script:fastPort."
    }

    Wait-ForInfrastructure
    Start-ApplicationServices

    Write-Host ""
    Write-Host "Web App:  http://$script:tailscaleIp`:$script:webPort"
    Write-Host "Core API: http://$script:tailscaleIp`:$script:corePort/api/health"
    Write-Host "Fast API: http://$script:tailscaleIp`:$script:fastPort/health"
    Write-Host "Logs:     $logDirectory"

    if (-not $options.NoPause) { Show-ServiceMenu }
    exit 0
}
catch {
    Write-Host ""
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if (-not $options.NoPause) { Read-Host "Press Enter to close" | Out-Null }
    exit 1
}
