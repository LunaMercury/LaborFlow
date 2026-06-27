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

function Get-TcpExcludedPortRanges {
    try {
        $output = & netsh interface ipv4 show excludedportrange protocol=tcp 2>$null
    } catch {
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

function Show-PortExclusionWarning {
    param(
        [string] $Label,
        [int[]] $Ports
    )

    $ranges = @(Get-TcpExcludedPortRanges)
    if ($ranges.Count -eq 0) {
        return
    }

    $blockedPorts = @()
    foreach ($port in $Ports) {
        $matched = $ranges | Where-Object { $port -ge $_.Start -and $port -le $_.End } | Select-Object -First 1
        if ($matched) {
            $blockedPorts += $port
        }
    }

    if ($blockedPorts.Count -gt 0) {
        Write-Warning "$Label ports are reserved by Windows TCP exclusions: $($blockedPorts -join ', '). This can look like a port conflict even when no process is listening."
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
Show-PortExclusionWarning "Tailscale" @($webPort, $corePort, $fastPort)
Show-PortExclusionWarning "Manual run-windows" @(5580, 5581, 5582)

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
    & cmd.exe /c "docker compose down >nul 2>nul"
}
Show-PortExclusionWarning "Manual run-windows" @(5580, 5581, 5582)

Write-Host ""
Write-Host "=========================================="
Write-Host "LaborFlow Tailscale services have been stopped."
Write-Host "=========================================="

if (-not $NoPause) {
    Read-Host "Press Enter to exit" | Out-Null
}
