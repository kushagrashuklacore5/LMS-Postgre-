# LMS Product, Architecture & Business Audit

**Phase 0 audit of Core5 Academy LMS** (`LMS-main`: `client/`, `server/`, `ai-modules/`)
**Audit date:** 5 October 2026
**Scope of this phase:** discover, analyse, document, recommend. No product code, schema or dependency was changed for this audit.

## How to read this document

Every claim carries one of three evidence labels.

| Label | Meaning |
| --- | --- |
| **LIVE** | Observed against the running local stack (API on `localhost:5002`, client on `localhost:5174`), either by a read-only HTTP request or in a real browser driven through Chrome DevTools. |
| **CODE** | Confirmed by reading the source. Not executed, usually because executing it would write or destroy data. |
| **UNVERIFIED** | Plausible from the code or UI but not confirmed. Requires testing in a later phase. |

How the live checks were run:

- API probes were `GET` requests only, sent with four identities: no `Authorization` header, a "guest" (missing token), a forged superadmin token, and a correctly signed student token.
- Browser checks used a headless Chrome session per role (guest, student, mentor, admin, accountant, storekeeper) with a locally signed session placed in browser storage. Real password logins were not used, so anything that depends on the login screen itself is marked UNVERIFIED.
- No write, delete, registration or login request was sent to any vulnerable endpoint. Findings about writes are labelled CODE.

One side effect occurred and is disclosed in section 18: a single read request crashed the backend twice during the audit (finding REL-001). The server was restarted each time.

Findings in priority P0 and P1 use the full strict format. P2 and below are listed in compact tables so the document stays usable; any of them can be expanded on request.

---

## 1. Executive Summary

The product has a wide surface (about 76 client routes, about 300 API routes, 54 database tables, 9 user roles) and two well-built modules, but it is **not safe to put in front of a real college in its current state**. The blocking problems are security and data-integrity problems in the core server, not missing features.

**The five things that matter most**

1. **Anyone on the network can read and change almost any record without logging in.** A generic CRUD router exposes 20 tables. Reading a user record, including its password hash, needs no token (LIVE). Updating and deleting rows needs no token either (CODE). See SEC-001, SEC-002.
2. **Authentication can be bypassed four different ways.** Missing or invalid tokens are downgraded to a "guest" instead of being rejected (LIVE); a superadmin token is an unsigned base64 string that anyone can write by hand (LIVE); self-registration accepts any role including admin (CODE); seven demo accounts log in with no password (CODE). See SEC-003 to SEC-006.
3. **Schools are not isolated from each other.** A student token from one school read another school's classroom and course roster (LIVE). Most tables have no school column and most controllers never check one. See SEC-010.
4. **One request from any logged-in user crashes the whole server.** `GET /api/accountant/fees-stats` took the backend down on both attempts (LIVE). See REL-001.
5. **The academic workflow is fragmented.** There are four unrelated ways to assess a student (legacy course assessments, AI tests, descriptive assignments, manually typed term results). None of them feeds another, and none feeds progress, dashboards or notifications. See WF-001.

**What is good and should be the model for the rest**

The two modules under `ai-modules/` (Student Onboarding Agent and AI Assessment Agent) are materially better than the core: they re-check the user's role and school against the database on every request, keep tenant scope on every row, use migrations, and have automated tests (343 passing in the onboarding module). The recommended direction is to bring the core up to that standard rather than to add features.

**Headline numbers**

| Measure | Value | Evidence |
| --- | --- | --- |
| Findings recorded | 98 (11 P0, 32 P1, 42 P2, 12 P3, 1 P4) | this document |
| Tables reachable through unauthenticated generic routes | 20 | CODE, sample LIVE |
| Automated tests in the core client and server | 0 | LIVE (file search) |
| Database indexes outside the AI modules | 2 (both on `superadmins`) | LIVE |
| Core tables with a school (`university_id`) column | 8 of 38 | LIVE (schema dump) |
| Scripts in the server root that read or reset credentials | 18 | LIVE (file listing) |

**Recommendation:** do not start formal feature testing yet. Fix the P0 list in section 20 first; otherwise every later test phase will be testing behaviour that has to change.

---

## 2. Product Scope

**What the product is today.** A multi-tenant, web-based school management and learning system. Its data model is school-shaped (grade, section, class teacher, term results, fee categories), not college-shaped. It combines three products:

| Product area | Modules | Assessment |
| --- | --- | --- |
| LMS core | Courses, weeks, chapters, materials, legacy assessments, progress, certificates, live classes, calendar, announcements | In scope. Partly working, weakly connected. |
| School administration | Users, classrooms, attendance, term results, timetable, student import, AI tests and assignments | In scope. The strongest area because of the AI modules. |
| Finance and procurement (ERP) | Fee structures, student fee payments, accountant portal, expenses, storekeeper, vendors, stock requests, invoices, requirements | Out of LMS scope. Lowest quality, largest attack surface. |
| SaaS platform | Superadmin, subscriptions, plans, quotas, feature gating, internal admin portal, translation | Platform concern. Partly broken. |

**Roles found:** student, mentor (also called teacher, class teacher, course teacher), admin, superadmin, accountant, storekeeper, vendor, plus `guest` (created by the auth middleware) and `portal_admin` (referenced in code).

**Positioning problem.** The marketing page sells "Enterprise & University" learning, the data model is a K-12 school, and a third of the code is an ERP. A buyer cannot tell what they are getting. This is a product decision (section 21, Q1).

---

## 3. Technology / Architecture Overview

| Layer | What is there | Evidence |
| --- | --- | --- |
| Client | React 18 + Vite + Tailwind, React Router, axios, socket.io-client. 224 source files. `App.jsx` is 1,495 lines; `TranslationContext.jsx` is 5,050 lines. | CODE |
| Server | Node + Express 4, one `server.js` mounting 45 route files. 24,000 lines across routes, controllers and middleware. | CODE |
| Database in use | A single SQLite file, `server/data/lms_permanent.db`, 54 tables. | LIVE |
| Database configured | `USE_POSTGRES=true` in `.env`, but ignored (see ARCH-001). PostgreSQL is not running. Mongoose models and a MongoDB data directory also remain. | LIVE |
| Auth | JWT in `localStorage`, 7-day expiry, no refresh for normal users, no server-side session or revocation. | CODE |
| Realtime | socket.io with no authentication; server broadcasts created and updated rows to every connected client. | CODE |
| AI | Hugging Face Inference router (Qwen model) for question generation, performance analysis, assignment evaluation and Excel column mapping. | LIVE |
| Payments | Razorpay; live-looking key secrets are hard-coded as fallbacks in source. | CODE |
| Email | Nodemailer via Zoho; onboarding emails paused by default. | CODE |
| Tests | None for client or server. Tests exist only inside `ai-modules/`. | LIVE |
| Runtime | Machine runs Node 18.20.8; the AI assessment module declares Node 22.5 or newer and works through a fallback driver. | LIVE |

### Architecture findings

| ID | Type | Sev | Finding | Evidence |
| --- | --- | --- | --- | --- |
| ARCH-001 | ARCHITECTURE | P1 | `server.js` loads `config/database-switch` on line 3, before `dotenv` on line 10. `USE_POSTGRES` is therefore always unset at that point and the app silently runs on SQLite whatever the environment says. An operator who believes they are on PostgreSQL is not. | LIVE (port 5432 closed, app works) |
| ARCH-002 | ARCHITECTURE | P1 | Three persistence strategies coexist: SQLite (used), PostgreSQL (configured, plus a master/tenant connection manager), Mongoose (20 model files, unused). Multi-tenancy is designed as "database per tenant" in `config/` but implemented as "one shared file with an optional column". | CODE |
| ARCH-003 | ARCHITECTURE | P1 | Two generations of code serve the same entities. For example `/api/attendance` has a controller and `universalRoutes` has a second, different attendance writer; `/api/users` is served by `user-routes` for some paths and by the generic router for the rest. Behaviour depends on Express mount order. | CODE, LIVE |
| ARCH-004 | TECHNICAL DEBT | P2 | Repository hygiene: 258 entries in `server/`, most of them one-off scripts; `*-backup.js`, `*-broken.js`, `.bak` files beside live code; a built `client/dist` checked in; status notes saved as `.js` files in the project root. | LIVE |
| ARCH-005 | ARCHITECTURE | P2 | No process-level safety net. There is no `uncaughtException` or `unhandledRejection` handler and no process manager, so any thrown error inside a database callback stops the service (see REL-001). | LIVE |
| ARCH-006 | TECHNICAL DEBT | P2 | The client reads its backend address from `VITE_BACKEND_URL` in 20+ files with two incompatible conventions (with and without `/api`), each with a hard-coded production fallback. A local build with no env file talks to production; with one, some pages call `/api/api/...` (LIVE: `GET /api/api/subscriptions/current` returned 404). | LIVE |
| ARCH-007 | ARCHITECTURE | P2 | State that must survive restarts is held in memory: import jobs, execution locks, rate-limit counters, plan cache. The service cannot be restarted or scaled to two instances without losing work. | CODE |

---

## 4. Complete Feature Inventory

Status key: **Works** (observed working), **Partial** (renders or responds but with defects), **Broken** (fails), **Unverified** (not exercised). "Guard" is what the server actually enforces, not what the UI hides.

### 4.1 Student

