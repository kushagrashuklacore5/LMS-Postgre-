# validation/ — Student Onboarding Agent

Deterministic validation of **canonical student rows**, meaning rows whose keys are
already the canonical field names from
[`config/studentSchema.json`](../../../config/studentSchema.json) (`fullName`,
`email`, ...). No LLM, database, LMS, network or email access.

| File                      | Role                                                                     |
|---------------------------|--------------------------------------------------------------------------|
| `studentSchema.js`        | `loadStudentSchema()` reads and strictly checks `config/studentSchema.json` |
| `formats.js`              | The `email`, `phone` and `date` format rules the schema refers to        |
| `StudentDataValidator.js` | `new StudentDataValidator(schema).validate(rows)`                        |

## The schema is the source of truth

Field names, types, required flags, normalization, formats, allowed values,
unique fields and system-controlled names are all read from
`studentSchema.json`. The validator hard-codes none of them. The loader refuses
a schema with an unknown type, format, normalization step or validation key,
so a typo can never silently disable a rule.

## Usage

Canonical rows come from `ColumnMappingService.mapImport()` (`result.canonicalRows`,
see [../mapping/README.md](../mapping/README.md)):

```js
const { loadStudentSchema } = require('./validation/studentSchema');
const { StudentDataValidator } = require('./validation/StudentDataValidator');

const validator = new StudentDataValidator(loadStudentSchema()); // once, at startup

// rows come from the mapping step: Excel rows re-keyed to canonical fields,
// keeping the rowNumber from ExcelImportService.
const result = validator.validate([
  { rowNumber: 2, values: { fullName: 'Rahul Sharma', email: 'rahul@example.com', className: '10' } },
]);
```

There is **no HTTP endpoint** for validation yet (see "Why no endpoint" below).

## Input

`rows`: an array of `{ rowNumber, values }`, the same envelope the Excel
import produces, but with canonical keys. `rowNumber` is the original Excel
row. Passing something that is not an array throws `ValidationError`
(`INVALID_ROWS`). Problems inside rows are always reported, never thrown.

## Result

Actual output for three rows (row 12 and row 27 share an email differing only
in case; row 13 has an extra `rollNumber` key):

```json
{
  "valid": false,
  "schemaVersion": "0.2.0",
  "summary": { "totalRows": 3, "validRows": 1, "invalidRows": 2, "rowsWithWarnings": 1, "errorCount": 4, "warningCount": 1 },
  "errors": [],
  "rows": [
    {
      "index": 0, "rowNumber": 12, "status": "invalid",
      "data": { "fullName": "Asha Rao", "email": "asha@example.com", "className": "10", "section": "A", "parentName": null,
                "phone": null, "dob": "2010-01-01", "admissionDate": null, "bloodGroup": "AB+", "address": null },
      "errors": [
        { "field": "email", "code": "DUPLICATE_EMAIL", "severity": "error",
          "message": "\"asha@example.com\" also appears in row(s) 27 (compared ignoring case).", "relatedRows": [27], "relatedRowCount": 1 }
      ],
      "warnings": []
    },
    {
      "index": 1, "rowNumber": 13, "status": "valid",
      "data": { "fullName": "Rahul Sharma", "email": "rahul@example.com", "phone": "+91 98765 43210", "…": "other fields null" },
      "errors": [],
      "warnings": [
        { "field": "rollNumber", "code": "UNKNOWN_FIELD", "severity": "warning",
          "message": "\"rollNumber\" is not a canonical student field and was ignored." }
      ]
    },
    {
      "index": 2, "rowNumber": 27, "status": "invalid",
      "data": { "fullName": "", "email": "ASHA@example.com", "dob": "03/04/2010", "…": "other fields null" },
      "errors": [
        { "field": "fullName", "code": "REQUIRED_FIELD_MISSING", "severity": "error", "message": "\"fullName\" is required but empty." },
        { "field": "dob", "code": "AMBIGUOUS_DATE", "severity": "error",
          "message": "\"03/04/2010\" could be day/month or month/day. Use YYYY-MM-DD or an Excel date cell." },
        { "field": "email", "code": "DUPLICATE_EMAIL", "severity": "error",
          "message": "\"ASHA@example.com\" also appears in row(s) 12 (compared ignoring case).", "relatedRows": [12], "relatedRowCount": 1 }
      ],
      "warnings": []
    }
  ]
}
```

(`"…"` marks fields shortened here; real output always lists every field.)

