# AI Assessment Agent: architecture notes

These notes explain the design decisions that the code alone does not make
obvious. For the overview, API and operations, see [../README.md](../README.md).

## Findings about the host LMS (inspected read-only, 2026-09-28)

- **Effective database: SQLite** `server/data/lms_permanent.db`.
  `server/.env` says `USE_POSTGRES=true`, but `config/database-switch.js` is
  required before dotenv loads, so it always picks SQLite. `config/postgres-db.js`
  does not exist. The Student Onboarding Agent makes the same assumption.
- **Auth:** `middleware/authMiddleware.js` checks the HS256 JWT and sets
  `req.user = { userId, role, universityId }`. `middleware/requireTenant.js`
  confirms the school exists.
- **Roles:** teachers are stored as `mentor`. The client's `ProtectedRoute` also
  treats `teacher` as a mentor. Students are stored as `student`.
- **Classes:** `classrooms(id, university_id, name, grade, section)`. Student
  membership is `student_classroom_assignment`. Teacher↔class links
  (`classroomAssignments`, `classrooms.classTeacherId`) are sparse, and some
  rows link a teacher to a classroom in another school, so they are not used
  for authorization.
- **Legacy assessments:** there is an existing course-scoped feature
  (`routes/assessmentRoutes.js`, tables `assessments` / `assessment_questions`).
  This module leaves it alone and uses the `aia_` table prefix.

## Layers and who may call what

| Layer | Knows about | Must not know about |
|---|---|---|
| `core/` | actor, adapter contract, validation | SQL, table names, express, LLMs |
| `adapters/lms/` | LMS tables, roles, SQLite | HTTP, LLMs |
| `http/` | express (injected), `openAdapter()` | SQLite, LMS tables |
| `integration/` | the two above plus the DB path | business rules |
| `llm/` (future) | prompt/response format | database, adapter, service |

The actor `{ userId, universityId, kind }` is created **only** by
`adapter.resolveActor(req.user)`, and every service method requires one. There
is no code path where a request body sets tenant, owner, role or status.

## Decisions

1. **No foreign keys to LMS tables.** SQLite checks foreign keys per
   connection. The LMS's `sqlite3` connection has them off, but `node:sqlite`
   has them on. A key from `aia_assessments` to `classrooms` could block or
   change LMS deletes on some connections. Integrity across the boundary is
   checked in the adapter instead: the classroom must belong to the actor's
   school, and this is re-checked at publish time.
2. **One correct option: two layers.** The service guard requires exactly one
   correct option. The database's partial unique index
   (`WHERE is_correct = 1`) guarantees at most one, even against a buggy
   future writer.
3. **"Not found" rather than "forbidden"** for other teachers' and other
   schools' tests, so ids cannot be probed.
4. **Publishing locks edits.** No student can see a test that is still being
   changed. Because attempts don't exist yet, unpublish is a safe way back.
5. **The migration is never auto-applied.** Until it runs, the routes answer
   `503 NOT_READY`. Nothing creates tables at startup.
6. **Handlers are deferred with `setImmediate`.** `requireTenant` queries
   SQLite through node-sqlite3, and node-sqlite3 finalizes that statement,
   which releases its SHARED lock, only *after* its callback returns. For a
   request with no JSON body (publish/unpublish), express would call our
   synchronous write handler inside that callback. Our COMMIT would then wait
   on a lock that cannot be released until we return, and fail after
   `busy_timeout` with "database is locked". This was found by the HTTP
   integration test and fixed in `http/createAssessmentRouter.js`. The test's
   publish step guards against regressions.
7. **No dependencies.** The module uses `node:sqlite` and `node:test`, and gets
   express injected by the host. The HTTP tests borrow express, jsonwebtoken
   and sqlite3 from the LMS's `server/node_modules`, and skip if the LMS is
   absent.

## Step 2 decisions (AI generation)

