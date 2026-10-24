# config/ — Student Onboarding Agent

Module-owned configuration. Runtime settings (ports, limits, provider keys)
come from this module's own `.env`, never from the LMS `.env`.

| File                 | Purpose                                                    |
|----------------------|------------------------------------------------------------|
| `studentSchema.json` | Canonical student object for bulk onboarding (**0.2.0, active**) |

`studentSchema.json` is the **single source of truth** for canonical student
fields. It is **not** a copy of an LMS table. It is used as follows:

- **Deterministic validator (implemented):** loaded by
  `backend/src/validation/studentSchema.js` and applied by
  `StudentDataValidator` (see
  [backend/src/validation/README.md](../backend/src/validation/README.md)).
  The loader rejects unknown types, formats and validation keys.
- **Column-mapping guardrails (Step 6A, implemented):** `importFields` are
  the only valid mapping targets. `systemControlledFields` and their
  `aliases` are always rejected as targets. Each field's `description` and
  `mappingHints` feed `describeMappingContract()` for the future LLM prompt
  (see [backend/src/mapping/README.md](../backend/src/mapping/README.md)).
- **Future LMS adapter:** will translate it to LMS storage and resolve classrooms.

Changing a rule means editing this JSON, not validator code. The allowed
`validation` vocabulary is documented in the file's `conventions` section.

---

## How the schema was derived

Read-only inspection of the existing LMS in this repository (Step 5A). No LMS
file was changed and no database was opened. The module stays LMS-agnostic at
runtime; the LMS was only a reference.

### Sources inspected (paths relative to the LMS root)

| Source | What it showed |
|---|---|
| `server/server.js` | Route mounts; DB selected via `config/database-switch.js` |
| `server/config/database-switch.js` | SQLite by default, PostgreSQL if `USE_POSTGRES=true` |
| `server/config/master-db.js` | Master DB is PostgreSQL, or SQLite when `USE_POSTGRES=false` |
| `server/config/sqlite-db.js` | `users`, `students`, `classrooms`, `student_classroom_assignment`, `classroomAssignments` tables |
| `server/config/schema.js` | An older `users` table definition |
| `server/config/multi-tenant-db-isolated.js` | A master `users` table (superadmins only) |
| `server/config/tenant-connection-manager.js` | Defines no tables |
| `server/database/postgres-schema.sql` | PostgreSQL `users` and `students` tables |
| `server/models/Student.js`, `server/models/User.js` | Mongoose models |
| `server/routes/adminRoutes.js` | `POST /api/admin/create-student` (auth + admin + quota check) |
| `server/controllers/adminController.js` | `createStudent`: the actual admin student-creation flow |
| `server/controllers/classroomController.js` | `createClassroom`, `assignStudentToClassroom` |
| `server/routes/universalRoutes.js` | `POST /classrooms/assign-student` |
| `server/controllers/auth-controller.js` | Self-registration (`register`) |
| `server/services/tenant-provisioning-service.js` | Tenant provisioning (searched only) |
| `client/src/pages/admin/AddStudent.jsx` | Admin "Add Student" form |
| `client/src/components/admin/AddStudentModal.jsx` | Older "Add Student" modal |

### Existing student definitions found

**1. SQLite (default runtime)**, `server/config/sqlite-db.js`. A student is a
`users` row with `role = 'student'`, plus a `students` row.

