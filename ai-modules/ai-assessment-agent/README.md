# AI Assessment Agent

> **Database (current):** the module now runs on the LMS's PostgreSQL database through
> `PostgresAssessmentLmsAdapter` (plus `pgAssignmentStore` / `pgRecipientsReportsStore`), using the server's
> connection pool. Its tables (`aia_*`) are part of the server migrations (`server/database/postgres/migrations`,
> `npm run db:migrate`); the module's own SQLite migrations, `applyMigration.js` and the SQLite adapters were
> removed. Tests need `LMS_TEST_DATABASE_ADMIN_URL` (see `docs/POSTGRESQL.md`). Mentions of SQLite, `.db` files and
> "migration 00x not applied" below are the historical log.

An isolated LMS module for multiple-choice (MCQ) assessments. Teachers create
tests by hand, or ask Gemini to **propose** questions. The teacher reviews and
edits the proposals and explicitly saves them. The module lives entirely in this
folder, apart from a few clearly marked hook points in the LMS. It can be moved
to another LMS or removed without touching unrelated code.

## Current status: Step 6 (teacher attempt reset / retake)

| Area | Status |
|---|---|
| Teacher: create draft test (title, description, subject, class, optional duration) | Done (Step 1) |
| Teacher: add / edit / delete MCQ questions (4 options, exactly one correct) | Done (Step 1); optional explanation added in Step 2 |
| Teacher: list own tests, open a test, inspect and edit its questions | Done (Step 1) |
| Teacher: publish / unpublish | Done (Step 1); **unpublish is refused once a test has attempts** (Step 3) |
| Tenant isolation, ownership, server-derived identity | Done |
| Gemini MCQ generation → validation → guard → teacher review → explicit save | Done (Step 2); tested with mocks only, no live Gemini call made |
| **Student: list published tests for own class, start/resume, answer, submit** | **Done (Step 3)**, UI at `/student/assessment-agent/tests` |
| **Server-side timer** (deadline stored on the server, enforced on every request) | **Done (Step 3)** |
| **Deterministic grading + stored result + student result page** | **Done (Step 3)**; no LLM |
| **Teacher report** (per student + summary, no ranking) | **Done (Step 3)** |
| Migrations 001 + 002 + 003 | Written and tested, **not applied** to the live DB |
| **Sidebar entries** (Mentor: "AI Assessments", Student: "My Tests") | **Done (Step 4)** |
| Real Gemini verification (2026-09-28/29) | Did not succeed (timeout, then HTTP 503); Gemini is kept but no longer the agent's provider |
| **AI provider: Hugging Face open-weight model** (`Qwen/Qwen3-Next-80B-A3B-Instruct` via DeepInfra) | **Done and verified**: one real synthetic call on 2026-09-29 returned HTTP 200 in about 1.5 s, with 1 valid MCQ that passed parsing, validation and the guard |
| **Test windows** (optional opens/closes time) **+ teacher "Close test"** | **Done (Step 5)**; needs migration 004 |
| Migration 004 | Written and tested, **not applied** to the live DB |
| **Teacher attempt reset / retake** (history preserved, max 3 resets per student per test) | **Done (Step 6)**; needs migration 005 |
| Migration 005 | Written and tested, **not applied** to the live DB |
| **Question types: single MCQ, multiple-select, numerical (integer/decimal)**, server-side grading per type | **Done (advanced generation step)**; needs migration 006 (without it: single MCQ only, as before) |
| **AI generation by question type + 10 educational intent templates + teacher instructions** | **Done**; fake provider only, no real Hugging Face call |
| Migration 006 | Written and tested on temp databases, **not applied** to the live DB |
| **Descriptive Assignments** (teacher drafts/publishes/closes; students upload a PDF; teacher submission dashboard + manual marks) | **Done (Prompt 1, no AI)**; needs migration 007 |
| Migration 007 | Written and tested on temp databases, **not applied** to the live DB |
| **"Assign to" selected students** (popup: search, select all/none, count; a report's suggested test pre-selects that student) + **"Send to Student"** for AI Performance Reports (student notification + authenticated download; PDF rebuilt in the browser, no AI call) | **Done**; needs migration 008 (without it: whole-class publishing and teacher-only reports, as before) |
| Migration 008 | Written and tested on temp databases, **not applied** to the live DB |
| **Student Performance Analyst** (teacher view of one student: deterministic metrics + optional AI interpretation) | **Done (add-on)**; no migration; tested with the fake provider only, no real Hugging Face call yet |
| AI grading/feedback, leaderboards, email, certificates, proctoring | Not started (out of scope) |

This module is **separate from the legacy LMS assessments** (`/api/assessments`,
tables `assessments` / `assessment_questions`, course-scoped). It does not
read, write or replace them.

## Architecture

```
Teacher UI (client/src/pages/assessment-agent)      Student (API only)
        │  HTTPS + LMS JWT                                   │
        ▼                                                    ▼
LMS server.js: /api/assessment-agent → authMiddleware → requireTenant   (existing LMS auth)
        ▼
http/createAssessmentRouter.js   request shape, unknown-field rejection, throttling, safe errors
        ▼
core/AssessmentService.js        rules: roles, ownership, tenant, draft/publish, visibility, reviewed save
core/assessmentValidation.js     deterministic MCQ rules (every saved question passes them)
        │                                                   │ (generation only)
        ▼  AssessmentLmsAdapter contract                    ▼
adapters/lms/SqliteAssessmentLmsAdapter.js         core/ai/AssessmentGenerator.js  (NO adapter, NO service, NO DB)
        ▼                                                   ▼  prompt (core/ai/generationPrompt.js)
server/data/lms_permanent.db                       llm/QuestionGenerationProvider (contract)
  reads users/universities/classrooms/                      ▼
  student_classroom_assignment;                    llm/providers/gemini/GeminiGenerationProvider.js
  writes only aia_* tables                                  ▼  raw text (untrusted)
                                                   core/ai/generatedOutput.js  strict structure/count/duplicates
                                                   core/ai/contentGuard.js     injection/meta/gibberish/leaks/markup
                                                   validateQuestionInput       the same rules as manual questions
                                                            ▼
                                                   proposal → teacher review/edit (browser memory only)
                                                            ▼  teacher clicks "Save as draft"
                                                   POST /from-review → AssessmentService → adapter → DB (draft)
                                                            ▼  teacher clicks "Publish" (Step 1 path)
```

Boundaries:

- **Core** (`core/`) is LMS-agnostic and has no SQL.
- **LMS adapter** (`adapters/lms/`) is the only place with LMS table names, role
  names and SQL.
- **AI core** (`core/ai/`): the generator receives a provider and nothing else.
  Model output can reach the database only through a teacher's explicit save,
  which runs through the same service and validation as manual input.
- **LLM** (`llm/`): a provider turns a prompt into text. It never parses,
  accepts, saves, publishes or authorizes anything.
- **HTTP** (`http/`) takes the host's `express`, an `openAdapter()` function and
  an optional generator.
- **Integration** (`integration/lmsAssessmentAgent.js`) wires everything for
  this LMS and reads the AI configuration.
- **Client**: the pages live in the LMS client. See [client/README.md](client/README.md).

Details and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Folder structure

```
ai-modules/ai-assessment-agent/
├── README.md, .env.example, .gitignore, package.json   (no dependencies)
├── backend/
│   ├── scripts/applyMigration.js             explicit, opt-in migration runner (001, 002, 003)
│   └── src/
│       ├── core/                             AssessmentService, AttemptService (Step 3), assessmentValidation, errors
│       │   └── ai/                           AssessmentGenerator, generationRequest, generationPrompt,
│       │                                     generatedOutput (validator), contentGuard, GenerationThrottle
│       ├── adapters/lms/                     contract, SQLite adapter, migrations/
│       ├── http/createAssessmentRouter.js
│       ├── integration/lmsAssessmentAgent.js
│       └── llm/                              QuestionGenerationProvider (contract), generationConfig,
│                                             createGenerationProvider, providers/gemini/
├── client/README.md
├── docs/ARCHITECTURE.md
└── tests/                                    unit, AI (mocked), attempts, migration and LMS HTTP integration tests;
                                              e2e/browserE2E.js = manual browser run (synthetic data)
```

## API

The LMS mounts the API at `/api/assessment-agent`. Every request needs the
normal LMS `Authorization: Bearer <JWT>`. Errors look like
`{ "error": { "code", "message", "details": [{ "field", "code" }] } }`.

**Teacher** (LMS roles `mentor` or `teacher`):

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/teacher/classrooms` | | `{ classrooms }` in the teacher's school |
| GET | `/teacher/assessments` | | `{ assessments }` the teacher's own tests |
| POST | `/teacher/assessments` | `{ title, subject, description?, classroomId?, durationMinutes? }` | 201 `{ assessment }` (draft) |
| GET | `/teacher/assessments/:id` | | `{ assessment }` with questions, correct answers, explanations |
| PATCH | `/teacher/assessments/:id` | any subset of the create fields (`null` clears class or duration) | `{ assessment }` |
| POST | `/teacher/assessments/:id/questions` | `{ text, options: [{ text, isCorrect } ×4], explanation?, difficulty? }` | 201 `{ assessment }` |
| PUT | `/teacher/assessments/:id/questions/:questionId` | same as above (full replace) | `{ assessment }` |
| DELETE | `/teacher/assessments/:id/questions/:questionId` | | `{ assessment }` |
| POST | `/teacher/assessments/:id/publish` | none | `{ assessment }` |
| POST | `/teacher/assessments/:id/unpublish` | none | `{ assessment }` |
| POST | `/teacher/assessments/:id/close` | none | `{ closedAt, attemptsFinalized, assessment }`. Step 5: the test closes now |
| POST | `/teacher/assessments/:id/students/:studentId/reset` | none | `{ reset: { studentId, archivedAttemptId, previousResult, resetAt, resetsUsed, resetsRemaining } }`. Step 6 |

Step 5: POST/PATCH `/teacher/assessments` also accept `opensAt` / `closesAt`.
These are optional ISO-8601 datetimes **with a timezone**, or `null` to clear.
| GET | `/teacher/ai/status` | | `{ ai: { available, reason } }` (no configuration values) |
| GET | `/teacher/ai/templates` | | `{ templates: [{ id, label, description }], questionTypes, questionTypesAvailable }` (no LLM) |
| POST | `/teacher/assessments/generate` | `{ topic, subject, classroomId?, count (1-20), difficulty (easy/medium/hard/mixed), questionType? (single_mcq/multi_select/numerical), numericFormat? (integer/decimal, numerical only), template?, instructions? (≤500), avoidQuestions? }` | `{ proposal: { saved: false, questions: [...] }, generatedBy }`. **Nothing is stored.** |
| POST | `/teacher/assessments/from-review` | `{ assessment: {create fields}, questions: [question bodies] }` | 201 `{ assessment }`: ONE new **draft**, atomically |

**Teacher, results** (Step 3):

| Method | Path | Result |
|---|---|---|
| GET | `/teacher/assessments/:id/report` | `{ report: { assessment, summary, students[] } }` for the teacher's **own** test (others → 404) |

**Teacher, Student Performance Analyst** (add-on; see the section below):

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/teacher/students/:studentId/performance` | | `{ student, scope, metrics, dataSufficiency }`. Deterministic facts; **never calls the LLM** |
| POST | `/teacher/students/:studentId/performance/analysis` | optional `{ focus?, instructions? }` only (anything else → 400, before any LLM call) | `{ analysis: { status: 'ok', generatedAt, provider, focus: { id, label }, content } }` or `{ analysis: { status: 'insufficient_data', message } }` |
| GET | `/teacher/ai/report-focuses` | | `{ focuses: [{ id, label, description }], defaultFocus }` (no LLM) |

**Descriptive Assignments** (migration 007; no AI):

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/teacher/assignments` | | `{ assignments }` own, with submission counts |
| POST | `/teacher/assignments` | `{ title, instructions?, classroomId, maxMarks, dueAt? }` | 201 `{ assignment }` (draft) |
| GET | `/teacher/assignments/:id` | | `{ assignment }` with questions |
| PATCH | `/teacher/assignments/:id` | any subset of the create fields (draft only) | `{ assignment }` |
| PUT | `/teacher/assignments/:id/questions` | `{ questions: [{ text, maxMarks }] }` (draft only; order = array order) | `{ assignment }` |
| POST | `/teacher/assignments/:id/publish` / `/close` | none | `{ assignment }` |
| GET | `/teacher/assignments/:id/submissions` | | `{ assignment, summary, students[] }` roster with status |
| GET | `/teacher/assignments/:id/submissions/:sid/file` | | the PDF (attachment) |
| PUT | `/teacher/assignments/:id/submissions/:sid/evaluation` | `{ finalMarks, teacherFeedback? }` | `{ submission }` |
| GET | `/student/assignments` | | `{ assignments }` with `myStatus` |
| GET | `/student/assignments/:id` | | `{ assignment }` with questions and own submission |
| PUT | `/student/assignments/:id/submission?filename=x.pdf` | raw PDF, `Content-Type: application/pdf` | 201 created / 200 replaced: `{ submission, replaced }` |
| GET | `/student/assignments/:id/submission/file` | | own PDF (attachment) |

**Student** (LMS role `student`):

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/student/assessments` | | Published tests for the student's classes, each with `attempt: null \| { id, status, deadlineAt, score?, percentage? }` |
| GET | `/student/assessments/:id` | | One such test, **without `isCorrect` or explanations** |
| POST | `/student/assessments/:id/attempt` | none | 201 new / 200 resumed: `{ created, attempt }`. Questions and options only, plus the server `deadlineAt` and `serverNow` |
| GET | `/student/attempts/:attemptId` | | In progress: questions + saved answers. Finalized: the result |
| PUT | `/student/attempts/:attemptId/answers/:questionId` | by type: `{ optionPosition: 0-3 \| null }`, `{ optionPositions: [0-3...] }`, `{ value: "42" \| null }` | `{ saved, deadlineAt, serverNow }` |
| POST | `/student/attempts/:attemptId/submit` | none | `{ alreadyFinalized, attempt }` (idempotent) |
| GET | `/student/attempts/:attemptId/result` | | The stored result (409 while still in progress) |

## Attempts, server timer, grading and reports (Step 3)

**Lifecycle.** The teacher publishes. The student sees the test in
**My Tests** and starts it. The server creates the attempt, then the student
answers (each choice is saved immediately), and the attempt ends when the student
submits **or** the server deadline passes. The server grades it, the student
sees the result, and the teacher sees it in the report.

- **One current attempt per student per test** (`UNIQUE(assessment_id, student_id)`).
  Starting again resumes the same attempt, which covers refresh and closing and
  reopening the browser; the deadline is never reset by the student. A retake
  is possible only after a **teacher reset** (Step 6, below).
- **Server-owned timer.** `started_at` and `deadline_at = started_at + duration`
  are computed and stored by the server. The client never sends times; start
  and submit take **no body**, and answer bodies accept **only**
  `optionPosition`. Any extra field (`deadlineAt`, `score`, `assessmentId`, …)
  gives `400`.
  - Every student read, save, submit and list, and every teacher report,
    first finalizes an attempt whose deadline has passed. It is marked `expired`,
    with `finished_at` set to the deadline.
  - Late requests therefore get `409 ATTEMPT_EXPIRED`. Device clock changes do
    nothing. The browser countdown is display-only and is computed from the
    server's `serverNow`.
  - Tests without a duration are untimed (`deadline_at` NULL).
- **Answers.** Only the attempt's owner can change it, and only while it's in
  progress:
  - `404` for someone else's attempt, and for a question outside the attempt's test;
  - `400 INVALID_OPTION` for a position that isn't one of the question's options;
  - `409 ATTEMPT_SUBMITTED` / `ATTEMPT_EXPIRED` once the attempt is closed.
- **Grading** is deterministic and runs only on the server: an answer is
  correct if the chosen `option_position` equals the stored correct option. No
  LLM is involved.
  - The server computes total, attempted, correct, incorrect, unattempted,
    score (1 per correct answer) and percentage (2 decimals).
  - These are stored on `aia_attempts`, with per-answer `is_correct` on
    `aia_attempt_answers`.
- **Finalization** runs in one transaction and only acts on an in-progress
  attempt, so the first finalization wins. A second submit returns the same
  stored result with `alreadyFinalized: true`.
- **What students see.** Before finalization: questions and options only, with
  no correct answers, answer keys or explanations. After: their answer, the
  correct option and whether they got it right. **Explanations stay
  teacher-only.**
- **Teacher report.** It lists every student in the class (including `not_started`)
  plus anyone with an attempt. For each: status, score, percentage,
  correct/incorrect/unattempted, submitted time and time taken. The summary
  gives students in class, attempted, submissions, in progress, average,
  highest and lowest. It is sorted by name, with **no ranking**.
- **Test windows and closing (Step 5).**
  - **Setting a window.** A draft can have an optional `opensAt` and
    `closesAt`. Both are stored in UTC, and `closesAt` must be after
    `opensAt`. Publishing refuses a `closesAt` that has already passed
    (`CLOSES_IN_PAST`).
  - **Starting, by the server clock.** Before `opensAt`: `409 TEST_NOT_OPEN`.
    At or after `closesAt`, or after a manual close: `409 TEST_CLOSED`.
  - **Deadline.** An attempt's deadline is the earlier of *start + duration*
    and `closesAt`. The existing lazy expiry therefore ends running attempts
    at the window's close, with no extra timer.
  - **Close test** (`POST .../close`, owner teacher only). It sets `closedAt`
    to now and immediately finalizes and grades every attempt in progress.
    They are marked `expired`, finished at the close time (or at their own
    earlier deadline).
  - **Visibility.** Students see `availability` (`upcoming` / `open` /
    `closed`) in their list. In the report, class members who never started
    a closed test show as `missed`. A closed test can't be reopened.
  - **Unpublishing.** A closed test *without* attempts can still be
    unpublished, which gives a clean draft. With attempts, the existing lock
    applies.
- **Teacher attempt reset / retake (Step 6).**
  - **Who:** only the teacher who owns the test. Students and admins get 403;
    other teachers and other schools get 404.
  - **When:** only for a **finished** attempt (`submitted`, or `expired`; an
    attempt past its deadline is finalized first). Refused with 409 when:
    - the student is still taking it (`ATTEMPT_IN_PROGRESS`);
    - the test is closed (`TEST_CLOSED`), because a reset never reopens a test;
    - the student has already had **3 resets** on this test
      (`RESET_LIMIT_REACHED`).
  - **What happens,** in one transaction: the finished attempt (result, timings
    and an answers snapshot) is **moved** to `aia_attempt_archive`, then it and
    its answers are deleted from the current tables. The test and its
    questions are never touched.
  - **After a reset,** the student's list shows no attempt. Starting creates a
    **fresh** attempt, with a new id, no answers, and a new server deadline
    (still capped by `closesAt`). The old attempt id returns 404 to the
    student, so it can't become current again. If the window closes before
    they restart, the report shows them as `missed`.
  - **Report:** every number is the **current** attempt. Each row adds
    `attemptNumber` and `previousAttempts` (score, percentage, status, times),
    and the summary counts current attempts only. The teacher's report has a
    **Reset** button on finished rows while the test is open.
  - **Lock:** archived attempts count as attempts, so a test that has ever
    had an attempt still can't be unpublished or edited.
- **Unpublish lock.** Once a test has any attempt it can't be unpublished
  (`409 ASSESSMENT_HAS_ATTEMPTS`), so the questions students were graded on
  can't change. Tests without attempts behave exactly as in Step 1.

Rules:

- A question has exactly 4 non-empty, distinct options and exactly one
  `isCorrect: true`. `explanation` (≤1000 characters, teacher-only) and
  `difficulty` are optional.
- Edits are allowed only on drafts. Publishing needs a class in the teacher's
  school and at least one question.
- Another teacher's or another school's test returns `404`.
- `503 NOT_READY` is returned until migrations 001 **and** 002 are applied.

## Gemini configuration

The agent **reuses the LMS's existing Gemini settings** in `server/.env`. It
has no key variable of its own:

| Variable | Purpose |
|---|---|
| `SOA_LLM_PROVIDER` | must be `gemini` (shared with the Student Onboarding Agent) |
| `SOA_LLM_MODEL` | Gemini model name (shared) |
| `SOA_GEMINI_API_KEY` | API key (shared, secret) |
| `AIA_AI_GENERATION_ENABLED` | optional; `false` turns AI generation off |
| `AIA_LLM_TIMEOUT_MS` | optional; 5000–120000, default 60000 |

- The key goes only in the `x-goog-api-key` request header. It never appears in
  a URL, response, error or log line, and it is kept off enumerable
  properties so it cannot be serialized by accident.
- The onboarding agent has its own small Gemini client. This module has a
  separate one (`llm/providers/gemini/`) so that either module can be removed
  without breaking the other. The **configuration** is shared; the code is not.

## Generation flow and the teacher-review requirement

1. The teacher opens **Generate with AI** and enters topic, subject, optional
   class, number of questions, difficulty and optional instructions.
2. The server validates the request. It checks the teacher's role against the
   DB, checks that the class belongs to the teacher's school (before any AI
   call), and applies throttling (one generation at a time per teacher, at most
   20 per 10 minutes).