| ID | Module / page | Capability | API | Tables | Status | Problems and gaps |
| --- | --- | --- | --- | --- | --- | --- |
| STU-001 | Dashboard `/student/dashboard` | Overview and stats | `/api/student/dashboard`, `/api/results/my-results` | users, students, course_students | Partial | Calls an endpoint that does not exist (404, LIVE). No "what is due" view. |
| STU-002 | Courses `/student/courses`, `/student/course/:id` | View enrolled courses, weeks, chapters, materials | `/api/courses/student`, `/api/materials/*`, `/api/chapters/*` | courses, course_students, weeks, chapters, course_materials | Works (page renders, LIVE) | Enrollment is a snapshot (WF-002). Materials are served from a public folder (SEC-014). |
| STU-003 | Legacy assessment `/student/assessment/:id` | Attempt a course assessment | `/api/assessments/*` | assessments, assessment_questions, assessment_attempts | Partial | Time window not enforced on submit; answers exposed (SEC-011). |
| STU-004 | My Tests `/student/assessment-agent/tests` | Attempt AI or manual MCQ tests set by a teacher | `/api/assessment-agent/student/*` | aia_* | Works (LIVE, empty state) | Not linked to courses, results or progress (WF-001). |
| STU-005 | Descriptive assignments `/student/assessment-agent/assignments` | Upload a PDF answer | `/api/assessment-agent/student/assignments/*` | aia_assignments, aia_assignment_submissions | Unverified | No sidebar entry (UX-002). |
| STU-006 | Results `/student/results` | View term results | `/api/results/student/:id` | results | Works (LIVE) | Readable by anyone without login (SEC-001 family). |
| STU-007 | Attendance `/student/attendance` | View own attendance | `/api/attendance/student` | attendance | Works (LIVE) | No percentage threshold or alert. |
| STU-008 | Timetable `/student/timetable` | View class timetable image | classroom timetable upload | classrooms.timetable | Partial | No sidebar entry. Timetable is an uploaded file, not data. |
| STU-009 | Pay fees `/student/pay-fees` | Pay fee by Razorpay | `/api/payments/*`, fee structures | payments, feeStructures, students | Broken | Fee-structure request returns HTML, not JSON (LIVE console error). No sidebar entry. |
| STU-010 | Certificates `/student/certificates` | View and download certificates | `/api/certificates` | certificates | Broken | API returns 500 (LIVE). |
| STU-011 | Calendar `/student/calendar` | View events | `/api/calendar` | calendar_events | Partial | Gated by subscription plan; no sidebar entry. |
| STU-012 | Announcements `/announcements` | Read announcements | `/api/announcements` | announcements | Works (LIVE) | No sidebar entry; no unread count. |
| STU-013 | Subscription `/student/subscription` | Student-level plan purchase | `/api/subscriptions/*` | subscriptions | Unverified | Unclear why a student buys a plan (BV-004). |
| STU-014 | Live classes | Join a class | `/api/live-classes/*` | live_classes, live_class_attendees | Unverified | Any logged-in user can start, end or delete (SEC-012). |

### 4.2 Mentor / faculty

| ID | Module / page | Capability | API | Tables | Status | Problems and gaps |
| --- | --- | --- | --- | --- | --- | --- |
| MEN-001 | Dashboard | Course list and shortcuts | `/api/courses/mentor` | courses | Works (LIVE) | 68 buttons on one screen; core actions live only here, not in the sidebar. |
| MEN-002 | Create course `/mentor/create-course` | Create a course, optionally for a classroom | `POST /api/courses/create-course` | courses, course_students | Works | No draft or publish state; can be created empty (WF-002). Heading shows the raw key `course_management` (LIVE). |
| MEN-003 | Course content | Weeks, chapters, materials upload | `/api/weeks`, `/api/chapters`, `/api/materials/upload` | weeks, chapters, course_materials | Unverified | Week update and delete have no ownership check (SEC-012). 500 MB upload limit. |
| MEN-004 | Assign students `/mentor/assign-students` | Replace a course's student list | `POST /api/courses/:id/assign-students` | course_students | Works | Deletes all enrollments then re-inserts, not atomic (DATA-004). |
| MEN-005 | Legacy assessment `/mentor/create-assessment`, `/mentor/assessment/:id` | Create, add questions, publish | `/api/assessments/*` | assessments, assessment_questions | Partial | Publish and add-question have no ownership check (SEC-011). |
| MEN-006 | AI Assessments `/teacher/assessments` | Manual or AI-generated tests, publish to class or selected students, report, retake reset | `/api/assessment-agent/teacher/*` | aia_* | Works (LIVE, generation tested) | Classroom-based, not course-based (WF-001). Label says "AI" for manual tests too. |
| MEN-007 | Descriptive assignments | Create, collect PDFs, AI-assisted marking | `/api/assessment-agent/teacher/assignments/*` | aia_assignments* | Works (page LIVE) | Marks do not reach results. |
| MEN-008 | Student performance `/teacher/assessments/students/:id` | AI performance report, share to student | assessment-agent | aia_performance_reports | Unverified | |
| MEN-009 | Attendance `/mentor/attendance` | Mark class attendance by date | `POST /api/attendance/mark` | attendance | Works (LIVE render) | Any mentor can mark any class (SEC-012). Overwrites the day (DATA-005). |
| MEN-010 | Class results `/mentor/results`, `/mentor/add-result` | Type term results per student | `POST /api/results` (generic) | results | Works (LIVE render) | Write endpoint has no authentication (SEC-002). Subjects stored as a JSON blob. |
| MEN-011 | My classrooms | View assigned classrooms and students | `/api/classrooms/my-classrooms` | classroomAssignments | Works (LIVE) | |
| MEN-012 | Progress `/mentor/progress` | See student progress per course | `/api/progress/mentor` | progress | Works (LIVE render) | Query count grows with students times courses (PERF-003). |
| MEN-013 | Requirements `/mentor/requirements` | Request classroom supplies | `/api/requirements` | requirements, requirement_items | Works (LIVE render) | ERP scope (BV-001). |
| MEN-014 | Calendar `/mentor/calendar` | Create and view events | `/api/calendar` | calendar_events | Partial | Plan-gated. |
| MEN-015 | Live classes | Schedule, start, end | `/api/live-classes` | live_classes | Unverified | External meeting link only. |

### 4.3 Admin

| ID | Module / page | Capability | API | Tables | Status | Problems and gaps |
| --- | --- | --- | --- | --- | --- | --- |
| ADM-001 | Dashboard, Analytics | Counts and charts | `/api/admin/dashboard`, `/api/admin/analytics` | several | Works (LIVE render) | Accuracy unverified. |
| ADM-002 | Users `/admin/users` | List, edit, delete users | `/api/admin/users`, `/api/users/:id` | users, students | Works (LIVE render) | Edit can change role and email with no school check (SEC-012). Hard delete (DATA-001). |
| ADM-003 | Add student / teacher | Create accounts | `/api/admin/create-student`, `/create-teacher` | users, students | Works (render) | Two inserts, not atomic. 10 of 12 inputs unlabeled (A11Y-001). |
| ADM-004 | Import students `/admin/student-import` | Excel upload, AI column mapping, review, approve, execute, custom fields | `/api/onboarding/*` | users, students, student_classroom_assignment, soa_* | Works (LIVE, review and day-first dates tested) | Imported students cannot log in until someone sets a password for each (WF-008). Jobs are lost on restart. |
| ADM-005 | Classrooms | Create class, assign class teacher and students, timetable | `/api/classrooms/*` | classrooms, classroomAssignments, student_classroom_assignment | Works (LIVE render) | `studentCount` is a stored number that can drift (DATA-003). |
| ADM-006 | Create course `/admin/create-course` | Create course and assign mentor and students | `/api/courses/create-course` | courses | Works (render) | React key warning; not in sidebar. |
| ADM-007 | Fee structure | Define fees per category | `/api/classrooms/fee-structures` | feeStructures | Works (render) | ERP scope. |
| ADM-008 | Mentor approval `/admin/mentors` | Approve or reject self-registered mentors | `/api/users/approve-mentor/:id` | users | Partial | Registration already auto-approves everyone, so the queue is meaningless (WF-009). Not in sidebar. |
| ADM-009 | Announcements | Create and delete | `/api/announcements` | announcements | Works (render) | Not in sidebar. |
| ADM-010 | Calendar | School events | `/api/calendar` | calendar_events | Partial | Plan-gated. |
| ADM-011 | Database export `/admin/database-export` | Export tables to Excel | `/api/database-export/*` | all | Broken | Both calls return 500 (LIVE). The feature itself is a data-exfiltration risk (SEC-015). |

### 4.4 Superadmin and platform

| ID | Module | Capability | Status | Problems and gaps |
| --- | --- | --- | --- | --- |
| SUP-001 | Superadmin login `/superadmin/login` | Separate login with 15-minute access token and refresh cookie | Partial | Refresh endpoint reads `req.cookies` but no cookie parser is installed, so refresh cannot work (CODE). |
| SUP-002 | Superadmin dashboard | Create universities and admins, list users | Partial | Client route is public; several server routes are registered after a catch-all and are unreachable (CODE). |
| SUP-003 | Subscriptions and plans | Buy plan, free trial, feature gating, quotas, plan inheritance and monitor | Partial | Every subscription endpoint is unauthenticated, including a "test upgrade" (SEC-013). Client calls a wrong URL (LIVE 404). |
| SUP-004 | Internal admin portal `/internal-admin-portal` | Manage superadmin accounts | Partial | Public client route; unauthenticated debug endpoints (SEC-016). |
| SUP-005 | Translation (English, Arabic, Urdu) | UI and content translation | Unverified | Unauthenticated endpoints, one with SQL injection (SEC-009). Raw keys visible in the UI (LIVE). |

### 4.5 Finance and procurement

| ID | Module | Capability | Status | Problems and gaps |
| --- | --- | --- | --- | --- |
| FIN-001 | Accountant dashboard | Revenue, payments, expenses | Broken | Queries a column (`payments.university_id`) that does not exist; fees-stats crashes the server (REL-001). |
| FIN-002 | Fee collection, payment history | List and receipt | Partial | Transactions readable with no login (LIVE). |
| FIN-003 | Vendor invoices, pay invoice | Pay vendors through Razorpay | Unverified | Any logged-in user passes the guard (CODE). |
| FIN-004 | Storekeeper: inventory, vendors, stock requests, orders | Procurement | Partial | Inventory readable by a student (LIVE). `/storekeeper/vendors` client route is public (LIVE). Two calls hit missing endpoints. |
| FIN-005 | Vendor portal | Stock, quotes, bills, orders | Unverified | Vendors authenticate with unsalted SHA-256 passwords (CODE). |

---

## 5. Role & Permission Matrix

"Intended" is what the UI and route guards suggest. "Actual" is what the server allowed in testing or allows by code.

