# Student Onboarding Agent

> **Database (current):** the module now runs on the LMS's PostgreSQL database through `PostgresLmsAdapter`
> and `PostgresCustomFieldStore`, using the server's connection pool. Its tables (`soa_*`) are part of the server
> migrations (`server/database/postgres/migrations`, `npm run db:migrate`); the SQLite adapters, the module's
> migrations folder and `apply-migration-003.js` were removed. Tests need `LMS_TEST_DATABASE_ADMIN_URL`
> (see `docs/POSTGRESQL.md`). Mentions of SQLite, `SqliteLmsAdapter` and `.db` files below are the historical log.

A standalone AI module that will import students from Excel files, use an LLM
to understand messy columns and data, create student records through
create-only tools, and handle onboarding/verification emails, progress
tracking and audit reporting.

## Current status

**Orchestration foundation + Excel parsing + deterministic validation.** The
backend has:

- the provider-agnostic agent layer (agent, context, LLM provider contract,
  tool registry) and a `POST /agent/run` endpoint;
- a deterministic Excel import engine behind `POST /import/parse`;
- a deterministic student data validator driven by
  `config/studentSchema.json`. The validator is an internal service with no
  endpoint; see [backend/src/validation/README.md](backend/src/validation/README.md).
- LLM-assisted column mapping (Steps 6A/6B). An LLM proposes which Excel
  column is which student field; deterministic guardrails decide. This is an
  internal service (`ColumnMappingService`) with no endpoint; see
  [backend/src/mapping/README.md](backend/src/mapping/README.md).