3. The prompt contains only topic, subject, grade, count, difficulty,
   instructions, and question texts to avoid (when regenerating). It contains
   no ids, class names, school or student data. The teacher's input is sent as
   a data block, and the system instruction tells the model to treat it as
   data.
4. Gemini returns JSON text. **Nothing it returns is trusted.**
5. The proposal is validated and guarded (see below). If anything fails, the
   whole response is discarded with `422 AI_OUTPUT_REJECTED` and codes only.
6. Valid questions go back to the browser as a **proposal**. The server stores
   nothing.
7. The teacher reviews every question: they can edit the text and options,
   change the correct option, edit the explanation, remove a question,
   **regenerate** a single question, or **add a manual question**.
8. Only **Save as draft** (`/from-review`) persists anything. It creates a
   normal draft through `AssessmentService`, with the same validation as manual
   questions and the same tenant and ownership rules.
9. Publishing is the unchanged Step 1 action. AI output is never published
   automatically.

## Validation and guard (deterministic)

**Structure** (`core/ai/generatedOutput.js`). The expected output is exactly
`{ questions: [{ question, options[4], correctAnswer, explanation, difficulty }] }`.

The response is rejected if any of the following hold:
- the JSON is invalid or empty;
- the structure is wrong, or has unexpected fields at any level;
- a field is missing, empty or the wrong type;
- a question has more or fewer than 4 options, or duplicate options;
- the correct answer is missing, is multiple, or doesn't exactly match (ignoring
  case and spacing) one of the options. A letter like `"B"` is not accepted;
