# Workflows: teaching and learning

Access rules are described in [03](03_ROLES_PERMISSIONS.md). Tables are described in [06](06_DATA_MODEL.md).

## Class-first setup

**Rule:** a school sets up a class before the courses and fee structures that depend on it.

| Step | Who | API | Rules (evidence) |
|---|---|---|---|
| Create a class | admin | `POST /api/classrooms` | Grade and section required. **A class teacher is required** and must be an approved teacher of the same school (400 "Class teacher is required"). The same grade and section twice gives 409. (`classroomController.createClassroom`, line 272) |
| Create a fee structure | admin | `POST /api/classrooms/fee-structures` | Refused until the school has a class. One structure per category, either "Primary" or "Secondary" (400 if it already exists). (`classroomController`, line 506) |
| Create a course | admin | `POST /api/courses/create-course` | Needs at least one class (below) |

**Gap:** `DELETE /api/classrooms/:id` answers "Classroom deleted successfully" but deletes nothing (`classroomController.deleteClassroom`, line 771). The comment there says "we don't have a classrooms table". See [12](12_GAPS_AND_OPEN_QUESTIONS.md).

## Courses and enrolment

### Creating a course for classes

1. **Frontend.** `/admin/create-course` (`CreateCourseAdmin.jsx`). The admin chooses a teacher and one or more classes, then a scope (`ClassEnrollmentScope.jsx`):
   - **All students of the class(es).** Everyone is enrolled now, and students who join the class later are enrolled automatically.
   - **Selected students.** Only the ticked students are enrolled. Later joiners are not.
2. **API.** One request, `POST /api/courses/create-course`, with:
   - `classroomIds`;
   - `scope`: `"all"` or `"selected"`;
   - `studentIds`, when the scope is selected;
   - `mentorId`, `title`, and the other course fields.
3. **Handler.** `course-controller.createCourse`, then `helpers/courseClasses.js` → `createCourseWithClasses()`:
   1. **Checks, before anything is written:**
      - the teacher is a `mentor`/`teacher` of the school;
      - every class belongs to the school;
      - every selected student is a student of the school and a member of one of the chosen classes (`checkAssignment()`);
      - the per-class course quota of the plan (`checkMentorCourseQuotaPerClass`, counted on the home class).
   2. **One transaction** (`withTransaction`) inserts:
      - the `courses` row, whose home class is the first class chosen;
      - one `course_classrooms` row per class (`enrollAll` = 1 for "all", 0 for "selected");
      - the `course_students` rows, each with `enrolledViaClassroomId` set.
   3. **If any check fails, nothing is saved.** The answer is 400, 403 or 404.
4. **Response.** 201 with the course and `totalStudents`.

The older single-class form, `classroomId` plus `enrollScope` (`"all"` or `"none"`), still works. It checks the teacher and student ids it is given.

**Tests:** `server/tests/integrity/courseEnrolmentManagement.test.js`, `courseClasses.test.js`, `classFirstRules.test.js`.

### Managing the classes of a course (admin, `/admin/courses`)

| Action | API | Behaviour |
|---|---|---|
| List courses with classes and counts | `GET /api/courses/teaching/overview` | Admin: every course of the school. Teacher: only courses they mentor. |
| Assign more classes | `POST /api/courses/:courseId/classrooms` `{classroomIds, scope, studentIds}` | A class that is already assigned is not duplicated. Assigning "all" widens a "selected" class; "selected" never narrows an "all" class. |
| Remove a class from a course | `DELETE /api/courses/:courseId/classrooms/:classroomId` | Removes the link and only the enrolments that link created (`enrolledViaClassroomId`). Individual enrolments stay. The last class cannot be removed (400). Removing the home class moves "home" to another assigned class. |
| See one class's roster for a course | `GET /api/courses/:courseId/classrooms/:classroomId/students` | The whole class, each student marked `enrolled` or not (admin only) |
| Tick or untick students of that class | `PUT /api/courses/:courseId/classrooms/:classroomId/students` `{studentIds}` or `{scope:"all"}` | Adds and removes course enrolments only. Unticking anyone makes the class "selected". Accounts, class membership, marks and submissions are never touched. |

