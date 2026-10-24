# MY LMS — Deployment and Rollback Runbook

For the person who installs and operates the LMS. It describes the topology the code supports today, the exact steps to bring a release up, how to check it, and how to go back.

Status of this document: every command was run on a development machine against temporary databases, except where a step says **not executed**. No staging or production server exists yet, so the first run of this runbook on a real host is itself a test. Values the owner must supply are written `<LIKE THIS>`; none of them is invented here.

Related: findings and evidence are in [security/SECURITY_REMEDIATION_PLAN.md](security/SECURITY_REMEDIATION_PLAN.md) (Part 4 is the current state); the plain-language version is [security/SECURITY_FIXES_SIMPLE_HINGLISH.md](security/SECURITY_FIXES_SIMPLE_HINGLISH.md).

## 1. What is deployed

| Part | What it is | Where it runs |
| --- | --- | --- |
| API server | `server/server.js` (Node, Express, Socket.IO). Loads both AI modules from `ai-modules/` in the same process | One long-running Node process |
| Database | PostgreSQL 16/17, one database (default name `lms`); set-up, migrations, import, backups: [POSTGRESQL.md](POSTGRESQL.md) | The API host or a database host it can reach |
| Uploaded files | A folder. Default `server/uploads`; set `LMS_UPLOADS_DIR` | Local disk of the API host |
| Web client | Static files built by Vite (`client/dist`) | Any static host. `client/vercel.json` is ready for Vercel |

**Supported topology: one API process.** Rate limits, import jobs and Socket.IO rooms live in the process's memory, so two API processes would each have their own. Do not run more than one instance, and do not put uploads on storage that disappears on redeploy (many "serverless" and container platforms wipe the local disk).

Measured on a 4-thread laptop with 2 × 2,000 students (plan, section 31): about 680 read requests per second before latency grows. That is a ceiling for one small machine and read traffic only, not a statement about how many schools it serves.

## 2. Before the first deployment (owner)

These cannot be done from the code and block a deployment with real schools.

1. **Rotate what was committed to Git**: the support mailbox password, and deactivate the two Razorpay key pairs that were in source. (Payments stay switched off until there is a customer; deactivating leaked keys is a separate act.)
2. **Decide the hosts**: `<API HOST>` (must keep a local disk), `<API URL>` such as `https://api.example.org`, and `<WEB URL>` for the client.
3. **Have a place for backups** that is not the API host: `<BACKUP LOCATION>`.
4. **Install Node.js 24 LTS and npm** on the build machine and on the API host. All test results in the plan were produced on Node 24.21.0.

## 3. Configuration

Create `server/.env` on the API host from `server/.env.example`. The server refuses to start, and says why, when a required value is missing or still a placeholder.

| Variable | Required in production | Notes |
| --- | --- | --- |
| `NODE_ENV=production` | Yes | Turns on the production start-up checks |
| `PORT` | No (5002) | |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Yes | Two different random values of 32+ characters. Generate each with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CORS_ORIGINS` | Yes | `<WEB URL>`; several are comma-separated. A `*` is refused |
| `TRUST_PROXY_HOPS` | When behind a reverse proxy | Number of proxies in front (usually `1`); without it every user shares the proxy's rate limit |
| `DATABASE_URL` | Yes | `postgres://lms_app:<LMS_APP_PASSWORD>@<DB HOST>:5432/lms`: the least-privilege role ([POSTGRESQL.md](POSTGRESQL.md) section 2) |
| `DATABASE_MIGRATION_URL` | For migrations, import, backups | `postgres://lms_owner:<LMS_OWNER_PASSWORD>@<DB HOST>:5432/lms` |
| `PG_BIN` | If `pg_dump` is not on PATH | PostgreSQL's `bin` folder |
| `LMS_UPLOADS_DIR` | Recommended | Absolute path on the persistent data disk |
| `LMS_EXIT_ON_FATAL=true` | When a supervisor restarts the process | |
| `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | For password reset and notices | Use the rotated mailbox password |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PLAN_PRICE_STANDARD_INR`, `PLAN_PRICE_PROFESSIONAL_INR` | No | Leave empty for now: payment requests answer 503 and the pages say that online payment is not available |
| `SEED_DEMO_DATA` | Must be absent or `false` | Refused in production |
| `AIA_LLM_PROVIDER`, `AIA_LLM_MODEL`, `HF_TOKEN` | Only for AI question generation | Without them the AI pages say generation is unavailable; manual tests still work |

