param(
    [switch] $KeepDocker,
    [switch] $NoPause
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

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

$webPort = [int](Get-EnvOrDefault "WEB_PORT_TAILSCALE" "6210")
$corePort = [int](Get-EnvOrDefault "CORE_PORT_TAILSCALE" "6211")
$fastPort = [int](Get-EnvOrDefault "FAST_PORT_TAILSCALE" "6212")

Write-Host "=========================================="
Write-Host "Stopping LaborFlow Tailscale services..."
Write-Host "=========================================="

Write-Host "[1/3] Releasing Tailscale service ports..."
Stop-PortListener "Web App" $webPort
Stop-PortListener "Core API" $corePort
Stop-PortListener "Fast API" $fastPort

Write-Host "[2/3] Stopping Gradle daemons..."
if (Test-Path (Join-Path $root "backend-core\gradlew.bat")) {
    Push-Location (Join-Path $root "backend-core")
    & .\gradlew.bat --stop *> $null
    Pop-Location
}

Write-Host "[3/3] Docker cleanup..."
if ($KeepDocker) {
    Write-Host "  Keeping Docker containers running."
} else {
    & docker compose down *> $null
}

Write-Host ""
Write-Host "=========================================="
Write-Host "LaborFlow Tailscale services have been stopped."
Write-Host "=========================================="

if (-not $NoPause) {
    Read-Host "Press Enter to exit" | Out-Null
}
