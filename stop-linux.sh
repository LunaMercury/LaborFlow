#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

KEEP_DOCKER=0
QUIET=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-docker)
      KEEP_DOCKER=1
      ;;
    --quiet)
      QUIET=1
      ;;
    --help)
      echo "Usage: ./stop-linux.sh [--keep-docker] [--quiet]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

WEB_PORT="${WEB_PORT:-5580}"
CORE_PORT="${CORE_PORT:-5581}"
FAST_PORT="${FAST_PORT:-5582}"
PID_DIR=".run/laborflow"

log() {
  if [[ "$QUIET" != "1" ]]; then
    echo "$@"
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    return 1
  fi
}

stop_pid() {
  local name="$1"
  local pid_file="${PID_DIR}/${name}.pid"

  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"

  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    log "Stopping ${name} (PID ${pid})..."
    kill "$pid" >/dev/null 2>&1 || true
    for _ in {1..10}; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  fi

  rm -f "$pid_file"
}

stop_port() {
  local name="$1"
  local port="$2"

  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      log "Stopping ${name} processes on port ${port}..."
      kill $pids >/dev/null 2>&1 || true
    fi
  elif command -v fuser >/dev/null 2>&1; then
    if fuser "${port}/tcp" >/dev/null 2>&1; then
      log "Stopping ${name} processes on port ${port}..."
      fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    fi
  fi
}

log "=========================================="
log "Stopping LaborFlow Services for Linux..."
log "=========================================="

stop_pid "web"
stop_pid "backend-fast"
stop_pid "backend-core"

stop_port "Web App" "$WEB_PORT"
stop_port "Fast API" "$FAST_PORT"
stop_port "Core API" "$CORE_PORT"

if [[ "$KEEP_DOCKER" != "1" ]]; then
  log "Stopping PostgreSQL and Redis containers..."
  compose down >/dev/null 2>&1 || log "[WARN] Docker compose shutdown was skipped or failed."
fi

if [[ -x "backend-core/gradlew" ]]; then
  (cd backend-core && ./gradlew --stop >/dev/null 2>&1 || true)
fi
if [[ -x "mobile/gradlew" ]]; then
  (cd mobile && ./gradlew --stop >/dev/null 2>&1 || true)
fi

log "LaborFlow services have been stopped."