The UI confirms before removing a class or unenrolling students; adding students needs no confirmation (`client/src/pages/admin/AdminCourses.jsx`).

### Who sees which students

- **Course roster** (`GET /api/courses/:courseId/roster`, `courseClasses.courseRoster`). Lists the enrolled students only, grouped by class. Visible to the course's mentor or an admin. Filters: `?inClass=` and `?q=`.
- **Class list** (`GET /api/classrooms/:id/students`):
  - the class teacher and admins see the whole class;
  - a teacher who only teaches a course to the class sees only the class's students enrolled in their courses.
- **Teacher's "My Students"** (`/mentor/students`, `MyStudents.jsx`) has two views:
  - **by course:** course → classes → students;
  - **by class:** class → course → students.

  Both are built from the overview and roster APIs above.

### Teacher-managed roster (older page)

`POST /api/courses/:id/assign-students` `{studentIds}`:

- Used by the mentor pages `AssignStudents.jsx` and `CourseTeacherPortal.jsx`.
- Allowed for the course's mentor or an admin.
- Sets the course's roster to exactly the list given. Students not in the list are **unenrolled**; unchanged enrolments keep their origin.
- Any student of the school may be added (Verified). A tighter rule may be wanted; see [12](12_GAPS_AND_OPEN_QUESTIONS.md).

## Course content

| Content | Create, change or delete | Read | Rules |
|---|---|---|---|
| Chapters | `POST /api/chapters/create-chapter`, `PUT update-chapter/:chapterId`, `DELETE delete-chapter/:chapterId` (mentor; multipart upload) | `GET /api/chapters/course/:courseId`, `get-chapters?courseId=` | Teacher: their own course. Student: enrolled only. |
| Weeks | `POST /api/weeks`, `PUT/DELETE /api/weeks/:id` | `GET /api/weeks` | Same course rules |
| Materials | `POST /api/materials/upload`, `DELETE /api/materials/:id` | `GET /api/materials/course/:courseId`, `/week/:weekId`, `/:id` | Same course rules. Links must be http(s) (`helpers/safeUrl.js`). |

**Uploads** (`server/middleware/uploadPolicy.js`, `PROFILES`):

- Each upload kind has an allow-list of extensions and MIME types and a size limit: material 500 MB, chapter 50 MB, image 5 MB, timetable 10 MB.
- A file whose content does not match its extension is refused (tested: E2E TE-2, `server/tests/security/uploads.test.js`).
- Files are served only through signed links that expire after `UPLOAD_LINK_TTL_MINUTES` (default 240).

## Progress and certificates

- **Progress.**
  - A student marks content as completed: `POST /api/progress/mark-completed` and `mark-content-completed`.
  - It is read with `GET /api/progress/:courseId`. A student sees their own progress. A mentor sees it for their own course, per enrolled student (`?studentId=`). An admin sees any student of the school.
- **Certificate eligibility.**
  - A course is complete when **every chapter** of it is marked completed (`certificate-controller.js`, lines 17–26).
  - A course with no chapters is never complete.
  - `POST /api/certificates/generate/:courseId` builds a PDF only when the student is eligible.

## Legacy assessments (quizzes)

These live under `/api/assessments`; the controller is `assessmentController.js`.

- **Teacher creates a quiz for their course:**
  - start and end must be valid dates, with the end after the start;
  - the timer must be 1–1440 minutes;
  - the teacher must be the course's mentor (403 otherwise).
- **Questions** are added, then the quiz is published (`PUT /:assessmentId/publish`).
- **Students** see only published quizzes of enrolled courses (`GET /api/assessments/course/:courseId`).
- **Submitting** (`POST /api/assessments/submit`, student only):
  - one attempt per student per quiz;
  - enforced by the unique index `idx_assessment_attempts_one_per_student` (`sqlite-db.js`, `addLookupIndexes`).
- **Teacher views attempts:** `GET /api/assessments/:assessmentId/attempts`, `/course/:courseId/attempts`.

