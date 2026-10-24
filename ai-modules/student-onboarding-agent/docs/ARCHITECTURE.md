# Student Onboarding Agent — Architecture (planned)

Status: mostly design. Implemented so far: the Express server (`GET /health`),
the agent orchestration skeleton (`agent/`), the `LLMProvider` contract, the
`ToolRegistry`, `POST /agent/run` (validates input and reports that no LLM
provider is configured), and the `import/` stage behind `POST /import/parse`
(deterministic XLSX parsing with a preview; see
[import/README.md](../backend/src/import/README.md)), and the `validation/`
stage: a deterministic validator driven by `config/studentSchema.json`
(service only, no endpoint; see
[validation/README.md](../backend/src/validation/README.md)), and LLM-assisted
column mapping (Steps 6A/6B: masked samples, prompt, Gemini provider, guard,
canonical rows; service only; see
[mapping/README.md](../backend/src/mapping/README.md)), and the Step 7 import
review/approval workflow (`import/ImportJobService.js`: server-owned job state,
human decisions checked by the guard, final validation, frozen approval;
service only, in-memory store; see
[import/README.md](../backend/src/import/README.md#import-jobs-step-7)), and the
Step 8 create-only tool layer (`execution/`, `tools/`, `adapters/lms/` with a
fake LMS only; see [execution/README.md](../backend/src/execution/README.md)).
Nothing else below exists yet. Folder names are
relative to `backend/src/`. See [backend/README.md](../backend/README.md) for
the current code layout.

## Import workflow (Steps 4–7, implemented)

```
Excel
  ↓
Parser                     import/ExcelImportService           (Step 4)
  ↓
LLM Mapping                mapping/ColumnMappingService        (Step 6B; masked samples only)
  ↓
Mapping Guard              mapping/ColumnMappingGuard          (Step 6A; authoritative)
  ↓
Canonical Rows             mapping/CanonicalRowBuilder         (Step 6B; rowNumber kept)
  ↓
Deterministic Validator    validation/StudentDataValidator     (Step 5)
  ↓
Review                     import/ImportReview                 (Step 7; blocking vs non-blocking)
  ↓
Human Mapping Decisions    import/ImportJobService             (Step 7; through the same Mapping Guard)
  ↓
Final Validation           import/ImportJobService             (Step 7; rebuilt from the raw rows)
  ↓
Approved Import            import/ImportJobService             (Step 7; frozen)
  ↓
STEP 8 Create-only Tools   execution/ + tools/ + adapters/lms/ (Step 8; see below)
```

## Create-only execution (Step 8, implemented; fake LMS only)

```
Approved Import              import/ImportJobService.getApprovedImport(jobId)
      ↓
Execution Boundary           execution/ApprovedImportExecutor.executeApprovedImport(jobId)
      ↓                      approved state from the job store, still frozen, re-validated; jobId only
Tool Registry                tools/ToolRegistry (create-only, locked)
      ↓
Tool Argument Validation     tools/ToolExecutor + validateInput (schema + StudentDataValidator rules)
      ↓                      + arguments must equal the approved row
Create-only Tool             createStudent, assignStudentToClassroom
      ↓
LMS Adapter Interface        adapters/lms/LmsAdapter (two business-level methods, via a frozen facade)
      ↓
Fake Adapter (Step 8)        adapters/lms/FakeLmsAdapter (in memory, deterministic)
      ↓
REAL LMS Adapter (Step 9B)   adapters/lms/SqliteLmsAdapter (migration applied 2026-09-28;
                             reached from the LMS via /api/onboarding, Step 9D)
```

Principles:

1. **The LLM never gets database access.** It receives prompt text only; it
   has no tool-calling, no adapter and no connection. The agent can describe
   tools but can only run them via `runApprovedImport(jobId)`.
2. **Tools are create-only.** The onboarding registry allows only `create`,
   is locked, and refuses update/delete and generic names (`executeSQL`,
   `queryDatabase`, `runQuery`, `arbitraryHTTP`, ...).
3. **System-controlled fields cannot originate from Excel, the LLM or the
   browser.** IDs, password, role, approval, tenant, classroom ID, fees,
   status and timestamps are rejected at every layer: the mapping guard, the
   validator, and tool arguments. They are never silently dropped. The real
   adapter generates them.
4. **Tools require an approved import.** Only the `approved` state executes,
   read from the job store. Arguments must match the approved row, and no
   caller-supplied rows, status or approval flag is accepted.
5. **The adapter is not a generic database wrapper.** It has two
   business-level methods, no query/execute/update/delete, and tools see only
   a frozen facade.
6. **Step 8 does not touch the real LMS.** Only `FakeLmsAdapter` exists; no
   database, email, token, Socket.IO or authentication work. Step 9B adds
   `SqliteLmsAdapter`, which does:
   - one transaction per operation, on its own connection
   - an admin and tenant re-verified against the LMS each time
   - durable idempotency keys
   - quota counted inside the transaction

   Its migration has been applied. Step 9D mounts the workflow in the LMS
   (`integration/lmsOnboarding.js`, `/api/onboarding`). The route is
   admin-only and scoped to one school. The actor is built only from the
   verified JWT, and the adapter opens a connection only for `execute` on
   an approved job.
7. **Duplicate/idempotency behaviour is only a standalone boundary for now.**
   The in-memory execution record and the fake adapter's idempotency keys
   stop repeated runs from creating duplicates in-process. Step 9 must make
   both durable and atomic in the LMS.

Principles:

1. **The LLM never approves imports.** It only proposes column meanings.
   Approval happens only through `approveImport()`, and only when the
   deterministic review has no blocking issue.
2. **Human review cannot bypass the mapping guard.** Every human decision is
   checked, together with the whole mapping, by the same `ColumnMappingGuard`
   that checks LLM proposals.
3. **StudentDataValidator remains deterministic.** Same rows and schema, same
   result: no LLM, no randomness, no timestamps. It is the authority on row
   validity.
4. **Approved imports are frozen.** No mapping, canonical data, validation,
   state or approval change is possible afterwards. The service and the job
   store both enforce it.
5. **Step 7 performs no LMS or database mutation.** Jobs live in the module's
   in-memory store; nothing is created, assigned or emailed.

The server owns job state and data. Callers can never submit canonical rows,
validation results, state or approval flags; there is no HTTP route for jobs
until the module is behind the LMS's authentication.

## Pipeline (full, including planned stages)

```
Excel upload
   │
   ▼
import/        parse workbook → raw rows + headers          (implemented)
               headers kept verbatim; no meaning inferred
   │
   ▼
mapping/       LLM-assisted column mapping                        (implemented)
               exact headers + a few MASKED samples (never full rows or the
               workbook) → LLM (via LLMProvider) proposes columns → canonical
               fields of config/studentSchema.json → ColumnMappingGuard
               (authoritative, per-column acceptance) → canonical rows with
               Excel rowNumber. Ambiguous/unmapped/rejected columns go to
               human review, never into student data.
   │
   ▼
validation/    deterministic checks from config/studentSchema.json      (implemented)
               (required, types, email/phone/date/blood group,
               duplicate emails within the batch, forbidden system fields)
   │
   ▼
review +       import job (import/ImportJobService)                (implemented)
approval       review with blocking/non-blocking issues → human mapping
               decisions (same ColumnMappingGuard) → final validation →
               approveImport() only when nothing blocks → frozen job.
               The LLM cannot approve; no HTTP routes until auth exists.
   │
   ▼
tools/         create-only student tools (createStudent,            (Step 8, implemented)
               assignStudentToClassroom) via execution/ApprovedImportExecutor
   │           → adapters/lms/ interface → FakeLmsAdapter now; real adapter in Step 9
   ▼
email/         onboarding / verification emails
   │
   ▼
progress/ + reporting/   per-job progress, audit log, import report
```

## LLM provider isolation

The agent depends on a single interface, never on a vendor SDK:

```
LLMProvider                  (implemented: llm/LLMProvider.js)
  name
  generate(prompt, { responseFormat: 'json', temperature, signal }) -> Promise<text>
  failures: LLMProviderError (fixed, secret-free message + code)
```

Structured output is requested through `responseFormat: 'json'` (JSON mode)
rather than a separate method. Callers still parse strictly and run the
deterministic guard, because JSON mode is a request, not a guarantee. Business
code receives the provider by dependency injection.

- `llm/providers/gemini/`: implemented (REST via `fetch`, no SDK). Tested
  offline with a fake `fetch`; not yet run against the live API.
- `llm/providers/openai/`, `llm/providers/huggingface/`: added later.
- `llm/createLLMProvider.js` picks the provider from `SOA_LLM_PROVIDER`.
- Vendor SDKs, API keys and model names live only inside their provider folder
  and `config/`. Switching providers must not touch `agent/`, `tools/`, or any
  business logic.

## Safety rules

- Tools are **create-only**. The agent never updates or deletes existing
  students or other LMS records. `ToolRegistry` enforces this: it only
  accepts tools whose `access` is `read` or `create`.
- The LLM proposes; deterministic validation decides. LLM output is never
  written to storage without validation.
- Import processing stays linear in the number of rows. Jobs are frozen
  values shared between versions, not deep-copied. Duplicate errors list at
  most 20 related rows (with the full count), so a file whose rows all share
  one email cannot blow up memory.
- Every import produces an audit record (who, when, file, mapping used,
  rows created / skipped / failed and why).

## LMS boundary

All writes to the LMS go through one adapter (`backend/src/adapters/lms/`).
The adapter has two business-level methods. `SqliteLmsAdapter` implements
them for the current LMS.

The LMS integration (`backend/src/integration/lmsOnboarding.js`) uses the
LMS's own authentication and tenant middleware. Its only direct database
access is a read-only check, on each request, of the admin's row and
school. The module has no email or Socket.IO dependency.