- a question is a duplicate, within the response or of the teacher's existing
  questions;
- the number of questions isn't exactly the number requested;
- the difficulty is invalid.

The only normalization is trimming whitespace and removing one surrounding
```` ```json ```` fence. Nothing is repaired or guessed.

**Guard** (`core/ai/contentGuard.js`). The response is rejected when any
question contains:
- instructions or meta text instead of a question ("Sure, here are…",
  "Generate…");
- prompt-injection phrases in any field;
- HTML, scripts or links;
- placeholder or gibberish text (e.g. "Lorem ipsum", "Option A", long runs of
  one character);
- **answer leakage outside `correctAnswer`**: "the answer is…" or "(correct)"
  in the question or options, or the correct option copied into the question.

Patterns were tuned to let normal wording through, such as "Choose the correct
answer:", `None`, `[1, 2, 3]` or `1000000000`.

**Final gate**: every question must also pass `validateQuestionInput`, the same
rules as manual questions. It runs again when the teacher saves.

## Safe error handling and fallback

| Situation | HTTP | Code |
|---|---|---|
| AI not configured / turned off | 503 | `AI_NOT_CONFIGURED` / `AI_DISABLED` |
| Invalid key (401/403 or 400 `API_KEY_INVALID`) | 502 | `AI_CONFIGURATION_REJECTED` |
| Model unknown (404) | 502 | `AI_MODEL_UNAVAILABLE` |
| Gemini 429 | 429 | `AI_RATE_LIMITED` |
| Gemini 5xx / 503 / network | 503 | `AI_UNAVAILABLE` |
| Timeout | 504 | `AI_TIMEOUT` |
| Malformed provider envelope | 502 | `AI_BAD_RESPONSE` |
| Safety-blocked | 422 | `AI_BLOCKED` |
| Output failed validation/guard | 422 | `AI_OUTPUT_REJECTED` (codes only) |
| Teacher already generating / over limit | 429 | `GENERATION_IN_PROGRESS` / `GENERATION_LIMIT_REACHED` |

Messages are fixed text. Server logs hold only the code and HTTP status, never
the key, headers, provider bodies or model text.

**Fallback:** AI problems affect only the AI routes. Manual creation, editing
and publishing keep working (this is tested). When AI is unavailable, the UI
disables the **Generate with AI** button.

## Hugging Face (open-weight model) configuration

The assessment agent can use an open-weight model through **Hugging Face
Inference Providers**. It uses routed requests to the OpenAI-compatible
`https://router.huggingface.co/v1/chat/completions`, with no dedicated endpoint
or GPU. The provider is `backend/src/llm/HuggingFaceProvider.js`, with the same
contract as the Gemini provider. Gemini stays available.

`server/.env` (assessment-only override; onboarding keeps `SOA_LLM_*` = Gemini):

```
AIA_LLM_PROVIDER=huggingface
AIA_LLM_MODEL=Qwen/Qwen3-Next-80B-A3B-Instruct:deepinfra
HF_TOKEN=<your hf_... token>
```

