#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

NO_OPEN=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-open)
      NO_OPEN=1
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --help)
      echo "Usage: ./run-linux.sh [--no-open] [--dry-run]"
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
  echo "Loading environment from .env..."
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

WEB_PORT="${WEB_PORT:-5580}"
CORE_PORT="${CORE_PORT:-5581}"
FAST_PORT="${FAST_PORT:-5582}"
DB_PORT="${DB_PORT:-55432}"
REDIS_PORT="${REDIS_PORT:-56379}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"

POSTGRES_DB="${POSTGRES_DB:-laborflow_db}"
POSTGRES_USER="${POSTGRES_USER:-admin}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-admin}"
REDIS_PASSWORD="${REDIS_PASSWORD:-admin}"
export LABORFLOW_FAST_BIND_ADDR="${LABORFLOW_FAST_BIND_ADDR:-127.0.0.1:${FAST_PORT}}"
export SERVER_PORT="${SERVER_PORT:-$CORE_PORT}"
export POSTGRES_DB
export POSTGRES_USER
export POSTGRES_PASSWORD
export REDIS_PASSWORD
export SPRING_DATASOURCE_URL="${SPRING_DATASOURCE_URL:-jdbc:postgresql://localhost:${DB_PORT}/${POSTGRES_DB}}"
export SPRING_DATASOURCE_USERNAME="${SPRING_DATASOURCE_USERNAME:-$POSTGRES_USER}"
export SPRING_DATASOURCE_PASSWORD="${SPRING_DATASOURCE_PASSWORD:-$POSTGRES_PASSWORD}"
export SPRING_DATA_REDIS_HOST="${SPRING_DATA_REDIS_HOST:-localhost}"
export SPRING_DATA_REDIS_PORT="${SPRING_DATA_REDIS_PORT:-$REDIS_PORT}"
export SPRING_DATA_REDIS_PASSWORD="${SPRING_DATA_REDIS_PASSWORD:-$REDIS_PASSWORD}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:${CORE_PORT}}"
export VITE_FAST_API_BASE_URL="${VITE_FAST_API_BASE_URL:-http://localhost:${FAST_PORT}}"
export VITE_REALTIME_WS_URL="${VITE_REALTIME_WS_URL:-ws://localhost:${FAST_PORT}/ws}"

PID_DIR=".run/laborflow"
LOG_DIR="${PID_DIR}/logs"
mkdir -p "$LOG_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command was not found: $1" >&2
    exit 1
  fi
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose was not found." >&2
    exit 1
  fi
}

wait_for_postgres() {
  echo "Waiting for PostgreSQL to accept connections..."
  for _ in {1..60}; do
    if docker exec laborflow_db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready in time." >&2
  return 1
}

wait_for_redis() {
  echo "Waiting for Redis to accept connections..."
  for _ in {1..60}; do
    if docker exec laborflow_redis redis-cli -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Redis did not become ready in time." >&2
  return 1
}

start_process() {
  local name="$1"
  local workdir="$2"
  shift 2

  echo "Starting ${name}..."
  (
    cd "$workdir"
    nohup "$@" > "../${LOG_DIR}/${name}.log" 2>&1 &
    echo $! > "../${PID_DIR}/${name}.pid"
  )
}

echo "=========================================="
echo "Starting LaborFlow Services for Linux..."
echo "=========================================="

require_command docker
require_command npm
require_command cargo

if [[ -x "stop-linux.sh" ]]; then
  ./stop-linux.sh --keep-docker --quiet || true
fi

if [[ "$DRY_RUN" == "1" ]]; then
  echo
  echo "Dry run completed. No services were started."
  exit 0
fi

echo "[1/4] Starting PostgreSQL and Redis (Docker)..."
compose up -d postgres redis
wait_for_postgres
wait_for_redis

echo "[2/4] Starting Backend Core (Spring Boot)..."
chmod +x backend-core/gradlew
start_process "backend-core" "backend-core" ./gradlew bootRun

echo "[3/4] Starting Backend Fast (Rust)..."
start_process "backend-fast" "backend-fast" cargo run

echo "[4/4] Starting Frontend (Web)..."
start_process "web" "web" npm run dev -- --host "$WEB_HOST" --port "$WEB_PORT"

echo
echo "=========================================="
echo "LaborFlow services are starting."
echo "Core API: http://localhost:${CORE_PORT}/api/health"
echo "Fast API: http://localhost:${FAST_PORT}/health"
echo "Web App:  http://localhost:${WEB_PORT}"
echo "Database: localhost:${DB_PORT} / ${POSTGRES_DB} / ${POSTGRES_USER}"
echo "Redis:    localhost:${REDIS_PORT}"
echo "Logs:     ${LOG_DIR}"
echo "=========================================="

if [[ "$NO_OPEN" != "1" ]] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:${WEB_PORT}" >/dev/null 2>&1 || true
fi
