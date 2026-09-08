# Database Migrations

Migration files are the source of truth for the PostgreSQL schema.
`backend-core` uses Flyway and copies these files into `classpath:db/migration` during the Gradle `processResources` task.

현재 최종 스키마, 테이블 관계, 업무별 데이터 흐름과 구현 불일치는
[`docs/database/README.md`](../docs/database/README.md)에서 확인합니다. 해당 문서는
개발 중인 구조의 소스 기준 스냅샷이며 migration 자체를 대체하지 않습니다.

The checked-in files keep the simple ordered name format (`001_...sql`).
During build they are packaged as Flyway migrations (`V001__...sql`).

Existing databases that were created before Flyway history was enabled must be
baselined once at their verified schema version. Do not enable
`SPRING_FLYWAY_BASELINE_ON_MIGRATE` permanently. After the one-time baseline,
normal application startup applies only newer migrations and records them in
`flyway_schema_history`.

Manual execution is only for local troubleshooting.

Local connection:

- Host: `localhost`
- Port: `55432`
- Database: `laborflow_db`
- User: `admin`

Example:

```powershell
docker exec -i laborflow_db psql -U admin -d laborflow_db < database/migrations/001_create_worker_table.sql
```

Sensitive worker data is separated into `worker_sensitive_profile`.
This table uses `worker_uuid` as both primary key and foreign key to keep a one-to-one relationship with `worker`.
Values with `_encrypted` suffix must be encrypted before storage, and `_hash` columns are for exact-match lookup or duplicate checks only.

Farm owner data follows the same split:

- `farm_owner`: central farm owner identity with shared canonical fields.
- `farm_owner_sensitive_profile`: central encrypted sensitive fields. `phone_hash` is unique when present, so one normalized phone number maps to one farm owner UUID.
- `labor_agency_farm_owner_profile`: per-agency private farm owner profile. Local name, nickname, business name, phone copy, bank account copy, and private memo are visible only to the owning agency owner.
- `farm_work_site`: farm/work location owned by `farm_owner` and managed by one `labor_agency_owner`, including farm address, required headcount, and work details.

Application APIs must read agency-facing farm owner lists from `labor_agency_farm_owner_profile`.
Central `farm_owner` canonical fields are for identity merge and internal moderation; they must not expose another agency owner's private input.
`farm_owner.internal_memo` is for internal moderation only, not agency-facing notes.

Service user data for labor agency owners follows the same split:

- `labor_agency_owner`: non-sensitive labor agency owner profile.
- `labor_agency_owner_sensitive_profile`: phone, office phone, office address, bank account, email, business registration number, and other encrypted sensitive fields.

Worker records are split into central identity and agency-private views:

- `worker`: central worker identity with shared canonical fields.
- `worker_sensitive_profile`: central encrypted sensitive fields. `phone_hash` is unique when present, so one normalized phone number maps to one worker UUID.
- `labor_agency_worker_profile`: per-agency private worker profile. Local name, nickname, phone copy, pickup location, and private memo are visible only to the owning agency owner.
- `work_type`: shared work type dictionary such as garlic harvest or garlic sorting.
- `labor_agency_worker_work_skill`: per-agency worker skill rating by work type. Ratings are 0 to 5 stars and belong to the agency-private worker profile, not the central worker identity.
- `labor_agency_worker_profile.is_active` and `available_days_mask`: the agency-private default availability rule. The bit mask uses Monday=1, Tuesday=2, Wednesday=4, Thursday=8, Friday=16, Saturday=32, Sunday=64.
- `labor_agency_worker_availability_exception`: date-range availability overrides such as resting, unavailable, or explicitly available periods.
- `labor_agency_worker_payment_profile`: per-agency worker payment information. Account numbers are sensitive data and must stay off the central `worker` table.

Application APIs must read agency-facing worker lists from `labor_agency_worker_profile`.
Central `worker` canonical fields are for identity merge and internal moderation; they must not expose another agency owner's private input.

Application accounts are split into accounts and roles:

- `app_account`: login identity with bcrypt password hash and optional link to `labor_agency_owner`.
- `app_role`: role definitions such as `ADMIN` and `LABOR_AGENCY_OWNER`.
- `app_account_role`: many-to-many account role assignment.
- `app_identity_provider`: enabled social login providers such as `GOOGLE`, `NAVER`, and `KAKAO`.
- `app_account_social_identity`: external provider identities linked to `app_account`.

Seed accounts are for local development only. Passwords are stored as bcrypt hashes, never plaintext.
Social provider subject and email values should be normalized and stored as hash/encrypted fields, not plaintext.

Authentication sessions are stored in `app_auth_session`.
Refresh token plaintext must never be stored; only a SHA-256/HMAC-style hash is persisted.
Standard sessions are limited to 12 hours, and remembered sessions are limited to 30 days.
Refresh token rotation should create a new session row, link it with `replaced_by_session_uuid`, and revoke the previous row.
