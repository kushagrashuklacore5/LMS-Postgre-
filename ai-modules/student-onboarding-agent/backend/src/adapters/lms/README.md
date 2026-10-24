# adapters/lms/ — Student Onboarding Agent

The boundary between this module and the LMS: an interface, a fake (Step 8)
and the real SQLite adapter (Step 9B). The adapter's idempotency migration
was applied to the LMS database on 2026-09-28. The LMS uses the adapter
through `/api/onboarding` (Step 9D; see the module README).

| File | Role |
|---|---|
| `LmsAdapter.js` | The interface, `LmsAdapterError`, and `createLmsFacade()` |
| `FakeLmsAdapter.js` | Deterministic in-memory LMS for standalone development and tests |
| `SqliteLmsAdapter.js` | The real adapter for the current LMS runtime (SQLite), plus `openSqliteLmsAdapter()` |
| `migrations/001_soa_idempotency_keys.sql` | Additive migration; **applied** to `server/data/lms_permanent.db` on 2026-09-28 |
| `migrations/002_soa_student_setup_tokens.sql` | Step 11 additive migration (one table, one index) for hashed one-time setup tokens; **not applied** to the live database yet |
| `migrations/003_soa_custom_fields.sql` | Admin-approved custom student fields (2 tables). **Applied** to `server/data/lms_permanent.db` on 2026-10-01 with `backend/scripts/apply-migration-003.js`: backup `server/data/backups/lms_permanent.pre-soa-003.2026-10-01T13-04-59-049Z.db` (sha256 recorded in `PRE_MIGRATION_CONTENT_SHA256.txt`, integrity + content verified), tables 49 → 51, every existing table's schema and rows unchanged, `integrity_check` ok. Rollback: `003_soa_custom_fields.down.sql` |

## Interface (business-level, deliberately narrow)

```
createStudent({ idempotencyKey, student })
  -> { studentRef, created }            created=false: this idempotencyKey was already used

assignStudentToClassroom({ idempotencyKey, studentEmail, className, section })
  -> { outcome: 'assigned' | 'classroom_not_found' | 'classroom_ambiguous', assignmentRef, replayed }
```

- `student` holds only validated canonical creation fields. Callers never
  send IDs, passwords, roles, approval flags, tenant IDs or fees.
- The adapter finds the classroom from `className` + `section`: a
  case-insensitive exact match within the admin's university (decision
  OD-7). Zero or several matches are reported, never guessed.
- `studentRef` and `assignmentRef` are opaque references the adapter
  creates. They are returned, never accepted as input.
- Failures throw `LmsAdapterError(message, { code })`, with a safe message
  only: no SQL, secrets or stack traces.

**This is not a generic database wrapper.** There is no `query`, `execute`,
`update` or `delete`, and none may be added. Tools never see the adapter
object itself. `createLmsFacade(adapter)` gives them a frozen object with
exactly the two methods, so anything else the adapter has, such as a
connection pool or helper methods, is unreachable.

## FakeLmsAdapter

- **Deterministic refs:** `fake-student-1, 2, …` and `fake-assignment-1, …`.
- **Idempotent:** the same `idempotencyKey` returns the stored result and
  creates nothing new.
- **Email clashes:** an email that already exists under a different key gives
  `STUDENT_ALREADY_EXISTS`, compared ignoring case. `existingEmails`
  pre-seeds the LMS.
- **Classrooms:** `classrooms: [{ className, section }]`, matched as above.
- **`failOnEmails`:** simulates LMS failures (`SIMULATED_FAILURE`).
- **Inspection:** `calls`, `students` and `assignments` show exactly what
  reached the adapter.

## SqliteLmsAdapter (Step 9B)

```js
const { adapter, close } = openSqliteLmsAdapter({
  dbPath,   // absolute path to the EXISTING LMS database (server/data/lms_permanent.db); never created
  actor,    // { userId, role: 'admin', universityId } from a VERIFIED JWT
  schema,   // compiled student schema
});
const executor = createApprovedImportExecutor({ schema, jobService, lmsAdapter: adapter });
// ... executor.executeApprovedImport(jobId) ... then close()
```

One adapter per import execution. It uses its own `node:sqlite`
connection, never the LMS's shared `sqlite3` handle, whose `BEGIN`/`COMMIT`
would mix in other requests' statements. It sets `busy_timeout` to 5 s, and
every operation runs in `BEGIN IMMEDIATE`. It needs **Node 22.5 or newer**.
The rest of the module still runs on Node 18.11 or newer.

### Actor and tenant

The actor's shape is checked at construction. Inside **every** transaction
it is checked again against the LMS:

- the user exists and has `role = 'admin'`
- its `university_id` is exactly `actor.universityId`, and not NULL
- that university exists

This rejects the LMS's `universityId || 1` default when it doesn't match the
admin's real school, and admins with no school. The tenant never comes from
a request.

### `createStudent` (one transaction)

1. **Replay check:** if the idempotency key exists for this tenant, return
   `{ studentRef, created: false }`. The same key used for another operation
   gives `IDEMPOTENCY_KEY_CONFLICT`.
2. **Existing email:** if any user in the LMS has this email, compared
   ignoring case, fail with `STUDENT_ALREADY_EXISTS`. Emails are unique
   across the whole LMS.
3. **Quota:** count the tenant's students, compared with the limit for
   `universities.subscriptionPlan`. The defaults are those in
   `server/helpers/quotaHelper.js`: free 10, standard 100, professional
   unlimited; unknown plans count as free. They can be overridden with
   `studentLimits`. Because the count runs inside the write transaction,
   concurrent imports cannot overshoot. Over the limit: `QUOTA_EXCEEDED`.
