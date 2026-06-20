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