- an import job workflow (Step 7): review, human mapping decisions, final
  validation and approval, with server-owned job state. This is an internal
  service (`ImportJobService`) with no endpoints, because the module has no
  authentication yet; see [backend/src/import/README.md](backend/src/import/README.md#import-jobs-step-7).

- the create-only tool layer (Step 8): `executeApprovedImport(jobId)` runs
  `createStudent` and `assignStudentToClassroom` for an approved import
  through a locked, create-only tool registry and a narrow LMS adapter
  interface. **Only a fake, in-memory LMS adapter exists**; see
  [backend/src/execution/README.md](backend/src/execution/README.md).

- the real LMS adapter (Step 9B): `SqliteLmsAdapter` implements the same two
  methods against the LMS's SQLite database. It uses transactions, a
  verified admin tenant, durable idempotency and quota; see
  [backend/src/adapters/lms/README.md](backend/src/adapters/lms/README.md).

- the LMS integration (Step 9D): the import workflow is mounted in the LMS
  at `/api/onboarding`, for school admins only (see
  [LMS integration](#lms-integration-step-9d)).

The idempotency migration
(`backend/src/adapters/lms/migrations/001_soa_idempotency_keys.sql`) has
been applied to the LMS database (`server/data/lms_permanent.db`,
2026-09-28). It added only the `soa_idempotency_keys` table. No real import
has been executed yet, no email is sent, and `/agent/run` is not wired to
the workflow.

How the pieces fit:

```
Excel upload → parse (Step 4)
  → safe header/sample preparation: exact headers + a few MASKED sample values (6B)
  → LLM semantic mapping via any LLMProvider; Gemini implemented (6B)
  → ColumnMappingGuard, authoritative (6A)
  → canonical rows: accepted columns only, Excel rowNumber kept (6B)
  → StudentDataValidator (Step 5)
  → IMPORT REVIEW: blocking vs non-blocking issues (7)
  → human mapping decisions, checked by the same guard (7)
  → FINAL VALIDATION → approval-ready → APPROVED, frozen (7)
  → create-only execution (8) → SqliteLmsAdapter → LMS database (9B/9D)
```

- **LLM mapping is advisory; the deterministic guardrails are authoritative.**
- **Unresolved columns** (ambiguous, unmapped, rejected) **require human
  review**. They are never copied into student data.
- **No real student data is intentionally sent to the LLM.** Only headers and
  masked samples are sent, never the complete workbook or full rows. Masking
  is data minimization, not a privacy guarantee.
- **The LLM has no database or LMS access** and cannot create, update or
  delete students.
- **The LLM never gets database or tool access.** Tools are create-only,
  require an approved import, reject every system-controlled field, and
  reach the LMS only through a two-method adapter interface.
- **The LLM cannot approve anything.** Only `approveImport` does, and only
  when the deterministic review has no blocking issue. An approved import can
  no longer be changed.

| Area                                  | Status               |
|---------------------------------------|----------------------|
| Folder structure                      | Done                 |
| Backend server + `/health`            | Done                 |
| Agent orchestration layer (skeleton)  | Done                 |
| `POST /agent/run` (validation only)   | Done                 |
| LLM provider contract                 | Done                 |
| Tool registry                         | Done (no tools)      |
| Excel upload + parsing (`/import/parse`) | Done              |
| Canonical student schema (`config/studentSchema.json`) | Done (0.2.0, decisions finalized) |
| Student data validation (service, `npm test`) | Done       |
| Column-mapping contract + guardrails (Step 6A) | Done       |
| LLM column mapping + canonical rows (Step 6B) | Done (service; Gemini provider not yet run against the live API) |
| Import review, decisions, final validation, approval (Step 7) | Done (service; in-memory job store; no HTTP routes) |
| Create-only student tools (Step 8)    | Done (service; fake LMS adapter only) |
| Real LMS adapter (Step 9B, SQLite)    | Done; idempotency migration applied (2026-09-28); needs Node 22.5+ |
| LMS integration (Step 9D, `/api/onboarding`) | Done; admin-only, tenant-scoped |
| Actual onboarding logic               | Not started          |
| Frontend UI                           | Not started          |
| LLM provider: Gemini (REST, no SDK)   | Implemented; offline-tested only |
| Database / SQLite                     | Connected through `SqliteLmsAdapter` only |
| Dependencies installed                | `express`, `dotenv`, `exceljs`, `multer` |

## Running the standalone backend

Requires Node.js 18.11 or newer. Run all commands from this folder
(`ai-modules/student-onboarding-agent/`):

```bash
npm install        # installs into this module's own node_modules
npm start          # start the backend
npm run dev        # start with auto-restart on file changes (node --watch)
npm test           # run the tests (Node's built-in test runner, no extra deps; never calls an LLM)
npm run mapping:manual  # opt-in: try column mapping against the configured real LLM (synthetic data)
```

The server listens on `SOA_PORT` from this module's `.env`, and uses port
**5055** if it is not set.

Check that it is running:

```bash
curl http://localhost:5055/health
```

```json
{ "status": "ok", "service": "student-onboarding-agent", "timestamp": "..." }
```

## API

### `GET /health`

Returns `200` with the JSON above.

### `POST /agent/run`

Runs the agent for one onboarding request. Body (`Content-Type: application/json`):

| Field       | Type             | Required | Notes                                        |
|-------------|------------------|----------|----------------------------------------------|
| `requestId` | string (≤100)    | no       | Generated (UUID) if omitted                  |
| `source`    | `{ type, reference? }` | one of `source` / `students` | e.g. `{ "type": "excel", "reference": "batch.xlsx" }` |
| `students`  | array of objects | one of `source` / `students` | Raw records; not validated as students yet |
| `metadata`  | object           | no       | Passed through                               |

Unknown fields are rejected.

```bash
curl -X POST http://localhost:5055/agent/run \
  -H "Content-Type: application/json" \
  -d '{"source":{"type":"manual"},"students":[{"name":"Asha","email":"asha@example.com"}]}'
```

`200` response (current behaviour: nothing is called or created):

```json
{
  "requestId": "…uuid…",
  "status": "provider_not_configured",
  "message": "The orchestration layer is ready, but no LLM provider is configured. No LLM was called and no records were created.",
  "llm": { "configured": false, "provider": null, "called": false },
  "tools": { "registered": [], "invoked": [] },
  "input": { "source": { "type": "manual", "reference": null }, "studentsReceived": 1 },
  "validation": { "errors": [], "warnings": [] },
  "startedAt": "…",
  "completedAt": "…"
}
```

Student records are not echoed back, only counted.

Errors are always JSON of the form `{ "error": { "code", "message", "details?" } }`,
and never include stack traces:

| HTTP | `code`              | When                                           |
|------|---------------------|------------------------------------------------|
| 400  | `VALIDATION_ERROR`  | Body missing, not an object, or fields invalid (`details` lists every problem) |
| 400  | `INVALID_JSON`      | Malformed JSON                                 |
| 413  | `PAYLOAD_TOO_LARGE` | Body over 100 KB (Express default)             |
| 404  | `NOT_FOUND`         | Unknown route or method                        |
| 500  | `INTERNAL_ERROR`    | Unexpected error (details are logged server-side only) |

### `POST /import/parse`

Uploads one Excel workbook and returns a parsed **preview**. Nothing is saved:
the file is held in memory only for the request and never written to disk.

- `multipart/form-data`, one file in the field **`file`**
- Supported type: **`.xlsx` only** (not `.xls`, `.xlsm`, `.csv`). The
  extension is checked first, then the file content itself.
- Max size: `SOA_IMPORT_MAX_FILE_MB` (default 10 MB). Max data rows:
  `SOA_IMPORT_MAX_ROWS` (default 5000).

```bash
curl -X POST http://localhost:5055/import/parse -F "file=@students.xlsx"
```

`200` response:

```json
{
  "success": true,
  "file": { "name": "students.xlsx", "sheetName": "Students", "sheetNames": ["Students"], "headerRowNumber": 1 },
  "summary": { "rowCount": 1, "columnCount": 3, "skippedBlankRows": 0, "previewRowCount": 1 },
  "headers": ["Student Name", "Email", "Class"],
  "previewRows": [
    { "rowNumber": 2, "values": { "Student Name": "Rahul Sharma", "Email": "rahul@gmail.com", "Class": "10-A" } }
  ],
  "warnings": []
}
```

- **Preview only:** `previewRows` holds at most the first **20** data rows.
  `summary.rowCount` is the full count. The parser produces all rows
  internally; later steps will use them without sending them to the browser.
- `rowNumber` is the row's number in Excel, so problems can be traced back to
  the spreadsheet.
- Headers are kept exactly as written (only trimmed). **No column meaning is
  inferred:** `"Student Name"` is not split into first/last name, and no
  column is mapped to an LMS field. Mapping Excel columns to LMS fields is a
  later step that will use the LLM provider abstraction.
- No student validation happens here (emails, required fields, duplicates,
  classes, parents, passwords). That is a later deterministic validation stage.
- `warnings` are `{ code, message }` objects for things such as ignored extra
  worksheets, formulas (never evaluated; the saved result is used), Excel
  error cells, merged cells, and values outside the header columns.

Upload/parse errors use the same error format:

| HTTP | `code`                  | When                                                  |
|------|-------------------------|-------------------------------------------------------|
| 400  | `MISSING_FILE`          | No file / not multipart                               |
| 400  | `UNEXPECTED_FILE_FIELD` | File in a field other than `file`, or more than one file |
| 400  | `INVALID_UPLOAD`        | Malformed multipart body                              |
| 400  | `UNSUPPORTED_FILE_TYPE` | Not `.xlsx`, content is not an XLSX, or contains macros |
| 400  | `EMPTY_FILE`            | Zero-byte file                                        |
| 400  | `INVALID_WORKBOOK`      | Corrupted or unreadable workbook                      |
| 400  | `NO_USABLE_WORKSHEET`   | Every worksheet is empty or hidden                    |
| 400  | `EMPTY_HEADER`          | A header cell is empty (incl. merged header cells)    |
| 400  | `DUPLICATE_HEADER`      | Two headers are equal, ignoring case                  |
| 400  | `TOO_MANY_ROWS`         | More than `SOA_IMPORT_MAX_ROWS` data rows             |
| 413  | `FILE_TOO_LARGE`        | Upload over `SOA_IMPORT_MAX_FILE_MB`                  |
| 413  | `WORKBOOK_TOO_LARGE`    | Workbook would expand to over 100 MB (zip bomb guard) |

See [backend/src/import/README.md](backend/src/import/README.md) for the
parser rules and the full normalized result.

## Standalone development principle

This module is developed in isolation from the existing LMS.

> **The existing LMS must not be modified during standalone development.**
> That includes `client/`, `server/`, the LMS `package.json`, routes,
> controllers, services, database, authentication, email, Socket.IO, and git
> configuration.

Rules:

- All code, config, dependencies and docs live inside
  `ai-modules/student-onboarding-agent/`.
- Nothing here imports from `client/` or `server/`, and nothing there imports
  from here.
- This module has its own `package.json`, `.env` and `node_modules`.
- Removing the module = deleting `ai-modules/` (or this folder). No other
  cleanup required.

## Planned capabilities

- Excel student import
- LLM-powered column and data understanding
- Create-only student tools (no updates or deletes of existing records)
- Student onboarding and verification
- Email triggering
- Progress tracking
- Audit and import reporting

## Planned architecture (high level)

```
student-onboarding-agent/
├── backend/    agent orchestration, LLM providers, tools, import, email,
│               progress, reporting, and (later) a single LMS adapter
├── frontend/   upload → review mapping → confirm → progress → report
├── config/     module-owned settings (provider, schema, limits)
├── docs/       architecture and design notes
├── .env.example
└── package.json
```

**LLM provider isolation.** The agent talks to one `LLMProvider` contract
(`backend/src/llm/LLMProvider.js`, implemented) and receives the provider by
dependency injection. Gemini will be the first provider; OpenAI and Hugging
Face can be added as new provider adapters selected by `SOA_LLM_PROVIDER`,
without changing agent or business logic. No provider exists yet.

**Create-only tools.** The `ToolRegistry` (implemented, empty) only accepts
tools with `read` or `create` access, so update/delete tools cannot be
registered.

**LLM proposes, code decides.** LLM output (column mappings, normalised
values) always passes deterministic validation before any record is created.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## LMS integration (Step 9D)

`backend/src/integration/lmsOnboarding.js` builds an Express router for the
LMS. The LMS mounts it in `server/server.js` through
`server/routes/onboardingRoutes.js`:

```js
app.use("/api/onboarding", requireAuth, requireTenant, onboarding.router, onboarding.errorHandler);
```

| Method and path | Purpose |
|---|---|
| `GET /api/onboarding/fields` | Mappable student fields from `config/studentSchema.json`, used by the admin UI |
| `POST /api/onboarding/imports` | Upload one `.xlsx` file (multipart field `file`, nothing else) and start a job |
| `GET /api/onboarding/imports/:jobId` | Get the review |
| `POST /api/onboarding/imports/:jobId/decisions` | `{ decisions, expectedVersion? }`: human column mapping |
| `POST /api/onboarding/imports/:jobId/validate` | Run the final validation again |
| `POST /api/onboarding/imports/:jobId/approve` | `{ expectedVersion? }` |
| `POST /api/onboarding/imports/:jobId/execute` | Empty body. Only for approved jobs; safe to repeat |

Security:

- **Access.** The requester needs a valid JWT (`requireAuth`), a school that
  exists (`requireTenant`) and the `admin` role. On every request the router
  also checks the user's database row: it must still be an admin of that
  same school.
- **Server-owned values.** The actor is built only from `req.user`:
  `{ userId, role: 'admin', universityId }`. A request that sends a school,
  user, role, rows, approval state or database ID is rejected with
  `400 INVALID_REQUEST`; those values are never ignored silently or used.
- **Tenant isolation.** A job belongs to the school that created it. Other
  schools get `404 JOB_NOT_FOUND`.
- **Execution.** `execute` runs the Step 8 executor with a
  `SqliteLmsAdapter`. The adapter opens its own connection for that request
  and closes it afterwards. It can only `createStudent` and
  `assignStudentToClassroom`.
- **Safe responses.** Only error codes and fixed messages are returned: no
  SQL, stack traces, paths or password data. The review shows issue codes
  and row numbers, not cell values. Upstream errors on these paths, such as
  malformed JSON, get the same safe JSON shape.
- **Automatic mapping.** No LLM provider is configured in the LMS
  environment, so admins map the columns themselves.

Limits:

- Import jobs and the per-job execution record are held in memory and are
  lost on restart.
- Each created student and assignment is recorded in the database
  (`soa_idempotency_keys`), so re-running an approved import never
  duplicates students or assignments, even after a restart.
- There is no UI entry point yet.

### Password setup and onboarding email (Step 11)

After `execute`, each student created by the import gets a one-time email link to set
their own password (`backend/src/onboarding/`). Each result row gets an
`email: { status, code? }` field, and the response gets an `emailTotals` summary.

- **Token.** 32 random bytes. Only its SHA-256 is stored, in
  `soa_student_setup_tokens` (migration `002`). It belongs to one student and
  school, works once, and expires after 72 hours. Sending a new link revokes
  the student's older ones.
- **Link.** `STUDENT_SETUP_URL#token=…`. The token is in the URL fragment, so
  it never appears in server URL logs. The client page `/setup-password`
  sends it to the public, rate-limited endpoints:
  - `POST /api/student-setup/check` with `{ token }`
  - `POST /api/student-setup/complete` with `{ token, password }`
- **Password.** Hashed with the LMS's own `bcryptjs` at 10 rounds. It must be
  8 or more characters and at most 72 bytes.
- **Email statuses.**

  | Status | Meaning |
  |---|---|
  | `sent` | The setup email was sent |
  | `already_sent` | A live link was already emailed |
  | `in_progress` | Another request is sending this student's email |
  | `rate_limited` | The student already got 5 links in the last 24 hours |
  | `account_already_set_up` | The student has already set a password |
  | `email_failed` | Sending failed; `code` says why. The student stays created and the link is revoked |
- **Retrying.** Run the import again: only failed or expired links are sent
  again.
- **Email sending.** The LMS adapter (`server/services/onboardingEmailAdapter.js`)
  uses the LMS's SMTP transporter. It never falls back to a mock and never
  logs anything. Tests use `FakeEmailAdapter`.

Tests: `server/test/integration/onboarding.test.js` and
`server/test/integration/student-setup.test.js` (run from `server/`).
It uses the real LMS middleware, a temporary SQLite file with the migration
applied, and a loopback-only HTTP server.

## Configuration

Copy `.env.example` to `.env` inside this folder. All variables are prefixed
`SOA_` to avoid collisions with LMS environment variables. Read so far:
`SOA_PORT`, `SOA_IMPORT_MAX_FILE_MB`, `SOA_IMPORT_MAX_ROWS`,
`SOA_LLM_PROVIDER`, `SOA_LLM_MODEL`, `SOA_GEMINI_API_KEY`,
`SOA_LLM_TIMEOUT_MS`, `SOA_MAPPING_SAMPLES_PER_COLUMN`. An invalid number
stops at startup with a clear message. Leaving the LLM settings empty is
allowed: mapping then reports `LLM_PROVIDER_NOT_CONFIGURED`. Never commit
`.env`; it is git-ignored. The backend loads this module's `.env` by absolute path, so it
never picks up the LMS `.env`, whatever directory it is started from.