- **Why this model:**
  - Apache-2.0 open-weight, and instruct-only (no "thinking" phase).
  - Live on the router, with DeepInfra reporting `json_schema` structured-output support.
  - The `:deepinfra` suffix pins that provider.
  - `Qwen/Qwen2.5-7B-Instruct` was checked first (2026-09-29). Its only live
    provider is Featherless, which has no structured-output support, and the
    model is absent from the router's `/v1/models` list.
- **Structured output:** `response_format: json_schema, strict: true`. The
  agent's schema is converted to standard JSON Schema with the same fields and
  required keys, and closed objects. The output is still fully parsed,
  validated and guarded; nothing was relaxed.
- **Token:** a fine-grained token with "Make calls to Inference Providers". A
  value that isn't `hf_…`, such as a placeholder, means "not configured", so
  nothing is called.
- **Cost:** HF free accounts get **$0.10 of credits per month**. This is not
  unlimited; paid credits are needed beyond it. HTTP 402 (credits used up) is
  shown to teachers as `AI_QUOTA_EXCEEDED`.
- **One real check:** `npm run llm:manual` (Photosynthesis / Biology / Class 8 /
  easy / 1 question). It uses a temporary DB, saves nothing, and makes no call
  unless the configuration is valid.
- **Back to Gemini:** remove `AIA_LLM_PROVIDER` / `AIA_LLM_MODEL`.

> The LMS `server/server.js` prints the whole `.env` file at startup
> (pre-existing). Any token in `.env`, including `HF_TOKEN`, therefore appears
> in the server console and logs.

## Real Gemini status

`npm run gemini:manual` (`tests/manual/realGeminiCheck.js`) makes **one** opt-in
real call through the full path: signed teacher JWT → LMS `authMiddleware` →
`requireTenant` → `/teacher/assessments/generate` → the real
`GeminiGenerationProvider` → parsing → validation → guard → response.
- It reads the existing `SOA_*` configuration from `server/.env`.
- It runs against a **temporary** synthetic database, because the live one
  has no module tables yet. It asserts that no rows are created.
- It scans the response and logs for the key.

**Result of the only run so far (Step 4):**

| # | Item | Result |
|---|---|---|
| 1 | Gemini request | Failed: no HTTP response before the 60 s timeout |
| 2 | HTTP status | Gemini: none received; assessment-agent API: `504 AI_TIMEOUT` (safe message) |
| 3 | Model | `gemini-3.8-flash` (from `SOA_LLM_MODEL`) |
| 4 | JSON parsing | Not reached |
| 5 | Validation | Not reached |
| 6 | Content guard | Not reached |
| 7 | Valid questions | 0 |
| 8 | DB rows created | None (temp DB counts unchanged; live DB untouched) |
| 9 | Student/email data | None |
| 10 | Key exposed | No |

Network diagnosis, done without the key and without generation:
- DNS resolves the Gemini host.
- A keyless request to it gets HTTP 403 in about 0.6 s, so the host is reachable.
- No proxy variables are set.

The request reaches Gemini, but the generation doesn't finish within 60 s. The
likely cause is the model's latency on structured output; a hung request is
also possible. Telling these apart needs **one more real call** with
`AIA_LLM_TIMEOUT_MS=120000`. That call was not made, per the owner's decision.

## How to disable AI generation

Set `AIA_AI_GENERATION_ENABLED=false` in `server/.env` and restart the server.
The status endpoint then reports `AI_DISABLED`, the button is disabled, and
`/generate` answers 503. Everything else is unchanged. Leaving `SOA_*` unset
has the same effect (`AI_NOT_CONFIGURED`).

## Authentication assumptions

- The module does **not** add a second authentication system. It relies on the
  LMS's `authMiddleware` (HS256 JWT → `req.user`) and `requireTenant`.
- On every request the adapter re-checks the user against the LMS database:
  - the user exists and belongs to the token's school (otherwise `403 TENANT_MISMATCH`);
  - the role comes from the DB (`mentor`/`teacher` = teacher, `student` = student);
  - every other role, including `admin`, gets `403`.
- School, owner, status and ids are never read from the body (`400 UNKNOWN_FIELD`).
- A teacher may target any classroom in their own school. Student membership
  comes from `student_classroom_assignment`.

## Database / migrations

All five migrations are additive, apply only to the module's own `aia_*` tables,
and are **not applied** to the live database. Until all five are applied,
every route answers `503 NOT_READY`.

- `001_aia_assessments.sql` (Step 1): `aia_assessments`, `aia_questions`,
  `aia_options` (with a partial unique index: at most one correct option per
  question). There are no foreign keys into LMS tables.
- `002_aia_question_explanation.sql` (Step 2): adds `aia_questions.explanation`
  (`TEXT NOT NULL DEFAULT ''`) and `aia_questions.difficulty` (nullable, CHECK
  easy/medium/hard). **No new table.** Unsaved AI proposals are never stored.
- `003_aia_attempts.sql` (Step 3):
  - `aia_attempts`: tenant, assessment (FK → `aia_assessments`, cascade),
    student, status, server `started_at`/`deadline_at`/`finished_at`, and the
    result columns. `UNIQUE(assessment_id, student_id)` enforces one attempt per
    student. A CHECK ties status to `finished_at`. Indexed for student and
    assessment lookups.
  - `aia_attempt_answers`: PK (attempt, question); FKs → `aia_attempts` /
    `aia_questions`; `option_position` 0–3; `is_correct` set at grading.
  - There are no foreign keys into LMS tables.

- `004_aia_assessment_window.sql` (Step 5): adds three nullable columns to
  `aia_assessments`: `opens_at`, `closes_at` and `closed_at`. There is no new
  table. Existing rows get NULL, meaning no window and not closed, which is
  the Step 1–4 behaviour.

- `005_aia_attempt_archive.sql` (Step 6): **one new table**,
  `aia_attempt_archive`, for reset attempts, with a result snapshot, an
  `answers_json` snapshot, `reset_by` and `reset_at`. It has an FK to
  `aia_assessments` and none into LMS tables. `aia_attempts` is **not
  rebuilt**, and its `UNIQUE(assessment_id, student_id)` stays. A rebuild was
  rejected: with foreign keys on, dropping the old table would cascade-delete
  saved answers.

- `006_aia_question_types.sql` (question types): additive, with no table
  rebuild.
  - `aia_questions` gains `question_type` (`NOT NULL DEFAULT 'single_mcq'`,
    CHECK single_mcq/multi_select/numerical), so every existing question stays
    a single MCQ. It also gains `numeric_answer` and `numeric_format` (CHECK
    integer/decimal).
  - The partial unique index `uq_aia_options_one_correct` is dropped, because
    multiple-select needs 2+ correct options. The one-correct rule for single
    MCQs is enforced by validation on every write path.
  - New table `aia_attempt_responses (attempt_id, question_id,
    selected_positions, numeric_value, is_correct, updated_at)`. Its CHECK
    allows exactly one kind of answer, and its FKs point only to `aia_*`
    tables. Single-MCQ answers stay in `aia_attempt_answers`, unchanged.
  - **006 is optional for readiness**: see legacy mode above.
  - Its down script **refuses** while any multiple-select or numerical question
    exists. Otherwise it drops the table and columns and recreates the index.

Apply all (back up the file first):

```bash
node backend/scripts/applyMigration.js --db <absolute path>/server/data/lms_permanent.db --yes
```

- `007_aia_assignments.sql` (Descriptive Assignments): three new tables:
  `aia_assignments`, `aia_assignment_questions` and
  `aia_assignment_submissions`.
  - Submissions are unique per student and assignment, PDF only, and hold
    nullable Prompt 2 evaluation fields.
  - No FK into LMS tables, and it is independent of 006.
  - Optional for readiness: without it, only the assignment routes answer 503.
  - Its down script drops only those three tables. Stored PDFs live outside
    the database.

- `008_aia_recipients_reports.sql` (recipients + shared reports): two new tables.
  - `aia_assessment_recipients`: optional student-level targeting of a published
    test. No rows = the whole class (the behaviour before 008). Selecting every
    student of the class is stored as "whole class".
  - `aia_performance_reports`: each generated AI Performance Report (validated
    content, focus, scope, preview warnings as plain messages; never provider,
    prompt or raw model output). `shared_at` is set by "Send to Student" and makes
    it the student's notification; `read_at` records the first download.
  - No FK into LMS tables. Optional for readiness: without it, selected-student
    publishing and sending reports answer 503; everything else works as before.
  - Its down script drops only those two tables (tests become whole-class again).