| Capability | Student | Mentor | Admin | Superadmin | Guest / no token | Actual server behaviour |
| --- | --- | --- | --- | --- | --- | --- |
| Read any user record by id (incl. password hash) | No | No | Own school | Yes | No | **Anyone.** `GET /api/users/:id` returned the record with no token (LIVE). |
| List users of a school (incl. password hashes) | No | Limited | Own school | Yes | No | **Any token.** A student received 16 users with the `password` field; a guest received school 1's users (LIVE). |
| Create, edit, delete users | No | No | Own school | Yes | No | **Anyone** through generic `PUT`/`DELETE /api/users/:id` (CODE). |
| Choose own role at sign-up | No | No | No | No | No | **Anyone** (CODE). |
| Read a student's results or progress | Own | Own classes | Own school | Yes | No | **Anyone**, by id, no token (LIVE). |
| Write term results | No | Own classes | Yes | Yes | No | **Anyone**, no token (CODE). |
| Mark attendance | No | Own classes | Yes | Yes | No | Any mentor or admin, any classroom, any school (CODE); a second write path needs no token (CODE). |
| Create course | No | Yes | Yes | Yes | No | As intended. |
| Edit or delete a course | No | Own | Own school | Yes | No | Any mentor or admin, any course (CODE); generic route: anyone (CODE). |
| Publish or edit a legacy assessment | No | Own course | Yes | Yes | No | Any caller that passes the auth middleware, which includes guests (CODE). |
| AI tests and assignments (create, publish, report) | No | Own | No | No | No | **As intended.** Role and school re-checked from the database (LIVE: forged-school token got 403). |
| Take an AI test | Assigned only | No | No | No | No | As intended (CODE, module tests). |
| Import students | No | No | Own school | No | No | As intended (LIVE: mentor token got 403). |
| Read another school's classrooms and course rosters | No | No | No | Yes | No | **Student could** (LIVE: classroom of a school-15 mentor, roster of course 1). |
| Read finance data (transactions, payments) | Own | No | Own school | Yes | No | **Anyone**, no token (LIVE). |
| Read inventory | No | No | Own school | Yes | No | **Student could** (LIVE). |
| Change a subscription plan | No | No | No | Own | No | **Anyone**, no token (CODE). |
| Act as superadmin | No | No | No | Yes | No | **Anyone** who sends `Bearer superadmin-<base64 JSON>` (LIVE: read all 18 courses across all schools). |
| Receive realtime events about other users' records | No | No | No | No | No | **Every connected socket**, unauthenticated (CODE). |

Two structural rules cause most of the gap:

- `roleMiddleware` lets `admin` through every role-restricted route, regardless of the roles listed.
- Admin-only guards (`adminOnly`) compare against the string `admin` only, so the forged superadmin token is refused there (LIVE: 403), but everything guarded only by `authMiddleware` is open.

---

## 6. Current Business Workflows

Arrows show what the system does today. A cross marks where the chain stops.

**6.1 School setup**
Superadmin creates university and admin → admin creates fee structures → admin creates classroom (requires a matching fee structure) → admin assigns class teacher → admin adds students singly or by Excel import → students are placed in a classroom ✗ no academic year, term or promotion to next year.

**6.2 Course delivery**
Mentor or admin creates course (title only is required) → if a classroom is chosen, its current students are copied into `course_students` once → mentor adds weeks, chapters, materials → student sees the course immediately, complete or not → student marks chapters complete in order → when all chapters are complete a certificate row is created ✗ students who join the classroom later are never enrolled; there is no publish step; materials and assessments do not count toward completion.

**6.3 Legacy course assessment**
Mentor creates assessment on a course (start, end, timer) → adds questions → publishes → student opens it from the course → submits once → score stored in `assessment_attempts` ✗ start and end times are only used for display, not enforced on submit; the score goes nowhere else.

**6.4 AI test (assessment agent)**
Teacher writes or generates questions → reviews → saves as draft → chooses a classroom → publishes to the whole class or selected students, optional open and close window → student sees it under My Tests → one timed attempt, autosave, auto-submit at deadline → teacher sees report, can reset an attempt → teacher can request an AI performance report and share it ✗ no link to a course; score does not reach term results, progress or the dashboard; the student is not notified.

**6.5 Descriptive assignment**
Teacher creates assignment for a classroom with questions and marks → publishes → student uploads one PDF (re-upload allowed until due) → teacher marks manually or asks for AI suggestions and then confirms ✗ marks stay inside the module.

**6.6 Term results**
Mentor types subject marks per student and term → stored as JSON → student and class views read it ✗ entirely manual, unrelated to any assessment above.

**6.7 Attendance**
Mentor selects classroom and date → marks each student → server deletes that day's rows for the class and inserts the new set → student sees a list with present, absent and a percentage ✗ per classroom per day only (no period or course); no minimum-attendance rule, alert, or defaulter report for staff.

**6.8 Communication**
Admin or mentor posts an announcement (audience: role or course) → users see it on the Announcements page when they open it → "read" is stored as a JSON list on the announcement ✗ no notification, no unread badge, no email.

**6.9 Fees and procurement**
Admin defines fee structure → student record carries total, paid, pending → student pays via Razorpay → payment row written; mentor raises requirement → storekeeper turns it into stock request or order → vendor quotes and bills → accountant pays invoice.

---

## 7. Workflow Gaps

Full-format findings for the gaps that block real use.

### WF-001

**Category:** WORKFLOW GAP
**Severity:** P1
**Module:** Assessments, Assignments, Results, Progress
**Role:** Mentor, Student

**Current Behavior:** Four independent grading mechanisms exist: legacy course assessments (`assessments`), AI/manual tests (`aia_assessments`), descriptive assignments (`aia_assignments`), and typed term results (`results`). Each has its own tables, pages and student view.

**Evidence:** LIVE schema dump (four table families, no foreign keys between them). LIVE browser: mentor sidebar has "AI Assessments" and "Class Results" as separate items; the legacy flow is reached only from the dashboard. CODE: no handler in any of the four writes to another's tables.

**Problem:** The root design problem is that the product has two organising units, the classroom and the course, and each assessment type picked one. Legacy assessments hang off a course; AI tests and assignments hang off a classroom; term results hang off a classroom and a free-text term. Nothing reconciles them, so a mentor who runs an online test must still retype the marks into Class Results.

**Why It Matters:** Double data entry is the exact cost an LMS is bought to remove. It also guarantees disagreement between "the test score" and "the result".

**Recommended Behavior:** Choose one assessable-item model: an item belongs to a course offering, has a type (objective test, descriptive assignment, offline/manual mark), a maximum mark and a weight. Scores from any type land in one gradebook per course offering. Term results become a view over the gradebook, with manual override recorded as such. Retire the legacy `assessments` flow in favour of the assessment agent, which already has the stronger lifecycle.

**Expected User Flow:** Mentor opens a course → adds a test or assignment → publishes → students attempt → scores appear in the course gradebook automatically → mentor adds any offline marks in the same grid → publishes results → student sees one results page.

**Business Value:** Removes retyping, makes results auditable, and is the precondition for progress tracking and reporting.

**Technical Impact:** Large. New gradebook tables, a course link on `aia_assessments` and `aia_assignments`, migration of 7 legacy assessments, removal of the legacy pages.

**Security Impact:** Positive. Retires the legacy assessment endpoints, which have no ownership checks (SEC-011).

**Dependencies:** Decision Q2 (classroom versus course), SEC-012.

**Priority:** P1

### WF-002

**Category:** WORKFLOW GAP
**Severity:** P1
**Module:** Courses, Enrollment
**Role:** Mentor, Admin, Student

**Current Behavior:** A course is created in one step with only a title required. If a classroom is selected, the students in that classroom at that moment are copied into `course_students`. There is no status field.

**Evidence:** CODE `course-controller.js` lines 50 to 235 (`autoAssignStudentsFromClassroom` runs only inside `createCourse`); LIVE schema (`courses` has no status column). LIVE data: 18 courses, 0 chapters, 1 week in the local database.

**Problem:** Three linked defects. (1) A student added to the classroom after the course was created is never enrolled, and nobody is told. (2) An empty course is visible to students immediately. (3) `mentorId` and `classroomId` are nullable, so a course can exist with no teacher and no audience.

**Why It Matters:** Late-joining students silently miss courses, tests and materials. This is the most common real-world enrollment event after the first week of term.

**Recommended Behavior:** Give a course a lifecycle: Draft → Published → Archived. Enrollment is a rule, not a snapshot: "all students of classroom X" stays live, with individual additions and removals recorded as exceptions. Publishing requires a mentor, an audience and at least one content item. Students see only published courses.

**Expected User Flow:** Create draft → add content → choose audience rule → Publish (checklist shows what is missing) → students see it → a student who joins the class next week sees it too.

**Business Value:** Removes a recurring manual fix and a source of student complaints.

**Technical Impact:** Medium. Status column, enrollment resolved by query or maintained on classroom-assignment change, publish validation.

**Security Impact:** None directly.

**Dependencies:** Q2, Q3.

**Priority:** P1

### WF-003

**Category:** FUNCTIONAL GAP
**Severity:** P1
**Module:** Academic structure
**Role:** Admin

**Current Behavior:** The only structure is university → classroom (name, grade, section) → students. Results carry a free-text `term`.

**Evidence:** LIVE schema dump: no table or column for academic year, semester, department, program or batch.

**Problem:** Nothing is scoped to time. There is no way to close a year, promote a class, keep last year's results separate, or run the same course again for a new intake. For a college there is also no department or program to group courses and faculty.

**Why It Matters:** The product cannot survive its second academic year without manual database work, and cannot model a college at all.

**Recommended Behavior:** Add the minimum time and grouping structure: academic session (year or semester) and, for colleges, program and batch. A classroom or section belongs to a session. A course offering is a course taught to a section in a session. Do not add timetable engines, credit systems or department budgets (see section 10).

**Expected User Flow:** Admin creates session → creates or rolls over sections → assigns courses to sections → at session end, archives and promotes.

**Business Value:** Makes the product sellable to a college and usable in year two.

**Technical Impact:** Large. Touches every academic table.

**Security Impact:** None.

**Dependencies:** Q1.

**Priority:** P1

### WF-008

**Category:** WORKFLOW GAP
**Severity:** P1
**Module:** Student onboarding
**Role:** Admin, Student

**Current Behavior:** The Excel import creates student accounts. Setup-password emails are paused unless `ONBOARDING_EMAIL_ENABLED=true`. While paused, the admin can set a first password for each imported student one row at a time from the import screen.

**Evidence:** CODE `server/routes/onboardingRoutes.js` (email switch, temporary admin password route). LIVE: 10 students were imported on the local system during this audit window; the setup-token table is empty.

