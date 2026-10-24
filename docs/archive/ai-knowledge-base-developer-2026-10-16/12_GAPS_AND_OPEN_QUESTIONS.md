# Gaps and open questions

Findings from static analysis on 16 October 2026. None of the "Suspected" items has been exploited or confirmed against a live system. Each one comes with a safe local test.

## Correctness and reliability

| # | Finding | Status | Evidence | Suggested follow-up |
|---|---|---|---|---|
| G1 | `DELETE /api/classrooms/:id` deletes nothing but answers "Classroom deleted successfully" | Verified | `server/controllers/classroomController.js`, `deleteClassroom` (line 771) | Product decision: what deleting a class should do with its students, courses and records. Then implement it or answer 501. |
| G2 | Deleting a user leaves orphaned enrolments, attendance, results and submissions (foreign keys not enforced by default) | Inferred | `adminController.deleteUser`; `LMS_ENFORCE_FOREIGN_KEYS` off by default | Decide on deactivation versus deletion. Test on a temporary database. |
| G3 | Deleting a course does not remove its content or enrolments explicitly | Inferred | `course-controller.deleteCourse` | Same as G2 |
| G4 | A live lecture can stay "live" after a server crash when no webhook arrives | Verified (by design) | `helpers/lectures.js` | Optional: a staff report of lectures that have been "live" for more than N hours |
| G5 | JaaS webhook signature format follows the documentation; it has not been tested with real JaaS | Documented | `helpers/jaas.js`, `verifyWebhook` | Configure `JAAS_WEBHOOK_SECRET` on a public test server and watch one real event |
| G6 | Student Onboarding import jobs are kept in memory; a restart loses jobs that are in progress | Inferred | `InMemoryImportJobStore` | Confirm with the module owner |
| G7 | Windows Time service could not be started on the development machine; the clock does not resync by itself | Observed | 16 October 2026 session | Make sure production uses NTP |

## Permissions to verify

| # | Finding | Status | Evidence | Safe local test |
|---|---|---|---|---|
| P1 | Generic list endpoints (`GET /api/users`, `/api/progress`, `/api/chapters`, `/api/feeStructures`, `/api/calendar_events`) filter a **teacher** by school only, not by their classes or courses | Suspected | `server/routes/universalRoutes.js`, `visibleTo()` | As a teacher of school A on a temporary database, call each endpoint without filters and compare the rows with that teacher's classes and courses |
| P2 | A course teacher may open result and attendance records **by id** for every student of a class they teach a course to | Verified (by rule) | `schoolScope.teacherMayAccess`, `result`/`attendance` → `teacherHasClassroom` | Product decision: should course teachers see whole-class results? |
| P3 | `POST /api/courses/:id/assign-students` lets a course's mentor enrol any student of the school, not only students of the course's classes | Verified | `course-controller.assignStudentsToCourse` | Product decision |
| P4 | Teacher-level scoping of `GET /api/attendance/download` and `/api/attendance` was not traced | Unverified | `attendanceController.js` | Read the handler; test as a course teacher |
| P5 | Vendor routes are said to be scoped to the vendor's own id; not verified per route | Documented | `apiAccessGate.js` comment; `vendorRoutes.js` | Read each handler |
| P6 | Superadmin frontend routes have no `requiredRole` | Verified | `client/src/App.jsx` | Not a security issue (the API enforces); a UX one |

## Contradictions

| # | Topic | Detail |
|---|---|---|
| C1 | Platform-owner login | `POST /api/superadmin/login` and `authMiddleware` read a `superadmins` table that is missing from the local database. `/internal/*` updates `users` rows with role `superadmin`. Tests sign the platform owner in through `/api/auth/login` as a `users` row. **Question:** which one is the supported design? |
| C2 | Database engine | SQLite only (`database-switch.js`), yet PostgreSQL multi-tenant code and `MASTER_DB_*` / `TENANT_DB_*` variables remain |
| C3 | AI Assessment migrations | The README says "not applied to the live DB"; the local database has them up to 010 |
| C4 | Duplicate frontend route | `/mentor/course/:courseId` is declared twice (`CourseTeacherPortal` and `MentorCourseDetails`) in `client/src/App.jsx`. Which page wins depends on React Router ordering. |
| C5 | Unmounted legacy code | `server/controllers/liveClassController.js` (public meet.jit.si links, a Mongoose `leave`) is no longer mounted but still in the tree, and `server/models/*` are Mongoose models the SQLite app does not use |

## Maintainability

- **About 200 one-off scripts** sit at the repository root and in `server/` (`check-*.js`, `add_*.js`, `*_FIXED.js`, and so on). Some of them write to the database. They are easy to run by mistake. **Recommendation:** move them to an `archive/` folder or delete them after review.
- **Error responses are mixed:** `{message}` and `{success, message}` ([08](08_ERRORS_TROUBLESHOOTING.md#known-error-handling-gaps)).
- **Two assessment systems** (legacy quizzes and the AI module) overlap. **Question:** is the legacy quiz feature to be kept?
- **`auth-controller.getMe` is not mounted.** A "who am I" endpoint would simplify the clients and future agent tools.
- **No audit log** records consequential changes: enrolments, attendance edits, deletions.

## Questions for the product owner

1. What should deleting a class or a user do? Options: deactivate, archive, or delete everything that belongs to it.
2. Should course teachers see whole-class results and attendance (P2), or only those of students enrolled in their courses?
3. Should a mentor be able to enrol any student of the school in their course (P3)?
4. Is the legacy quiz feature to be kept alongside the AI Assessment module?
5. Which platform-owner login is the supported one (C1)?
6. Should lectures that stay "live" too long be ended automatically after a limit?
7. When will online payments (Razorpay) and JaaS webhooks be configured in production?

## Not analysed

The following were not analysed: procurement status transitions, installment allocation maths, the translation and bilingual features, the subscription and plan-monitor schedulers, LLM prompt contents, and every individual frontend page. See [_ANALYSIS_NOTES.md](_ANALYSIS_NOTES.md#areas-not-analysed-and-why).
