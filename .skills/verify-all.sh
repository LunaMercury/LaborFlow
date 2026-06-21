#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${repo_root}/.skills/verify-web.sh"
"${repo_root}/.skills/verify-core.sh"
"${repo_root}/.skills/verify-fast.sh"
"${repo_root}/.skills/verify-mobile.sh"