The client needs one value at build time: `VITE_BACKEND_URL=<API URL>/api` (ending in `/api`). `VITE_RAZORPAY_KEY_ID` stays unset while payments are off.

## 4. Release steps

Run from the repository root on the API host unless a step says otherwise. PowerShell and POSIX shells take the same commands.

### 4.1 Install

```
cd server && npm ci
cd ../ai-modules/ai-assessment-agent && npm ci
cd ../student-onboarding-agent && npm ci
```

`server` has three packages with a native part (`sqlite3`, `better-sqlite3`, `bcrypt`); the two SQLite drivers are used only by the one-time SQLite import. They install a ready-made binary through their install script. npm 12 and later block install scripts unless they are approved; if a script then fails with "Could not locate the bindings file", run `npm rebuild sqlite3 better-sqlite3 bcrypt` in `server/` (or approve the scripts when npm asks).

### 4.2 Check the build before it serves anyone

The tests create and drop their own `lms_test_*` databases; they need `LMS_TEST_DATABASE_ADMIN_URL` (a superuser connection on a NON-production PostgreSQL, see [POSTGRESQL.md](POSTGRESQL.md) section 6).

```
cd server && npm test                                   # 403 tests, temporary databases only
cd ../ai-modules/ai-assessment-agent && npm test        # 502
cd ../student-onboarding-agent && npm test              # 338
```

Known failures carried over unchanged from the SQLite release: 3 Razorpay tests in `server/tests/feesAndCertificates` and 6 custom-field tests in the onboarding module.

Optional and recommended on a machine with Chrome: the browser run of the four portals.

```
cd server
npm run e2e:stack        # terminal 1: throw-away server and client on ports 5612 / 5178
npm run e2e:browser      # terminal 2: 38 checks; set E2E_HEADLESS=1 on a machine without a screen
```

None of these commands reads `server/.env` or touches the `lms` database.

### 4.3 Back up what is there

Skip on the very first installation.

```
cd server
npm run db:backup -- --out <BACKUP LOCATION> --verify-url <superuser URL of a NON-production server>
```

It prints `Verified:` and exits 0 only after it has restored the backup into a scratch database and compared every table. Copy the uploads folder to the same place with the same timestamp.

### 4.4 Database changes

All tables (the core LMS and both AI modules) are created by numbered SQL migrations, applied with the owner role and the server stopped:

```
cd server && npm run db:migrate && npm run db:status
```

The server never changes the schema itself; it refuses to start while a migration is pending. The first installation on a host with an existing SQLite database also needs the one-time import ([POSTGRESQL.md](POSTGRESQL.md) section 4; run it with `--dry-run` first).

On a database that existed before this release, also review ownership of old rows:

```
cd server && node scripts/security/reconcile-school-ownership.js --database-url <DATABASE_MIGRATION_URL>
```

It only reports. Rows it lists with no school are shown to no school until the owner decides (`--apply-derived`, `--assign-remaining <school id>`; both write an undo SQL file first).

### 4.5 Start the API

The process must be run by a supervisor that restarts it and stops it politely. The server shuts down cleanly on `SIGTERM`/`SIGINT`, and on Windows on the process message `shutdown` (PM2: `shutdown_with_message: true`): it finishes requests in hand, closes the database and exits 0 within 10 seconds (tested).

```
cd server && node server.js
```

Readiness: `GET <API URL>/health/ready` answers `{"status":"ready"}` with 200 once the database is usable, and 503 otherwise. Point the supervisor's and the load balancer's health check at it. `GET /health` only says the process is alive.

Examples of supervisor settings (examples, not installed by this project): systemd `Restart=always`, `KillSignal=SIGTERM`, `TimeoutStopSec=15`; PM2 `instances: 1`, `kill_timeout: 12000`, `shutdown_with_message: true` on Windows. Always **one** instance.

Serve the API over HTTPS. The API sets its own security headers (helmet); the proxy must pass `X-Forwarded-For`.

### 4.6 Build and publish the client

```
cd client
npm ci
VITE_BACKEND_URL=<API URL>/api npm run build        # PowerShell: $env:VITE_BACKEND_URL='<API URL>/api'; npm run build
```

