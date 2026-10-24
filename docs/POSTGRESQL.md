# PostgreSQL for the LMS

The LMS server, the AI assessment module and the student onboarding module all keep their data in one PostgreSQL database. The server will not start unless that database is reachable and fully migrated. It never falls back to SQLite.

Values you supply are written `<LIKE THIS>`. Never put a real password in a file that is committed. Real values go only in `server/.env`, which git ignores.

## 1. Install PostgreSQL (once per machine)

1. Install PostgreSQL 16 or 17 from https://www.postgresql.org/download/windows/ (the EDB installer).
2. The installer asks for a password for the `postgres` superuser. Choose one, keep it safe, and note it down: this is `<POSTGRES_PASSWORD>`. There is no default.
3. Keep port 5432 and let it install the Windows service (`postgresql-x64-17`).
4. Add `C:\Program Files\PostgreSQL\17\bin` to PATH, or set `PG_BIN` to that folder in `server/.env`. The backups use `pg_dump` and `pg_restore` from there.

Check that it runs:

```powershell
Get-Service postgresql*
psql -U postgres -h localhost -c "select version()"
```

## 2. Create the LMS roles and database (once)

| Role | Used for | Rights |
|---|---|---|
| `postgres` | this set-up step only | superuser; the LMS never uses it |
| `lms_owner` | `db:migrate`, `db:status`, the SQLite import (`DATABASE_MIGRATION_URL`) | owns the schema and tables; not a superuser |
| `lms_app` | the running server (`DATABASE_URL`) | read and write rows and use id sequences only; no CREATE, ALTER, DROP or TRUNCATE |

Choose two new passwords, each at least 16 characters and different from each other. Then run:

```powershell
cd server
$env:LMS_OWNER_PASSWORD = '<LMS_OWNER_PASSWORD>'
$env:LMS_APP_PASSWORD   = '<LMS_APP_PASSWORD>'
$env:PGPASSWORD         = '<POSTGRES_PASSWORD>'
npm run db:setup -- --admin-url postgres://postgres@localhost:5432/postgres --database lms
Remove-Item Env:LMS_OWNER_PASSWORD, Env:LMS_APP_PASSWORD, Env:PGPASSWORD
```

The script never prints the passwords. It is safe to run again: existing roles keep their passwords unless you pass `--reset-passwords`.

Then put these two lines in `server/.env` with the real passwords (see `server/.env.example`):

```
DATABASE_URL=postgres://lms_app:<LMS_APP_PASSWORD>@localhost:5432/lms
DATABASE_MIGRATION_URL=postgres://lms_owner:<LMS_OWNER_PASSWORD>@localhost:5432/lms
```

A password containing `@ : / ? #` or `%` must be percent-encoded in the URL. For example, `@` becomes `%40`.

## 3. Create the tables

```powershell
npm run db:migrate     # applies database/postgres/migrations/*.sql in order, as lms_owner
npm run db:status      # "up to date"
```

Each migration file runs in its own transaction and is recorded with a checksum in `schema_migrations`. Running the command again does nothing. If an applied file is later edited, the server refuses to start. Schema changes are always a new numbered file.

## 4. Bring over the existing SQLite data (once)

```powershell
npm run db:import-sqlite -- --sqlite data/lms_permanent.db --dry-run   # full rehearsal, then rolls back
npm run db:import-sqlite -- --sqlite data/lms_permanent.db             # the real import
```

What the import does:

- Opens the `.db` file read-only and never changes it. It records the file's SHA-256 before and after.
- Writes a backup copy and a JSON report to `server/data/postgres-import-<time>/`.
- Imports everything in one transaction, keeping every id, relationship and timestamp.
- Before committing, it checks row counts, a content checksum per table, orphaned-relationship counts and sample rows. If any check fails, everything is rolled back, so the target stays empty and the command can simply be run again.
- If the target already has rows it stops. Use `--replace` only when you mean to replace them.
- Import **before** the first server start. With `SEED_DEMO_DATA=true` the server adds demo accounts to an empty database, and the import would then stop because the target is no longer empty.

Keep `server/data/lms_permanent.db` and the import folder. They are the way back (section 8).

## 5. Run the LMS

```powershell
cd server;  npm start           # or: npm run dev
cd client;  npm run dev
```

The first lines show `✅ PostgreSQL connected: lms_app@localhost:5432/lms`. If the database is unreachable, the credentials are wrong or the schema is out of date, the server prints `❌ Database start-up failed: …` and exits. Fix that, then start the server again.

`SEED_DEMO_DATA=true` adds demo accounts to an empty database. Use it for development only; it is refused in production.

## 6. Tests

The tests never touch the `lms` database. They create throw-away databases named `lms_test_*` from a migrated template, then drop them. They need a superuser connection on a development machine:

```powershell
$env:LMS_TEST_DATABASE_ADMIN_URL = 'postgres://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres'
cd server;                                   npm test
cd ai-modules/ai-assessment-agent;           npm test
cd ai-modules/student-onboarding-agent;      npm test
```

CI (`.github/workflows/tests.yml`) does the same with a disposable `postgres:17` service container.

## 7. Backups

```powershell
npm run db:backup -- --out <BACKUP FOLDER>
# also test-restores the backup into a scratch database and compares row counts:
npm run db:backup -- --out <BACKUP FOLDER> --verify-url postgres://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres
```

Run it daily from Task Scheduler. Copy the `.dump` files and the `server/uploads` folder off the machine.

To restore:

1. Stop the server.
2. `npm run db:setup -- --admin-url … --database lms_restored` (this creates the database and the privileges).
3. `pg_restore --no-owner --role=lms_owner -d "postgres://lms_owner:…@localhost:5432/lms_restored" <file>.dump`
4. Point `DATABASE_URL` at `lms_restored`.
5. Start the server and check `GET /health/ready`.

## 8. Going back to SQLite (rollback)

The SQLite file is never modified by the import. Rolling back means running the previous release of the code (before the PostgreSQL migration) against `server/data/lms_permanent.db`. Anything written in PostgreSQL after the import is **not** in that file. If you need it, export it before switching back.

## 9. Troubleshooting

| Message | Cause |
|---|---|
| `password authentication failed for user "lms_app"` | wrong password in `DATABASE_URL`, or it needs percent-encoding |
| `database "lms" does not exist` | section 2 was not run |
| `has no LMS schema yet` / `schema is out of date (pending: …)` | section 3 was not run (or a new migration came with an update) |
| `Applied migration files were edited afterwards` | a file in `database/postgres/migrations` was changed after it was applied; restore it and add a new file |
| `permission denied for table …` while migrating | `DATABASE_MIGRATION_URL` points at `lms_app`; it must be `lms_owner` |
| `Connection terminated due to connection timeout` | PostgreSQL service stopped, or the host or port is wrong |