| Table | Field | Constraint / default |
|---|---|---|
| `users` | `id` | PK autoincrement |
| | `name` | TEXT **NOT NULL** |
| | `email` | TEXT **UNIQUE NOT NULL** (LMS-wide, not per university) |
| | `password` | TEXT **NOT NULL** (bcrypt hash) |
| | `role` | TEXT **NOT NULL** |
| | `university_id` | INTEGER default 1 (tenant) |
| | `isApproved` | BOOLEAN default 0 |
| | `classroom_id` | INTEGER, nullable |
| | `subscriptionPlan` | TEXT default `'free'` |
| | `createdAt`, `updatedAt` | default now |
| `students` | `id` | PK |
| | `userId` | → `users.id` |
| | `studentId` | TEXT **UNIQUE** |
| | `grade`, `rollNumber` | TEXT |
| | `totalFees`, `feesPaid`, `pendingFees` | REAL default 0 |
| `classrooms` | `university_id` | NOT NULL default 1 |
| | `name`, `grade` | TEXT **NOT NULL** |
| | `section` | TEXT |
| `student_classroom_assignment` | `studentId` → `users.id`, `classroomId` → `classrooms.id` | UNIQUE(studentId, classroomId) |

**2. PostgreSQL**, `server/database/postgres-schema.sql`: `users` is like
SQLite's (plus `status` default `'active'`, `role` default `'student'`), but
`students` is completely different: `id`, `name` NOT NULL, `email` NOT NULL
(not unique), `university_id`, timestamps. There is no `studentId`, `grade`,
`rollNumber` or fees.

**3. Mongoose models** (`models/Student.js`, `models/User.js`): `Student` has
`name`, `email` (required, unique), fees and `role`. `User` has `name`
(trimmed), `email` (unique, **lowercased**), `password`, `role` (enum
student/mentor/admin), `isApproved` default false, `classroom` ref,
`isActive`, `preferredLanguage`. These are used only in a few places (e.g.
`payment-controller.js`); the student-creation flow uses SQL.

**4. The actual admin creation flow**, `createStudent` in
`adminController.js`:

- **Accepts** `fullName, parentName, email, phone, bloodGroup, address,
  admissionDate, dob, className, section`.
- **Requires** `fullName` and `email` (the form enforces the same).
- **Rejects** an email that already exists in `users` (exact match).
- **Checks** the university's student quota.
- **Generates** a random password (returned once to the admin) and a
  `studentId` of `"2026"` + 6 random digits (unique).
- **Stores** `users(name=fullName, email, password, role='student',
  isApproved=1, university_id=<admin's>)` and
  `students(userId, studentId, grade=className, rollNumber=section, fees=0)`.
- **Discards** `parentName, phone, bloodGroup, address, admissionDate, dob`.

**5. Classroom assignment** is a separate step using internal IDs
(`classroomId` + student `users.id`). The classroom must belong to the
admin's university. `universalRoutes.js` also sets `users.classroom_id`.
Classrooms are created with required `grade` + `section`; the name is
generated as `"Grade <grade> - <section>"`. Nothing enforces unique grade +
section.

### Conflicts found

1. **Three different `students` shapes**: SQLite (studentId/grade/rollNumber/fees),
   PostgreSQL (name/email only), Mongoose (name/email/fees).
2. **`section` is written into `students.rollNumber`** by `createStudent`,
   so `rollNumber` does not hold roll numbers.
3. **Three ways to link a student to a class**: `students.grade` (text),
   `users.classroom_id`, and `student_classroom_assignment`.
4. **Six fields the API accepts but never stores** (parentName, phone,
   bloodGroup, address, admissionDate, dob).
5. **Email case**: SQL checks are exact (case-sensitive); the Mongoose `User`
   model lowercases.
6. **`AddStudentModal.jsx` is stale**: it sends `name/password/classroomId`,
   but the API requires `fullName`, so it would always get a 400.
7. **Self-registration** (`auth-controller.js register`) takes `role` from the
   request body. That is one reason `role` must never come from Excel/LLM here.

---

## Canonical onboarding schema decisions

The canonical object follows the **LMS create-student API contract**
(`createStudent` input + `AddStudent.jsx`), not any single table. That is the
business-level definition of "a student being onboarded" that the current
LMS actually uses, and it doesn't depend on which database is active.

