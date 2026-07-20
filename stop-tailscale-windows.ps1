[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArguments
)

& (Join-Path $PSScriptRoot "run-tailscale-windows.ps1") --stop @ScriptArguments
exit $LASTEXITCODE