**Problem:** After a bulk import of several hundred students, none can log in until an admin types a password for each one, and that screen disappears if the server restarts because jobs are in memory.

**Why It Matters:** Bulk import saves hours and then gives them back. It is also the first experience every student has.

**Recommended Behavior:** Decide one production path: emailed one-time setup links (already built) with a visible delivery status and a resend action, plus a fallback printable list of one-time codes for schools without student email. Remove the temporary admin-sets-password route once that exists.

**Expected User Flow:** Import → approve → students receive a link → admin sees who has activated and can resend.

**Business Value:** Completes the highest-value admin feature in the product.

**Technical Impact:** Small to medium; most of it exists.

**Security Impact:** Positive. Admins stop knowing student passwords.

**Dependencies:** Working outbound email; SEC-007 (mail credentials).

**Priority:** P1

### Other workflow gaps (compact)

| ID | Sev | Gap | Evidence |
| --- | --- | --- | --- |
| WF-004 | P1 | No notification concept. There is no table, badge, or "due soon" list. Publishing a test, posting marks or approaching a deadline produces nothing a student will notice. | LIVE schema; LIVE student dashboard |
| WF-005 | P2 | No student or staff lifecycle. Users can only be hard-deleted; there is no inactive, transferred, graduated or suspended state. Deleting leaves attendance, results and attempts pointing at nobody. | CODE `user-controller.js`, `adminController.js` |
| WF-006 | P1 | Legacy assessment deadlines are decorative. `startTime` and `endTime` are used to show "locked" in a list but `submitAssessment` never checks them, nor publication, nor enrollment. | CODE `assessmentController.js` 316 to 440 |
| WF-007 | P2 | Attendance stops at the student's own view. The student page shows present, absent and an attendance percentage (corrected after the visible walkthrough; an earlier draft said no percentage existed). There is no minimum-attendance rule, no defaulter list for the class teacher or admin, and no per-course or per-period attendance. | LIVE page; CODE |
| WF-009 | P2 | Contradictory account creation. Self-registration auto-approves every role, while an admin "Mentor Approval" queue also exists. | CODE `auth-controller.js`; LIVE page |
| WF-010 | P2 | Editing after submission. Legacy assessments and questions can be edited or republished after students have attempted, with no versioning. The AI module correctly forbids edits while published. | CODE |
| WF-011 | P2 | Certificates count chapters only and the list endpoint fails. | LIVE 500 |
| WF-012 | P2 | Course deletion has no guard, no cascade and no archive. Weeks, materials, enrollments, attempts, live classes, calendar events and announcements keep the dead `courseId`. | CODE `deleteCourse`; LIVE schema (all `NO ACTION`) |
| WF-013 | P3 | Mentor change. Reassigning a course's mentor is not possible through the update endpoint (it updates five text fields only); ownership-based checks would lock out the new mentor if edited by hand. | CODE `updateCourse` |
| WF-014 | P3 | Announcements can reference a deleted course and remain visible to nobody. | CODE |

---

## 8. Recommended Business Workflows

Each recommendation states the smallest design that fixes the gap. Items marked NOT RECOMMENDED add complexity without matching value.