- Routes (no AI call on any of them): `GET /teacher/classrooms/:id/students`,
  `POST /teacher/assessments/:id/publish` with optional `{ recipientIds }`,
  `POST /teacher/performance-reports/:reportId/share`,
  `GET /student/performance-reports`, `GET /student/performance-reports/:reportId`
  (only the student the report is about, only once shared; everything else 404).

Roll back with `--down --yes`. It runs 008 down to 001, and deletes all
assessment-agent data. Already-applied migrations are skipped. To apply or roll
back only one migration, add `--only 006`, `--only 007` or `--only 008`.

## How to run

Requires Node 22.5+ (`node:sqlite`). There is nothing to install.

```bash
cd ai-modules/ai-assessment-agent
npm test                        # unit, AI (mocked), attempts, migrations, LMS HTTP tests; temp DBs only
node tests/e2e/browserE2E.js    # manual: one headless-Chrome run of the full lifecycle, synthetic data
```

The browser E2E uses:
- the real LMS login route, `authMiddleware`, `requireTenant`, this router and
  the LMS React client (Vite);
- a **temporary** SQLite file with the LMS table definitions, migrations 001–003
  and synthetic users. It never opens the live database; it checks that the
  live file's modification time is unchanged.
- AI disabled, so no Gemini call.

It needs Chrome or Edge and the client's `node_modules`.

## Question types and advanced AI generation

**Question types** (`core/questionTypes.js`, `core/assessmentValidation.js`):

| Type | Stored as | Valid when | Correct when (server-side, no partial credit) |
|---|---|---|---|
| `single_mcq` (default; every pre-existing question) | 4 `aia_options`, one `is_correct` | exactly 4 distinct options, exactly 1 correct | the chosen option is the correct one |
| `multi_select` | 4 `aia_options`, 2+ `is_correct` | exactly 4 distinct options, at least 2 correct | the chosen SET equals the correct set (subset or superset = wrong) |
| `numerical` | no options; `numeric_answer` + `numeric_format` | a plain number; format `integer` or `decimal` | the canonical numbers are equal |

Numbers are compared as canonical decimal text, never floats. `2.50`, `+2.5`
and `02.5` all become `2.5`. Whole-number questions refuse decimals such as
`3.0` rather than rounding them. The input is plain digits: an optional minus
sign and at most 6 decimal places, with no units, commas, fractions or
exponents. A tolerance or range can be added later as a field of
`numericAnswer`; only `numbersMatch()` would change.

Question bodies (teacher):
- `{ type?, text, options: [{ text, isCorrect } x4], explanation?, difficulty? }`.
  A missing `type` means `single_mcq`, so existing clients keep working.
- `{ type: 'numerical', text, numericAnswer: { format, value }, explanation?, difficulty? }`.

Student answer bodies (`PUT /student/attempts/:id/answers/:questionId`) must
fit the question's type, otherwise `400 WRONG_ANSWER_TYPE`:
- `{ optionPosition }` for a single MCQ;
- `{ optionPositions: [..] }` for a multiple-select (`[]` clears);
- `{ value: "42" }` for a numerical question.

Students never receive `isCorrect`, the numeric answer or explanations before
the attempt is finalized. They do see a numerical question's format (whole
number or decimal), so they know what to type.

**Educational intent templates** (`core/ai/generationTemplates.js`):
- The 10 templates are Board Exam Practice, Concept Mastery, Fundamentals First,
  Application & Reasoning, Higher-Order Thinking, Competitive Exam Practice,
  Numerical Practice, Mixed Difficulty, Revision / Quick Test and Teacher Custom.
- They are guidance, never predictions. A test rejects wording such as "most
  probable" or "guaranteed".
- The guidance text stays on the server. The client sends only a template id and
  gets `{ id, label, description }` from `GET /teacher/ai/templates`.

**Template + teacher instructions.** The prompt's data block carries
`educationalIntent` (the base goal) and `teacherInstructions` (the refinement)
as separate fields. The system rules state this hierarchy, and they depend only
on the question type, never on teacher text. Instructions are screened before
any LLM call, and injection-like wording answers `400 UNSAFE_INSTRUCTIONS`. The
screen catches:
- attempts to re-define the model or change the output format or rules;
- the shared prompt-injection patterns;
- HTML and links.

Teacher Custom requires instructions. Difficulty `mixed` asks for an
easier-to-harder progression.

**Output validation per type** (`core/ai/generatedOutput.js`) keeps the
all-or-nothing rule. Multiple-select needs `correctAnswers` with 2–4 distinct
entries, each an exact option text. Numerical needs `answer` as a number string
valid for `answerFormat`, and for the requested format if there is one. A field
from another type is `UNEXPECTED_FIELD`. The existing checks still apply:
duplicates, answer leaks (every correct option of a multiple-select),
injection, markup and gibberish.

**Legacy mode (before migration 006).** The module stays ready on a 001–005
database. Single MCQs work exactly as before, and the new types answer `503
QUESTION_TYPES_NOT_READY`. For AI requests this happens before the provider is
called, so no quota is spent on something that couldn't be saved.
`GET /teacher/ai/templates` reports `questionTypesAvailable: ['single_mcq']`,
and the UI disables the other two types.

**AI-call efficiency (Performance Analyst).** The LLM is called only from the
explicit Generate / Regenerate button, one request per click:
- A synchronous lock ignores double clicks, and the button is disabled while
  loading.
- Opening, refreshing, loading metrics, rendering charts, moving to another
  student or coming back never call it.
- Before any request, the section shows "AI analysis has not been generated yet."
- The server's throttle (one analysis in flight per teacher) is the second guard.

## Student Performance Analyst (add-on)

A teacher opens one student's performance from the test report ("View
performance", route `/teacher/assessments/students/:studentId`).

**Scope.** Only the requesting teacher's own published tests where the student
is (or was) a member of the test's class, or has a current or archived attempt.
The student must be a `student` in the teacher's school (otherwise 404
`STUDENT_NOT_FOUND`). Students and admins get 403. Unrelated tests of other
teachers are never read.

**Facts (backend, deterministic).** `core/analytics/StudentPerformanceService.js`
collects the records and `core/analytics/performanceMetrics.js` computes
everything from the existing tables (no migration):
- per-test state: `finished`, `in_progress`, `pending`, `upcoming`, `missed`.
  A test counts as missed only if the student joined the class before it
  closed, or has an archived attempt. Expired in-progress attempts are
  finalized first (same lazy expiry as elsewhere).
- counts; completion rate = finished / (finished + missed); average, median,
  best, lowest; last-3 average (3+ finished only).
- trend: least-squares slope per test (> +5 improving, < -5 declining,
  otherwise stable).
- consistency: population SD (<= 10 consistent, <= 20 moderate, else variable).
- by subject; by difficulty; unanswered rate; timed-out rate; % of time used;
  retakes (archived attempts are history only; the current attempt counts).
- history rows labelled `A1..An` (publish order), with the class average of
  finished current attempts.
- `dataSufficiency`: 0 finished -> `none`, 1-2 -> `limited`, 3+ -> `adequate`.
  Trend, consistency and last-3 need 3+.

**AI interpretation (optional).** `core/ai/PerformanceAnalyst.js` reuses the
**same** generator/provider as question generation (Hugging Face via
`AIA_LLM_PROVIDER`/`AIA_LLM_MODEL`/`HF_TOKEN`), with the same timeout and error
mapping. Throttling uses a separate `GenerationThrottle` instance with the
same rules (1 in flight per teacher, 20 per 10 minutes). It is never called
when there are 0 finished tests (the endpoint returns `insufficient_data`).

What the model receives (`buildPayload`), and nothing else:
- `student: "the student"`, the sufficiency level, the numbers above;
- tests as labels `A1..An` with subject, state and numbers (no titles, no ids);
- at most 10 teacher-written question texts (<= 6 incorrect/unanswered,
  <= 4 correct). Before sending, emails become `[email]`, the student's name
  (and each part of 3+ characters) becomes `[student]`, and class names and test
  titles become `[redacted]`. Each is truncated to 200 characters.

It **never** receives the student's name, email or ids, the teacher, school or
class names or ids, or test titles. The POST takes no body, so nothing from the
browser reaches the prompt.

The output is validated strictly by `core/ai/analysisSchema.js`:
- exact fields, enums, lengths and item counts;
- every evidence reference must exist (`A#`, `subject:`, `difficulty:`,
  `metric:`), and so must every `A#` mentioned in the text;
- any percentage or `x/y` score must match a supplied number (+/- 0.5);
- no psychological, personality, family or health claims;
- no prompt injection, markup or links (shared `contentGuard` patterns);
- no gibberish;
- data limitations are required when data is `limited`.

A rejection returns `422 AI_OUTPUT_REJECTED` with codes only (never model
text). The facts endpoint keeps working whatever the AI state is.

