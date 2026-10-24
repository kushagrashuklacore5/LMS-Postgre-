# AI tool catalog (design only)

**None of these tools exists yet.** This is a design catalog for a future agent, for example one built with LangChain or LangGraph.

## Design principles

1. **Act as the signed-in user.**
   - Every tool calls an existing LMS API with the **user's own session token**.
   - The tool never uses a service account and never has direct database access.
   - The server's four enforcement layers ([03](03_ROLES_PERMISSIONS.md)) then apply unchanged.
2. **Never accept identity or scope from the model.**
   - School, user id and role come from the session. A tool must not have a `universityId` or `userId` parameter for "who am I".
   - Ids of *target* records (a course, a lecture) are allowed, because the server checks them.
3. **Read-only tools first.** Mutating tools need:
   - an explicit user confirmation step that shows exactly what will change;
   - an idempotency key where the API supports one.
4. **Return what the API returns.** Never fill gaps with guesses, and keep the API's 403 or 404 as a plain "not available to you".
5. **Do not wrap these endpoints:**
   - the platform-owner-only endpoints (`/api/superadmin`, `/api/database-export`, `/api/accountant-export`);
   - bulk-delete style operations.

## Summary

| Tool | Kind | Users | Wraps | Exists as an API? |
|---|---|---|---|---|
| `get_my_profile` | read | all | session user (login response / `GET /api/student/dashboard` for students) | Partly; there is no single "me" route for every role (`getMe` exists in `auth-controller` but is not mounted) |
| `list_my_courses` | read | student, teacher, admin | `GET /api/courses/student` (student), `GET /api/courses/teaching/overview` (teacher, admin) | Yes |
| `get_course_details` | read | student (enrolled), teacher (mentor), admin | `GET /api/courses/:id` | Yes |
| `list_course_content` | read | same | `GET /api/chapters/course/:courseId`, `GET /api/materials/course/:courseId`, `GET /api/weeks?courseId=` | Yes |
| `get_course_roster` | read | teacher (mentor), admin | `GET /api/courses/:courseId/roster` | Yes |
| `list_class_students` | read | class teacher, admin; course teacher gets enrolled students only | `GET /api/classrooms/:id/students` | Yes |
| `get_my_attendance` | read | student | `GET /api/attendance/student` | Yes |
| `get_class_attendance_for_date` | read | teacher (class allowed), admin | `GET /api/attendance/classroom/:classroomId/date/:date` | Yes |
| `get_my_results` | read | student | `GET /api/results/my-results` | Yes |
| `get_course_progress` | read | student (own), teacher (mentor, per enrolled student) | `GET /api/progress/:courseId[?studentId=]` | Yes |
| `check_certificate_eligibility` | read | student | `GET /api/certificates/eligibility/:courseId` | Yes |
| `list_my_tests_and_assignments` | read | student | `GET /api/assessment-agent/student/assessments`, `/student/assignments` | Yes |
| `list_my_lectures` | read | student, teacher, admin | `GET /api/live-classes/student` \| `/mine` \| `/school` | Yes |
| `get_lecture_attendance` | read | lecture's teacher, admin | `GET /api/live-classes/:id/attendance` | Yes |
| `list_notifications` | read | all school roles | `GET /api/announcements` | Yes |
| `get_my_fee_status` | read | student | `GET /api/accountant/student-installment-status`, `/student-payments-history` | Yes |
| `schedule_lecture` | **mutating** | teacher | `GET /api/live-classes/teaching/:classroomId/courses` + `POST /api/live-classes` (`mode:"schedule"`, `requestKey`) | Yes |
| `start_lecture` | **mutating** | lecture's teacher | `POST /api/live-classes/:id/start` | Yes |
| `cancel_lecture` | **mutating, consequential** | lecture's teacher, admin | `POST /api/live-classes/:id/cancel` | Yes |
| `mark_attendance` | **mutating, consequential** | teacher (class allowed), admin | `POST /api/attendance/mark` | Yes |
| `enrol_students_in_course_for_class` | **mutating, consequential** | admin | `GET` + `PUT /api/courses/:courseId/classrooms/:classroomId/students` | Yes |
| `create_announcement` | **mutating** | teacher, admin | `POST /api/announcements` | Yes |
| `explain_lms_feature` | read (static) | all | knowledge base retrieval ([11](11_RAG_KNOWLEDGE_STRATEGY.md)) | Needs the RAG pipeline (new) |

## Tool details

Each entry lists the inputs, the output, the authorization (who the server lets through), the sensitivity, the side effects, the confirmation rule and the failure modes.

### `list_my_courses` (read)

- **Input:** none.
- **Output:**
  - student: list of `{id, title, mentor}` from `GET /api/courses/student`;
  - teacher and admin: `courses[]` from the overview (`{id, title, total, classes[]}`).
