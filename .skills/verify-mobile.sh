#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mobile_root="${repo_root}/mobile"

if [[ ! -d "$mobile_root" ]]; then
  echo "mobile/ does not exist." >&2
  exit 1
fi

cd "$mobile_root"
chmod +x ./gradlew
export GRADLE_USER_HOME="${LABORFLOW_MOBILE_GRADLE_USER_HOME:-${repo_root}/.gradle-user-home/mobile}"
mkdir -p "$GRADLE_USER_HOME"

./gradlew --stop >/dev/null 2>&1 || true
./gradlew --no-daemon --console=plain :app:compileDebugSources
./gradlew --stop >/dev/null 2>&1 || true