**UI** (`client/src/pages/assessment-agent/StudentPerformance.jsx`): student
header, sufficiency banner, KPI cards, score trend (student vs class
average), subject and difficulty charts, and assessment history. Then the AI
section, labelled "AI interpretation of the metrics above": Generate /
Regenerate, a loading state, a safe unavailable state with Try again, and the
summary, insights, strengths, focus areas, teacher actions and practice
suggestions. Evidence chips highlight the referenced row or section. Data
limitations (fixed ones plus the AI's) come last.

**Limitations.** Only MCQ, so there is no question-type breakdown. "Topic" is
the test subject (there is no topic column). The class average uses current
finished attempts only. Nothing is stored; each analysis is generated on
request.

### AI Performance Report (professional report step)

The AI layer of the Student Performance Analyst is a structured report, written
for a mentor. It interprets the facts above and never replaces them.

**Sections** (`core/ai/analysisSchema.js`). Observed data, interpretation and
recommendation are always separate fields:

| Section | Fields |
|---|---|
| A. Executive Summary | `overallStatus` (strong / on_track / needs_support / insufficient_evidence), `observed`, `interpretation` |
| B. Performance Overview | 1–8 items, one per metric (overall, recent, completion, consistency, unanswered, timed_out, retakes, trend): `observed`, `interpretation`, evidence |
| C. Strengths | 0–5: `area`, `observed`, `evidenceStrength` (strong / moderate / limited), evidence |
| D. Areas Requiring Attention | 0–5: `area`, `observed`, `interpretation`, `investigate`, `evidenceStrength`, `priority`, evidence |
| E. Recommended Mentor Actions | 1–5: `action`, `rationale`, `priority`, evidence |
| F. Suggested Next Assessment | `objective`, `questionType`, `difficulty`, `questionCount` (3–30), `rationale`, evidence. A suggestion only; nothing is created |
| G. Data Limitations | 0–6 strings; at least one is required when data is limited |

**Report focus** (`core/ai/reportFocus.js`). There are 8 focuses; the
guidance text stays on the server and the client sends only an id. The default
is Overall Academic Progress:
- Overall Academic Progress
- Identify Weak Concepts
- Exam Readiness (no predictions)
- Fundamentals & Concept Gaps
- Higher-Order Thinking
- Difficulty Progression
- Intervention Planning
- Custom Focus (requires instructions)

The request body is `{ focus?, instructions? }` and nothing else:
- The instructions are screened like generation instructions (injection,
  output-format changes, HTML, links). They are also sanitized like question
  texts: the student's name, e-mail, class names and test titles are blanked.
- The model input is ordered focus → teacher instructions → data. The system
  rules come first and state this hierarchy. They are fixed and never contain
  teacher text.

**Evidence and invented data.** References must exist in the supplied data:
- `A2` (assessment);
- `A2-Q3` (only question samples that were actually supplied);
- `subject:X`, `difficulty:Y`, `metric:Z`. "Subject: Mathematics" style is
  accepted and normalized.

Any `A<n>` or `A<n>-Q<m>` written in text must exist too.

Every number in text must match a supplied number. The exceptions are the
suggested question count, the "3 completed assessments" threshold and counts
from 0 to 3. The report is rejected for any of the following:
- claims of improvement or decline that the trend (or a retake comparison)
  does not show;
- predictions (pass/fail, scores, ranks, probabilities) and certainty words;
- psychological, personality, health or family/background claims;
- hype, first person or chatbot language;
- injection, markup, links or gibberish;
- evidence rated "strong" on limited data.

A rejection returns `422 AI_OUTPUT_REJECTED` with codes only.

**Calls.** The LLM is called only on "Generate AI Report", "Regenerate" or
"Try again", with one request per click:
- The button is disabled while running, and a synchronous lock plus the server
  throttle prevent duplicates.
- The status reads "AI analysis not generated", "Generating...",
  "Generated just now" or "Generated X minutes ago".
- The report lives in client state only, with no persistence and no
  migration. Reloading, returning or changing student shows the empty state
  again, and nothing is generated automatically.

## Descriptive Assignments (Prompt 1: foundation, no AI)

Teachers create written assignments. Students answer them in one PDF.
Teachers see who has submitted, download PDFs and can record final marks by
hand. **No AI is called anywhere in this feature yet.** "Evaluate with AI" is
Prompt 2.

**Lifecycle.** `draft → published → closed`.
- **Draft:** details and questions are editable. Questions are replaced as a
  whole list, which covers add, edit, remove and reorder.
- **Publish needs:** a class in the teacher's school, at least one question,
  question marks that add up to `maxMarks`, and a due date (if set) in the
  future.
- **Published or closed:** everything is locked.
- **Submissions:** accepted while published and before `dueAt` (server clock).
  There is no late-submission mode. A student who has not submitted once the
  assignment is closed or past due is **missed**.

**One current submission per student** (`UNIQUE(assignment_id, student_id)`).
- Uploading again before marking replaces the file. `version` goes up by one
  and the old file is deleted.
- Once marked, the submission cannot be replaced.
- Student statuses: `not_submitted`, `submitted`, `evaluated`, `missed`.

**Upload.** `PUT /student/assignments/:id/submission?filename=<name>.pdf`, raw
body, `Content-Type: application/pdf`, at most 10 MB. `assignments/pdfValidation.js` checks:
- the declared type is `application/pdf`, **and** the bytes start with
  `%PDF-x.y`, **and** there is an `%%EOF` trailer;
- the file is neither empty nor oversized;
- the name ends in `.pdf`;
- there is no JavaScript, launch action or embedded file (a best-effort
  byte scan).

The original filename is reduced to a safe display string. It is never used as
a path.

**Storage.** `assignments/LocalSubmissionFileStore.js`, with `save`, `read`,
`exists` and `delete`:
- Files are stored under random UUID keys that the store generates and checks
  on every call. No path from a client is ever used.
- Writes are atomic; files have mode 0600 and the folder 0700.
- Directory: `AIA_SUBMISSIONS_DIR` (absolute), otherwise
  `<module>/data/submissions`, which is git-ignored.
- Responses never contain keys or paths. Downloads are sent as attachments with
  `nosniff` and a sandbox CSP.
- Prompt 2's evaluator should read PDFs with `fileStore.read(storageKey)`.

**Security.**
- **Teachers:** only their own assignments in their own school; anything else
  is 404. Students and admins get 403 on teacher routes.
- **Class:** must be in the teacher's school.
- **Students:** only published or closed assignments of their own classes, and
  only their own submission.
- **Server-derived values:** school, teacher, student and status always come
  from the session. Sending `teacherId`, `ownerId`, `universityId`, `schoolId`,
  `status` or `studentId` in a body is rejected with 400 `UNKNOWN_FIELD`.

**Data model** (migration 007).
- `aia_assignment_submissions` already reserves `ai_marks`, `ai_grade`,
  `ai_feedback`, `ai_question_marks_json`, `ai_evaluated_at`, `final_marks`,
  `final_grade`, `teacher_feedback`, `final_question_marks_json`,
  `evaluated_at` and `evaluated_by`.
- The teacher's manual marks use `final_marks`, `teacher_feedback`,
  `evaluated_at` and `evaluated_by`: `PUT .../submissions/:sid/evaluation`
  with `{ finalMarks (0..max, steps of 0.5), teacherFeedback? }`.

**Without migration 007** the module is fully ready for assessments. Only the
assignment routes answer 503 `ASSIGNMENTS_NOT_READY`.

### AI-assisted evaluation (Prompt 2)

The only trigger is the teacher clicking **Evaluate with AI** on a submission row, which sends
`POST /teacher/assignments/:id/submissions/:sid/evaluate-ai` with no body. Opening pages, loading
submissions, downloading PDFs and opening the review make **no** AI call.

**Pipeline** (the database is closed during the file and model work):
1. Owner teacher; submission of this assignment; published or closed assignment.
2. AI availability is checked. If AI is off or not configured: 503, and the PDF is not read.
3. Throttle: one evaluation in flight per teacher (a double-click gets 429), 60 per 10 minutes.
4. The PDF is read with `fileStore.read(storageKey)` and re-validated.
5. Text extraction (`assignments/pdfText.js`) uses **pdf-parse 2.4.5** (`PDFParse#getText`, built on Mozilla
   pdf.js). It is the module's only dependency, in `node_modules` here.
   - Limits: at most 40 pages, a 20 s parse timeout, at least 20 letters, and at most 24,000 characters.
   - Larger documents are **refused** (`DOCUMENT_TOO_LARGE`), never truncated. PDFs with no text are
     refused with `PDF_TEXT_UNREADABLE`: "Unable to extract readable text from this PDF."
6. The payload is built (`assignments/AssignmentEvaluator.js`).
7. The existing provider is called (`AssessmentGenerator.callProvider`), with its timeout and safe error codes.
8. Strict validation (`assignments/evaluationSchema.js`).
9. The result is stored in the `ai_*` columns only.

**Payload.** `{ assignment: { instructions, totalMarks, questions: [{ id: "Q1", text, maxMarks }] }, studentAnswer }`.
- Before anything is sent, the student's name (full and its parts), e-mails, the class name, and the teacher
  and school names are blanked. This applies to the answer and also to the teacher's instructions and questions.
- Line breaks are kept, so question and answer boundaries survive.
- No ids, titles, paths or storage keys are sent.

**Validation.**
- Every question appears exactly once, with no unknown ids.
- Marks are between 0 and the question's maximum, in steps of 0.5.
- `maxMarks` must equal the server's value, and `totalMarks` the assignment total.
- `totalMarksAwarded` must equal the sum; the server stores its own sum.
- Feedback must pass the report's guards: no psychological, health or family claims, predictions,
  certainty words, hype, HTML, links, injection, provider or error text, or redacted names.
- On failure: 422 `AI_OUTPUT_REJECTED` with codes only, and nothing is saved.

**Storage.**
- `ai_marks` (server total), `ai_feedback`, `ai_question_marks_json` (`[{ questionId, marksAwarded, maxMarks, feedback }]`),
  `ai_limitations_json` (added to migration 007 while it was still unapplied) and `ai_evaluated_at`.
- Re-evaluating replaces only these. The teacher's `final_*` marks are never touched.
- A student's replacement upload clears the stale suggestion. A suggestion is only stored if the evaluated file
  is still the current one (otherwise 409 `SUBMISSION_CHANGED`).

**Review.**
- "Accept suggestions" only pre-fills the final-marks form. "Save final marks" sends
  `PUT .../evaluation` with `{ questionMarks: [{ questionId, marks }], teacherFeedback }`; the total is
  computed by the server and is authoritative.
- Students see only the final marks, per-question marks and teacher feedback. They never see `ai_*` data.

## How to remove

**Only the AI integration** (keep Step 1). The quickest way is to set
`AIA_AI_GENERATION_ENABLED=false`, which needs no code change. To remove the code:
1. In `integration/lmsAssessmentAgent.js`, remove the config, provider and
   generator lines and pass no `generator`.
2. In `http/createAssessmentRouter.js`, remove the three "Teacher, AI (Step 2)"
   routes, the `generator`/`throttle` parameters and the two `core/ai` imports.
3. Delete `backend/src/core/ai/`, `backend/src/llm/`, `tests/ai/`,
   `tests/lms-integration/ai-http.test.js` and `tests/helpers/mockProvider.js`.
4. Delete `client/src/pages/assessment-agent/AiAssessmentGenerator.jsx`. In
   `TeacherAssessments.jsx`, remove its import, the `aiMode`/`ai` state, the
   AI-status effect and the **Generate with AI** button.
5. `AssessmentService.createAssessmentWithQuestions` / `resolveGenerationTarget` /
   `assertTeacher` can stay: they are plain, AI-free service methods.
   Migration 002 can stay too, because explanations are optional. Or run its
   down file.

**Only Step 3 (attempts/grading/reports)**, keeping Steps 1–2:
1. If migration 003 was applied, first roll back **only 003**:
   `003_aia_attempts.down.sql` (e.g.
   `node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync(process.argv[1]).exec(require('fs').readFileSync('backend/src/adapters/lms/migrations/003_aia_attempts.down.sql','utf8'))" <db path>`).
   This deletes all attempts and results.
2. In `http/createAssessmentRouter.js`: remove the `AttemptService` import, the
   `attempts`/`now` lines in `handle()` (call `fn(service, actor, req)`), the
   "Teacher, results (Step 3)" route and the "Student, attempts (Step 3)"
   routes. Change the student list route back to
   `{ assessments: s.listAvailableForStudent(a) }`.
3. In `integration/lmsAssessmentAgent.js`, remove the `now` option.
4. In `adapters/lms/`: remove `'aia_attempts', 'aia_attempt_answers'` from
   `MODULE_TABLES`, the "attempts (Step 3)" methods and `ATTEMPT_COLUMNS` in
   `SqliteAssessmentLmsAdapter.js`, and the Step 3 names in
   `AssessmentLmsAdapter.js`'s `REQUIRED_METHODS`. Delete
   `migrations/003_aia_attempts*.sql` and the 003 entry in
   `scripts/applyMigration.js`.
5. In `core/AssessmentService.js`, remove the `ASSESSMENT_HAS_ATTEMPTS` check in
   `unpublish`. Delete `core/AttemptService.js`.
6. Delete `tests/attempts/`, `tests/lms-integration/attempts-http.test.js` and
   `tests/e2e/`. In `tests/helpers/lmsTestDb.js`, remove `UP_003`/`DOWN_003`
   and the `withStep3` branch.
7. Client: delete `StudentTests.jsx`, `StudentAttempt.jsx` and
   `AssessmentReport.jsx` from `client/src/pages/assessment-agent/`. Remove their
   two imports and two routes from `client/src/App.jsx` (marked "AI Assessment
   Agent (Step 3)"). In `TeacherAssessments.jsx`, remove the `AssessmentReport`
   import, the `showReport` state and the **Report** button/section.

**Only Step 6 (reset/retake)**, keeping Steps 1–5:
1. If migration 005 was applied, run only `005_aia_attempt_archive.down.sql`.
   This drops the reset history; current attempts are untouched.
2. Backend:
   - `http/createAssessmentRouter.js`: remove the `/students/:studentId/reset`
     route.
   - `core/AttemptService.js`: remove `resetAttempt`,
     `MAX_RESETS_PER_STUDENT`, and the `archive`/`previousOf`/`attemptNumber`/
     `previousAttempts` parts of `report`.
   - Adapter: remove `'aia_attempt_archive'` from `MODULE_TABLES`, the three
     archive methods, and the archive term in `countAttempts`. Also remove the
     three names from `REQUIRED_METHODS`.
3. Delete `migrations/005_*`, the 005 entry in `scripts/applyMigration.js`,
   `tests/retakes/`, `tests/lms-integration/retakes-http.test.js`, and
   `UP_005`/`DOWN_005`/`withStep6` in `tests/helpers/lmsTestDb.js` (plus the
   two 005 lines in the 004 migration test).
4. Client: in `AssessmentReport.jsx`, remove the Reset button, `resetStudent`
   and the attempt/previous lines.

**Only Step 5 (windows/close)**, keeping Steps 1–4:
1. If migration 004 was applied, run only `004_aia_assessment_window.down.sql`.
   This loses only the window and close data.
2. Backend:
   - `http/createAssessmentRouter.js`: remove the `/close` route and pass
     `{ adapter }` without `now` to `AssessmentService`.
   - `core/AttemptService.js`: remove `closeAssessment`, `availabilityOf`, the
     window checks in `startAttempt` (restore the duration-only deadline), the
     `availability` field, and `missed`/`testClosed` in `report`.
   - `core/AssessmentService.js`: remove the window check in
     `updateAssessment`, `CLOSES_IN_PAST` in `publish`, the three window fields
     in `summary`/`studentSummary`, and the `now` option.
   - `core/assessmentValidation.js`: remove `opensAt`/`closesAt`,
     `ISO_DATETIME` and `optionalDateTime`.
   - Adapter: remove the three columns from `ASSESSMENT_COLUMNS`/`EDITABLE`,
     `insertAssessment`, `closeAssessment`, the `closed_at` clause in
     `setAssessmentStatus`, and `STEP5_ASSESSMENT_COLUMNS` in `isReady`. Also
     remove `closeAssessment` from `REQUIRED_METHODS`.
3. Delete `migrations/004_*`, the 004 entry in `scripts/applyMigration.js`,
   `tests/windows/`, `tests/lms-integration/windows-http.test.js`, and
   `UP_004`/`DOWN_004`/`withStep5` in `tests/helpers/lmsTestDb.js`.
4. Client (module pages only):
   - `TeacherAssessments.jsx`: remove the window inputs, helpers, the Close
     button and badge, and the three new `CODE_TEXT` entries.
   - `StudentTests.jsx`: remove the availability display.
   - `AssessmentReport.jsx`: remove the `missed` label.

**Only question types / advanced generation** (keeping single MCQs and everything else):
1. If migration 006 was applied, first delete (or convert to single MCQ) every
   multiple-select and numerical question, then run
   `node backend/scripts/applyMigration.js --db <path> --down --only 006 --yes`.
   The script refuses while such questions exist.
2. Backend:
   - Delete `core/questionTypes.js` and `core/ai/generationTemplates.js`.
   - Revert `validateQuestionInput` to the single-MCQ rules.
   - In `AttemptService`, restore `optionPosition`-only answers and grading.
   - In the adapter, remove `supportsQuestionTypes`/`saveResponse`, the 006
     columns in `listQuestions`/`insertQuestion`/`replaceQuestion`, and the
     `aia_attempt_responses` parts of `listAnswers`, `finalizeAttempt` and
     `archiveAttempt`.
   - Remove `questionType`/`numericFormat`/`template` and the instruction
     screening from `generationRequest.js`.
   - Restore the single `SYSTEM_INSTRUCTION`/`RESPONSE_SCHEMA` in
     `generationPrompt.js` and the single-MCQ path in `generatedOutput.js`.
   - Remove the `/teacher/ai/templates` route.
3. Tests: delete `migrations/006_*`, the 006 entry and `--only` in
   `scripts/applyMigration.js`, `tests/questionTypes/`,
   `tests/lms-integration/questionTypes-http.test.js`, and
   `UP_006`/`DOWN_006`/`withQuestionTypes`/`multi`/`numerical` in
   `tests/helpers/lmsTestDb.js`. Also remove steps 5–6 of the browser E2E.
4. Client: delete `QuestionEditor.jsx` and `questionForm.js`, and restore the
   single-MCQ editors in `AiAssessmentGenerator.jsx`, `TeacherAssessments.jsx`
   and `StudentAttempt.jsx`.

**Only Descriptive Assignments** (keeps Steps 1–6, question types,
performance reports, question generation, the Student Onboarding Agent and
legacy assessments):
1. **Migration.** If 007 was applied, run
   `node backend/scripts/applyMigration.js --db <path> --down --only 007 --yes`.
   This drops the three `aia_assignment*` tables only. Then delete the
   submission folder (`AIA_SUBMISSIONS_DIR` or `<module>/data/submissions`).
2. **Backend.**
   - Remove the `pdf-parse` dependency from `package.json`, and `node_modules`.
   - Delete `backend/src/assignments/` (this includes the Prompt 2 files `pdfText.js`,
     `evaluationSchema.js` and `AssignmentEvaluator.js`),
     `backend/src/adapters/lms/sqliteAssignmentStore.js` and
     `migrations/007_*`.
   - In `SqliteAssessmentLmsAdapter.js`, remove the `assignmentMethods` import
     and the `Object.assign(adapter, assignmentMethods(db))` line.
   - In `http/createAssessmentRouter.js`, remove the
     `registerAssignmentRoutes` import, the `fileStore` option and the
     "Descriptive Assignments" block.
   - In `integration/lmsAssessmentAgent.js`, remove the
     `LocalSubmissionFileStore` import, `submissionsDirFrom` and `fileStore`.
   - In `scripts/applyMigration.js`, remove the 007 entry.
3. **Tests.**
   - Delete `tests/assignments/`,
     `tests/lms-integration/assignments-http.test.js` and
     `tests/helpers/syntheticPdf.js`. Also delete
     `tests/lms-integration/assignmentEvaluation-http.test.js`.
   - In `tests/helpers/lmsTestDb.js`, remove `UP_007`/`DOWN_007`/`withAssignments`.
   - In `tests/e2e/browserE2E.js`, remove steps 7–11, the classmate and the
     upload directory.
4. **Client.**
   - Delete `TeacherAssignments.jsx`, `AssignmentSubmissions.jsx`, `StudentAssignments.jsx`,
     `StudentAssignment.jsx` and `assignmentUi.jsx`.
   - In `App.jsx`, remove the three imports and routes marked "Descriptive
     Assignments".
   - Remove the entry links marked "Descriptive Assignments entry" in
     `TeacherAssessments.jsx` and `StudentTests.jsx`.
5. In `.gitignore`, the `data/` line may stay.

**Only the professional report upgrade** (keeping the Performance Analyst facts):
1. Delete `core/ai/reportFocus.js`, `client/.../AiPerformanceReport.jsx` and
   `tests/helpers/reportFixture.js`.
2. In `createAssessmentRouter.js`, remove the `/teacher/ai/report-focuses`
   route and restore `emptyBody(req)` in the analysis route.
3. Restore the earlier `analysisSchema.js`/`PerformanceAnalyst.js`, and the
   AI section in `StudentPerformance.jsx`.
4. The `position`/`type` fields that `StudentPerformanceService` adds to
   question records, and the `unsafeInstructions` export, are harmless and may
   stay.

**Only the Student Performance Analyst** (no migration to undo):
1. Client: delete `client/src/pages/assessment-agent/StudentPerformance.jsx`.
   In `client/src/App.jsx`, remove its import and the route marked "AI
   Assessment Agent: Student Performance Analyst". In `AssessmentReport.jsx`,
   remove the "View performance" `Link`, plus the `Link` and `BarChart3`
   imports.
2. Backend:
   - `http/createAssessmentRouter.js`: remove the two
     `/teacher/students/:studentId/performance*` routes, the
     `StudentPerformanceService` import and the `analyst`/`analysisThrottle`
     options. The 5th `adapter` argument of `handle` may stay.
   - `integration/lmsAssessmentAgent.js`: remove the `PerformanceAnalyst`
     import and `analyst`.
   - Delete `core/analytics/` and `core/ai/PerformanceAnalyst.js`,
     `core/ai/analysisSchema.js`.
   - Adapter: remove `getSchoolStudent` and `listStudentMemberships` (and
     their names in `REQUIRED_METHODS`).
   - The extra exports (`availabilityOf` from `AttemptService`,
     `INJECTION`/`MARKUP` from `contentGuard`) are harmless and may stay.
3. Tests: delete `tests/analytics/` and
   `tests/lms-integration/performance-http.test.js`. In `tests/e2e/browserE2E.js`,
   remove step 4 and its checks.

**The whole module:**
1. Remove the "AI Assessment Agent" mount block in `server/server.js` and delete
   `server/routes/assessmentAgentRoutes.js`.
2. Remove the marked imports and routes in `client/src/App.jsx` (the teacher
   route, the Student Performance Analyst route, and the two Step 3 student
   routes), and delete
   `client/src/pages/assessment-agent/`.
3. Remove the Step 4 sidebar entries, each marked "AI Assessment Agent":
   - `client/src/components/MentorLayout.jsx`: the nav item and the
     `ClipboardCheck` import;
   - `client/src/components/StudentLayout.jsx`: the nav item and the
     `ClipboardList` import;
   - `client/src/context/TranslationContext.jsx`: the `nav_ai_assessments` and
     `nav_my_tests` keys.
4. If migrations were applied, run
   `node backend/scripts/applyMigration.js --db <path> --down --yes` first.
5. Delete `ai-modules/ai-assessment-agent/`.

The shared `SOA_*` variables remain in use by the Student Onboarding Agent;
leave them.

## Current limitations

- **Retakes (Step 6):**
  - They exist only through a teacher reset, at most 3 per student per test
    (a fixed constant, not configurable).
  - There is no "retake policy" for students and no bulk reset.
  - Resets are refused on closed tests, so a retake after closing would need
    a new test.
  - Students can't see their archived attempts; only the teacher's report
    shows them.
- A test with attempts can't be unpublished or edited.
- **Windows (Step 5):**
  - The window can only be set while the test is a draft. Once published
    (for example, to extend `closesAt`), it can't be changed; the teacher can
    only close early.
  - A closed test can't be reopened.
  - Attempts finalized by a close share the `expired` status with time-ups.
    The report labels both "Auto-submitted (time up / closed)".
- Expiry is lazy: an abandoned attempt is finalized the next time the student
  or the teacher's report touches it. The result is the same either way,
  because `finished_at` is the deadline. There is no background job.
- Scoring is 1 mark per question, with no negative marking and no weights.
- Answers are saved one click at a time. A click that reaches the server after
  the deadline is refused; there is no grace period.
- The sidebar entry highlights only on the exact list page, not on attempt
  or result pages. This follows the layouts' existing exact-match logic,
  which was left unchanged.
- The "AI Assessments" label is translated in English only. Arabic and Urdu
  fall back to English, like `nav_student_import`.
- AI generation now runs on Hugging Face (verified with one real call).
  **Gemini is still not verified.** The one real call timed out
  (see [Real Gemini status](#real-gemini-status)). The provider is tested against
  mocked HTTP only.
- The guard is pattern-based. It is not a factual-accuracy check: the teacher's
  review is the accuracy check.
- Generation is all-or-nothing. One bad question rejects the whole response,
  and the teacher simply generates again.
- Whether a saved question came from the AI is not recorded (there is no
  provenance column).
- AI-generation throttling is in memory, per server process.
