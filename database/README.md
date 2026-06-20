# Database Migrations

Run migration files against local PostgreSQL in order.

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
- `labor_agency_owner_sensitive_profile`: phone, bank account, email, business registration number, and other encrypted sensitive fields.

Worker records are split into central identity and agency-private views:

- `worker`: central worker identity with shared canonical fields.
- `worker_sensitive_profile`: central encrypted sensitive fields. `phone_hash` is unique when present, so one normalized phone number maps to one worker UUID.
- `labor_agency_worker_profile`: per-agency private worker profile. Local name, nickname, phone copy, and private memo are visible only to the owning agency owner.

Application APIs must read agency-facing worker lists from `labor_agency_worker_profile`.
Central `worker` canonical fields are for identity merge and internal moderation; they must not expose another agency owner's private input.