8. **The provider returns text; the core decides.** `QuestionGenerationProvider.generateJson()`
   returns raw text. Parsing, validation, the guard and the final
   `validateQuestionInput` all live in `core/ai/`, so every future provider
   gets the same checks for free.
9. **The generator has no persistence access.** `AssessmentGenerator` is built
   with a provider only (a test asserts its fields). The generation route
   closes its DB connection **before** the LLM call, and it uses the DB only to
   authorize the teacher and resolve the class inside the teacher's school.
10. **Proposals are stateless.** The server returns them and forgets them. The
    browser holds them during review. Saving is a separate, explicit request
    (`/from-review`) that runs the normal service rules, so a tampered client
    can do no more than a teacher typing questions by hand.
11. **All-or-nothing rejection.** If any question fails, the whole response is
    discarded, so a partly broken response never looks complete. Regenerating
    a single question passes the other texts as `avoidQuestions`.
12. **Separate Gemini client, shared configuration.** The onboarding agent's
    client is not imported, so either module can be deleted independently.
    Configuration (`SOA_*`) is read, never duplicated. Module-specific settings
    are non-secret (`AIA_AI_GENERATION_ENABLED`, `AIA_LLM_TIMEOUT_MS`).
13. **Explanations are teacher-only.** They are stored (migration 002) for
    review now and for results later. The student view maps fields explicitly
    and omits them (tested).
14. **Guard tuned for false positives.** One hit rejects the whole response, so
    patterns avoid normal quiz wording ("Choose the correct answer:", `None`,
    code-like options). Tests cover both sides.

## Step 3 decisions (attempts, timer, grading, reports)

15. **Attempts attach to the existing model.** `aia_attempts` references
    `aia_assessments`, and `aia_attempt_answers` references `aia_questions`.
    There is no parallel question or test model. Grading reads
    `aia_options.is_correct`.
16. **One (current) attempt per student per test** (`UNIQUE(assessment_id, student_id)`; retakes only via a teacher reset, decision 30).
    "Start" is idempotent and resumes the same attempt, so refreshing, closing
    and reopening, or double-clicking can never create a second attempt or
    reset the deadline.
17. **The server clock is the only clock.** `AttemptService` takes `now()`
    (injected in tests) and stores ISO-8601 UTC `started_at`/`deadline_at`.
    Expiry is **lazy but universal**: every student read, save, submit and
    list, and every teacher report, calls `finalizeIfExpired` inside its
    transaction before doing anything else. An expired attempt is finalized
    with `finished_at = deadline_at`, so the result doesn't depend on when it
    was noticed. A refused save still commits that finalization (the
    transaction returns an outcome and the error is thrown after commit).
18. **Atomic, idempotent finalization.** `UPDATE ... WHERE status =
    'in_progress'` inside `BEGIN IMMEDIATE` means the first finalization wins.
    Later submits return the stored result. Per-answer `is_correct` is written
    in the same transaction.
19. **Unpublish lock.** Once a test has any attempt, it can't be unpublished,
    and therefore can't be edited (edits need a draft). This keeps stored
    results consistent with the questions they were graded against. Tests
    without attempts behave exactly as in Step 1.
20. **Minimal client input.** Start and submit take no body. An answer body is
    exactly `{ optionPosition }`, and ids come only from the URL. Anything else
    (scores, deadlines, `assessmentId`, `isCorrect`) is rejected, not ignored.
21. **Explanations stay teacher-only**, even after submission. This keeps the
    Step 2 promise. Students get their answer, the correct option and the
    outcome.
22. **Report averages come from raw counts.** The average percentage is
    `sum(correct) / sum(total)`, not the mean of rounded percentages (which
    would give 66.66 instead of 66.67). A test caught this.

## Step 5 decisions (test windows + close)

23. **The window lives on the assessment row.** Migration 004 adds three
    nullable columns (`opens_at`, `closes_at`, `closed_at`). NULL means the
    Step 1–4 behaviour, so existing data needs no backfill.
