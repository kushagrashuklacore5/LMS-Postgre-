# mapping/ — Student Onboarding Agent

Maps Excel columns to canonical student fields. An LLM **proposes** what each
column means; deterministic code **decides** what is accepted. Nothing here
touches a database or the LMS, and nothing here can create, update or delete
a student.

| File                       | Role                                                                 |
|----------------------------|----------------------------------------------------------------------|
| `ColumnMappingContract.js` | (6A) Proposal shape, statuses, allowed/forbidden targets from the schema |
| `ColumnMappingGuard.js`    | (6A) Checks a proposal; authoritative; never repairs                 |
| `SampleMasker.js`          | (6B) Header samples with personal data masked                        |
| `MappingPrompt.js`         | (6B) Provider-neutral prompt built from the schema contract          |
| `CanonicalRowBuilder.js`   | (6B) Accepted mapping + Excel rows → canonical rows                  |
| `ColumnMappingService.js`  | (6B) Runs the whole flow with any `LLMProvider`                      |

## Flow

```
ExcelImportService.parse()        headers + rows [{ rowNumber, values }]          (Step 4)
        │
        ▼
SampleMasker                      exact headers + ≤ N masked samples per column   (6B)
        │                         nothing else leaves the process
        ▼
MappingPrompt                     schema field descriptions, mappingHints,        (6B)
        │                         forbidden names, rules, output format
        ▼
llmProvider.generate()            any LLMProvider (Gemini implemented);           (6B)
        │                         JSON mode, temperature 0, timeout
        ▼
strict JSON.parse                 no repair, no code-fence stripping              (6B)
        │
        ▼
ColumnMappingGuard.validate()     AUTHORITATIVE; per-column acceptance            (6A)
        │
        ▼
buildCanonicalRows()              accepted columns only, rowNumber kept           (6B)
        │
        ▼
StudentDataValidator.validate()   row-level validation, called by the caller      (Step 5)
```

```js
const service = new ColumnMappingService({ schema, llmProvider, samplesPerColumn, timeoutMs });
const result = await service.mapImport(await excelImportService.parse(buffer, { fileName }));
const validation = new StudentDataValidator(schema).validate(result.canonicalRows);
```

## Principles

- **LLM mapping is advisory; the guardrails are authoritative.** Every model
  answer goes through `ColumnMappingGuard`. Confidence is never proof.
- **Unresolved columns need human review.** Ambiguous, unmapped and rejected
  columns are never copied into student data. They stay visible in
  `unresolvedColumns`.
- **No real student data is intentionally sent to the LLM.** The model sees
  only the exact headers and a few masked sample values per column (see
  Masking). **The complete workbook, and full rows, are never sent.**
- **The LLM has no access to anything else.** It gets a prompt and returns
  text; it has no tools, database or LMS access, and cannot create, update or
  delete students.

## Masking (`SampleMasker.js`)

For each column, up to `SOA_MAPPING_SAMPLES_PER_COLUMN` (default 3, max 10)
**distinct** masked values are taken in row order. Blank cells are skipped.

Masking is the default. A value is sent as written only if it matches the
allowlist below; everything else becomes a type token:

| Sent as written (useful, not personal on its own) | Masked |
|---|---|
| class/section codes `10`, `A`, `10-A`, `XII` | `Rahul Sharma` → `<NAME>` (2–4 capitalised words) |
| blood groups `AB+`, `o-` | `rahul@gmail.com` → `<EMAIL>` |
| gender/yes-no words `Male`, `F`, `yes`, `n/a` | `9876543210`, `+91 98765 43210` → `<PHONE>` |
| dates `2026-04-12`, `2010-05-17T00:00:00.000Z`, `03/04/2010` | `12 Main Street`, `Flat 2, …` → `<ADDRESS>` |
| `true`/`false`, whole numbers up to 3 digits | `ADM2024001` → `<CODE>`; `2024`, `411001` → `<NUMBER>` |
| | `98.76` → `<DECIMAL>`; any other text → `<TEXT>` |

