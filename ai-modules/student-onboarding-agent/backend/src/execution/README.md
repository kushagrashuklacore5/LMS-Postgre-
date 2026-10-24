# execution/ — Student Onboarding Agent

Step 8's approved-import execution boundary: the only path from an approved
import to the create-only tools.

```js
const executor = createApprovedImportExecutor({ schema, jobService, lmsAdapter });
const result = await executor.executeApprovedImport(jobId);   // jobId only
```

## What it checks, all from the server-side job store

1. **The job exists** (`JOB_NOT_FOUND`).
2. **Its state is `approved`.** Any other state (`received`, `parsed`,
   `mapped`, `needs_review`, `validated`, `failed`) gives
   `IMPORT_NOT_APPROVED`, with `STATE_…` in `details`.
3. **The approved data is still deep-frozen** (`IMMUTABLE_IMPORT_VIOLATION`).
4. **It still passes `StudentDataValidator`** (`APPROVED_IMPORT_INVALID`).

The caller passes a jobId and nothing else. Any options, such as
`{ approved: true }`, `{ status: 'approved' }` or `{ canonicalRows: [...] }`,
are refused (`INVALID_REQUEST`). There is no way to hand it rows.

## What it runs, per approved row, in Excel row order

1. **`createStudent`** with the row's creation fields, through
   `ToolExecutor`: lookup, create-only access, argument validation, and the
   approved-data check.
2. If the student exists and the row has **both** `className` and
   `section`, **`assignStudentToClassroom`**:
   - neither field: `not_requested`
   - only one of them: `skipped_incomplete_classroom`, reported and never
     guessed
3. A failing row is recorded and the other rows go on. A row whose student
   was not created skips its classroom (`skipped_student_not_created`).

The tools get a frozen context with only the jobId, a one-row lookup,
server-generated idempotency keys, and the adapter facade. The approved
import is not copied; rows are looked up in an index.

## Result (no PII)

```js
{
  jobId,
  status: 'completed' | 'completed_with_issues',
  totals: { rows, created, alreadyCreated, failed, assigned, classroomNotFound, classroomAmbiguous, classroomSkipped, classroomFailed, needsAttention },
  rows: [{ rowNumber,
           student:   { status: 'created' | 'already_created' | 'failed', studentRef, error },
           classroom: { status: 'assigned' | 'classroom_not_found' | 'classroom_ambiguous' | 'not_requested' |
                                'skipped_incomplete_classroom' | 'skipped_student_not_created' | 'failed', assignmentRef, error },
           needsAttention }],
  repeated: false,
}
```

Errors are stored as `{ code, reasons }` codes only. Tool and validator
messages can contain cell values, so no messages, names or emails are kept.

## Idempotency: a standalone boundary only

| Situation | Behaviour |
|---|---|
| Second call while a run is in progress | `EXECUTION_IN_PROGRESS` (check and claim happen with no `await` between them) |
| Call after a completed run | The stored result, `repeated: true`; the adapter is not called again |
| Call after an interrupted run (unexpected crash) | Resumes; the adapter's idempotency keys (`jobId:rowNumber:tool`) return existing students instead of creating duplicates |

`InMemoryExecutionStore` is process memory: it is lost on restart and not
shared between servers. **A real deployment must back this with persistent,
atomic storage.** That means a unique execution record per job, and the
adapter's idempotency keys stored in the LMS in the same transaction as each
insert. Retrying failed rows after a completed run is not supported yet; that
policy is still to be decided.

Tests: `backend/test/ApprovedImportExecutor.test.js`.