24. **One availability rule, evaluated on the server clock.** It is `closed`
    if closed manually or `closes_at` has been reached, `upcoming` if
    `opens_at` hasn't been reached, and otherwise `open`. Start,
    the student list and the report all use `availabilityOf`.
25. **The window reuses the Step 3 timer.** A new attempt's deadline is
    `min(start + duration, closes_at)`. The existing lazy expiry (decision 17)
    therefore ends running attempts at the window's close, with no new timer
    or background job.
26. **Close finalizes eagerly and in one transaction.** It sets `closed_at`,
    then applies `finalizeIfExpired` to each attempt, then finalizes what is
    still running at `closed_at`. An attempt already past its own deadline
    keeps that earlier `finished_at`.
27. **Datetimes must carry a timezone.** Input is ISO-8601 with `Z` or
    `±hh:mm` and is stored as UTC. The browser converts the teacher's local
    `datetime-local` to UTC before sending.
28. **The window is editable only in draft**, like every other field
    (decision 4). A published test can only be closed early. A closed test is
    final; unpublishing it without attempts yields a clean, not-closed draft.

## Step 6 decisions (teacher reset / retake)

29. **History lives in an archive table, not in a rebuilt `aia_attempts`.**
    Dropping the table-level `UNIQUE` would require a table rebuild. With
    `node:sqlite` enforcing foreign keys, dropping the old table would cascade
    to `aia_attempt_answers`. Migration 005 is therefore purely additive:
    `aia_attempt_archive`.
30. **Decision 16 still holds for current attempts.** A reset *moves* the
    finished attempt to the archive (result, timings, answers as a JSON
    snapshot) and deletes it and its answers in the same transaction. Answers
    are deleted explicitly, not by cascade. The old attempt can't become
    current again, and a restart is a brand-new row with a fresh server
    deadline.
31. **Reset only when it is safe.** It needs a finished attempt (an expired
    one is finalized first), a test that isn't closed (so a reset never
    reopens it), the owning teacher, and a cap of 3 resets per student per
    test (no unlimited retakes).
32. **The report is about the current attempt.** Scores and the summary use
    current attempts only; archived ones appear per student as
    `previousAttempts`, with an `attemptNumber` on the current row.
33. **The lock counts history.** `countAttempts` includes archived attempts,
    so the questions behind an archived result can never be edited afterwards.

## Student Performance Analyst decisions (add-on)

34. **Facts first, AI second.** All numbers come from
    `core/analytics` (pure metrics plus a read-only collector). The GET facts
    endpoint never calls the LLM. The AI only interprets a payload built from
    those facts, and every number or reference it writes is checked against
    that payload (`analysisSchema.js`).
35. **No migration.** Everything is computed on request from the existing
    tables. Two read-only adapter methods were added: `getSchoolStudent` and
    `listStudentMemberships`. "Missed" uses the class join date
    (`student_classroom_assignment.createdAt`) and the test's close time.
36. **Scope = the requesting teacher's own tests.** A student with no tests of
    this teacher in scope is a 404, the same as a student of another school.
37. **Pseudonymised payload.** The student becomes "the student" and tests become
    `A1..An`. No ids, names, titles, class or school names are sent. Question
    texts (at most 10) are sanitised before sending. The POST has no body.
38. **One provider, one generator.** `PerformanceAnalyst` wraps the existing
    `AssessmentGenerator.callProvider`, so the timeout, error mapping and
    provider configuration are shared. Throttling uses a separate instance
    with the same rules, so analysis and question generation don't block
    each other.
39. **The adapter is closed before the LLM call**, so a slow model never holds
    the SQLite connection.

## Question types / advanced generation decisions

40. **Additive migration 006, no rebuild.** It adds a type column (default
    `single_mcq`), numeric answer columns, and a separate
    `aia_attempt_responses` table for the new answer kinds. Single-MCQ answers
    keep their table, so every existing attempt, archive snapshot and report is
    untouched.
