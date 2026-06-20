# Backend Core Architecture

## Package Layout

- `com.laborflow.core.common`: shared infrastructure such as cache, locks, errors, and framework configuration.
- `com.laborflow.core.identity`: identity, authentication, authorization, and account lifecycle.
- `com.laborflow.core.workforce`: workforce profile, organization, team, and employment assignment.
- `com.laborflow.core.attendance`: attendance writes, corrections, approvals, and audit rules.
- `com.laborflow.core.schedule`: shifts, rosters, calendar views, and schedule changes.
- `com.laborflow.core.workflow`: task flow, approval flow, and notification routing.
- `com.laborflow.core.health`: runtime dependency health checks.

## Layer Policy

Feature packages should use these layers when they need code:

- `api`: HTTP controllers and API DTO mapping.
- `application`: use cases, transactions, authorization checks, and orchestration.
- `dto`: request and response records used across API/application boundaries.
- `dao`: repository contracts and external storage adapters.

## Redis Policy

Redis is available for short-lived cache, rate limiting, idempotency keys, distributed locks, and realtime fan-out support. PostgreSQL remains the source of truth for personal data, attendance records, schedules, workflow history, and audit trails.
