# import/ — Student Onboarding Agent

Two parts:

1. **Excel parsing (Step 4):** deterministic parsing that turns an uploaded
   `.xlsx` into a plain table. It does **not** interpret what the columns mean.
2. **Import jobs (Step 7):** review and approval of an import. See
   [Import jobs](#import-jobs-step-7) below.

| File                    | Role                                                                 |
|-------------------------|----------------------------------------------------------------------|
| `ExcelImportService.js` | `parse(buffer, { fileName })` → normalized result (below)            |
| `xlsxContainer.js`      | Checks the ZIP container before ExcelJS loads it (type, macros, zip bombs) |
| `importJobStates.js`    | (7) Job states and the allowed transitions                           |
| `ImportJobStore.js`     | (7) Storage contract + `InMemoryImportJobStore`                      |
| `ImportReview.js`       | (7) Deterministic review: issues, blocking rules, readiness          |
| `ImportJobService.js`   | (7) The only way to change a job: start, decide, validate, approve   |

## What `parse()` does

1. Rejects empty buffers.
2. Checks the ZIP container without decompressing: must be a real XLSX
   (`xl/workbook.xml`), no VBA macros, declared uncompressed size ≤ 100 MB.
3. Loads the workbook with ExcelJS. Formulas and macros are never executed.
4. Uses the **first visible, non-empty worksheet**. Hidden/empty sheets before
   it and any sheets after it are reported as warnings.
5. The **header row** is the first row with any non-empty cell. Header names
   are trimmed and otherwise kept exactly (`"Student Name"` stays
   `"Student Name"`). Header columns span from the first to the last non-empty
   header cell.
6. Rejects empty header names inside that span, including columns covered by a
   merged header cell, and duplicates (compared case-insensitively).
7. Reads data rows. Rows with no non-blank value in the header columns are
   skipped and counted. More than `SOA_IMPORT_MAX_ROWS` data rows is rejected.

## Result

```js
{
  fileName: 'students.xlsx',        // display-safe base name of the upload
  sheetName: 'Students',
  sheetNames: ['Students', 'Notes'],
  headerRowNumber: 1,               // Excel row number
  headers: ['Student Name', 'Email', 'Class'],
  rows: [
    { rowNumber: 2, values: { 'Student Name': 'Rahul Sharma', Email: 'rahul@gmail.com', Class: '10-A' } },
  ],
  rowCount: 1,
  columnCount: 3,
  skippedBlankRows: 0,              // blank rows between header and last data row
  warnings: [],                     // [{ code, message }]
}
```

Each row keeps its original Excel `rowNumber` so later validation and audit
reports can point to the exact spreadsheet row. Every row has every header as
a key; empty cells are `null`.

## Cell values

| Excel cell                   | Value                                                       |
|------------------------------|-------------------------------------------------------------|
| text / number / boolean      | as is (strings are not trimmed or altered)                  |
| date                         | ISO-8601 string, e.g. `"2010-01-01T00:00:00.000Z"`          |
| rich text                    | concatenated plain text                                     |
| hyperlink                    | the displayed text                                          |
| formula                      | the result Excel last saved (`null` if none); **not evaluated** |
| error (`#N/A`, `#DIV/0!` …)  | the error text                                              |
| covered by a merged cell     | `null` (the value stays in the merge's top-left cell)       |

## Warnings (`code`)

`SKIPPED_WORKSHEETS`, `OTHER_WORKSHEETS_IGNORED`, `NO_DATA_ROWS`,
`FORMULA_CELLS`, `ERROR_CELLS`, `MERGED_CELLS`, `VALUES_OUTSIDE_HEADER`
(non-empty cells right/left of the header columns are ignored).

## Errors (`ValidationError.code`)

`EMPTY_FILE`, `UNSUPPORTED_FILE_TYPE`, `INVALID_WORKBOOK`,
`WORKBOOK_TOO_LARGE` (413), `NO_USABLE_WORKSHEET`, `EMPTY_HEADER`,
`DUPLICATE_HEADER`, `TOO_MANY_ROWS`.

## Intentionally not done by the parser

- No mapping of columns to student fields. That is the column-mapping step
  (`../mapping/`).
- No validation of emails, required fields, uniqueness, classes, parents or
  passwords. That is the validator (`../validation/`).
- No database writes, no LMS calls, no file persistence.

---

## Import jobs (Step 7)

An import job carries one upload through review to approval, so the file is
uploaded only once and all data stays **server-owned**.

```
startJob(buffer)      received → parsed → [LLM mapping + guard] → mapped → [canonical rows + validator] → needs_review | validated
applyMappingDecision  needs_review | validated → mapped → needs_review | validated   (human decision, checked by ColumnMappingGuard)
runFinalValidation    needs_review | validated → mapped → needs_review | validated   (rebuild from raw rows, validate again)
approveImport         validated → approved                                           (final; frozen)
unparseable file      received → failed                                              (final)
```

| State | Meaning |
|---|---|
| `received` | Job created, file not parsed yet |
| `parsed` | Workbook parsed into headers + raw rows |
| `mapped` | A mapping is in place; canonical rows are being (re)built and validated |
| `needs_review` | Blocking issues remain |
| `validated` | Approval-ready |
| `approved` | Frozen; the input for Step 8 |
| `failed` | The file could not be parsed; nothing can continue |

Any other transition (e.g. `received → approved`, `needs_review →
approved`) is refused with `INVALID_STATE_TRANSITION`. **The store enforces
this**, so it holds even if service code is bypassed.

### Service API (no HTTP routes)

```js
const service = new ImportJobService({
  schema, store: new InMemoryImportJobStore(loadImportJobConfig()),
  importService: new ExcelImportService({ maxRows }),
  mappingService: new ColumnMappingService({ schema, llmProvider, samplesPerColumn, timeoutMs }),
});

const review = await service.startJob(buffer, { fileName });            // -> review
await service.getReview(jobId);                                          // -> review
await service.applyMappingDecision(jobId, { decisions: [                 // -> review
  { sourceColumn: 'ID', action: 'map', targetField: 'address' },         //   map to an allowed field
  { sourceColumn: 'Remarks', action: 'unmap' },                          //   confirm as not imported
  { sourceColumn: 'Std', action: 'unresolve' },                          //   back to undecided
] }, { expectedVersion });                                               //   (columns not listed stay as they are)
await service.runFinalValidation(jobId);                                 // -> review
await service.approveImport(jobId, { expectedVersion });                 // -> safe summary (no student data)
await service.getApprovedImport(jobId);                                  // -> frozen canonical rows, for Step 8
```

**Why no HTTP routes yet.** The module has no authentication; adding it is
out of scope. Job endpoints would let anyone who can reach the server read
student data from review results and approve imports. The service boundary
is enough until the module is mounted behind the LMS's authentication. The
routes proposed for that point are:

- `POST /import/jobs` (upload)
- `GET /import/jobs/:id` (review)
- `POST /import/jobs/:id/decisions`
- `POST /import/jobs/:id/validate`
- `POST /import/jobs/:id/approve`

There is still no endpoint that accepts browser-supplied canonical rows.

### Job data

A job stores:

- **File metadata:** name, sheet, header row, counts, parse warnings.
- **Content:** the exact headers, and the raw parsed rows, stored once and
  never modified.
- **Current mapping:** one record per header, with `status`, `targetField`,
  `decidedBy`, the guard's errors, and the model's `candidateFields`,
  `confidence` and `reason`. Those three are display only.
- **Automatic-mapping audit:** provider name, error code, and the masked
  samples sent.
- **Decision log:** column, action and target.
- **Latest results:** canonicalization notes and the latest validator result.
  The validator result carries each row's normalized data, so canonical rows
  are rebuilt, not stored.
- **Approval record.**

It never stores API keys, raw LLM responses, passwords, generated
credentials or LMS identifiers. The review is computed on demand, never
stored.

**Jobs are frozen values.** The store deep-freezes every job on write and
hands out the frozen object itself. Callers cannot change a stored job
through a reference, and nothing is deep-copied. Each change builds a new
job object (`{ ...job, state }`), and unchanged parts such as the raw rows
are shared between versions. Measured on 5,000 rows:

- **Ordinary import:** start about 80 ms, decision about 50 ms, approval
  about 2 ms.
- **Every row sharing one email:** start and decision about 100 ms each, and
  a 2 MB review.
- **Before this change,** the shared-email case took 17 s to start and 31 s
  per decision, and produced a 265 MB review.

### Review and blocking rules

`getReview()` returns the columns (each with a `blocking` flag), a summary,
and `issues[]`. Each issue has:

- `category`, one of:
  - `file` (parser warnings)
  - `mapping` (ambiguous, unmapped, rejected, pending)
  - `schema` (batch-level validator errors such as `NO_ROWS`)
  - `missing_required`, `duplicate` or `invalid_field` (validator row errors)
  - `row_warning` (validator row warnings)
  - `representation` (canonicalization notes)
- `code`, `severity`, `blocking`
- `rowNumber`, `sourceColumn`, `targetField`
- `message`, and optional `details`. `DUPLICATE_EMAIL` has
  `{ relatedRows, relatedRowCount }`; at most 20 related rows are listed.

Issues come in a fixed order: file, mapping, schema, then rows in Excel row
order.

| Source | Blocking? |
|---|---|
| Column `mapped` | No |
| Column `ambiguous` (`AMBIGUOUS_COLUMN`), `rejected` (`REJECTED_MAPPING`, with the guard codes), `pending` (`COLUMN_NOT_MAPPED`, no automatic mapping) | **Yes** |
| Column `unmapped` by the LLM (`UNCONFIRMED_UNMAPPED_COLUMN`) | **Yes**, until a human confirms. Otherwise data could be dropped silently (continues the Step 6B "unmapped needs review" policy) |
| Column `unmapped` by a human (`UNMAPPED_COLUMN`) | No (information) |
| Validator row errors: `DUPLICATE_EMAIL`, `REQUIRED_FIELD_MISSING`, `INVALID_EMAIL`, ...; batch errors (`NO_ROWS`) | **Yes** |
| Validator warnings, file warnings, `REQUIRED_FIELD_UNMAPPED`, representation notes (`DECIMAL_NOT_TEXT`, ...) | No. The rows they affect already carry the blocking validator error |

A rejected LLM column is never re-accepted automatically. It stays blocking
until a human decides it, even if the conflict that caused it disappears.

**Approval-ready** (`validated`) means all of the following:

- the mapping is structurally valid
- no blocking column remains
- the validator reports no errors

Warnings may remain.

### Human decisions

- **Actions:** `map`, `unmap`, `unresolve`. Only `sourceColumn`, `action`
  and `targetField` are accepted.
- **Rejected fields:** anything else, such as `state`, `confidence`,
  `status`, or canonical rows, is refused (`INVALID_MAPPING_DECISION`).
- **Checked by the guard:** the decision is merged with the current mapping,
  and the full mapping is checked by the same `ColumnMappingGuard` used for
  LLM proposals.
- **All or nothing:** if the guard rejects any decided column (unknown,
  forbidden or system target, duplicate target, not a header, ...), the whole
  decision is refused with `MAPPING_DECISION_REJECTED` and the guard's codes,
  and the job is unchanged.
- **Moving a field** between columns works in one decision: unmap one column,
  map the other.
- **After an accepted decision,** canonical rows are rebuilt from the raw rows
  and validated again.

### Approval

`approveImport` is refused in these cases:

- the job does not exist (`JOB_NOT_FOUND`)
- it is failed or not yet mapped (`INVALID_JOB_STATE`)
- it is already approved (`JOB_APPROVED_IMMUTABLE`)
- anything blocks (`APPROVAL_BLOCKED`, with reasons and counts per code)

It re-checks the mapping and the validation from the stored data rather than
trusting the state. After approval the job cannot change: every write is
refused by the service **and** the store, and there is no way out of
`approved`. `getApprovedImport` returns deep-frozen data:

- `mapping`
- `rows`, each `{ rowNumber, data }`
- `schemaVersion`, `approvedAt`

### Concurrency and limits

Every write checks the job's `version`. Callers may pass `expectedVersion`
(from the last review) and get `JOB_CONFLICT` if the job changed.

`InMemoryImportJobStore` is for standalone development only:

- jobs are lost on restart
- at most `SOA_IMPORT_MAX_JOBS` jobs (default 50; then `JOB_STORE_FULL`)
- jobs, including approved ones, expire after `SOA_IMPORT_JOB_TTL_MINUTES`
  (default 120)

Replace it with a persistent store implementing the same three async
methods (`create`, `get`, `update`).