- **Authorization:** the session role decides which API is called. A student's list comes from **enrolments**, never from class membership.
- **Sensitivity:** low.
- **Failure modes:** 401 (session ended), 403 (role).

### `get_course_roster` (read)

- **Input:** `courseId`, optional `inClass`, optional `q`.
- **Output:** groups of `{classroom, students[{id,name,email,rollNumber}]}`, plus counts.
- **Authorization:** the course's mentor or an admin. Anyone else gets 404 or 403.
- **Sensitivity:** **personal data of students**. Show it only to the requesting staff member; never echo it into shared channels.
- **Failure modes:** 404 when the course is not the caller's.

### `list_my_lectures` (read)

- **Input:** optional `classroomId` and `courseId`. Admins may also give `teacherId`.
- **Output:** lectures with `status`. Students also get `myStatus` and `canJoin`; staff get `attendance` counts.
- **Authorization:** the server picks the scope by role (`/student`, `/mine`, `/school`).
- **Note:** to join, the agent should give the user the LMS link `/live/<id>`. It must not request a meeting token itself; tokens are short-lived and belong to the browser session.

### `get_my_fee_status` (read)

- **Input:** none. The student id comes from the session; the server refuses any other.
- **Output:** installment stages and payment history.
- **Sensitivity:** financial.
- **Failure modes:** 403 if another student is named.

### `schedule_lecture` (mutating)

- **Input:** `classroomId`, `courseId` (must be one returned by `teaching/:classroomId/courses`), `title`, optional `description`, `scheduledStartTime` (ISO; the user's time zone converted to UTC), `durationMinutes`.
- **Before calling:**
  - show the course, class, topic and local time;
  - ask "Schedule this lecture?";
  - generate a `requestKey` once per confirmed action.
- **Side effects:** a `live_classes` row, and **notifications to every enrolled student** of the class.
- **Idempotency:** the same `requestKey` returns the first lecture (`duplicate: true`).
- **Failure modes:** 400 (past time, too far ahead, no topic), 403 (not the mentor of a course taught to that class).

### `start_lecture` (mutating)

- **Input:** `lectureId`.
- **Confirmation:** required. Starting notifies students.
- **Rules:** from 30 minutes before the scheduled time; the teacher only; 503 if JaaS is not configured.
- **Idempotent:** a second start returns the live lecture and sends no second notification.

### `cancel_lecture` (mutating, consequential)

- **Input:** `lectureId`.
- **Confirmation:** required, naming the lecture and its time.
- **Rule:** only scheduled lectures can be cancelled. A live lecture answers 409 and must be ended instead.
- **Reversibility:** **irreversible**; there is no "un-cancel".

### `mark_attendance` (mutating, consequential)

- **Input:** `classroomId`, `date` (not in the future), `records[{studentId, status: present|absent}]`.
- **Confirmation:** required, showing the counts of present and absent students and the date.
- **Idempotency:** one row per student per day. Saving again overwrites that day's status.
- **Failure modes:** 400 (future date, a student not in the class, a bad status), 403 or 404 (class not allowed).

### `enrol_students_in_course_for_class` (mutating, consequential)

- **Input:** `courseId`, `classroomId`, the desired `studentIds` **or** `scope:"all"`.
- **Before calling:** `GET` the current roster and compute what will be added and removed. List the **removals** by name and ask for confirmation.
- **Side effects:** removes or adds `course_students` rows only.
- **Failure modes:** 400 (a student not in that class), 403 (not an admin), 404 (class not assigned to the course).

### `create_announcement` (mutating)

- **Input:**
  - admin: `title`, `message`, `publishFor` (`students`, `mentors` or `both`);
  - teacher: `title`, `message`, class and section, or a course.
- **Confirmation:** required; the announcement reaches many people.
- **Failure modes:** 400 (audience missing; a teacher without a class).

### `explain_lms_feature` (read, static)

- **Input:** a question.
- **Output:** an answer with citations to sections of this knowledge base.
- **Status:** **new**; requires the retrieval pipeline ([11](11_RAG_KNOWLEDGE_STRATEGY.md)).
- **Restriction:** must not answer questions about live data. Route those to a live tool.

## Capabilities that would need new backend work

| Wanted capability | Why it is missing |
|---|---|
| A single "who am I / my scope" call for every role | `auth-controller.getMe` exists but no route mounts it |
| A teacher-scoped "my students' recent results and attendance" summary | Only per-class or per-course endpoints exist; a summary would need N+1 calls |
| Student "what is due this week" across tests, assignments and lectures | Three separate APIs; no aggregate |
| Read-only audit of who changed an enrolment | No audit log table exists |
