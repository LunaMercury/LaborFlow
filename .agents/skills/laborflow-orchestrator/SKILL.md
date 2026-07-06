---
name: laborflow-orchestrator
description: Apply LaborFlow orchestrator workflow for repo coding tasks. Use for cross-module feature work, auth/authorization, Redis/realtime, attendance/scheduling, mobile upload/token work, verification planning, or when the user mentions orchestrator runner commands or .skills verification scripts.
---

# LaborFlow Orchestrator

Use this skill to make Codex follow the same project-specific workflow that the local `orchestrator` runner uses for LaborFlow work.

## First Reads

Read only the files needed for the current request:

- Always read root `AGENTS.md` and the relevant source files before editing.
- For role/module routing, read `orchestrator/config/project.yaml`.
- For category contracts and applied-template expectations, read `orchestrator/config/project-templates.yaml`.
- For runner usage or handoff flow, read `orchestrator/RUNNER_WORKFLOW.md`.
- For safety gates or apply policy, read `orchestrator/APPLY_REVIEW_GATES.md`, `orchestrator/SAFE_APPLY_MODES.md`, or `orchestrator/RUN_CLEANUP_POLICY.md` only when the task affects those areas.

Do not load all of `orchestrator/` by default. Treat it as a routing and verification reference, not as application runtime code unless the user asks to change the orchestrator itself.

## Role Routing

Map work to modules using `orchestrator/config/project.yaml`:

- `frontend`: `web/**`
- `java`: `backend-core/**`
- `rust`: `backend-fast/**`
- `mobile`: `mobile/**`
- `data`: `database/**` and Docker compose files
- `deployment`: Dockerfiles, compose files, and run/stop scripts

For auth, authorization, attendance confirmation, scheduling assignment, Redis/realtime, upload, fan-out, or token-storage work, check the related contracts before editing. Report any contract change explicitly before making it.

## Workflow

1. Inspect current files and `git status --short`.
2. Identify affected roles and required verification before editing.
3. Make scoped changes that preserve existing contracts, environment variable names, authentication structure, and path-relative tooling.
4. Add or update `.skills/verify-*.ps1` and matching `.sh` scripts when a new system or module behavior needs repeatable verification.
5. Run the narrowest relevant verification script after edits:
   - Web: `powershell -ExecutionPolicy Bypass -File .\.skills\verify-web.ps1`
   - Core: `powershell -ExecutionPolicy Bypass -File .\.skills\verify-core.ps1`
   - Fast path: `powershell -ExecutionPolicy Bypass -File .\.skills\verify-fast.ps1`
   - Mobile: `powershell -ExecutionPolicy Bypass -File .\.skills\verify-mobile.ps1`
   - All modules: `powershell -ExecutionPolicy Bypass -File .\.skills\verify-all.ps1`
6. If the task specifically asks to use the orchestrator runner, run commands from `orchestrator/` and prefer the documented safe flow: `npm run runner:readiness:strict`, then `npm run runner:goal`, then `npm run runner:quick`, then `npm run runner:accept` only after approval or an explicit user request to keep the applied result.

## Safety Rules

- Do not expose secrets, tokens, passwords, private keys, database credentials, Redis credentials, or provider client secrets to frontend/mobile code or logs.
- Reject missing, expired, or invalid tokens on authenticated API and realtime paths.
- Keep PostgreSQL as the source of truth for personal data, attendance records, schedules, workflow history, and audit logs.
- Use Redis only for short-lived cache, rate limits, idempotency keys, distributed locks, and realtime fan-out support. Do not store raw personal data or long-lived audit records in Redis.
- Keep backend-core feature packages split into `api`, `application`, `dto`, and `dao`; reserve `common` for shared infrastructure only.
- Use `.yaml` for YAML files unless a tool requires another extension.
- Avoid absolute paths except unavoidable OS/tool paths.

## Reporting

In final responses, include:

- Changed files and the user-visible behavior change.
- Verification commands run and their result, or a clear reason if not run.
- Any contract, auth, Redis, data retention, migration, or deployment risk.

