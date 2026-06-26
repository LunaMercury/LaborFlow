param(
    [switch] $DryRun,
    [switch] $NoPause
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Import-DotEnv {
    $envPath = Join-Path $root ".env"
    if (-not (Test-Path $envPath)) {
        return
    }

    Get-Content $envPath | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }

        $key, $value = $line.Split("=", 2)
        if ($key) {
            [Environment]::SetEnvironmentVariable($key.Trim(), $value.Trim(), "Process")
        }
    }
}

function Resolve-TailscaleIp {
    if ($env:TAILSCALE_IP) {
        return $env:TAILSCALE_IP
    }

    try {
        $ip = (& tailscale ip -4 2>$null | Select-Object -First 1).Trim()
        if ($ip) {
            return $ip
        }
    } catch {
        return $null
    }

    return $null
}

function Get-EnvOrDefault {
    param(
        [string] $Name,
        [string] $DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
}

function Stop-PortListener {
    param(
        [string] $Name,
        [int] $Port
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        if ($processId -and $processId -ne 0) {
            Write-Host "  Stopping $Name on port $Port (PID $processId)..."
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Wait-ForDockerDependency {
    param(
        [string] $Name,
        [scriptblock] $Probe
    )

    Write-Host "Waiting for $Name..."
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        & $Probe
        if ($LASTEXITCODE -eq 0) {
            return
        }

        Start-Sleep -Seconds 1
    }

    throw "$Name did not become ready in time."
}

function Start-LoggedProcess {
    param(
        [string] $Name,
        [string] $Command,
        [string] $OutLog,
        [string] $ErrLog
    )

    $process = Start-Process `
        -FilePath "cmd.exe" `
        -ArgumentList "/c", $Command `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -PassThru

    Write-Host "  Started $Name (launcher PID $($process.Id))"
}

Import-DotEnv

$webPort = [int](Get-EnvOrDefault "WEB_PORT_TAILSCALE" "6210")
$corePort = [int](Get-EnvOrDefault "CORE_PORT_TAILSCALE" "6211")
$fastPort = [int](Get-EnvOrDefault "FAST_PORT_TAILSCALE" "6212")
$dbPort = [int](Get-EnvOrDefault "DB_PORT" "55432")
$redisPort = [int](Get-EnvOrDefault "REDIS_PORT" "56379")

if (-not $env:POSTGRES_DB) { $env:POSTGRES_DB = "laborflow_db" }
if (-not $env:POSTGRES_USER) { $env:POSTGRES_USER = "admin" }
if (-not $env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD = "admin" }
if (-not $env:REDIS_PASSWORD) { $env:REDIS_PASSWORD = "admin" }

$tailscaleIp = Resolve-TailscaleIp
if (-not $tailscaleIp) {
    throw "TAILSCALE_IP is not set and `tailscale ip -4` did not return an address."
}

$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "=========================================="
Write-Host "Starting LaborFlow for Tailscale..."
Write-Host "=========================================="
Write-Host "Tailscale IP: $tailscaleIp"

if ($DryRun) {
    Write-Host "Dry run completed. No services were stopped or started."
    Write-Host "Web App:  http://$tailscaleIp`:$webPort"
    Write-Host "Core API: http://$tailscaleIp`:$corePort/api/health"
    Write-Host "Fast API: http://$tailscaleIp`:$fastPort/health"
    if (-not $NoPause) { Read-Host "Press Enter to exit" | Out-Null }
    exit 0
}

Write-Host "[0/4] Releasing Tailscale service ports..."
Stop-PortListener "Web App" $webPort
Stop-PortListener "Core API" $corePort
Stop-PortListener "Fast API" $fastPort

Write-Host "[1/4] Starting PostgreSQL and Redis (Docker)..."
& docker compose up -d postgres redis
if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed."
}

Wait-ForDockerDependency "PostgreSQL" {
    & cmd.exe /c "docker exec laborflow_db pg_isready -U $($env:POSTGRES_USER) -d $($env:POSTGRES_DB) >nul 2>nul"
}

Wait-ForDockerDependency "Redis" {
    & cmd.exe /c "docker exec laborflow_redis redis-cli -a $($env:REDIS_PASSWORD) ping >nul 2>nul"
}

$coreOut = Join-Path $logDir "core-tailscale-$corePort.out.log"
$coreErr = Join-Path $logDir "core-tailscale-$corePort.err.log"
$fastOut = Join-Path $logDir "fast-tailscale-$fastPort.out.log"
$fastErr = Join-Path $logDir "fast-tailscale-$fastPort.err.log"
$webOut = Join-Path $logDir "web-tailscale-$webPort.out.log"
$webErr = Join-Path $logDir "web-tailscale-$webPort.err.log"

$coreCommand = @(
    "set SERVER_PORT=$corePort",
    "set SERVER_ADDRESS=$tailscaleIp",
    "set LABORFLOW_WEB_ALLOWED_ORIGINS=http://$tailscaleIp`:$webPort",
    "set LABORFLOW_WEB_ALLOWED_ORIGIN_PATTERNS=http://localhost:*,http://127.0.0.1:*",
    "set SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:$dbPort/$($env:POSTGRES_DB)",
    "set SPRING_DATASOURCE_USERNAME=$($env:POSTGRES_USER)",
    "set SPRING_DATASOURCE_PASSWORD=$($env:POSTGRES_PASSWORD)",
    "set SPRING_DATA_REDIS_HOST=localhost",
    "set SPRING_DATA_REDIS_PORT=$redisPort",
    "set SPRING_DATA_REDIS_PASSWORD=$($env:REDIS_PASSWORD)",
    "cd /d `"$root\backend-core`"",
    "gradlew.bat bootRun"
) -join "&& "

$fastCommand = @(
    "set LABORFLOW_FAST_BIND_ADDR=$tailscaleIp`:$fastPort",
    "cd /d `"$root\backend-fast`"",
    "cargo run"
) -join "&& "

$webCommand = @(
    "set VITE_FAST_API_BASE_URL=http://$tailscaleIp`:$fastPort",
    "set VITE_REALTIME_WS_URL=ws://$tailscaleIp`:$fastPort/ws",
    "cd /d `"$root\web`"",
    "npm run dev -- --host $tailscaleIp --port $webPort"
) -join "&& "

Write-Host "[2/4] Starting Backend Core..."
Start-LoggedProcess "Backend Core" $coreCommand $coreOut $coreErr

Write-Host "[3/4] Starting Backend Fast..."
Start-LoggedProcess "Backend Fast" $fastCommand $fastOut $fastErr

Write-Host "[4/4] Starting Frontend..."
Start-LoggedProcess "Frontend" $webCommand $webOut $webErr

Write-Host ""
Write-Host "=========================================="
Write-Host "LaborFlow Tailscale services are starting."
Write-Host "Web App:  http://$tailscaleIp`:$webPort"
Write-Host "Core API: http://$tailscaleIp`:$corePort/api/health"
Write-Host "Fast API: http://$tailscaleIp`:$fastPort/health"
Write-Host "Logs:     $logDir"
Write-Host "=========================================="

if (-not $NoPause) {
    Read-Host "Press Enter to exit" | Out-Null
}