4. **Student ID:** `2026` plus 6 digits from `crypto.randomInt`, retried until
   it is unique in `students.studentId`.
5. **Password:** a random, valid bcrypt-format value (`$2a$10$…`) that is the
   hash of **no known password**. The LMS's `bcrypt.compare` returns false
   for every input, so nobody can log in until a password is set through
   reset or onboarding (Step 11). No secret ever exists, and it costs nothing;
   a real bcrypt hash of a random secret would cost about 70 ms per student.
6. **Insert `users`:** `name = fullName`, the email as given (trimmed),
   `role = 'student'`, `isApproved = 1`, `university_id` = the tenant,
   `created_by` = the admin.
7. **Insert `students`:** `studentId`, `grade = ''` (as the LMS does),
   **`rollNumber = NULL`** (section is never written there), fees 0.
8. **Record** the idempotency key, and commit.
9. **Return** `{ studentRef: 'lms-student:<studentId>', created: true }`,
   never the password or hash.

Only `fullName` and `email` are persisted, because the current LMS has no
columns for the optional fields (Step 9A). Any field that is not a canonical
creation field, including every system field, is `INVALID_REQUEST`.

### `assignStudentToClassroom` (separate transaction)

1. **Replay check:** if the key exists, return `{ outcome: 'assigned', …, replayed: true }`.
2. **Find the student** by email, ignoring case, restricted to
   `role = 'student'` and **the tenant**. Otherwise fail with
   `STUDENT_NOT_FOUND`; another school's student looks exactly like a missing
   one. If more than one user matches, differing only in case, fail with
   `STUDENT_AMBIGUOUS`.
3. **Find the classroom** within the tenant by `grade` and `section`,
   ignoring case and surrounding spaces:
   - none: return `classroom_not_found`
   - several: return `classroom_ambiguous`

   These results are not recorded, so a retry after the school fixes its
   classrooms is evaluated again.
4. **Insert into `student_classroom_assignment`.** An existing row counts as
   assigned, with no duplicate. `users.classroom_id` and
   `students.rollNumber` are not touched.
5. **Only for a newly inserted row:** add 1 to `classrooms.studentCount`, in
   the same transaction. The update is limited to the tenant and must change
   exactly one row, or the whole assignment rolls back (`LMS_UNAVAILABLE`).
6. **Record** the idempotency key, and commit.

**Why the adapter maintains `classrooms.studentCount`.** It is a stored,
denormalized counter; the junction table is the source of truth. But it is
the number the LMS **displays**:

- the admin classroom list (`GET /api/classrooms` → `getAllClassrooms`)
- the mentor classroom list (`GET /api/classrooms/my-classrooms` →
  `getAssignedClassrooms`)

Both read the stored column. Only two mentor endpoints in
`universalRoutes.js` compute the count live. The LMS's own assign flow
updates the column by recounting the junction table.

The adapter adds **+1 per new assignment** instead of recounting:

- a replay, an already-existing assignment, a failure, or a not-found or
  ambiguous classroom changes nothing
- it never decrements
- it never rewrites drift that other LMS code caused

A read-only check of the live database found 2 of 8 classrooms whose stored
count is already **lower** than their real assignments. That is a
pre-existing LMS data issue, not fixed here.

This is the adapter's only update to an existing row. Nothing is ever
decremented or deleted.

### Errors

Every error is an `LmsAdapterError` with a fixed, safe message:

- `TENANT_INVALID`, `ACTOR_NOT_AUTHORIZED`
- `STUDENT_ALREADY_EXISTS`, `QUOTA_EXCEEDED`
- `STUDENT_NOT_FOUND`, `STUDENT_AMBIGUOUS`
- `IDEMPOTENCY_KEY_CONFLICT`, `INVALID_REQUEST`
- `LMS_NOT_READY`, `LMS_BUSY`, `LMS_UNAVAILABLE`

Any database failure rolls the whole transaction back. No SQL, paths or
stack traces are passed on.

### The durable-idempotency table (migration applied)

The adapter refuses to start (`LMS_NOT_READY`) unless `soa_idempotency_keys`
exists. It never creates the table itself. The additive migration
`migrations/001_soa_idempotency_keys.sql` was applied to
`server/data/lms_permanent.db` on 2026-09-28, in one transaction on its own
connection.

The migration was verified as follows:
- the table count went from 37 to 38;
- the only new object is `soa_idempotency_keys`;
- the schema and row contents of every existing table are unchanged;
- `PRAGMA integrity_check` returned `ok`.

Rollback: `DROP TABLE soa_idempotency_keys;`. Any other schema change
needs its own explicit approval.

The tests run the adapter only against throwaway **in-memory** databases
that use the live LMS table definitions from Step 9A, with this migration
applied (`backend/test/fixtures/lmsTestDatabase.js`).

## Requirements that shaped the real adapter (from Step 8)

The real adapter must:

- **Implement the same two methods only.**
- **Idempotency:** make it durable. Store `idempotencyKey` → result in the
  LMS database in the same transaction as the insert, and make it unique, so
  retries after a crash never duplicate a student.
- **Tenant from auth:** take the tenant (university) from the authenticated
  admin context supplied at construction, never from arguments.
- **System fields:** generate them the LMS way, inside the adapter: password,
  studentId, `role = 'student'`, `isApproved`.
- **Existing emails:** check for an existing email, and report
  `STUDENT_ALREADY_EXISTS`.
- **Classrooms:** resolve them within the tenant, and report none or several
  matches.