## AI Assessment module (tests and assignments)

This module is mounted at `/api/assessment-agent`. Its frontend pages are:

- teacher: `/teacher/assessments`, `/teacher/assessments/assignments`, `/teacher/assessments/students/:studentId`;
- student: `/student/assessment-agent/*`.

The module's own documentation is `ai-modules/ai-assessment-agent/README.md` and `docs/`.

| Capability | Verified rule |
|---|---|
| Test belongs to a class **and** a course | A new test needs `classroomId` and `courseId`. The course must be one the teacher mentors and taught to that class. The value is stored in `aia_assessments.course_id`; older tests have NULL there and are shown as "Legacy". (`AssessmentService.checkCourseForNewTest`, migration `010_aia_assessment_course.sql`) |
| Who receives a test | Students of the class who are enrolled in the test's course. "Assign to" can narrow this to selected students (`aia_assessment_recipients`). Publishing to a student outside the course gives 400 `NOT_IN_COURSE`. |
| Questions | Single-choice, multiple-select and numerical types. AI generation proposes questions; the teacher reviews them and saves them explicitly. |
| Attempts | A server-side timer (`deadline_at`). Grading is deterministic, with no LLM. A teacher can reset a student's attempt, at most 3 times, and the history is kept in `aia_attempt_archive`. |
| Test windows | Optional `opens_at` and `closes_at`. The teacher can close a test. Unpublishing is refused once attempts exist. |
| Assignments | The teacher writes questions. Students upload a PDF. The teacher evaluates by hand, or asks for an AI evaluation proposal. |
| Performance reports | Teacher only. A report can be shared with the student, who then gets a notification. |

**Contradiction:** the module README says migrations 001–008 are "not applied to the live DB". The local database already has the `aia_*` tables, including the migration 010 column. The README is out of date on that point.

## Attendance

| Step | API | Rules (`attendanceController.js`) |
|---|---|---|
| Mark a day | `POST /api/attendance/mark` `{classroomId, date, records[]}` | A teacher allowed in the class, or an admin (`authorizeClassroom`). No future dates. Status must be `present` or `absent`. Only students of that class. One row per student per class per day (unique index `idx_attendance_one_per_day`), so saving again updates the row instead of adding one. |
| Read a day | `GET /api/attendance/classroom/:classroomId/date/:date` | Same class rule |
| Student's own | `GET /api/attendance/student` | Own rows only |
| Export | `GET /api/attendance/download` | Read. The class id goes through the global id guard. Teacher-level scoping inside the handler was not traced. |

A reminder notification (`ATTENDANCE_PENDING`) is created when a class has no attendance by `ATTENDANCE_REMINDER_HOUR` (`notification-scheduler.js`).

## Results (term marks)

- **Entering marks:** `POST /api/results/add` (mentor or admin). It needs `studentId` and `classroomId` and at least one subject with marks.
  - Maximum marks must be greater than 0 and within the allowed totals (`resultController.js`, lines 28–103).
  - Marks above the maximum are refused (tested: E2E TE-5).
- **Subject configuration per class and student:** `/api/results/subjects/...` (8 routes; not traced in detail).
- **Reading:**
  - students read their own (`GET /api/results/my-results`);
  - teachers and admins read per class (`GET /api/results/classroom/:classroomId`).
- **Notification:** a `RESULT_AVAILABLE` notification is sent (`services/notificationText.js`).

## Calendar, timetable, requirements

- **Calendar events:** `/api/calendar` (create, read, update, delete for teachers and admins; read for school members).
  - Audience: `publishFor`, optionally a class or a course.
  - A `CALENDAR_EVENT` notification is sent.
- **Timetable:** an upload profile exists (`uploadPolicy.js`, `timetable`), and `classrooms.timetable` holds the file. The student page is `/student/timetable`. The full flow was not traced.
- **Requirements:** teachers raise requests for items (`POST /api/requirements`); storekeepers and accountants process them. See [04d](04d_WORKFLOWS_FEES_PROCUREMENT_PLATFORM.md).