| Field | Type | Required | Unique | Class assignment | Stored by current LMS |
|---|---|---|---|---|---|
| `fullName` | string | **yes** | no | no | yes → `users.name` |
| `email` | string | **yes** | **yes** (within import) | no | yes → `users.email` |
| `className` | string | no | no | **yes** | yes → `students.grade` |
| `section` | string | no | no | **yes** | yes (into `rollNumber`, see conflict 2) |
| `parentName` | string | no | no | no | no |
| `phone` | string | no | no | no | no |
| `dob` | date | no | no | no | no |
| `admissionDate` | date | no | no | no | no |
| `bloodGroup` | string | no | no | no | no |
| `address` | string | no | no | no | no |

Decisions:

- **Required = `fullName`, `email`**, exactly as the LMS enforces.
- **`fullName` stays one value.** The LMS stores one name, so it is never
  split into first/last.
- **Email uniqueness**: the LMS enforces it (LMS-wide), so duplicates within
  one import are flagged on every affected row. Nothing is dropped, merged or
  turned into an update. Checking against existing LMS users is the adapter's
  job.
- **Classroom**: the import carries only human-readable `className` +
  `section`. Internal classroom IDs are resolved later by the LMS adapter, and
  the LLM never invents them.
- **Fields the LMS accepts but discards are kept as optional**, so admin
  data isn't lost at the mapping stage (OD-8). Each is marked
  `lms.persisted: false`.
- **Normalization is only `trim`, and `emptyToNull` for optional fields.**
  There are no semantic transformations.
- `phone` is always text, so leading zeros and `+` survive.
- **Email format check** is a module decision, not LMS evidence (OD-2).
- **System-controlled names are matched ignoring case, `_` and `-`**, plus
  aliases. `university_id`, `ClassroomID` and `totalFees` are rejected, not
  ignored.

## Fields intentionally excluded (system-controlled)

Never accepted from Excel or the LLM (`systemControlledFields` in the schema):

- **Identity and security:** `id`, `password` (generated by the LMS), `role`
  (always `student`), `isApproved` (admin-created = approved).
- **Tenant and internal references:** `universityId` (from the admin's token),
  `studentId` (generated by the LMS), `classroomId` and `userId`.
- **Other LMS-owned data:** fees (`totalFees`, `feesPaid`, `pendingFees`),
  `subscriptionPlan`, `status`, `createdAt`, `updatedAt`.

Also excluded: the photo in `AddStudent.jsx` (a local preview only, never
uploaded), `preferredLanguage`/`isActive` (Mongoose only), and `rollNumber`
(OD-6).

## Decisions (finalized)

The questions left open in Step 5A were answered before Step 5. They are
recorded as `decisions` in `studentSchema.json`:

| ID | Decision | Applied in |
|---|---|---|
| OD-1 | Email duplicates are detected ignoring case; the original value is kept | validator |
| OD-2 | Basic email syntax is validated, even though the LMS does not | validator |
| OD-3 | Phone: international / E.164-compatible, not country-specific | validator |
| OD-4 | Dates: real Excel dates and `YYYY-MM-DD`; ambiguous text dates flagged, never guessed | validator |
| OD-5 | Blood group ∈ `A+ A- B+ B- AB+ AB- O+ O-` | validator |
| OD-6 | Roll/admission number stays excluded | schema |
| OD-7 | className + section: case-insensitive exact match; zero or several matches reported | future LMS adapter |
| OD-8 | parentName, phone, dob, admissionDate, bloodGroup, address kept as optional fields | schema |

Two details had to be pinned down to implement OD-3 and OD-4. They are
recorded in `conventions.formats`:

- **Phone digit count, 7–15.** 15 is the E.164 maximum. The minimum of 7 is
  a module choice (the shortest real international numbers have 7 digits);
  national formats without `+` are allowed.
- **"Real Excel date"** means the value the import step produces for a date
  cell: `YYYY-MM-DDT00:00:00.000Z`. A bare number (an unformatted Excel
  serial) is not treated as a date.
