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

- `farm_owner`: non-sensitive owner profile and operating status.
- `farm_owner_sensitive_profile`: phone, bank account, business registration number, and other encrypted sensitive fields.
- `farm_work_site`: farm/work location owned by `farm_owner`, including farm address, required headcount, and work details.
