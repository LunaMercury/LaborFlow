# LaborFlow

인력 배치, 차량 배치, 현장 흐름을 관리하는 앱/웹 프로젝트입니다.

## Local Run

- Windows: `run-windows.bat`, `stop-windows.bat`
- Linux/Ubuntu: `./run-linux.sh`, `./stop-linux.sh`

## Environment

Copy `.env.example` to `.env` for local development and replace placeholder passwords before use.
Production secrets must be injected through a cloud secret manager, CI secret, or host-managed `.env` file that is never committed.

## Docker Compose

- Local infrastructure only: `docker compose -f docker-compose.local.yaml up -d postgres redis`
- Full container stack: `docker compose -f docker-compose.prod.yaml up -d --build`

The default `docker-compose.yaml` remains compatible with the local run scripts and starts PostgreSQL and Redis.
The production compose file routes traffic through Caddy. Set `PUBLIC_DOMAIN` and `ACME_EMAIL` before using it on a real host.

## Verification

- Windows: `.skills/verify-all.ps1`
- Linux/Ubuntu: `.skills/verify-all.sh`
