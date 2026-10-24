# Knowledge base replacement report

**Date:** 21 October 2026
**Scope:** knowledge-base content only. No chatbot, application, prompt or retrieval code was changed.

## 1. Audit of the previous knowledge base

**Location:** `docs/ai-knowledge-base/`, 18 Markdown files. Archived unchanged in `docs/archive/ai-knowledge-base-developer-2026-10-16/`.

**What it was:** a **developer and architecture reference**, written on 16 October 2026 for developers and agent designers. It was never user help. Its content:

| Previous file | Content | Why it gives bad answers to users |
|---|---|---|
| 05_API_REFERENCE.md (601 lines) | 297 API routes, request and response shapes | "How do I add a student?" retrieves `POST /api/admin/create-student` instead of the screen steps |
| 06_DATA_MODEL.md | Tables, columns, foreign keys | "How many students?" retrieves tables like `users` and `course_students`; an LLM then explains a query |
| 02, 03 | Middleware order, access-policy matrix, id guards | Technical permission detail with no "where do I click" |
| 04a–04d | Workflows traced *from API to database*, with handler names | Steps are backend steps, not UI steps |
| 08, 09, 10, 11, 12, 13 | Troubleshooting for operators, environment variables, AI tool designs, RAG strategy, code gaps, chatbot rules | Developer guidance that a user-facing chatbot repeats to end users |

**Measured on the evaluation set** (`validate-kb.js --baseline`):

- the old knowledge base contained the facts needed for only **13 of 88** user questions;
- its user-facing text had **49** backend-detail matches (SQL, API paths, table names, source files);
- it contained **no** UI navigation paths, button labels or form fields.

**Root cause (for the knowledge base):**

1. **Wrong audience.** It explains the code, not the screens.
2. **No task procedures.** It has no numbered UI steps, expected results or recovery steps.
3. **Live-data questions retrieve schema and API text** instead of "which screen shows this number".
4. **Large documents mixing many features** (the 601-line API file), which retrieve poorly.
5. **No natural-language or Hinglish phrasings.**

Whether the chatbot's own prompt or retrieval also contribute could not be checked: the chatbot is not in this repository, and changing it was out of scope.

## 2. How the new knowledge base was built

- **UI evidence.** Labels were taken from the React source with a read-only extractor: JSX text, `placeholder` and `aria-label` attributes, button text, toast messages, and `t('key')` translations resolved to English. It covered every portal layout (sidebars) and the pages behind each menu item.
- **Rules.** Business rules (who may do what, validation) were confirmed in the server code only where they change what the user sees.
- **Facts verified in the code before writing.** Examples:
  - The **Forgot password? link is not wired**: it reloads the login page, and the reset screen `pages/Login.jsx` is not routed.
  - The **"Create it" link in Add Student fails**, because it sends no class teacher.
  - The **accountant Fee Monitoring page loads no data**: its API is teacher-only.
  - **Classes cannot be deleted** in the UI: the handler exists but no button uses it.
  - The **teacher dashboard "Total Students" double-counts** students in two courses.
- **Format.** Markdown, one task or feature per file, with YAML front matter (id, title, intent, portal, roles, navigation, prerequisites, related, sources, verified, last_verified). This is the same format as before (Markdown files in the same folder), so no loader change is needed. Front matter is plain text and stays readable even for a loader that does not parse it.
- **Structure.** Every document is self-contained and ends with **"Questions this answers"**, including Hinglish phrasings, so equivalent questions map to one workflow without duplicated text.

## 3. Coverage inventory (31 documents)