Publish `client/dist` on `<WEB URL>`. The host must answer every path with `index.html` (single-page app) and should send the headers listed in `client/vercel.json`. The production build leaves out the pages' debug logging and contains no source maps.

`client/public` does not exist in the repository: the fonts (`/fonts/Mansory*.otf`) and course banners (`/banners/*.png`) that the pages reference are missing, so browsers fall back to default fonts and banners show as empty boxes. Add the files under `client/public/` before building if they are wanted.

### 4.7 First accounts

A new database has no accounts. Create the platform owner once, then use the web pages for everything else. **Not scripted in this release**: the existing helper scripts in `server/` (for example `create-superadmins.js`) predate the remediation and were not reviewed; check one on a copy before using it, or insert the row by hand with a bcrypt hash. Never set `SEED_DEMO_DATA=true` on a real database: the demo accounts use a published password.

On a database that already has the demo accounts (`admin@gmail.com`, `mentor@gmail.com`, `student@gmail.com`, `accountant@demo.com`, `storekeeper@demo.com`, `superadmin@core5.com`), delete them or give each a new password before the URL is shared.

### 4.8 Smoke check after start

1. `GET <API URL>/health/ready` → 200.
2. Open `<WEB URL>/login`; sign in as the platform owner; the dashboard lists schools.
3. Create a test school; sign in as its admin with the one-time password; create a teacher.
4. Request a password reset for a mailbox you control and complete it (this is the one path that needs real mail and has only been tested against the mock transport).
5. Upload a chapter file as a teacher and open it as a student.
6. In the API log, look for lines with `"status":5` (one JSON line per request, with a request id that is also returned in the `X-Request-Id` header).

## 5. Monitoring and backups after go-live

Nothing here is configured by the project; each line is an owner task.

| Need | How |
| --- | --- |
| Is it up | An external check on `GET /health/ready` every minute; alert on two failures |
| Errors | Alert on API log lines with status 500 and above; the request id ties a user report to a log line |
| Disk | Alert when the data disk passes 80%. The database and uploads only grow |
| Backups | Schedule `scripts/ops/backup-and-verify.js` daily; copy the result and the uploads folder to `<BACKUP LOCATION>`; keep at least 14 days |
| Restore drill | Once a month restore the latest backup on another machine and start the server on it (section 6.3) |

## 6. Rollback

### 6.1 Code only (the usual case)

1. Stop the API (the supervisor's stop command).
2. Put back the previous release's `server/`, `ai-modules/` and client build.
3. `npm ci` in `server/` if dependencies differ, then start.

**Across the PostgreSQL migration:** a release from before it runs on SQLite only. Rolling back to it means starting it on the untouched `server/data/lms_permanent.db`. Everything written in PostgreSQL since the import is not in that file ([POSTGRESQL.md](POSTGRESQL.md) section 8).

The database changes of this release are additive, so the previous code runs on the migrated file. Expect three effects: password-reset codes issued by this release are stored hashed and the old code cannot use them (users ask for a new one); everyone signs in again if the JWT secrets are changed back; rows now carry a school id that the old code ignores. Rolling back to a release from before the security remediation reopens the holes that remediation closed (unauthenticated routes, cross-school reads) — do it only as an emergency and off the public internet.

Dependency note: this release moves `sqlite3` from 5 to 6, `nodemailer` from 8 to 10 and `puppeteer` from 24 to 25. Going back means reinstalling the previous `package-lock.json` (`npm ci`).

### 6.2 Client only

Republish the previous `client/dist`. The API accepts both.

### 6.3 Data

Only when data itself is wrong.

1. Stop the API.
2. Restore the chosen backup into a new database and point `DATABASE_URL` at it ([POSTGRESQL.md](POSTGRESQL.md) section 7). Keep the current database (rename it, do not drop it). Restore the uploads folder of the same time.
4. Start the API; check `/health/ready`; sign in and look at one school.

Everything written after that backup is lost; say so to the schools affected.

## 7. Known limits of this release

- One API instance, one host (section 1).
- Foreign-key enforcement is off (`LMS_ENFORCE_FOREIGN_KEYS`); switching it on fails today because `payments.studentId` is declared against the wrong table. The application checks ownership itself; see the plan, DATA-001/006.
- Online payment is not configured; the verified payment flow is tested only against a stand-in gateway.
- Real email delivery, the CI workflow on GitHub and the client host's security headers have not been exercised.
- The session token is kept in the browser's `localStorage`.