41. **The one-correct index is dropped; the rule moves to validation.** A
    partial index cannot see the question type (another table). Every write
    path validates. A DB-level guard for single MCQs would need a trigger, which
    was not part of the approved design.
42. **006 is optional for readiness (legacy mode).** Deploying this code before
    applying 006 changes nothing for single MCQs. The new types answer 503
    `QUESTION_TYPES_NOT_READY` before any LLM call.
43. **Numbers are canonical decimal text.** This gives exact comparison with no
    float error. The structure (`numericAnswer.format`, `numbersMatch`) leaves
    room for a later tolerance or range.
44. **Templates are server-owned guidance, sent as data.** The client sends an
    id. The system rules depend only on the question type. Teacher instructions
    are a separate refinement field, screened for injection before any call.
45. **LLM calls on the Performance page are click-only**, with a synchronous
    lock plus the server throttle.

## AI Performance Report decisions (professional report step)

46. **Structured report with observed / interpretation / recommendation
    separated at the schema level**, rather than asking the model to label its
    own sentences. The UI shows the three kinds with tags.
47. **Evidence is validated against the supplied data, down to question
    samples.** `A2-Q3` is only valid for the up-to-10 question samples actually
    sent. Every number in text must come from the payload, and
    improvement/decline claims must match the computed trend.
48. **Report focus is server-owned guidance, as with question templates.**
    Teacher instructions are screened, sanitized for PII, and placed after the
    focus and before the data. The system rules never contain teacher text.
49. **No persistence.** Reports stay in client state. A stored report would
    need its own table, access rules and retention, which is out of scope for
    this step. So there is no migration.

## Descriptive Assignments decisions (Prompt 1)

50. **Separate entity, not a new question type.** Assignments have their own
    lifecycle, marks and file submissions, so they get their own tables (007),
    service, routes and adapter file (`sqliteAssignmentStore.js`). They reuse
    the same session/actor resolution, school and class checks, error format
    and router.
51. **Files are outside the database, behind `SubmissionFileStore`.**
    - The database keeps metadata and an opaque key.
    - Keys are generated and validated by the store, which makes traversal
      impossible.
    - The upload is validated from its bytes before it is stored. The rules
      are checked before storing and again in the recording transaction. A
      failed record deletes the new file, and a replacement deletes the old one.
52. **Raw PDF body instead of multipart.** No new dependency, one file per
    request, the size is capped by `express.raw`, and the filename travels in
    the query string only as display text.
53. **One current submission; replace until marked.** Simple, auditable (the
    `version` counter) and ready for Prompt 2, whose AI marks are stored beside
    the teacher's final marks.
54. **No late submissions.** The due date and closing both stop submissions;
    non-submitters then show as "missed".

55. **AI evaluation = suggestion; teacher final = authoritative (Prompt 2).**
    - Separate `ai_*` and `final_*` columns: regenerating never touches final marks.
    - "Accept" only pre-fills the form; students never see `ai_*` data.
    - One nullable column (`ai_limitations_json`) was added to migration 007 while it was still unapplied, so
      limitations are never stored in an unrelated column.
56. **Text extraction on the server, not raw PDFs to the model.**
    - pdf-parse 2.4.5 (pdf.js) runs behind limits.
    - Documents that are too large are refused, never truncated.
    - Names and e-mails are redacted in one pass, with line breaks kept.
    - The database is closed during extraction and the provider call. The file is re-checked when storing
      (the student may have replaced it).

## Next integration points (Step 7+)

- **Background expiry job**, if reports must show expired attempts without
  anyone opening them. Today the report itself finalizes them.
- **Provenance:** record whether a question was AI-proposed, if needed for
  audit. A trustworthy record needs server-side proposal ids.
- **Stricter class targeting:** change `getClassroom` / `listClassrooms` in the
  adapter once the LMS's teacher↔class data is reliable.
