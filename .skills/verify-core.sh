#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_root="${repo_root}/backend-core"

if [[ ! -d "$core_root" ]]; then
  echo "backend-core/ does not exist." >&2
  exit 1
fi

cd "$core_root"
chmod +x ./gradlew
export GRADLE_USER_HOME="${LABORFLOW_CORE_GRADLE_USER_HOME:-${repo_root}/.gradle-user-home/backend-core}"
mkdir -p "$GRADLE_USER_HOME"

./gradlew --stop >/dev/null 2>&1 || true
./gradlew --no-daemon --console=plain classes
./gradlew --stop >/dev/null 2>&1 || true
