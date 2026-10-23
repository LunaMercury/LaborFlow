$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $repoRoot "database/tests/verify-assignment-cautions.mjs")
if ($LASTEXITCODE -ne 0) { throw "Isolated assignment caution DB verification failed." }