- `valid` is true only if there is at least one row and no row has errors.
- `errors` (top level) holds batch problems. Currently only `NO_ROWS` (empty batch).
- Every input row appears once, in input order. `index` is its position in
  the input and `rowNumber` its Excel row (`null` only if the input lacked a
  valid one).
- `data` holds the normalized canonical object: every schema field, in schema
  order, with `null` for absent or empty optional values. System and unknown
  fields are never copied into `data`.
- A row is `invalid` if it has any error. Warnings never make a row invalid.
- Same input + same schema gives the same output. There are no timestamps or
  randomness, and the input is not modified.

## Rules

| Code | Severity | When |
|---|---|---|
| `REQUIRED_FIELD_MISSING` | error | Required field (`fullName`, `email`) absent, `null`, or empty after trimming |
| `INVALID_FIELD_TYPE` | error | A value is not a JSON string. The validator coerces nothing; the mapping step already turns safe whole numbers into text (`9876543210` → `"9876543210"`) and leaves decimals/booleans for this error |
| `INVALID_EMAIL` | error | Not `local@domain.tld` (no spaces, one `@`, non-empty domain labels) |
| `DUPLICATE_EMAIL` | error | Same email (ignoring case) in another row of the batch. **Every** row in the group is flagged. `relatedRows` lists up to 20 of the other rows and `relatedRowCount` gives the full number, so output stays linear even if thousands of rows share one email |
| `INVALID_PHONE` | error | After removing spaces, `-`, `.`, `(`, `)`: not an optional `+` then 7–15 digits (no leading 0 after `+`) |
| `INVALID_DATE` | error | Not a real calendar date in `YYYY-MM-DD`, not an Excel date, or has a time of day |
| `AMBIGUOUS_DATE` | error | Numeric text like `03/04/2010`, `3-4-10`: day/month order unknown, never guessed. Exception: a column that proves day-first order (some value with a first part above 12, none with a second part above 12, 4-digit years) is read as DD-MM-YYYY |
| `INVALID_BLOOD_GROUP` | error | Not one of `A+ A- B+ B- AB+ AB- O+ O-` (case-insensitive; stored in standard spelling) |
| `FORBIDDEN_SYSTEM_FIELD` | error | The row contains a system-controlled field such as `password`, `role` or `universityId` (also `university_id`, `ClassroomID`, `totalFees`, ...) |
| `INVALID_ROW` | error | The row, or its `values`, is not an object |
| `INVALID_ROW_NUMBER` | error | `rowNumber` is missing or not a positive integer (the values are still validated) |
| `UNKNOWN_FIELD` | warning | A key that is neither canonical nor system-controlled (e.g. `rollNumber`); it is ignored |
| `NO_ROWS` | batch error | The batch is empty |

**Normalization** (from the schema): `trim` on all text, and `emptyToNull`
on optional fields. Dates become `YYYY-MM-DD`, and blood groups take their
standard spelling. Nothing else changes: names are not split, emails are not
lower-cased (only compared that way), and phones are not reformatted.

**Real Excel dates**: the import step turns date cells into
`YYYY-MM-DDT00:00:00.000Z`. The validator accepts exactly that (midnight UTC)
and `YYYY-MM-DD`. A number such as `40179` (an unformatted Excel serial) is not
treated as a date.

## Intentionally not done here

- **No column mapping.** Semantic Excel-column → canonical-field mapping
  (`"Mail ID"` → `email`) is **Step 6**, done through the `LLMProvider`
  abstraction. The validator only accepts canonical keys.
- **No check against existing LMS students.** Duplicates are detected only
  within the batch; existing LMS emails are checked by the future LMS adapter.
- **No classroom resolution.** Matching `className` + `section` to a classroom
  (case-insensitive exact match; zero or several matches reported, decision
  OD-7) needs the LMS's classrooms, so it belongs to the LMS adapter.
- No future-date or age rules, no roll/admission numbers (OD-6), no type
  coercion, no database, LMS, network or email access.

## Why no endpoint

`POST /import/parse` returns only a 20-row preview and keeps nothing on the
server. Canonical rows only exist after the server-side mapping step
(`ColumnMappingService`), and the caller passes them to the validator directly. An HTTP endpoint that takes
canonical rows from the client would be an API the real flow never uses, so
none was added. It can be added once the import job/flow design exists.

Tests: `backend/test/StudentDataValidator.test.js` (run `npm test`).
