# Attendance Data Policy

## Source of truth

- PostgreSQL is the source of truth for schedule participants, attendance, pay terms, settlement periods, revisions, and worker activity summaries.
- Redis must not store attendance history, raw personal data, pay history, or the only copy of an audit record.
- `worker_activity_summary` is a rebuildable PostgreSQL read model. It is never the authoritative attendance record.

## Migration strategy

- Existing registered assignments remain valid and are backfilled as `REGISTERED` participants.
- A registered worker may have more than one assignment on the same date when the schedule day differs.
- Anonymous guests have an assignment UUID but no worker profile UUID.
- Existing API payloads for registered assignments remain supported while guest and attendance fields are added incrementally.

## Time and confirmation

- Schedule dates and planned local times use the work site's local calendar date and time.
- Confirmed timestamps use `timestamptz`; LaborFlow currently interprets planned work times in `Asia/Seoul`.
- Passing the work date never confirms attendance automatically.
- Confirm-as-planned copies the effective planned time into the actual time and records the confirming account and timestamp.

## Retention and deletion

- Schedule, attendance, pay, and revision records use soft deletion or status transitions.
- Paid or locked records are corrected with revision/adjustment history instead of destructive overwrite.
- Anonymous participant rows are event records and do not appear in the reusable worker directory.
- Retention duration is deployment policy and must be reviewed against applicable labor, tax, privacy, and dispute requirements before production launch.

## Authorization and audit

- Every write is scoped to the labor agency owner resolved from the authenticated account.
- Attendance confirmation records `confirmed_by_account_uuid` and `confirmed_at`.
- Corrections preserve before/after values in PostgreSQL.

## Cache policy

- Recent-work sorting reads from `worker_activity_summary`.
- A short-lived Redis list cache may be added only after measuring query load.
- Any future cache must use agency-scoped keys, short TTL, explicit invalidation after attendance confirmation, and database fallback.
