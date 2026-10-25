$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $repoRoot "database/tests/verify-finance.mjs")
if ($LASTEXITCODE -ne 0) { throw "Isolated finance verification failed." }
