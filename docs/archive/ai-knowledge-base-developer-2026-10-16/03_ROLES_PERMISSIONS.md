# Roles and permissions

The server enforces access in four layers. A request must pass all of them.

| Layer | Where | What it decides |
|---|---|---|
| 1. Role gate | `server/config/accessPolicy.js` + `server/middleware/apiAccessGate.js` | Is the caller signed in, and is their role allowed in this API area? The first matching rule wins; paths with no rule are refused (deny by default). |
| 2. Account check | `server/middleware/authMiddleware.js` | Is the account still present and approved, is the token newer than `sessions_valid_from`, and do role and school still match the database? |
| 3. Id guards | `server/helpers/schoolScope.js` (`guardParams`, `requestIdsInCallerSchool`) | Does every record id in the URL, query string or JSON body belong to the caller's school and the caller's own scope? |
| 4. Handler rules | Controllers and helpers: `teachingScope.js`, `courseClasses.js`, `lectures.js`, AI module services | Ownership, enrolment, status and business rules |

**Hiding a button in the frontend is never a permission.** `client/src/components/ProtectedRoute.jsx` only redirects; the four layers above make every decision.

## Role gate by API area

These rules come from `server/config/accessPolicy.js`. "Read" means GET and HEAD.

| API area (`/api/...`) | student | mentor | admin | accountant | storekeeper | vendor | superadmin |
|---|---|---|---|---|---|---|---|
| `auth/login`, `auth/register`, `password-reset`, `student-setup`, `superadmin/login`, `demo-requests` (POST), `live-classes/webhooks/jaas`, translation helpers | public | public | public | public | public | public | public |
| `auth/logout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `superadmin`, `demo-requests` (other methods), `database-export`, `accountant-export` | | | | | | | ✓ |
| `plan-inheritance`, `plan-monitor`, `subscriptions` (write) | | | ✓ | | | | ✓ |
| `subscriptions/current`, `subscriptions/check-feature-access` (read) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `admin`, `onboarding` | | | ✓ | | | | |
| `database-translations`, `bilingual` | | | ✓ | | | | ✓ |
| `users` | | read | ✓ | read | read | | |
| `student` | ✓ | | | | | | |
| `assessment-agent` (the module re-checks roles itself) | ✓ | ✓ | ✓ | | | | |
| `classrooms` | read | ✓ | ✓ | read | read | | |
| `courses`, `chapters`, `weeks`, `materials`, `assessments`, `attendance`, `results` | read | ✓ | ✓ | | | | |
| `assessments/submit` (POST) | ✓ | | | | | | |
| `progress`, `certificates`, `live-classes` | ✓ | ✓ | ✓ | | | | |
| `calendar` | read | ✓ | ✓ | read | read | | |
| `announcements` | ✓ | ✓ | ✓ | ✓ | ✓ | | |
| `payments`, `transactions`, parts of `accountant` (installment status, payment history, invoice; read) | ✓ | | ✓ | ✓ | | | |
| `accountant` (rest) | | | ✓ | ✓ | | | |
| `vendor` | | | | | | ✓ | |
| `storekeeper` | | | ✓ | | ✓ | | |
| `stock-requests`, `expenses`, `orders` | | | ✓ | ✓ | ✓ | | |
| `requirements` | | ✓ | ✓ | ✓ | ✓ | | |

Some routes narrow this further with `roleMiddleware([...])`, as listed in [05](05_API_REFERENCE.md). For example:

- `POST /api/courses/:courseId/classrooms`: `admin` only.
- `GET /api/courses/student`: `student` only.
- `POST /api/classrooms/assign-student`: `mentor` or `admin`. The handler then allows only an admin or the class teacher.

The two `superadmin` paths are not the same role check. A school admin is refused at `/api/superadmin` by the gate (tested in `server/tests/security/routeCoverage.test.js`).

## School isolation

**Claim:** A user of one school can never read or change a record of another school. A record of another school is answered exactly like a missing record (HTTP 404), so its id cannot even be confirmed.

- **Status:** Verified.
- **Evidence:**
  - `server/helpers/schoolScope.js`: `SCHOOL_QUERY` gives one ownership query per record type, and `belongsToCallerSchool()` uses it. Child records (week, chapter, material, assessment, result, attendance, live class) are resolved through their parent course or class.
  - `server/tests/security/schoolIsolation.test.js`.
- **Implication for AI tools:** a tool must take the school from the signed-in user's session. It must never accept a school id from the model or the user.

## Global id guard

`requestIdsInCallerSchool()` (`schoolScope.js`) runs on every non-public `/api` request.

1. **Which fields it checks.** Every known id field in the query string and the JSON body, including arrays and one level of nested rows. The fields are listed in `ID_FIELDS`: `courseId`, `classroomId`, `classroomIds`, `studentId(s)`, `mentorId`, `teacherId`, `classTeacherId`, `userId`, `recipientUserId`, `weekId`, `chapterId`, `materialId`, `assessmentId`, `liveClassId`, `feeStructureId`, plus the `snake_case` forms.
2. **What it checks.** Each id goes through `callerMayAccess()`: same school, and for students and teachers the relationship rules below. A failure answers 404.
3. **Students naming someone else.** A student who puts another person's id in `studentId`, `student_id` or `userId` gets 403 "You can only access your own records".
4. **Teachers naming students in a body.** A teacher may name any student of the school in a request body. This is the school check only, for example for enrolment, and the handler decides the rest.

`guardParams(router, {...})` applies the same check to URL parameters (`router.param`).

## Object-level rules inside one school

The rules below are `studentMayAccess()` and `teacherMayAccess()` in `schoolScope.js`.

| Record | Student may use it when… | Teacher (`mentor`/`teacher`) may use it when… |
|---|---|---|
| User | it is themself | it is themself, or a student they have (see "teacher's students" below) |
| Class | they are a member (`student_classroom_assignment`) | they are its class teacher, or the mentor of a course taught to it |
| Course, and its weeks, chapters, materials, assessments, live classes | they are **enrolled** (`course_students`); class membership is not enough | they are the course's **mentor** (`courses.mentorId`) |
| Result, attendance row | it is their own | it belongs to a class they may use (row above) |
| Certificate | it is their own | its student is one of their students |
| Announcement, calendar event, fee structure | school check only; handlers filter by audience | school check only |

Admins, accountants and storekeepers pass layer 3 with the school check only. They act on their whole school within their role gate.

### Teachers: class teacher vs course teacher

There are two kinds of teacher link:

- **Class teacher of a class:**
  - `classrooms.classTeacherId`; or
  - the legacy `classrooms.classTeacher` column; or
  - a `classroomAssignments` row with `role = 'class_teacher'`.
- **Course teacher (mentor) of a course:** `courses.mentorId`. The course is taught to its home class (`courses.classroomId`) and to every class in `course_classrooms`.

What each link allows:

| Action | Class teacher | Course teacher of a course in that class |
|---|---|---|
| Open the class | ✓ | ✓ |
| See the class's full student list (`GET /api/classrooms/:id/students`) | ✓ | Only students of the class enrolled in their own courses |
| Add students to the class (`POST /api/classrooms/assign-student`) | ✓ | ✗ (403) |
| Open another teacher's course, its roster, assessments, chapters or lectures | ✗ (404) | n/a |
| Course roster and course operations | Only courses they mentor | Their own courses: enrolled students only |
| Start or schedule a live lecture | Only for a course they mentor that is taught to the class | ✓ for their own course |

**Evidence:**

- `schoolScope.js`: `RUNS_CLASSROOM`, `TEACHES_IN_CLASSROOM`, `teacherHasCourse`, `teacherHasStudent`, `teacherRunsClassroom`.
- `server/controllers/classroomController.js`: `getClassroomStudents`, `assignStudentToClassroom`.
- `server/helpers/teachingScope.js`: `authorizeCourse`, which allows the mentor only.
- `server/controllers/course-controller.js`: `getCoursesByClassroom`, where a teacher gets only the courses they mentor.

**Tests:** `server/tests/integrity/classFirstRules.test.js` and `courseEnrolmentManagement.test.js`.

### A teacher's students

`teacherHasStudent()`: a student is "theirs" when either

- the student is in a class the teacher **runs**, as class teacher; or
- the student is **enrolled** in a course the teacher mentors.

Teaching a course to a class does not open the class's other students.

### Students: enrolment decides course access

**Claim:** A student takes a course only through an explicit `course_students` row. Being a member of a class the course is taught to is not enough.

- **Status:** Verified.
- **Evidence:**
  - `schoolScope.js`: `studentTakesCourse()`.
  - `course-controller.js`: `getCourseById`, which returns 403 without an enrolment.
  - `chapter-controller.js`: `getChapters`.
  - `server/routes/universalRoutes.js`: `visibleTo()`.
  - Tests: `classFirstRules.test.js`, "being in a class does not by itself give a course".
- **Implication:** "Which courses does this student have?" must be answered from enrolments (`GET /api/courses/student`), never from class membership.

## Mutations that need extra care

These are the irreversible or consequential operations. A future agent must ask for explicit confirmation before calling any of them.

| Operation | Route | Effect |
|---|---|---|
| Delete a user | `DELETE /api/admin/users/:userId`, `DELETE /api/users/:userId` | Removes an account (school admin) |
| Delete a class | `DELETE /api/classrooms/:id` | Removes a class (handler-dependent; not traced) |
| Delete a course | `DELETE /api/courses/:id` | Removes a course and its class links |
| Remove a class from a course | `DELETE /api/courses/:courseId/classrooms/:classroomId` | Removes the enrolments that this class link created |
| Untick students of a class for a course | `PUT /api/courses/:courseId/classrooms/:classroomId/students` | Removes those course enrolments |
| Replace a course's roster | `POST /api/courses/:id/assign-students` | Unenrols everyone not in the list |
| Cancel or end a live lecture | `POST /api/live-classes/:id/cancel`, `/end` | Final status; attendance is finalised |
| Publish, close or reset AI tests and assignments | `/api/assessment-agent/teacher/...` | Visible to students, or attempts reset |
| Mark attendance, enter results | `POST /api/attendance/mark`, `POST /api/results/add` | Writes academic records |
| Collect an offline fee | `POST /api/accountant/collect-offline-fee` | Financial record |
| Superadmin user or school deletion | `/api/superadmin/...` | Platform-wide |

## Unverified or inconsistent permission behaviour

These are summarised here; details are in [12](12_GAPS_AND_OPEN_QUESTIONS.md).

- **Generic list endpoints are not narrowed to a teacher's own scope** (Suspected; needs a local test). `universalRoutes.js` answers these lists because no earlier router defines a `GET /` for them: `GET /api/users`, `/api/progress`, `/api/chapters`, `/api/feeStructures`, `/api/calendar_events`. They filter by school, and for students by own record or enrolment. They do **not** narrow a teacher to their own classes or courses. The global guard narrows only the ids a request names. A teacher calling, for example, `GET /api/progress` or `GET /api/chapters` without filters may therefore receive school-wide rows. Proposed safe test: as a teacher of school A, call these endpoints without filters and compare the rows with that teacher's scope.
- **A course teacher can open result and attendance records by id** for every student of a class they teach a course to. The `result` and `attendance` rules use `teacherHasClassroom`, which includes course teachers. This is consistent with the rule that "a course teacher may open the class", but it is wider than the course-enrolment rule.
- **Superadmin authentication has two paths:** a `superadmins` table and `users.role = 'superadmin'`. Their relationship is unclear (Gap).