Tokens are chosen by value shape and can be wrong (a remark in Title Case
looks like `<NAME>`). The prompt says so, and the header is the main evidence.

**This is data minimization, not a privacy guarantee.** Headers are always
sent verbatim, dates (including dates of birth) are sent as written, and
short values could still be identifying in rare cases.
`result.sentToLlm.columns` records exactly what was sent, for audit.

## Guard behaviour (changed in 6B: partial acceptance)

- A **proposal-level** error rejects the whole proposal. That is: the
  response is not `{ mappings: [...] }`, has an unexpected top-level
  property, or leaves out or renames a header. The result is `status:
  'failed'` with `MAPPING_PROPOSAL_INVALID`, and no canonical rows.
- Otherwise acceptance is **per column**. Every column that passes its own
  checks is used. A rejected column (forbidden or unknown target, duplicate
  target, bad confidence, ...) is **not repaired or re-targeted**; it joins
  `unresolvedColumns` with its errors.
- Two columns mapped to the same field are **both** rejected, so neither is
  chosen.
- Guard result fields:
  - `structurallyValid`: no proposal-level error.
  - `valid`: no rejected column either.
  - `mapping`: the accepted columns, or null if not structurally valid.
  - `unresolvedColumns`
  - `reviewRequired`
- `REQUIRED_FIELD_UNMAPPED` is a warning when no accepted column fills
  `fullName` or `email`.

### Proposal contract

```json
{ "mappings": [
  { "sourceColumn": "Student Name", "status": "mapped", "targetField": "fullName", "confidence": 0.97, "reason": "…" },
  { "sourceColumn": "ID", "status": "ambiguous", "candidateFields": [], "reason": "…" },
  { "sourceColumn": "Remarks", "status": "unmapped", "reason": "…" }
] }
```

- Every header appears exactly once, spelled exactly.
- `targetField` is only allowed on `mapped` entries.
- `confidence` (0–1) is required on `mapped` entries, and advisory only.
- `candidateFields` is only allowed on `ambiguous` entries.
- `reason` is at most 500 characters.
- `null` means "not given".
- Allowed targets are the schema's `importFields`. Forbidden targets are the
  schema's `systemControlledFields` and their aliases, matched ignoring case,
  `_` and `-`.

### Guard codes

| Code | Level | When |
|---|---|---|
| `MALFORMED_PROPOSAL` | proposal | Not an object, or `mappings` is not an array |
| `UNEXPECTED_PROPERTY` | proposal / column | A property the contract does not define |
| `COLUMN_NOT_ADDRESSED` | proposal | An Excel header has no entry |
| `MALFORMED_MAPPING` | column | An entry is not an object |
| `MISSING_SOURCE_COLUMN` / `INVALID_SOURCE_COLUMN` | column | `sourceColumn` absent/empty, or not a string |
| `UNKNOWN_SOURCE_COLUMN` | column | Not an Excel header (exact match) |
| `DUPLICATE_SOURCE_COLUMN` | column | Same column in several entries; all rejected |
| `INVALID_STATUS` | column | Not `mapped`/`unmapped`/`ambiguous` |
| `MISSING_TARGET_FIELD` / `UNEXPECTED_TARGET_FIELD` | column | Missing on `mapped`, or present on `unmapped`/`ambiguous` |
| `UNKNOWN_TARGET_FIELD` | column | Not an import field |
| `FORBIDDEN_TARGET_FIELD` | column | A system-controlled name or alias, however spelled |
| `DUPLICATE_TARGET_FIELD` | column | Several columns map to one field; all rejected |
| `UNEXPECTED_CANDIDATE_FIELDS` / `INVALID_CANDIDATE_FIELDS` | column | Misplaced, malformed or duplicated `candidateFields` |
| `MISSING_CONFIDENCE` / `INVALID_CONFIDENCE` | column | Missing on `mapped`, or not a finite number in [0, 1] |
| `INVALID_REASON` | column | Not a string, or over 500 characters |
| `REQUIRED_FIELD_UNMAPPED` | warning | A required field has no accepted column |