**8.1 One organising spine**
Session → Section (today's classroom) → Course offering (a course taught to a section by a mentor) → Activities (content, test, assignment, live class). Students belong to a section; they see every published offering of their section, plus individually added ones. This single change resolves WF-001, WF-002 and most cross-module gaps.

**8.2 Course lifecycle**
Draft → Published → Archived. Publish is blocked until a mentor, an audience and one content item exist. Archive replaces delete once any student activity exists.

**8.3 Assessment lifecycle (adopt the assessment agent's model everywhere)**
Draft → Published (with open and close time) → Closed → Results released. Editing is blocked while published. A late joiner is included automatically if the audience is "whole section". Results release is an explicit teacher action for descriptive work and automatic for objective tests.
NOT RECOMMENDED: question banks with tagging, randomised sections, proctoring, negative marking. None solves a problem the current users have reported, and each multiplies test cases.

**8.4 Gradebook and results**
One grid per course offering: rows are students, columns are activities. Auto-filled from tests and assignments, manually fillable for offline marks. A term result is the weighted roll-up, lockable by the admin.

**8.5 Attendance**
Keep daily section attendance as the default. Add computed percentage per student per session and one defaulter list for the class teacher and admin.
NOT RECOMMENDED for now: period-wise or course-wise attendance, biometric or QR check-in. Revisit only if a customer requires period attendance.

**8.6 Communication**
Three distinct things, kept distinct:

| Concept | Meaning | Created by | Shown where |
| --- | --- | --- | --- |
| Announcement | A human message to an audience | Admin or mentor | Announcements page and dashboard |
| Notification | A system fact for one user that needs attention ("Test published", "Marks released") | System events | Bell with unread count |
| Upcoming work | A computed list of open items with due dates | Query, not stored | Student dashboard |

Email is a delivery channel for notifications, off by default per school.
NOT RECOMMENDED: an activity feed, chat, or turning every event into an announcement.

**8.7 User lifecycle**
Active → Inactive (cannot log in, history kept) → Removed (anonymised after a retention period). Deleting is replaced by deactivating everywhere in the UI.

**8.8 Onboarding**
Import → approve → activation links or printed codes → activation status visible to admin (WF-008).

---

## 9. Cross-Module Relationships

Connections that should exist. Each must be justified by the last column.

| Trigger | System action | User effect | Data effect | Business value |
| --- | --- | --- | --- | --- |
| Student added to a section | Resolve section's published offerings | Courses and open tests appear | No copy needed if enrollment is rule-based | No missed coursework for late joiners |
| Course published | Mark visible; notify section | Appears in My Courses | Status change, notifications | Students stop seeing half-built courses |
| Test or assignment published | Add to upcoming work; one notification per recipient | Student sees it on dashboard with due date | Notification rows | Removes "I did not know" |
| Test attempt finalised | Write score to gradebook | Score visible in course and results | Gradebook cell | No retyping |
| Descriptive marks confirmed by teacher | Write score to gradebook; notify student | Marks and feedback visible | Gradebook cell, notification | Same |
| Close time approaching (24 h) with no attempt | One reminder notification | Reminder | Notification | Higher completion; cheap to build |
| Attendance marked | Recompute percentage | Student and class teacher see current figure | Computed, not stored | Defaulter visibility without manual counting |
| Student deactivated | Remove from active rosters; keep history | Disappears from mark sheets going forward | Status flag | Clean rosters, intact records |
| Mentor replaced on an offering | New mentor gains access; old loses write | Seamless handover | Ownership field | Staff changes without database edits |
| Course archived | Hide from students; freeze activities | Read-only history | Status | Year-end without deletion |

Connections considered and rejected: announcement on every system event (noise); automatic email for every notification (cost and spam; make it opt-in); attendance affecting test eligibility (policy varies by institution, adds hard edge cases).

---

## 10. Missing / Incomplete Features (college fit)

| Concept | Present today | Classification | Note |
| --- | --- | --- | --- |
| Academic year / semester | No | MUST HAVE | WF-003 |
| Section / batch | Yes, as "classroom" (grade, section) | MUST HAVE | Rename and attach to session |
| Program / department | No | SHOULD HAVE for colleges | Grouping only; no budgets or HR |
| Course offering per section per session | No (course is global) | MUST HAVE | 8.1 |
| Enrollment that follows section membership | No (snapshot) | MUST HAVE | WF-002 |
| Content: weeks, chapters, materials | Yes | MUST HAVE | Needs publish state |
| Objective tests | Yes, twice | MUST HAVE | Keep one (WF-001) |
| Descriptive assignments with file upload | Yes | MUST HAVE | Link to gradebook |
| Gradebook and term results | Manual only | MUST HAVE | 8.4 |
| Attendance with percentage | List only | MUST HAVE | 8.5 |
| Announcements | Yes | MUST HAVE | Add unread state |
| Notifications and upcoming work | No | MUST HAVE | 8.6 |
| Student progress | Chapter completion only | SHOULD HAVE | Derive from gradebook and content |
| Faculty workload view | No | NICE TO HAVE | Count of offerings and pending marking |
| Reports (class performance, defaulters) | AI performance report only | SHOULD HAVE | Two fixed reports first |
| Bulk student import | Yes, strong | MUST HAVE | Finish activation |
| Bulk staff import | No | NICE TO HAVE | Reuse the importer |
| Password self-service | OTP reset exists | MUST HAVE | Fix SEC-008 |
| Audit log | No | SHOULD HAVE | Who changed marks, roles, publish state |
| Live classes | Link scheduling | NICE TO HAVE | Keep as link; do not build video |
| Certificates | Broken | NICE TO HAVE | Fix or hide |
| Timetable | Image upload | NICE TO HAVE | Keep as upload |
| Fees, accounting, inventory, vendors, procurement | Yes | NOT NECESSARY in an LMS | Section 17, BV-001 |
| Credit system, CGPA engine, exam seating, hostel, transport, HR, payroll | No | NOT NECESSARY | ERP territory |

---

## 11. UX Findings

| ID | Sev | Current | Problem | Recommendation | Why it matters | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| UX-001 | P1 | Failed requests are shown as empty lists. With a 401, the vendor page says "No vendors found"; student pages show empty states when the API errors. | Users cannot tell "nothing exists" from "it failed" and will re-enter data. | One shared error state with retry; never render an empty state on a failed request. | Prevents duplicate entry and support calls. | LIVE (`/storekeeper/vendors`, certificates) |
| UX-002 | P1 | Student sidebar has 5 items. Timetable, Pay Fees, Certificates, Calendar, Announcements and Descriptive Assignments exist only as URLs. | Features that were built cannot be found. | Add them to navigation or remove the routes. | Students will never discover assignments set for them. | LIVE (nav capture) |
| UX-003 | P2 | Mentor's core tasks (create course, add chapter, assign students, create assessment, progress) are buttons on the dashboard; the sidebar holds secondary items. The dashboard has 68 buttons. | Navigation does not match the work. | Organise by course: sidebar lists My Courses; all course actions live inside a course. | Fewer clicks, less scanning. | LIVE |
| UX-004 | P2 | Raw translation keys appear as headings: `course_management`, `fee_collection`. | Looks broken. | Fall back to English text when a key is missing. | First-impression quality. | LIVE |
| UX-005 | P2 | Four names for one role: Mentor, Teacher, Class teacher, Course teacher; "AI Assessments" also holds manually written tests. | Users cannot build a mental model. | Pick "Faculty" or "Teacher"; rename the item "Tests". | Clarity, easier training. | LIVE, CODE |
| UX-006 | P2 | Admin sidebar omits Create Course, Mentor Approval, Announcements and Analytics, which have pages. | Hidden admin functions. | Add or remove. | Same as UX-002. | LIVE |
| UX-007 | P2 | 98 uses of browser `alert` and `confirm`. | Inconsistent, unstyled, not accessible, cannot explain consequences. | One confirmation dialog component that states what will be lost. | Prevents accidental destructive actions. | LIVE (source count) |
| UX-008 | P2 | The login form lives inside the marketing home page; `/login` and `/` are the same long page. | Returning users scroll past marketing. | A plain `/login` page. | Daily friction for every user. | LIVE |
| UX-009 | P3 | Database Export page shows "Failed to fetch tables" with no next step. | Dead end. | Hide until fixed. | Trust. | LIVE |
| UX-010 | P3 | Page titles repeat ("Classrooms" twice, "AI Assessments" twice) because the layout and the page both render a heading. | Wasted space. | One heading per page. | Polish. | LIVE |
| UX-011 | P3 | A Terms & Conditions block was present on every student page during testing. | If it is a blocking modal for real users on every load, it is a serious annoyance. | Show once per version, then never. | UNVERIFIED: observed with an injected session, not a real login. | LIVE render, cause UNVERIFIED |
| UX-012 | P2 | A wrong role visiting another role's URL is silently redirected to their own dashboard. | Acceptable, but shared links fail without explanation. | Show "You do not have access to this page". | Supportability. | LIVE |

---

## 12. Security Findings

Severity reflects impact on a hosted multi-school deployment. Several findings are independently sufficient to compromise every account.

### SEC-001

**Category:** SECURITY (broken authentication, excessive data exposure)
**Severity:** P0
**Module:** Generic CRUD router (`server/routes/universalRoutes.js`)
**Role:** Anyone, including unauthenticated

**Current Behavior:** For each of 20 entities, `GET /api/<entity>/:id` has no authentication middleware and returns `SELECT *`. Further unauthenticated reads exist for results, progress, classroom rosters, attendance by date, and search and stats.

**Evidence:** LIVE, no `Authorization` header: `GET /api/users/31` → 200 with fields `id, name, email, password, role, university_id, ...`; `GET /api/vendors/1` → 200 including `password`; `GET /api/results/student/30` → 200 (3 rows); `GET /api/progress/student/30` → 200; `GET /api/assessments/1` → 200. CODE lines 82, 237, 255, 272 to 500.

**Problem:** Ids are sequential integers. The whole user table, with bcrypt hashes, and every student's results can be downloaded by counting upward.

**Why It Matters:** Personal data of minors, credential hashes and academic records exposed to the internet. This is a reportable data breach in most jurisdictions.

**Recommended Behavior:** Remove the generic router. Each entity gets explicit routes that require a verified session, check the caller's school and relationship to the record, and return a named list of fields that never includes `password`.

**Expected User Flow:** Unchanged for legitimate users. Unauthenticated requests receive 401.

**Business Value:** Precondition for selling the product at all.

**Technical Impact:** Large. The client depends on these routes in many places; each call needs a real endpoint.

**Security Impact:** Closes the single largest exposure.

**Dependencies:** SEC-003.

**Priority:** P0

### SEC-002

**Category:** SECURITY (broken authorization, mass assignment, SQL injection)
**Severity:** P0
**Module:** Generic CRUD router
**Role:** Anyone

**Current Behavior:** `PUT /api/<entity>/:id` and `DELETE /api/<entity>/:id` have no authentication. `PUT` builds `UPDATE <table> SET <key> = ?` from the request body's keys. `POST /api/bulk/:entity` inserts arbitrary rows into the table named in the URL with no authentication. `POST /api/results` and `POST /api/attendance` are also unauthenticated.

**Evidence:** CODE lines 167 to 235, 504, 574, 804 to 830. Not executed because it would modify data.

**Problem:** Anyone can set `role = 'admin'` or replace the `password` hash on any user, delete any course or student, or insert rows into any table. Because column names come from the request, the body keys are also a SQL injection point. The table name in the bulk route is taken from the URL.

**Why It Matters:** Complete loss of integrity. Marks, attendance and accounts can be rewritten by an anonymous caller, and the socket broadcast will announce the change to every client.

**Recommended Behavior:** Same as SEC-001. No endpoint may accept column or table names from the client.

**Expected User Flow:** Unchanged for legitimate users.

**Business Value:** Results and attendance become trustworthy.

**Technical Impact:** Large (shared with SEC-001).

**Security Impact:** Critical.

**Dependencies:** SEC-001.

**Priority:** P0

### SEC-003

**Category:** SECURITY (broken authentication)
**Severity:** P0
**Module:** `server/middleware/authMiddleware.js`
**Role:** Anyone

**Current Behavior:** When the token is missing, malformed, expired or wrongly signed, the middleware does not reject the request. It sets `req.user = { userId: null, role: "guest" }` and continues. Only paths containing `/superadmin/` are rejected.

**Evidence:** LIVE, no token: `GET /api/users` → 200 (6 users of school 1, with `password`); `GET /api/announcements` → 200; `GET /api/accountant/payments` → 200; `GET /api/assessments/1/questions` → 200; `GET /api/requirements/test` → 200 echoing the guest user. CODE lines 57 to 71.

**Problem:** "Protected by authMiddleware" means nothing. Any handler that does not separately check role or user id is public, and the school defaults to 1 when absent (`req.user?.universityId || 1` appears throughout), so guests are treated as members of the first school.

**Why It Matters:** It converts every missing role check into a public endpoint and makes school 1 everyone's default tenant.

**Recommended Behavior:** Reject with 401 when no valid token is present. Remove every `|| 1` default for school id; a request without a school is an error.

**Expected User Flow:** Expired sessions are sent to login instead of seeing odd partial data.

**Business Value:** Predictable access control.

**Technical Impact:** Small change, wide effect. Expect client pages that silently relied on guest access to surface errors.

**Security Impact:** Critical.

**Dependencies:** None.

**Priority:** P0

### SEC-004

**Category:** SECURITY (authentication bypass, privilege escalation)
**Severity:** P0
**Module:** `authMiddleware.js`
**Role:** Anyone

**Current Behavior:** A bearer token beginning with `superadmin-` is not a JWT. The remainder is base64-decoded as JSON and the caller becomes `role: "superadmin"` with no signature or secret involved.

**Evidence:** LIVE: a token built by hand from `{"email":"attacker@example.com"}` was accepted; `GET /api/courses` then returned all 18 courses across every school (superadmin view), and `GET /api/requirements/test` echoed `role: superadmin`. CODE lines 12 to 27.

**Problem:** Superadmin is the highest role and it can be claimed with a text editor.

**Why It Matters:** Every route that grants superadmin extra reach is open, including cross-school reads and the subscription and plan controls.

**Recommended Behavior:** Delete this branch. Superadmins use the same signed-token path as everyone else (a signed superadmin login already exists in `superadminRoutes.js`).

**Expected User Flow:** Superadmin logs in through the superadmin login only.

**Business Value:** Platform owner control is real.

**Technical Impact:** Small; client code that builds this token must switch to the real login.

**Security Impact:** Critical.

**Dependencies:** SUP-001 refresh fix.

**Priority:** P0

### SEC-005

**Category:** SECURITY (privilege escalation)
**Severity:** P0
**Module:** Registration (`auth-controller.js`)
**Role:** Anyone

**Current Behavior:** `POST /api/auth/register` takes `role` from the request body, stores it, and sets `isApproved = 1`. No school is assigned.

**Evidence:** CODE lines 6 to 45. Not executed (would create an account).

**Problem:** Anyone can register as `admin` or `superadmin`.

**Why It Matters:** A self-made admin passes every `adminOnly` guard and `roleMiddleware` check.

**Recommended Behavior:** Decide whether public registration should exist at all (Q4). If it stays, it creates students only, unapproved, attached to a school by an invitation code. Staff accounts are created by an admin.

**Expected User Flow:** Students join by invitation or import; staff are added by the admin.

**Business Value:** Schools control who is in their system.

**Technical Impact:** Small.

**Security Impact:** Critical.

**Dependencies:** Q4.

**Priority:** P0

### SEC-006

**Category:** SECURITY (hard-coded backdoor accounts)
**Severity:** P0
**Module:** Login (`auth-controller.js`)
**Role:** Anyone

**Current Behavior:** Six fixed email addresses, including a superadmin and an admin address, log in with any or no password. If one of seven demo addresses does not exist, the login call creates it with a fixed password and returns a token.

**Evidence:** CODE lines 68 to 108 and 181 to 210. Not executed (login would create accounts).

**Problem:** Permanent, publicly guessable administrator access in production code.

**Why It Matters:** Combined with school defaulting to 1, these accounts administer the first customer.

**Recommended Behavior:** Remove both blocks. Demo data belongs in a seed script that runs only in a demo environment.

**Expected User Flow:** Demo users exist only on demo deployments, with real passwords.

**Business Value:** Removes an embarrassing audit failure.

**Technical Impact:** Small.

**Security Impact:** Critical.

**Dependencies:** None.

**Priority:** P0

### SEC-007

**Category:** SECURITY (secrets management, token forgery)
**Severity:** P0
**Module:** Configuration, repository
**Role:** Anyone with source or repo access

**Current Behavior:** (a) `JWT_SECRET` in `server/.env` is the template placeholder text, and code falls back to another fixed string when unset. (b) Razorpay key id and key secret are hard-coded in three source files as fallbacks. (c) `server/.env` and four sibling files hold a live mailbox password and an AI provider token in plain text. (d) 18 scripts in `server/` exist to print, check or reset passwords and credentials. (e) The `superadmins` table has a `db_password` column.

**Evidence:** LIVE: the loaded secret equals the placeholder (24 characters). CODE: `config/razorpay-config.js`, `payment-controller.js`, `subscription-controller.js`; file listing of `server/`. Secret values are deliberately not reproduced here.

**Problem:** Anyone who has seen the repository or the template can sign a valid token for any user of any school, and can sign Razorpay payment confirmations.

**Why It Matters:** This alone defeats authentication even after SEC-003 to SEC-006 are fixed.

**Recommended Behavior:** Rotate every secret named above now. Generate a long random JWT secret per environment and refuse to start without it. Remove all fallbacks. Delete the credential scripts and the extra env files. Check whether any of these files were ever pushed to a remote and treat them as leaked if so.

**Expected User Flow:** All users are signed out once when the secret changes.

**Business Value:** Restores the meaning of a login.

**Technical Impact:** Small in code; operational coordination for rotation.

**Security Impact:** Critical.

**Dependencies:** None.

**Priority:** P0

### SEC-008

**Category:** SECURITY (account takeover)
**Severity:** P0
**Module:** Password reset, rate limiting
**Role:** Anyone

**Current Behavior:** Reset uses a 6-digit code stored in plain text. The attempt counter is incremented only on the row that matches both email and code, so wrong guesses are never counted. Rate limiters are configured, per their own comments, at 600,000 requests per minute.

**Evidence:** CODE `services/otpService.js` lines 56 to 75; `middleware/rateLimiter.js` header comments. The effective limit at runtime is UNVERIFIED.

**Problem:** A 6-digit code with no working attempt limit can be brute-forced within its validity window.

**Why It Matters:** Any account whose email is known can be taken over.

**Recommended Behavior:** Count attempts per email, lock after five, store a hash of the code, and set real limits on login, reset and registration.

**Expected User Flow:** Unchanged for honest users.

**Business Value:** Basic account safety.

**Technical Impact:** Small.

**Security Impact:** High to critical.

**Dependencies:** None.

**Priority:** P0

### SEC-009

**Category:** SECURITY (SQL injection)
**Severity:** P0
**Module:** Translation routes, export, generic router
**Role:** Anyone (first case), authenticated (second)

**Current Behavior:** `GET /api/translation/content/:contentId/:contentType/:contentField/:lang` is unauthenticated and places `contentField` directly into `SELECT ${contentField} FROM courses WHERE id = ?`. `GET /api/:entity/export` places the URL segment into `SELECT * FROM ${entity}`. Generic `PUT` and `POST` place body keys into SQL.

**Evidence:** CODE `routes/translationRoutes.js` lines 68 to 112; `universalRoutes.js` line 844. LIVE: the endpoint is reachable without a token (returned 500 for a benign request). Injection itself was not attempted.

**Problem:** An attacker chooses the selected expression or the table.

**Why It Matters:** Arbitrary read of the database from an unauthenticated URL.

**Recommended Behavior:** Whitelist field and table names against a fixed map. Require authentication.

**Expected User Flow:** Unchanged.

**Business Value:** Removes a classic, scanner-detectable flaw.

**Technical Impact:** Small.

**Security Impact:** Critical.

**Dependencies:** None.

**Priority:** P0

### SEC-010

**Category:** SECURITY (tenant isolation)
**Severity:** P0
**Module:** Whole core server
**Role:** Any authenticated user

**Current Behavior:** School scoping is applied in a minority of handlers. Of 25 controllers, 16 never reference the school at all (assessments, attendance, materials, progress, results, live classes, calendar, certificates, chapters, weeks, requirements, expenses, orders, payments, password reset, student). 30 of 38 core tables have no school column. Where the school is used, it comes from the token with a default of 1.

**Evidence:** LIVE with a school-20 student token: `GET /api/classrooms/mentor/27` returned a classroom belonging to a school-15 mentor; `GET /api/courses/1/students` returned the roster of another school's course; `GET /api/storekeeper/inventory` returned 16 items. LIVE schema dump. CODE reference counts per controller.

**Problem:** Records are separated only by unguessable-looking but sequential ids.

**Why It Matters:** One customer's staff or students can read, and in several cases change, another customer's data. For a multi-tenant SaaS this is the defining requirement.

**Recommended Behavior:** Every tenant-owned table carries the school id. Every query filters by the school taken from the verified session and re-checked against the user record, as the AI modules already do. Add an automated cross-tenant test suite that fails the build on any leak.

**Expected User Flow:** Unchanged.

**Business Value:** Makes multi-school hosting defensible.

**Technical Impact:** Large; schema change and a pass over every query.

**Security Impact:** Critical.

**Dependencies:** SEC-003, Q5 (single database versus database per tenant).

**Priority:** P0

### SEC-011

**Category:** SECURITY (missing ownership checks, answer exposure)
**Severity:** P1
**Module:** Legacy assessments
**Role:** Student, any authenticated or guest caller

**Current Behavior:** `GET /api/assessments/:id/questions` returns `SELECT *` from the questions table, which includes the `correctAnswer` column, to any caller. `PUT /:id/publish` and `POST /questions` check neither role nor course ownership. `POST /submit` checks neither the time window, publication, nor enrollment.

**Evidence:** LIVE: a guest and a student both received 200 from the questions endpoint (the sample assessment had no questions, so the answer field itself was not observed). CODE `assessmentController.js` lines 157 to 300 and 316 to 440.

**Problem:** A student can read the answers before attempting, attempt assessments of courses they are not in, and submit after the deadline. Anyone can add questions to or publish someone else's assessment.

**Why It Matters:** Scores from this flow are meaningless.

**Recommended Behavior:** Retire this flow in favour of the assessment agent (WF-001). If kept in the interim, strip answers from student responses and enforce role, ownership, enrollment and window.

**Expected User Flow:** As 8.3.

**Business Value:** Trustworthy scores.

**Technical Impact:** Medium, or removal.

**Security Impact:** High.

**Dependencies:** WF-001.

**Priority:** P1

### Other security findings (compact)

| ID | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| SEC-012 | P1 | Missing ownership checks across the core: any mentor or admin can update or delete any course; any mentor can mark attendance for any classroom; week update and delete, live class start, end and delete, material delete and calendar edits rely only on the auth middleware or a role check; admin "update user" can change role and email of a user in another school. | CODE (`updateCourse`, `deleteCourse`, `markAttendance`, `weekRoutes`, `updateUser`) |
| SEC-013 | P1 | Subscription and plan endpoints are entirely unauthenticated, including create order, verify payment, activate free trial, cancel, and a "test upgrade" route. Payment and transaction routes (`/api/payments/*`, `/api/transactions/*`) are also unauthenticated. | LIVE (`/api/transactions` → 200 with payment ids, signatures, student email; `/api/subscriptions/current` → 200); CODE |
| SEC-014 | P1 | File handling: uploads are stored under `server/uploads` and served by `express.static` with no authentication; filenames include the original client filename; chapter uploads have no type filter and a 50 MB limit; material uploads allow 500 MB. The AI assignment module, by contrast, stores files outside the web root behind an authorised route. | CODE (`server.js` line 210, `middleware/upload*.js`) |
| SEC-015 | P1 | Data export as a feature: admin and accountant "Database Export" pages can dump whole tables to Excel. The accountant export API has no authentication at all (`/api/accountant-export/stats` → 200 LIVE). Table names come from the URL. | LIVE, CODE |
| SEC-016 | P1 | Debug and test endpoints in the production router: `/api/superadmin/internal/debug` echoes request headers to anyone (LIVE 200); `/internal/test`, `/internal/superadmins-test`, `/api/test-endpoint`, `/api/requirements/test`, `/api/subscriptions/debug-feature-access`, `/api/classrooms/debug/create-test-assignment`, `/api/requirements/debug/database`. | LIVE, CODE |
| SEC-017 | P1 | Realtime channel: socket.io accepts any connection with no token, and the generic router emits `<entity>-created` and `<entity>-updated` events containing the full row to all clients. A created or updated user row, including its password hash, would be broadcast to every connected browser of every school. | CODE (`server.js` 154 to 174, `universalRoutes.js` emit calls). Broadcast content UNVERIFIED live. |
| SEC-018 | P1 | Password hashes are returned in list responses to ordinary users (`GET /api/users` as a student returned 16 users with `password`). | LIVE |
| SEC-019 | P2 | CORS: a manual middleware sets `Access-Control-Allow-Origin: *` together with `Allow-Credentials: true` on every response, overriding the configured allow-list. | CODE (`server.js` 75 to 91) |
| SEC-020 | P2 | Session handling: 7-day tokens in `localStorage`, no revocation, no logout on the server, no refresh. Any script injection reads the token. Role and school are trusted from the token for a week after an admin changes them. | CODE |
| SEC-021 | P2 | Logging: the auth middleware logs the first 20 characters of rejected tokens and the secret's length on every request; a global middleware logs every request. Several handlers return raw database error messages. | CODE |
| SEC-022 | P2 | Vendor passwords may be unsalted SHA-256; vendors log in through the main login with a separate table. | CODE (`auth-controller.js`) |
| SEC-023 | P2 | Client-side route guards are the only guard for `/superadmin/dashboard`, `/superadmin/subscription`, `/internal-admin-portal` and `/storekeeper/vendors`, which are declared public. The storekeeper page rendered for a guest. | LIVE |
| SEC-024 | P2 | Request body limit of 50 MB on all JSON routes and five-minute timeouts make memory-exhaustion requests cheap. | CODE |
| SEC-025 | P3 | Content Security Policy is report-only in development and its production branch is selected by `NODE_ENV`, which is not set in `.env`; effective policy in deployment is UNVERIFIED. | CODE |

**Safer by design (keep):** `/api/onboarding` and `/api/assessment-agent` re-verify role and school from the database, refuse unknown fields, scope every row by school, and return safe errors. A token carrying the wrong school was refused with 403 (LIVE).

---

## 13. Data Integrity Findings

| ID | Sev | Finding | Consequence | Evidence |
| --- | --- | --- | --- | --- |
| DATA-001 | P1 | Every foreign key in the core schema is `ON DELETE NO ACTION`, and the core's database driver does not enable foreign-key enforcement (no `PRAGMA foreign_keys` in `config/sqlite-db.js`). Deletes succeed and leave children behind. | Deleting a course orphans weeks, materials, enrollments, assessments, attempts, live classes, calendar events and announcements. Deleting a user orphans attendance, results, attempts and progress. | LIVE schema dump; CODE. Runtime pragma state UNVERIFIED. |
| DATA-002 | P1 | Enforcement differs by connection. The AI modules open their own connections with enforcement on and `CASCADE` on their tables. | The same database behaves differently depending on which code path touches it; a delete that the core allows can be blocked or cascaded elsewhere. | LIVE (audit connection reported enforcement on); CODE |
| DATA-003 | P1 | Duplicate sources of truth: class membership exists as `users.classroom_id` (unused), `student_classroom_assignment`, and a stored `classrooms.studentCount`; class teacher exists as `classrooms.classTeacher` (text), `classTeacherId`, and `classroomAssignments`; a student is a `users` row plus an optional `students` row. | Counts and names drift from reality; 13 `students` rows versus student users will not reconcile. | LIVE schema |
| DATA-004 | P1 | Multi-step writes are not transactional: create student (two inserts), mark attendance (delete day, then insert each row without awaiting), assign students to a course (delete all, then insert), create course with auto-enrollment. | A failure midway reports an error but leaves partial data, or, for attendance, reports success before inserts finish and after the previous marks were deleted. | CODE |
| DATA-005 | P1 | Attendance has no uniqueness rule on classroom, student and date, and two writers that format the date differently (one normalises to `YYYY-MM-DD`, one stores what it is given). | Duplicate or unmatched rows for the same day; the "delete this day" step may miss rows written by the other path. | LIVE schema (0 unique indexes); CODE |
| DATA-006 | P1 | Mixed identity keys for students: `payments.studentId` references `students.id`, while attendance, results and enrollments reference `users.id`. `course_students.studentId` is declared as text in one place and integer in another. | Joins silently return nothing or the wrong student. The accountant dashboard already queries a column that does not exist. | LIVE schema; CODE |
| DATA-007 | P2 | Results store subjects and marks as a JSON string with a free-text `term`. | No validation, no aggregation, no uniqueness per student and term at database level. | LIVE schema |
| DATA-008 | P2 | "Read by" for announcements is a JSON array rewritten on each read. | Lost updates when two users open the same announcement together; grows without bound. | CODE |
| DATA-009 | P2 | `users.email` is unique across all schools, and roles are free text. | The same person cannot exist in two schools; typos create unknown roles that pass or fail guards unpredictably. | LIVE schema |
| DATA-010 | P2 | Hard deletes everywhere, no audit trail, no backups defined (a `data/backups` folder exists; policy UNVERIFIED). | Mark or attendance changes cannot be traced or reversed. | CODE |
| DATA-011 | P2 | Import jobs, approvals and execution locks are in memory. | A restart during a large import loses the review; idempotency keys in the database prevent double creation, which is good, but the admin loses their place. | CODE |
| DATA-012 | P3 | A scheduler comment and code path clears and re-seeds default fee structures at startup in one database initialiser. Whether this runs against the live file is UNVERIFIED. | Possible loss of configured fees on restart. | Log text in `output.log`; UNVERIFIED |

---

## 14. API / Backend Findings

About 300 routes are mounted. The table groups them by how they are guarded, which is what determines the testing approach.

| Group | Mounts | Auth | Authorisation | Validation | Errors | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Generic CRUD | `/api/<20 entities>`, `/api/bulk/:entity`, `/api/:entity/export` | List and create: weak middleware. Read by id, update, delete, search, stats, bulk: none. | None | None; client supplies column names | Generic 500 | Remove (SEC-001, SEC-002) |
| Core academic | `/api/courses`, `/weeks`, `/chapters`, `/materials`, `/assessments`, `/attendance`, `/progress`, `/certificates`, `/live-classes`, `/calendar`, `/announcements`, `/classrooms`, `/student` | Weak middleware (guest passes) | Role check on about half; ownership on few; school on few | Presence checks only | Mixed; some leak messages | Rework guard by guard |
| Admin | `/api/admin`, `/api/users` | Weak middleware + `adminOnly` or role | School checked in most admin handlers | Presence checks | Reasonable | Closest to acceptable in the core |
| Finance and procurement | `/api/payments`, `/transactions`, `/accountant`, `/accountant-export`, `/expenses`, `/orders`, `/requirements`, `/storekeeper`, `/stock-requests`, `/vendor` | None on payments, transactions, export; weak elsewhere | Partial | Minimal | One handler crashes the process | Isolate or remove |
| Platform | `/api/superadmin`, `/subscriptions`, `/plan-inheritance`, `/plan-monitor` | None on subscriptions; custom on superadmin | Role string checks | Good on superadmin login | Good on superadmin login | Fix auth, delete unreachable routes |
| Translation | `/api/translation`, `/database-translations`, `/translate`, `/bilingual`, `/language` | Mostly none | None | None; one SQL injection | One route throws `db is not defined` (LIVE) | Fix or remove |
| AI modules | `/api/onboarding`, `/api/assessment-agent`, `/api/student-setup` | Weak middleware, then re-verified against the database | Role, school and ownership on every call | Strict, unknown fields rejected | Safe, coded | Keep as the reference pattern |

Specific backend defects:

| ID | Type | Sev | Finding | Evidence |
| --- | --- | --- | --- | --- |
| REL-001 | BUG | P0 | `GET /api/accountant/fees-stats` terminates the server process. A helper function refers to `req`, which is not in its scope; the error is thrown inside a database callback where the surrounding `try/catch` cannot catch it. Any caller with a user id in their token can trigger it. | LIVE, reproduced twice (ECONNRESET, port closed) |
| API-001 | BUG | P1 | Endpoints the client calls that do not exist: `/api/results/my-results` (student dashboard, 404), `/api/storekeeper/invoices` (404), `/api/storekeeper/stock-requests/status`, `/api/api/subscriptions/current` (404). | LIVE |
| API-002 | BUG | P1 | Endpoints that fail on every call: `/api/certificates` (500), `/api/database-export/tables` and `/stats` (500), `/api/database-translations/` (500 "db is not defined"), `/api/users/role/:role` (500), `/api/payments/all-transactions` (500). | LIVE |
| API-003 | BUG | P1 | Unreachable code: in `superadminRoutes.js`, `POST /create-user` and `GET /users` are registered after a `router.use("*")` catch-all. The superadmin refresh endpoint depends on a cookie parser that is not installed. | CODE |
| API-004 | TECHNICAL DEBT | P2 | Route shadowing: `/api/users/...` is served by `user-routes` or by the generic router depending on the path, and specific generic routes such as `/users/mentors` are declared after `/:id` patterns, so some never match. | CODE, LIVE (403 versus 200 for similar paths) |
| API-005 | TECHNICAL DEBT | P2 | No consistent response shape: some endpoints return arrays, some `{ success, data }`, some `{ message }`; errors vary the same way. | LIVE |
| API-006 | BUG | P2 | Duplicate-operation safety is absent outside the AI modules: double-click on create course, create assessment, add question, pay invoice or submit creates duplicates or double actions. | CODE; UNVERIFIED live |

---

## 15. Scalability / Performance Concerns

| ID | Sev | Concern | Evidence |
| --- | --- | --- | --- |
| PERF-001 | P1 | Single SQLite file for all schools with no indexes on any core table (only two indexes exist, both on `superadmins`). Lookups by `studentId`, `courseId`, `classroomId` and `university_id` are full scans. | LIVE |
| PERF-002 | P1 | No pagination on list endpoints. User, course, attendance, results and transaction lists return everything. | LIVE (source search: one paginated route) |
| PERF-003 | P2 | Query fan-out: mentor progress runs one query per course, then per student, then per student-course. | CODE |
| PERF-004 | P2 | Per-request console logging of every request and token check; a plan monitor runs every 30 seconds. | CODE |
| PERF-005 | P2 | Single process, in-memory state (ARCH-007), no health-based restart (ARCH-005). Cannot run two instances. | CODE |
| PERF-006 | P2 | Client bundle carries a 5,050-line translation context and all role portals in one app; code splitting UNVERIFIED. | CODE |
| PERF-007 | P3 | Puppeteer is a server dependency for invoice generation; it launches a browser per document. | CODE |
| PERF-008 | P2 | AI calls are synchronous to the request with a 60-second timeout and a per-teacher throttle. Acceptable now; needs a queue before wide use. | CODE, LIVE (4 s and 10 s observed) |

---

## 16. Accessibility Concerns

Automated accessibility testing was not run in this phase; these are observations from the DOM.

| ID | Sev | Concern | Evidence |
| --- | --- | --- | --- |
| A11Y-001 | P2 | Form inputs without an associated label or `aria-label`: Add Student 10 of 12, Add Teacher 9 of 11, Fee Structure 8 of 9, Add Result 8 of 9, Create Course (admin) 7 of 8, Create Assessment 4 of 5, login 2 of 3. | LIVE |
| A11Y-002 | P2 | Only 20 of 224 client files use any ARIA attribute or role. Custom dropdowns, modals and tabs are likely unannounced. | LIVE (source count); behaviour UNVERIFIED |
| A11Y-003 | P2 | Native `alert` and `confirm` used 98 times; modals built by hand elsewhere. Focus trapping and return UNVERIFIED. | LIVE (count) |
| A11Y-004 | P3 | 34 `<img>` elements in source without `alt`. Rendered pages checked had none missing. | LIVE |
| A11Y-005 | P3 | Keyboard-only operation, visible focus, colour contrast on the cream background, and screen-reader flow are all UNVERIFIED and need the dedicated phase. | UNVERIFIED |
| A11Y-006 | P3 | Arabic and Urdu are offered; right-to-left layout correctness is UNVERIFIED. | UNVERIFIED |

---

## 17. Business Value Opportunities

| ID | Sev | Finding | Recommendation |
| --- | --- | --- | --- |
| BV-001 | P1 (BUSINESS VALUE) | Roughly a third of the server (accountant, storekeeper, vendor, stock, orders, expenses, invoices, requirements) is an ERP. It has the weakest guards, a server-crashing bug, broken pages and no evident tie to learning. | Decide (Q1) whether finance and procurement are part of this product. If not, remove them from the LMS build. If yes, treat them as a separate module with its own release gate. Either way, do not let them block the LMS. |
| BV-002 | P1 | The strongest differentiators are already built: AI-assisted Excel import with review and custom fields, AI question generation with mandatory teacher review, AI-assisted marking of descriptive answers, AI performance reports. They are hidden behind weak navigation and are not connected to results. | Make them the centre: connect them to the gradebook (WF-001) and put them in primary navigation. |
| BV-003 | P2 | Time savings a college would pay for and that are cheap once the spine exists: automatic enrollment of late joiners, automatic marks transfer, a defaulter list, an "unmarked submissions" list for faculty, activation status after import. | Build these five before any new feature. |
| BV-004 | P2 | Subscription logic is spread across students, superadmins, a scheduler, a monitor, a 1,377-line quota middleware and browser storage, and partly does not work (wrong URL, unauthenticated endpoints). A student-level subscription page exists with no clear purpose. | Reduce to one plan per school, enforced on the server at a few clear limits (students, storage, AI calls). |
| BV-005 | P2 | Three-language translation is costly to maintain (5,050-line context, auto-translation on write, unauthenticated endpoints) and visibly incomplete. | Confirm the market need (Q6). If needed, use static locale files for the UI and drop content auto-translation on write. |
| BV-006 | P3 | Live classes, certificates and timetable are thin features that add surface without finishing a workflow. | Keep live class as "meeting link on the calendar"; fix or hide certificates; keep timetable as an upload. |
| BV-007 | P4 | An audit log of who changed marks, attendance, roles and publish states would answer most disputes a college raises. | Add after P0 and P1. |

---

## 18. Critical Product Risks

| Risk | Likelihood | Impact | Basis |
| --- | --- | --- | --- |
| Breach of student personal data and credentials through unauthenticated endpoints | Very high if internet-facing | Legal, reputational, contract-ending | SEC-001, SEC-003, SEC-018 |
| Silent tampering with marks, attendance or accounts | High | Loss of trust in every record | SEC-002, SEC-011 |
| Full platform takeover by a forged or self-registered administrator | High | Total | SEC-004, SEC-005, SEC-006, SEC-007 |
| One school reading another's data | High | Contract-ending for a multi-tenant product | SEC-010 |
| Outage caused by a single request | Certain when the accountant portal is used | Service down until manually restarted | REL-001, ARCH-005 |
| Production already affected | Unknown | Same as above | The hosted site is the client's default backend. It was not tested in this audit. If it runs this code, treat SEC-001 to SEC-010 as present there until shown otherwise. |
| Data loss or drift over time | High | Wrong results, unreconcilable fees | DATA-001 to DATA-006 |
| Product cannot run a second academic year | Certain | Churn at renewal | WF-003 |
| Regression with every change | High | Slow, risky releases | No automated tests in core |
| Unclear product identity | Medium | Lost sales | Section 2 |

**Disclosure.** During this audit the local backend stopped twice when the accountant fees endpoint was requested. It was restarted each time by updating the timestamp of `server/server.js` (no content change). Any import review that was open in a browser at that moment was lost, because import jobs are held in memory.

---

## 19. Recommendations

1. **Stop the bleeding first (P0).** Reject unauthenticated requests, remove the forged-token branch, the demo logins and role-on-register, rotate all secrets, remove the generic CRUD router's unauthenticated routes, and fix the crashing endpoint. These are small code changes with large effect, and nothing else is worth testing until they are done.
2. **Adopt the AI modules' pattern as the house standard.** Actor resolved from the database, school on every row and query, explicit field lists, safe coded errors, migrations, tests. Rework the core module by module to that standard rather than patching handlers one at a time.
3. **Decide the product's shape before building more.** School or college, LMS or LMS plus ERP, one tenant database or many (section 21).
4. **Build the spine, then connect.** Session → section → course offering → activities → gradebook. Most workflow gaps disappear once this exists.
5. **Remove before adding.** Delete unused code paths, duplicate routes, backup files, credential scripts, unused database layers and debug endpoints. Each removal shrinks the test surface for every later phase.
6. **Introduce a release gate.** No module ships without cross-tenant tests, role tests and a restart-survival check.

---

## 20. Prioritized Backlog

Not to be implemented until reviewed and approved.

**P0 — Critical (product is unsafe)**

- SEC-003 Reject requests without a valid token; remove the default school of 1.
- SEC-004 Remove the unsigned `superadmin-` token path.
- SEC-006 Remove passwordless and auto-created demo accounts.
- SEC-005 Stop accepting a role at registration.
- SEC-007 Rotate JWT, Razorpay, mailbox and AI provider secrets; remove fallbacks, extra env files and credential scripts.
- SEC-001, SEC-002 Remove unauthenticated generic read, update, delete, bulk, results and attendance routes.
- SEC-009 Remove SQL built from request values.
- SEC-008 Fix reset-code attempt counting; set real rate limits.
- SEC-010 Enforce school scope on every query; add cross-tenant tests.
- REL-001 Fix the crashing endpoint; add a process-level error handler and supervisor.
- Confirm whether the hosted production site runs this code and apply the same fixes there.

**P1 — High**

- SEC-011 to SEC-018 Ownership checks, payment and subscription auth, upload storage, export removal, debug endpoints, socket auth, strip password fields.
- ARCH-001, ARCH-002, ARCH-003 One database strategy, loaded correctly; one route per capability.
- DATA-001 to DATA-006 Enforce foreign keys, define delete behaviour, single sources of truth, transactions, attendance uniqueness, one student key.
- WF-001 One assessment and gradebook model. WF-002 Course lifecycle and rule-based enrollment. WF-003 Academic session. WF-004 Notifications and upcoming work. WF-006 Deadline enforcement. WF-008 Student activation after import.
- API-001, API-002, API-003 Missing, failing and unreachable endpoints.
- UX-001, UX-002 Error states; navigation for hidden features.
- PERF-001, PERF-002 Indexes and pagination.
- BV-001 Decide on ERP scope.

**P2 — Medium**

- ARCH-004 to ARCH-007, SEC-019 to SEC-024, DATA-007 to DATA-011, WF-005, WF-007, WF-009 to WF-012, API-004 to API-006, UX-003 to UX-008, UX-012, PERF-003 to PERF-006, PERF-008, A11Y-001 to A11Y-003, BV-003 to BV-005.

**P3 — Low**

- SEC-025, DATA-012, WF-013, WF-014, UX-009 to UX-011, PERF-007, A11Y-004 to A11Y-006, BV-006.

**P4 — Enhancement**

- BV-007 Audit log. Faculty workload view. Bulk staff import.

---

## 21. Questions Requiring Product Decision

| # | Question | Why it blocks | Recommendation |
| --- | --- | --- | --- |
| Q1 | Is the product a school LMS, a college LMS, or a school management suite with finance and procurement? | Determines data model (WF-003), scope (BV-001) and positioning. | College and school LMS with administration; move finance and procurement out. |
| Q2 | Is the unit of teaching the classroom or the course? | Root of WF-001 and WF-002. | Course offering per section (8.1). |
| Q3 | Should students ever see unpublished or empty courses? | Course lifecycle. | No. |
| Q4 | Should public self-registration exist? | SEC-005, WF-009. | No. Accounts are created by import, invitation or admin. |
| Q5 | One shared database with a school column, or one database per school? | SEC-010, ARCH-002. Both are half-built. | Shared database with enforced school scope; simpler to operate and test at this size. |
| Q6 | Are Arabic and Urdu required for launch customers? | BV-005 cost. | Only if a signed customer needs them. |
| Q7 | Which assessment flow survives? | WF-001. | The assessment agent; migrate and retire the legacy flow. |
| Q8 | How do imported students get their first password? | WF-008. | Emailed link, with printed one-time codes as fallback. |
| Q9 | What is the data-retention and deletion policy for students who leave? | WF-005, DATA-010. | Deactivate, retain for a defined period, then anonymise. |
| Q10 | Is the system single-instance for now? | ARCH-007, PERF-005. | Yes, but move jobs and limits to the database so restarts are safe. |
| Q11 | What plan limits are actually sold? | BV-004. | Students, storage, AI calls per month. |
| Q12 | Is student-facing AI output (performance reports) reviewed by a teacher before release? | Trust and liability. | Yes, always; the current design already requires an explicit share. |

---

## 22. Phase 0 Exit Criteria

Phase 0 is complete when all of the following are true.

1. This document has been reviewed and each P0 and P1 finding is marked accepted, rejected or deferred, with an owner.
2. Questions Q1, Q2, Q4, Q5 and Q7 have recorded answers.
3. Every finding labelled CODE or UNVERIFIED that is P0 or P1 has either been reproduced in an isolated copy of the system or explicitly accepted on code evidence.
4. All P0 items in section 20 are fixed and re-tested, including on the hosted environment.
5. An isolated test environment exists with seeded data for at least two schools and every role, so later phases never run against real data.
6. A feature list for testing is agreed: which modules are in scope, which are removed or parked (ERP, legacy assessments, translation).

### Recommended testing strategy for the next phases

| Phase | Focus derived from this audit | Entry condition |
| --- | --- | --- |
| Security re-test | Re-run every probe in section 12 as an automated suite: no token, bad token, wrong role, wrong school, wrong owner, for every route. This suite becomes permanent. | P0 fixes merged |
| API testing | Contract tests per endpoint: auth, role, school, ownership, validation, error shape, idempotency on double submit. Start from the table in section 14. | Generic router removed |
| Unit testing | Scoring, deadline and window logic, enrollment resolution, percentage calculations, date parsing, permission helpers. | Spine design agreed |
| Integration testing | The cross-module chains in section 9, each asserted end to end in the database. | Gradebook exists |
| Data integrity testing | Delete and deactivate every entity type with children present; concurrent attendance and marks entry; interrupted multi-step writes. | Foreign keys enforced |
| End-to-end testing | One scripted journey per role through sections 6.1 to 6.8, in a real browser, with real logins. Include refresh, back button, two tabs, expired session. | Navigation fixed |
| Edge-case testing | Late joiner, student removed after submitting, mentor replaced, course archived with open tests, late and double submission, deadline passing mid-attempt, edit after publish, empty test published, duplicate creation, restart during import. | Lifecycles implemented |
| Performance testing | 5,000 students in one school and 20 schools: list endpoints, attendance marking for a class, results page, AI generation under throttle. | Indexes and pagination |
| Accessibility testing | Automated scan on every page plus keyboard and screen-reader walkthrough of login, take a test, mark attendance, import students; right-to-left check if translation stays. | UI stable |
| Regression testing | The security, API and end-to-end suites on every change. | Suites exist |
| User acceptance testing | One admin, two faculty, five students from a real institution running a mock week. | All above green |

---

*End of Phase 0 audit. No recommendation in this document has been implemented.*
