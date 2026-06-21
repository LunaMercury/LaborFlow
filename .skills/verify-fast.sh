#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fast_root="${repo_root}/backend-fast"

if [[ ! -d "$fast_root" ]]; then
  echo "backend-fast/ does not exist." >&2
  exit 1
fi

cd "$fast_root"
export CARGO_TARGET_DIR="${LABORFLOW_FAST_CARGO_TARGET_DIR:-${repo_root}/.cargo-target/backend-fast}"
mkdir -p "$CARGO_TARGET_DIR"

cargo check