| Area | Document id | Status |
|---|---|---|
| Portals and roles | general-portals-and-roles | Verified |
| Sign-in, sign-out, first password, password reset limitation | general-login-and-password | Verified |
| Notifications, announcements, calendar | general-notifications-calendar | Verified |
| Where to see numbers ("how many students") | reports-and-counts | Verified |
| Troubleshooting | troubleshooting-common-problems | Verified |
| Unsupported and unknown | unsupported-and-unknown | Verified |
| Admin: add student, import students, add teacher, users | admin-add-student, admin-import-students, admin-add-teacher, admin-manage-users | Verified |
| Admin: classrooms, courses (create, manage), fees, lecture history | admin-classrooms, admin-courses-create, admin-courses-manage, admin-fee-structure, admin-lectures-history | Verified |
| Teacher: classes and students, attendance, results | teacher-classrooms-and-students, teacher-attendance, teacher-results | Verified |
| Teacher: course portal (weeks, materials, chapters, legacy quiz) | teacher-course-portal | Verified |
| Teacher: AI tests, assignments, live classes | teacher-ai-tests, teacher-assignments, teacher-live-classes | Verified |
| Teacher: requirements | teacher-requirements | **Partial** (status meanings not verified) |
| Student: courses, tests and assignments, live classes, results, attendance and fees | student-courses-and-learning, student-tests-and-assignments, student-live-classes, student-results-attendance-fees | Verified |
| Accountant: fees, offline payments, reminders, vendor invoices | accountant-fees-and-payments | Verified (with gaps noted) |
| Super Admin: institutes, staff, demo leads | superadmin-institutes-and-staff | Verified |
| Storekeeper and vendor | storekeeper-and-vendor | **Partial** (overview only) |
| Index | 00_INDEX (id `index`) | n/a |

**Not covered, because they are not verifiable or not user-facing:**

- storekeeper and vendor step-by-step screens;
- the student timetable flow;
- subscription purchase steps (online payment is off);
- translation and language settings.

## 4. Verification matrix

Each document lists its evidence files in `sources` (front matter); `validate-kb.js` checks that every one exists. The main evidence per document:

| Document | Key evidence |
|---|---|
| admin-add-student | `client/src/pages/admin/AddStudent.jsx` (fields, "Save Student", validation toasts); `components/admin/ClassSectionSelect.jsx` (class messages, the inline create that sends no class teacher); `components/admin/PasswordNotice.jsx` ("Copy password"); `server/controllers/adminController.js` ("Student already exists", generated password) |
| admin-classrooms | `pages/admin/Classrooms.jsx`, `CreateClassroomModal.jsx` (grade list, "Select Class Teacher", the class-teacher messages), `ClassroomDetails.jsx` (tabs Courses, Students, Lectures; "Assign Student"); server duplicate check (409 "already exists") |
| admin-courses-create / -manage | `pages/admin/CreateCourseAdmin.jsx`, `AdminCourses.jsx`, `components/admin/ClassEnrollmentScope.jsx`; `server/helpers/courseClasses.js` (scopes, removal rules) |
| reports-and-counts | `Admin-Dashboard.jsx` (stat cards), `UserList.jsx` (role cards), `MentorDashboard.jsx` (count adds per-course enrolments), `ClassFeeStatus.jsx` + `server/routes/classroomRoutes.js` (teacher-only API), `SuperAdminDashboard.jsx` |
| general-login-and-password | `pages/Home.jsx` ("Log In to Your Account", "SIGN IN", "Forgot password?" navigates to `/login`), `App.jsx` (`/login` renders Home; the `Login` page is imported but not routed), `server/middleware/rateLimiter.js` (login message), `SuperAdminDashboard.jsx` ("Reset Password (optional)") |
| teacher-live-classes / student-live-classes / admin-lectures-history | `components/lectures/StartClassModal.jsx`, `LecturesTable.jsx` (countdown buttons, statuses), `LiveNowBanner.jsx`, `pages/LiveLecture.jsx`, `server/helpers/lectures.js` (30-minute start window, 60-second attended rule) |
| teacher-ai-tests / teacher-assignments | `pages/assessment-agent/*` (labels: "Create Draft Test", "Publish Test…", "Confirm & Assign", "Save & Publish Final Marks", …) |
| accountant-fees-and-payments | `components/OfflineFeeModal.jsx` (fields, modes, "Submit & Generate Receipt"), `pages/accountant/*`, `server/routes/classroomRoutes.js` (`roleMiddleware(["mentor"])` on the fees API) |
| student-results-attendance-fees | `pages/student/PayFees.jsx` (the 503 message "Online payment is not available yet. Please pay at the school office."), `StudentResults.jsx`, `StudentAttendance.jsx` |

