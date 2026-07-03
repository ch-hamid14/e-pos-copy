# PostgreSQL Desktop Install

The Electron POS uses a **local PostgreSQL database** with the same schema as the company's cloud database.

## 1. Install PostgreSQL 15+

Install on the client machine using your standard playbook.

## 2. Create company database

```sql
CREATE DATABASE madix_company_<company_uuid_without_dashes>;
CREATE USER madix_pos WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE madix_company_<id> TO madix_pos;
```

## 3. Configure the desktop app

Create or edit `database.json` in the app user data folder:

`~/Library/Application Support/madix-e-pos/database.json` (macOS)

```json
{
  "host": "localhost",
  "port": 5432,
  "user": "madix_pos",
  "password": "your-secure-password",
  "database": "madix_company_<company_id>"
}
```

On first launch the app runs company migrations automatically.

## 4. Initial data restore

1. Generate cloud snapshot: `pg_dump -Fc -d madix_company_<id> > company.dump`
2. Restore locally: `pg_restore -d madix_company_<id> company.dump`
3. Login on desktop — app pulls delta from `last_sequence`

## 5. Environment overrides (optional)

```
PG_HOST=localhost
PG_PORT=5432
PG_USER=madix_pos
PG_PASSWORD=...
PG_DATABASE=madix_company_...
```
