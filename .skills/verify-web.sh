#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
web_root="${repo_root}/web"

if [[ ! -d "$web_root" ]]; then
  echo "web/ does not exist." >&2
  exit 1
fi

cd "$web_root"
if [[ ! -d "node_modules" ]]; then
  npm ci
fi

npm run build