## 5. Validation actually performed

All results come from `node docs/ai-knowledge-base-validation/validate-kb.js docs/ai-knowledge-base --baseline docs/archive/ai-knowledge-base-developer-2026-10-16`, run on 21 October 2026.

| Check | New KB | Old KB |
|---|---|---|
| Front matter complete, ids unique, related ids exist, source files exist | Pass (31 documents) | n/a |
| Backend detail (SQL, API paths, table names, source files) in user text | **0** | 49 |
| Every document has "Questions this answers" | Pass | n/a |
| Evaluation questions whose required facts are in the expected document | **88 / 88** | 13 / 88 (in any document) |
| Retrieval proxy (BM25): expected document in top 3 | **86 / 88** | n/a |
| Retrieval proxy: a top-3 document holds all required facts | **86 / 88** | 12 / 88 |

**Retrieval proxy misses (2):**

- **Q76, "What can a student do in the LMS?"** A very broad question. The general-portals-and-roles document holds the answer but ranks 4th.
- **Q83, "How do I add someone?"** Deliberately ambiguous. The expected behaviour is a clarifying question (student or teacher?).

**Evaluation dataset** (`evaluation-dataset.json`): 88 questions.

- 50 UI guidance (some overlap with other categories)
- 14 natural-language and Hinglish variations
- 14 live-data and reports questions
- 14 troubleshooting
- 10 role-specific
- 7 unsupported or ambiguous

The live-data questions check that the knowledge base points to the right screen. No live number is stored in it.

**Not performed:**

- **The live chatbot was not tested.** It is not in this repository, and testing it is out of scope. The retrieval proxy is only an approximation of real retrieval.
- **No screen was clicked through manually for this task.** The labels come from the source code. Pages reused from the live-class and course work had been exercised in the browser end-to-end tests on 16 October.

## 6. Gaps found (documented in the knowledge base, not fixed: application changes were out of scope)

1. **Forgot password is not available.** The link reloads the login page; the reset screen exists but is not routed.
2. **"Class or section not listed? Create it" (Add Student) fails.** The server requires a class teacher.
3. **The accountant's "Fee Monitoring & Reminders" loads no data and "Send Reminder" fails.** The API is teacher-only.
4. **The admin Dashboard "Database Export" quick action is refused for school admins.** Export is Super Admin only.
5. **Mentor Approval (`/admin/mentors`), Analytics (`/admin/analytics`), My Certificates (`/student/certificates`) and teacher fee monitoring (`/mentor/fee-monitoring`) are not in any sidebar.**
6. **The teacher dashboard "Total Students" double-counts** students who are in two of the teacher's courses.
7. **Classes cannot be deleted; teachers' "Remove" student button says "coming soon".**
8. **Online fee payment is off** (intended for now).

## 7. Files

**Created**

- `docs/ai-knowledge-base/` (replaced content): 31 documents, `00_INDEX.md` plus the 30 listed in section 3.
- `docs/ai-knowledge-base-validation/KB_REPLACEMENT_REPORT.md` (this report)
- `docs/ai-knowledge-base-validation/evaluation-dataset.json`
- `docs/ai-knowledge-base-validation/validate-kb.js`

**Moved (archived, recoverable)**

- The previous 18 files → `docs/archive/ai-knowledge-base-developer-2026-10-16/`. They remain useful as developer documentation, but should **not** be loaded by the user-facing chatbot.

**Removed from `docs/ai-knowledge-base/`**

- The 18 previous files (superseded; an identical copy is in the archive).

**Not changed:** chatbot code, prompts, retrieval, application code and configuration.

**Note for whoever loads the knowledge base:** load only `docs/ai-knowledge-base/`. Do not load `docs/archive/` or `docs/ai-knowledge-base-validation/`; they contain developer and test material.