## Canonical rows (`CanonicalRowBuilder.js`)

For each Excel row, a new `{ rowNumber, values }` object is built. It contains
only accepted target fields; the raw row is not modified, and no value is
invented. Nothing system-controlled (password, role, IDs, tenant, classroom)
is ever generated.

| Schema type | Excel value | Canonical value |
|---|---|---|
| text (`string`) | string | trimmed |
| | empty cell | `null` |
| | safe whole number `10`, `9876543210` | `"10"`, `"9876543210"` |
| | decimal `98.76`, boolean, other, unsafe integer | left as-is + issue `DECIMAL_NOT_TEXT` / `BOOLEAN_NOT_TEXT` / `UNSUPPORTED_VALUE` / `UNSAFE_INTEGER` |
| `date` | string (parser's `YYYY-MM-DDT00:00:00.000Z`, or text as typed) | unchanged |
| | empty cell | `null` |
| | a number (never read as an Excel serial) | left as-is + issue `NOT_A_DATE_VALUE` |

This is **representation normalization, not validation**. Values left as-is
are rejected by `StudentDataValidator` (`INVALID_FIELD_TYPE`) with the same
`rowNumber`. Ambiguous text dates are passed through for the validator to
flag (`AMBIGUOUS_DATE`). Issue messages name the row, column and field but
never contain the cell value.

## Result of `mapImport()`

```js
{
  status: 'mapped' | 'needs_review' | 'failed',
  error: null | { code, message },   // fixed messages: no keys, raw responses or cell values
  provider: 'gemini' | null,
  sentToLlm: { columns: [{ sourceColumn, samples }] } | null,
  proposal,              // the parsed model output (it only ever saw masked data)
  guard,                 // full ColumnMappingGuard result
  unresolvedColumns,     // [{ sourceColumn, status: ambiguous|unmapped|rejected, reason, candidateFields, errors }]
  canonicalRows,         // [{ rowNumber, values }] | null
  canonicalizationIssues,// [{ rowNumber, sourceColumn, targetField, code, severity, message }]
  warnings,              // e.g. REQUIRED_FIELD_UNMAPPED
}
```

`needs_review`: something needs a human decision (unresolved columns,
warnings or canonicalization issues). `mapped`: every column was accepted
cleanly. Row validity is still decided by `StudentDataValidator`.

| `error.code` | When |
|---|---|
| `LLM_PROVIDER_NOT_CONFIGURED` | No provider (see `SOA_LLM_*` in `.env.example`); nothing is sent |
| `LLM_PROVIDER_ERROR` | Network/HTTP/provider failure (details are not exposed) |
| `LLM_TIMEOUT` | No answer within `SOA_LLM_TIMEOUT_MS` (default 30000); the request is aborted |
| `LLM_MALFORMED_RESPONSE` | Empty, non-text or oversized response |
| `LLM_INVALID_JSON` | Response is not exactly one JSON value |
| `MAPPING_PROPOSAL_INVALID` | JSON does not follow the contract (see `guard.errors`) |

## Not done here

No HTTP endpoint, no classroom lookup or assignment, no existing-student
checks, no student creation, no onboarding tokens or email, no database,
LMS, Socket.IO or authentication. Those are later steps.

Tests (all offline, fake provider and fake fetch):
`ColumnMappingGuard.test.js`, `SampleMasker.test.js`,
`CanonicalRowBuilder.test.js`, `ColumnMappingService.test.js` and
`GeminiProvider.test.js` in `backend/test/`.

## Additional deterministic rules (LLM layer hardening)

- **Credential-like columns get no samples.** Headers such as Password, PIN, OTP,
  Token, API key, Aadhaar or bank account are sent to the LLM without any sample
  value, not even a masked one (`isSensitiveHeader()` in `SampleMasker.js`).
- **Low-confidence suggestions are not accepted.** A "mapped" suggestion below
  `SOA_MAPPING_MIN_CONFIDENCE` (default 0.7) becomes "ambiguous". The suggested
  field becomes its only candidate, and the column is flagged
  `LOW_CONFIDENCE_MAPPING`, so an admin must confirm it. The LMS router applies
  this rule; `ImportJobService` defaults to 0, meaning no threshold.
- **Confidence in the review.** The LMS review response includes each column's
  `confidence` (the model's value, advisory only).
- **Tests.** `backend/test/LlmMappingFlow.test.js` uses a mocked provider and
  the messy-header fixture `backend/test/fixtures/messyStudentWorkbook.js`.

## Automatic mapping of SAFE AI suggestions

- **AUTO MAPPED** (status `mapped`, `decidedBy: "llm"`): an AI mapping is applied automatically - the same
  state a human decision produces, so it takes the one existing path (canonical rows -> validation ->
  import approval -> executor) - only when ALL hold: the proposal is structurally valid; the guard accepted
  the column (built-in field or this school's existing ACTIVE custom field; not system-controlled, not a
  duplicate, valid confidence, no unsafe text); confidence >= `SOA_MAPPING_MIN_CONFIDENCE` (default 0.7,
  also `ImportJobService`'s default); and `SampleShapeCheck` finds no contradiction. An exact header match
  stays `decidedBy: "rule"`.
- **NEEDS ACTION** (blocks the import, never applied): low confidence or sample mismatch -> `ambiguous` (the
  AI field is only a candidate); guard-rejected -> `rejected`; AI-unmapped -> `unmapped` until an admin
  confirms; AI unavailable / error / timeout / invalid or unsafe answer -> every column `pending`.
- **MANUAL**: any admin decision (`decidedBy: "human"`) can still override an auto-mapped column.
- **New fields are never created automatically**: new-field ideas stay `suggested` until the existing
  explicit admin approval (customFields/README.md).
- Tests: `backend/test/AutoMapping.test.js` (including the full router path to student creation).

- **Flagged suggestions need the admin's own choice** (status `ambiguous`, no bulk approval):
  confidence below `SOA_MAPPING_MIN_CONFIDENCE` (`LOW_CONFIDENCE_MAPPING`), or masked samples that
  contradict the field, e.g. a phone column suggested for `email` (`SAMPLE_MISMATCH`,
  `SampleShapeCheck.js`).
- **Unsafe model text rejects the whole proposal** (`UNSAFE_CONTENT`, `ProposalSafety.js`):
  instructions ("ignore the rules"), SQL statements, code, markup or URLs in any reason, target or
  suggested name/label. The import then falls back to manual mapping.
- **`suggestedNewFields`** (optional, top level): `[{ sourceColumn, name, label, reason }]` for
  columns the AI left `unmapped`. Display-only ideas; nothing creates a field or column. Invalid
  ideas are dropped (`UNSAFE_NEW_FIELD_NAME` - not snake_case, `NEW_FIELD_ALREADY_EXISTS`,
  `NEW_FIELD_SOURCE_NOT_UNMAPPED`, `DUPLICATE_NEW_FIELD_SUGGESTION`, ...) without affecting the mapping.
- **Review additions**: `missingRequiredFields` (required fields no approved column or pending
  suggestion fills). The LMS API adds `aiReview: { samples, reasons, suggestedNewFields }`:
  the masked samples the AI saw and its reasons (screened, capped at 200 characters).
- The prompt uses compact JSON (about 16% fewer characters on the messy-sheet fixture).
- Tests: `backend/test/AiMappingSuggestions.test.js` (fake provider only).
