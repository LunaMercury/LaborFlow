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
default_gradle_home="${XDG_CACHE_HOME:-${HOME}/.cache}/laborflow/gradle/backend-core"
export GRADLE_USER_HOME="${LABORFLOW_CORE_GRADLE_USER_HOME:-${default_gradle_home}}"
mkdir -p "$GRADLE_USER_HOME"
default_build_dir="${XDG_CACHE_HOME:-${HOME}/.cache}/laborflow/build/backend-core-verify"
core_build_dir="${LABORFLOW_CORE_BUILD_DIR:-${default_build_dir}}"
mkdir -p "$core_build_dir"

./gradlew --stop >/dev/null 2>&1 || true
./gradlew --no-daemon --console=plain "-PlaborflowBuildDir=${core_build_dir}" test
./gradlew --stop >/dev/null 2>&1 || true
