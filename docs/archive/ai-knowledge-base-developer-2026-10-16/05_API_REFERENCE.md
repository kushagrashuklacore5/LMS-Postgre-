# API reference

All LMS endpoints are under `/api` on the API server (port `PORT`, 5002 in development).

- **Authentication:** `Authorization: Bearer <JWT>` (see [02](02_SYSTEM_ARCHITECTURE.md#authentication-model)).
- **Access:** the role gate, the id guards and the handler rules decide access (see [03](03_ROLES_PERMISSIONS.md)). Every route below also passes `apiAccessGate`.
- **Generated tables:** the tables at the end of this document were generated from the route files on 16 October 2026:
  - "Gate" is the result of the real `findAccess()` for that path;
  - "Route roles" are extra `roleMiddleware` lists in the route itself.

## Conventions

- **Errors.** Errors are JSON. Most handlers answer `{ message }`; newer ones answer `{ success: false, message }`.
  - **401** means not signed in, or the session is no longer valid.
  - **403** means the role or rule refuses.
  - **404** means the record is unknown **or belongs to another school or is outside your scope**; the two cases look the same on purpose.
  - **400** means invalid input.
  - **409** means a conflict with the current status.
  - **429** means rate limited.
  - **503** means a needed service is not configured: the payment gateway or JaaS.
- **Ids.** Ids anywhere in the URL, the query string or the body are checked (the global id guard). A student naming another person gets 403.
- **Uploads.** Responses contain signed upload links (`/uploads/...?expires=&signature=`), never bare paths.
- **Shapes.** Request and response shapes are given below only where the implementation establishes them. Everything else is in the handler named in the tables.

## Key endpoints with verified shapes

### Courses and enrolment (`server/routes/course-routes.js`, `helpers/courseClasses.js`)

| Endpoint | Body or query | Success response | Notes |
|---|---|---|---|
| `POST /api/courses/create-course` (admin, class-based) | `{title, description?, category?, duration?, mentorId, classroomIds:[id], scope:"all"\|"selected", studentIds?:[id]}` | 201 `{message, course:{id, title, mentorId, classroomId, totalStudents, ...}, classes:[...]}` | All or nothing (one transaction) |
| `GET /api/courses/teaching/overview` | none | `{success, data:{courses:[{id,title,mentorId,total,withoutClass,classes:[{id,label,count,isHome,assigned}]}], classes:[{id,label,courses:[{id,title,count}]}]}}` | Admin: whole school. Teacher: own courses. |
| `GET /api/courses/:courseId/roster` | `?inClass=&q=` | `{success, data:{course, total, shown, classes:[{id,label,count}], groups:[{classroom, students:[{id,name,email,rollNumber}], count}]}}` | Enrolled students only |
| `POST /api/courses/:courseId/classrooms` | `{classroomIds, scope, studentIds?}` | `{success, data:[{classroomId,label,scope,newlyAssigned,students,selected,enrolledNow,alreadyEnrolled}]}` | Admin |
| `DELETE /api/courses/:courseId/classrooms/:classroomId` | none | `{success, data:{classroomId, enrolmentsRemoved, newHomeClassroomId}}` | Admin. 400 for the last class. |
| `GET /api/courses/:courseId/classrooms/:classroomId/students` | none | `{success, data:{course, classroom:{id,label}, scope, isHome, classSize, enrolled, students:[{id,name,email,rollNumber,enrolled}]}}` | Admin |
| `PUT /api/courses/:courseId/classrooms/:classroomId/students` | `{studentIds:[id]}` or `{scope:"all"}` | `{success, data:{classroomId,label,scope,added:[{id,name}],removed:[{id,name}],classSize,enrolled}}` | Admin |

### Live lectures (`server/routes/liveClassRoutes.js`, `helpers/lectures.js`)

| Endpoint | Body or query | Success response |
|---|---|---|
| `POST /api/live-classes` | `{classroomId, courseId, title, description?, mode:"now"\|"schedule", scheduledStartTime?, durationMinutes?, requestKey?}` | 201 (or 200 with `duplicate:true`) `{success, duplicate, data: Lecture}` |
| `GET /api/live-classes/:id` | none | `{success, data: Lecture & {isOwner, role, canJoin}}` |
| `POST /api/live-classes/:id/join` | none | `{success, data:{lecture, meeting:{domain, appId, roomName, jwt, expiresAt}}}` |
| `POST /api/live-classes/:id/presence` | `{kind:"join"\|"leave"\|"beat"}` | `{success, data:{recorded}}` |
| `POST /api/live-classes/:id/start`, `/end`, `/cancel` | none | `{success, data: Lecture}` |
| `GET /api/live-classes/:id/attendance` | none | `{success, data:{lecture, attendanceState, students:[{studentId,name,status,attendedMinutes,intervals,firstJoinedAt,lastLeftAt}]}}` |
| `GET /api/live-classes/mine` \| `/school` \| `/student` | `?classroomId=&courseId=&teacherId=&limit=&offset=` (limit at most 200) | `{success, data:[Lecture & {attendance}\|{myStatus, myAttendedMinutes, canJoin}]}` |
| `POST /api/live-classes/webhooks/jaas` (public) | JaaS event + `X-Jaas-Signature` | `{success, outcome}` or 401 |

`Lecture` = `{id, title, description, status, classroomId, classLabel, courseId, courseTitle, teacherId, teacherName, scheduledStartTime, actualStartTime, actualEndTime, durationMinutes, cancelledAt, failureReason, embedded}`.

### Authentication

| Endpoint | Body | Response |
|---|---|---|
| `POST /api/auth/login` | `{email, password}` | `{token, user:{id,name,email,role,isApproved,...}}` (fields per `auth-controller.login`) |
| `POST /api/auth/logout` | none | Ends every session of the caller |
| `POST /api/password-reset/send-otp` → `verify-otp` → `reset-password` | `{email}` → `{email, otp}` → `{email, newPassword, ...}` | See [04a](04a_WORKFLOWS_ACCOUNTS_AND_ACCESS.md#forgotten-password-email-code) |

## AI Assessment module (`/api/assessment-agent`)

- **Mounting:** `app.use("/api/assessment-agent", authMiddleware, requireTenant, router)`. The gate allows `student`, `mentor` and `admin`.
- **Routes:** `ai-modules/ai-assessment-agent/backend/src/http/createAssessmentRouter.js` and `assignments/assignmentRoutes.js`.
- **Rules:** the module re-derives the actor from `req.user` and enforces teacher/student and school rules in its services (`core/AssessmentService.js`, `core/AttemptService.js`, `assignments/AssignmentService.js`).

| Area | Routes |
|---|---|
| Teacher tests | `GET/POST /teacher/assessments`, `GET/PATCH /teacher/assessments/:id`, `POST /teacher/assessments/:id/questions`, `PUT/DELETE /teacher/assessments/:id/questions/:questionId`, `POST /teacher/assessments/:id/publish` \| `unpublish` \| `close`, `POST /teacher/assessments/:id/students/:studentId/reset`, `GET /teacher/assessments/:id/report`, `POST /teacher/assessments/generate`, `POST /teacher/assessments/from-review`, `POST /teacher/question-images`, `GET /teacher/question-images/:key` |
| Teacher helpers | `GET /teacher/classrooms`, `GET /teacher/classrooms/:id/students?courseId=`, `GET /teacher/ai/status` \| `templates` \| `report-focuses` |
| Teacher assignments | `GET/POST /teacher/assignments`, `GET/PATCH /teacher/assignments/:id`, `PUT /teacher/assignments/:id/questions`, `POST .../publish` \| `close`, `GET .../submissions`, `GET .../submissions/:submissionId/file`, `PUT .../submissions/:submissionId/evaluation`, `POST .../submissions/:submissionId/evaluate-ai` |
| Teacher analytics | `GET /teacher/students/:studentId/performance`, `POST /teacher/students/:studentId/performance/analysis`, `POST /teacher/performance-reports/:reportId/share` |
| Student tests | `GET /student/assessments`, `GET /student/assessments/:id`, `POST /student/assessments/:id/attempt`, `PUT /student/attempts/:attemptId/answers/:questionId`, `POST /student/attempts/:attemptId/submit`, `GET /student/attempts/:attemptId` \| `/result`, question image |
| Student assignments and reports | `GET /student/assignments`, `GET /student/assignments/:id`, `PUT /student/assignments/:id/submission` (PDF), `GET .../submission/file`, `GET /student/performance-reports`, `GET /student/performance-reports/:reportId` |

## Student Onboarding module (`/api/onboarding`, `/api/student-setup`)

- **Mounting:** `/api/onboarding` is admin only (the gate and the module). Routes are under `ai-modules/student-onboarding-agent/backend/src/routes/` and `integration/lmsOnboarding.js`.
  - Imports: `POST /imports`, `GET /imports/:jobId`, `POST /imports/:jobId/validate` \| `decisions` \| `approve` \| `execute`, `POST /imports/:jobId/new-fields/approve` \| `reject`, `POST /imports/:jobId/rows/:rowNumber/password`, `GET/POST /imports/:jobId/setup-verification`, `GET /template`.
  - Custom fields: `GET /fields`, `GET /custom-fields`, `PATCH /custom-fields/:key`, `POST /custom-fields/:key/retire`, `GET /students/:studentRef/custom-fields`, `GET /me/custom-fields`.
- **`/api/student-setup`** (public, rate limited): `POST /check`, `POST /complete`. A student sets their first password from an emailed link.

## Generic read endpoints (`server/routes/universalRoutes.js`)

- **What it answers:** `GET /api/<entity>` and `GET /api/<entity>/:id` for `users`, `classrooms`, `courses`, `feeStructures`, `calendar_events`, `weeks`, `chapters`, `assessments`, `attendance`, `results`, `certificates`, `progress`.
- **When it is reached:** only when no earlier router answers the path.
- **Scoping:**
  - school;
  - for students: own rows, enrolled courses, published assessments only;
  - **no teacher-level narrowing**; see [12](12_GAPS_AND_OPEN_QUESTIONS.md).
- **Other routes:** `POST /api/results` and `DELETE /api/results/:resultId` are also defined here.

## All mounted routes (generated)

### auth-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/auth/register` | public |  | `server/routes/auth-routes.js:8` |
| POST | `/api/auth/login` | public |  | `server/routes/auth-routes.js:9` |
| POST | `/api/auth/logout` | any signed-in |  | `server/routes/auth-routes.js:12` |

### passwordResetRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/password-reset/send-otp` | public |  | `server/routes/passwordResetRoutes.js:10` |
| POST | `/api/password-reset/verify-otp` | public |  | `server/routes/passwordResetRoutes.js:13` |
| POST | `/api/password-reset/reset-password` | public |  | `server/routes/passwordResetRoutes.js:16` |
| GET | `/api/password-reset/check-cooldown` | public |  | `server/routes/passwordResetRoutes.js:19` |

### user-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/users/all` | mentor, admin, accountant, storekeeper | admin | `server/routes/user-routes.js:31` |
| PUT | `/api/users/approve-mentor/:userId` | admin | admin | `server/routes/user-routes.js:38` |
| DELETE | `/api/users/reject-mentor/:userId` | admin | admin | `server/routes/user-routes.js:45` |
| DELETE | `/api/users/:userId` | admin | admin | `server/routes/user-routes.js:52` |
| GET | `/api/users/mentors-simple` | mentor, admin, accountant, storekeeper | admin | `server/routes/user-routes.js:59` |
| GET | `/api/users/mentors` | mentor, admin, accountant, storekeeper | mentor, admin | `server/routes/user-routes.js:66` |
| GET | `/api/users/students-simple` | mentor, admin, accountant, storekeeper | mentor, admin | `server/routes/user-routes.js:73` |
| PUT | `/api/users/:userId` | admin | admin | `server/routes/user-routes.js:80` |
| GET | `/api/users/dashboard` | mentor, admin, accountant, storekeeper | admin | `server/routes/user-routes.js:87` |
| GET | `/api/users/analytics` | mentor, admin, accountant, storekeeper | admin | `server/routes/user-routes.js:94` |

### student-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/student/dashboard` | student |  | `server/routes/student-routes.js:21` |
| GET | `/api/student/courses` | student |  | `server/routes/student-routes.js:24` |
| GET | `/api/student/payments` | student |  | `server/routes/student-routes.js:27` |
| GET | `/api/student/:studentId/classroom` | student |  | `server/routes/student-routes.js:30` |

### languageRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/language/user/preference` | any signed-in |  | `server/routes/languageRoutes.js:15` |
| GET | `/api/language/user/preference/:email` | any signed-in |  | `server/routes/languageRoutes.js:61` |
| GET | `/api/language/supported` | public |  | `server/routes/languageRoutes.js:90` |

### adminRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/admin/create-student` | admin |  | `server/routes/adminRoutes.js:44` |
| POST | `/api/admin/create-teacher` | admin |  | `server/routes/adminRoutes.js:56` |
| GET | `/api/admin/mentors` | admin |  | `server/routes/adminRoutes.js:69` |
| GET | `/api/admin/dashboard` | admin |  | `server/routes/adminRoutes.js:80` |
| GET | `/api/admin/users` | admin |  | `server/routes/adminRoutes.js:91` |
| GET | `/api/admin/user-hierarchy` | admin |  | `server/routes/adminRoutes.js:102` |
| DELETE | `/api/admin/users/:userId` | admin |  | `server/routes/adminRoutes.js:113` |
| GET | `/api/admin/students` | admin |  | `server/routes/adminRoutes.js:124` |
| GET | `/api/admin/students/:studentId/classrooms` | admin |  | `server/routes/adminRoutes.js:135` |
| PUT | `/api/admin/students/:studentId/classroom` | admin |  | `server/routes/adminRoutes.js:146` |
| GET | `/api/admin/classrooms` | admin |  | `server/routes/adminRoutes.js:157` |
| GET | `/api/admin/analytics` | admin |  | `server/routes/adminRoutes.js:168` |

### classroomRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/classrooms` | mentor, admin |  | `server/routes/classroomRoutes.js:47` |
| GET | `/api/classrooms` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:55` |
| GET | `/api/classrooms/teaching-scope` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:59` |
| GET | `/api/classrooms/my-classrooms` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:65` |
| GET | `/api/classrooms/student-classrooms` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:71` |
| GET | `/api/classrooms/analytics` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:79` |
| POST | `/api/classrooms/assign-student` | mentor, admin | mentor, admin | `server/routes/classroomRoutes.js:86` |
| GET | `/api/classrooms/fee-structures` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:93` |
| POST | `/api/classrooms/fee-structures` | mentor, admin |  | `server/routes/classroomRoutes.js:99` |
| PUT | `/api/classrooms/fee-structures/:id` | mentor, admin |  | `server/routes/classroomRoutes.js:106` |
| GET | `/api/classrooms/mentor/me` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:116` |
| GET | `/api/classrooms/mentor/:mentorId` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:122` |
| GET | `/api/classrooms/:classroomId/students` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:129` |
| GET | `/api/classrooms/:id/fee-structure` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:135` |
| GET | `/api/classrooms/:id` | student, mentor, admin, accountant, storekeeper |  | `server/routes/classroomRoutes.js:141` |
| PUT | `/api/classrooms/:id` | mentor, admin |  | `server/routes/classroomRoutes.js:147` |
| DELETE | `/api/classrooms/:id` | mentor, admin |  | `server/routes/classroomRoutes.js:154` |
| GET | `/api/classrooms/teacher/students-fees` | student, mentor, admin, accountant, storekeeper | mentor | `server/routes/classroomRoutes.js:165` |
| POST | `/api/classrooms/send-fee-reminder` | mentor, admin | mentor | `server/routes/classroomRoutes.js:231` |

### chapter-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/chapters/create-chapter` | mentor, admin | mentor | `server/routes/chapter-routes.js:18` |
| PUT | `/api/chapters/update-chapter/:chapterId` | mentor, admin | mentor | `server/routes/chapter-routes.js:19` |
| DELETE | `/api/chapters/delete-chapter/:chapterId` | mentor, admin | mentor | `server/routes/chapter-routes.js:20` |
| GET | `/api/chapters/get-chapters` | student, mentor, admin |  | `server/routes/chapter-routes.js:23` |
| GET | `/api/chapters/course/:courseId` | student, mentor, admin |  | `server/routes/chapter-routes.js:24` |

### course-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/courses/create-course` | mentor, admin | mentor, admin, teacher | `server/routes/course-routes.js:28` |
| GET | `/api/courses` | student, mentor, admin |  | `server/routes/course-routes.js:37` |
| GET | `/api/courses/classroom/:classroomId` | student, mentor, admin |  | `server/routes/course-routes.js:40` |
| GET | `/api/courses/classroom` | student, mentor, admin |  | `server/routes/course-routes.js:45` |
| GET | `/api/courses/mentor` | student, mentor, admin | mentor | `server/routes/course-routes.js:52` |
| GET | `/api/courses/student` | student, mentor, admin | student | `server/routes/course-routes.js:60` |
| GET | `/api/courses/teaching/overview` | student, mentor, admin |  | `server/routes/course-routes.js:83` |
| GET | `/api/courses/:courseId/roster` | student, mentor, admin |  | `server/routes/course-routes.js:89` |
| GET | `/api/courses/:courseId/classrooms` | student, mentor, admin |  | `server/routes/course-routes.js:91` |
| POST | `/api/courses/:courseId/classrooms` | mentor, admin | admin | `server/routes/course-routes.js:92` |
| DELETE | `/api/courses/:courseId/classrooms/:classroomId` | mentor, admin | admin | `server/routes/course-routes.js:98` |
| GET | `/api/courses/:courseId/classrooms/:classroomId/students` | student, mentor, admin | admin | `server/routes/course-routes.js:105` |
| PUT | `/api/courses/:courseId/classrooms/:classroomId/students` | mentor, admin | admin | `server/routes/course-routes.js:111` |
| POST | `/api/courses/:id/assign-students` | mentor, admin | mentor, admin | `server/routes/course-routes.js:119` |
| GET | `/api/courses/:courseId/students` | student, mentor, admin |  | `server/routes/course-routes.js:127` |
| GET | `/api/courses/:id` | student, mentor, admin |  | `server/routes/course-routes.js:134` |
| PUT | `/api/courses/:id` | mentor, admin | mentor, admin | `server/routes/course-routes.js:137` |
| DELETE | `/api/courses/:id` | mentor, admin | mentor, admin | `server/routes/course-routes.js:145` |

### progress-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/progress/mentor` | student, mentor, admin | mentor | `server/routes/progress-routes.js:16` |
| GET | `/api/progress/:courseId` | student, mentor, admin | student, mentor, admin | `server/routes/progress-routes.js:19` |
| POST | `/api/progress/mark-completed` | student, mentor, admin | student | `server/routes/progress-routes.js:22` |
| POST | `/api/progress/mark-content-completed` | student, mentor, admin | student | `server/routes/progress-routes.js:30` |

### certificate-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/certificates/eligibility/:courseId` | student, mentor, admin |  | `server/routes/certificate-routes.js:23` |
| POST | `/api/certificates/generate/:courseId` | student, mentor, admin |  | `server/routes/certificate-routes.js:26` |
| GET | `/api/certificates/view/:certificateId` | student, mentor, admin |  | `server/routes/certificate-routes.js:29` |
| GET | `/api/certificates/download/:certificateId` | student, mentor, admin |  | `server/routes/certificate-routes.js:32` |
| GET | `/api/certificates` | student, mentor, admin |  | `server/routes/certificate-routes.js:35` |

### materialRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/materials/upload` | mentor, admin |  | `server/routes/materialRoutes.js:15` |
| GET | `/api/materials/course/:courseId` | student, mentor, admin |  | `server/routes/materialRoutes.js:27` |
| GET | `/api/materials` | student, mentor, admin |  | `server/routes/materialRoutes.js:33` |
| GET | `/api/materials/week/:weekId` | student, mentor, admin |  | `server/routes/materialRoutes.js:40` |
| GET | `/api/materials/:id` | student, mentor, admin |  | `server/routes/materialRoutes.js:47` |
| DELETE | `/api/materials/:id` | mentor, admin |  | `server/routes/materialRoutes.js:54` |

### assessmentRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/assessments/create` | mentor, admin |  | `server/routes/assessmentRoutes.js:21` |
| POST | `/api/assessments` | mentor, admin |  | `server/routes/assessmentRoutes.js:29` |
| POST | `/api/assessments/questions` | mentor, admin |  | `server/routes/assessmentRoutes.js:37` |
| POST | `/api/assessments/add-question` | mentor, admin |  | `server/routes/assessmentRoutes.js:42` |
| GET | `/api/assessments/:assessmentId/questions` | student, mentor, admin |  | `server/routes/assessmentRoutes.js:49` |
| GET | `/api/assessments/questions/:assessmentId` | student, mentor, admin |  | `server/routes/assessmentRoutes.js:54` |
| GET | `/api/assessments/questions/:questionId/image` | student, mentor, admin |  | `server/routes/assessmentRoutes.js:61` |
| PUT | `/api/assessments/:assessmentId/publish` | mentor, admin |  | `server/routes/assessmentRoutes.js:67` |
| GET | `/api/assessments/course/:courseId/all` | student, mentor, admin | mentor | `server/routes/assessmentRoutes.js:74` |
| GET | `/api/assessments/:assessmentId/attempts` | student, mentor, admin | mentor | `server/routes/assessmentRoutes.js:82` |
| GET | `/api/assessments/course/:courseId/attempts` | student, mentor, admin | mentor | `server/routes/assessmentRoutes.js:90` |
| GET | `/api/assessments/course/:courseId` | student, mentor, admin |  | `server/routes/assessmentRoutes.js:104` |
| POST | `/api/assessments/submit` | student |  | `server/routes/assessmentRoutes.js:111` |

### weekRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/weeks` | mentor, admin |  | `server/routes/weekRoutes.js:18` |
| POST | `/api/weeks/create` | mentor, admin |  | `server/routes/weekRoutes.js:19` |
| GET | `/api/weeks` | student, mentor, admin |  | `server/routes/weekRoutes.js:20` |
| PUT | `/api/weeks/:id` | mentor, admin |  | `server/routes/weekRoutes.js:21` |
| DELETE | `/api/weeks/:id` | mentor, admin |  | `server/routes/weekRoutes.js:22` |

### attendanceRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/attendance/mark` | mentor, admin |  | `server/routes/attendanceRoutes.js:17` |
| GET | `/api/attendance/download` | student, mentor, admin |  | `server/routes/attendanceRoutes.js:18` |
| GET | `/api/attendance/student` | student, mentor, admin |  | `server/routes/attendanceRoutes.js:19` |
| GET | `/api/attendance/classroom/:classroomId/date/:date` | student, mentor, admin |  | `server/routes/attendanceRoutes.js:20` |
| GET | `/api/attendance` | student, mentor, admin |  | `server/routes/attendanceRoutes.js:25` |

### resultRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/results/my-results` | student, mentor, admin |  | `server/routes/resultRoutes.js:14` |
| GET | `/api/results/student/:studentId` | student, mentor, admin |  | `server/routes/resultRoutes.js:21` |
| GET | `/api/results/classroom/:classroomId` | student, mentor, admin | mentor, admin | `server/routes/resultRoutes.js:28` |
| POST | `/api/results/add` | mentor, admin | mentor, admin | `server/routes/resultRoutes.js:36` |
| GET | `/api/results/subjects/classrooms` | student, mentor, admin |  | `server/routes/resultRoutes.js:47` |
| GET | `/api/results/subjects/classroom/:classroomId` | student, mentor, admin |  | `server/routes/resultRoutes.js:50` |
| PUT | `/api/results/subjects/classroom/:classroomId` | mentor, admin |  | `server/routes/resultRoutes.js:51` |
| GET | `/api/results/subjects/classroom/:classroomId/students` | student, mentor, admin |  | `server/routes/resultRoutes.js:54` |
| GET | `/api/results/subjects/classroom/:classroomId/student/:studentId` | student, mentor, admin |  | `server/routes/resultRoutes.js:57` |
| POST | `/api/results/subjects/classroom/:classroomId/student/:studentId/subjects` | mentor, admin |  | `server/routes/resultRoutes.js:62` |
| DELETE | `/api/results/subjects/classroom/:classroomId/student/:studentId/subjects` | mentor, admin |  | `server/routes/resultRoutes.js:67` |
| PUT | `/api/results/subjects/classroom/:classroomId/student/:studentId/max-marks` | mentor, admin |  | `server/routes/resultRoutes.js:72` |
| PUT | `/api/results/subjects/classroom/:classroomId/student/:studentId/replace-all` | mentor, admin |  | `server/routes/resultRoutes.js:77` |
| POST | `/api/results/subjects/classroom/:classroomId/student/:studentId/restore-defaults` | mentor, admin |  | `server/routes/resultRoutes.js:82` |
| GET | `/api/results` | student, mentor, admin |  | `server/routes/resultRoutes.js:89` |

### calendarRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/calendar` | mentor, admin |  | `server/routes/calendarRoutes.js:21` |
| GET | `/api/calendar` | student, mentor, admin, accountant, storekeeper |  | `server/routes/calendarRoutes.js:24` |
| PUT | `/api/calendar/:id` | mentor, admin |  | `server/routes/calendarRoutes.js:27` |
| DELETE | `/api/calendar/:id` | mentor, admin |  | `server/routes/calendarRoutes.js:30` |

### liveClassRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/live-classes/webhooks/jaas` | public |  | `server/routes/liveClassRoutes.js:28` |
| GET | `/api/live-classes/config` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:43` |
| GET | `/api/live-classes/teaching/:classroomId/courses` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:46` |
| GET | `/api/live-classes/mine` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:49` |
| GET | `/api/live-classes/school` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:50` |
| GET | `/api/live-classes/student` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:53` |
| GET | `/api/live-classes/student/upcoming` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:54` |
| GET | `/api/live-classes/course/:courseId` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:57` |
| POST | `/api/live-classes` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:65` |
| GET | `/api/live-classes/:liveClassId` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:76` |
| GET | `/api/live-classes/:liveClassId/attendance` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:77` |
| PUT | `/api/live-classes/:liveClassId/start` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:78` |
| POST | `/api/live-classes/:liveClassId/start` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:79` |
| POST | `/api/live-classes/:liveClassId/end` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:80` |
| POST | `/api/live-classes/:liveClassId/cancel` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:81` |
| DELETE | `/api/live-classes/:liveClassId` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:83` |
| POST | `/api/live-classes/:liveClassId/join` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:86` |
| POST | `/api/live-classes/:liveClassId/presence` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:88` |
| POST | `/api/live-classes/:liveClassId/leave` | student, mentor, admin |  | `server/routes/liveClassRoutes.js:89` |

### announcementRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/announcements` | student, mentor, admin, accountant, storekeeper |  | `server/routes/announcementRoutes.js:22` |
| GET | `/api/announcements` | student, mentor, admin, accountant, storekeeper |  | `server/routes/announcementRoutes.js:25` |
| POST | `/api/announcements/suggest-text` | student, mentor, admin, accountant, storekeeper |  | `server/routes/announcementRoutes.js:28` |
| GET | `/api/announcements/:id` | student, mentor, admin, accountant, storekeeper |  | `server/routes/announcementRoutes.js:31` |
| DELETE | `/api/announcements/:id` | student, mentor, admin, accountant, storekeeper |  | `server/routes/announcementRoutes.js:34` |
| PUT | `/api/announcements/:id/read` | student, mentor, admin, accountant, storekeeper |  | `server/routes/announcementRoutes.js:37` |

### databaseExportRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/database-export/tables` | superadmin |  | `server/routes/databaseExportRoutes.js:67` |
| GET | `/api/database-export/table/:tableName/structure` | superadmin |  | `server/routes/databaseExportRoutes.js:85` |
| GET | `/api/database-export/table/:tableName/data` | superadmin |  | `server/routes/databaseExportRoutes.js:117` |
| GET | `/api/database-export/table/:tableName/excel` | superadmin |  | `server/routes/databaseExportRoutes.js:153` |
| GET | `/api/database-export/database/excel` | superadmin |  | `server/routes/databaseExportRoutes.js:295` |
| GET | `/api/database-export/stats` | superadmin |  | `server/routes/databaseExportRoutes.js:436` |

### translations.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/database-translations/create` | admin, superadmin |  | `server/routes/translations.js:26` |
| GET | `/api/database-translations/text/:text` | admin, superadmin |  | `server/routes/translations.js:58` |
| GET | `/api/database-translations/:id` | admin, superadmin |  | `server/routes/translations.js:77` |
| GET | `/api/database-translations/model/:model_name` | admin, superadmin |  | `server/routes/translations.js:94` |
| GET | `/api/database-translations` | admin, superadmin |  | `server/routes/translations.js:111` |
| GET | `/api/database-translations/search/:query` | admin, superadmin |  | `server/routes/translations.js:130` |
| PUT | `/api/database-translations/:id` | admin, superadmin |  | `server/routes/translations.js:147` |
| DELETE | `/api/database-translations/:id` | admin, superadmin |  | `server/routes/translations.js:171` |
| POST | `/api/database-translations/batch/create` | admin, superadmin |  | `server/routes/translations.js:189` |
| POST | `/api/database-translations/get-translated` | admin, superadmin |  | `server/routes/translations.js:228` |

### accountantExportRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/accountant-export/tables` | superadmin |  | `server/routes/accountantExportRoutes.js:30` |
| GET | `/api/accountant-export/table/:tableName/structure` | superadmin |  | `server/routes/accountantExportRoutes.js:54` |
| GET | `/api/accountant-export/table/:tableName/data` | superadmin |  | `server/routes/accountantExportRoutes.js:85` |
| GET | `/api/accountant-export/table/:tableName/excel` | superadmin |  | `server/routes/accountantExportRoutes.js:137` |
| GET | `/api/accountant-export/database/excel` | superadmin |  | `server/routes/accountantExportRoutes.js:206` |
| GET | `/api/accountant-export/stats` | superadmin |  | `server/routes/accountantExportRoutes.js:299` |

### translationRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/translation/languages` | public |  | `server/routes/translationRoutes.js:10` |
| POST | `/api/translation/translate` | public |  | `server/routes/translationRoutes.js:20` |
| POST | `/api/translation/translate-content` | mentor, admin |  | `server/routes/translationRoutes.js:40` |
| GET | `/api/translation/content/:contentId/:contentType/:contentField/:lang` | any signed-in |  | `server/routes/translationRoutes.js:90` |
| POST | `/api/translation/translate-batch` | public |  | `server/routes/translationRoutes.js:174` |

### userLanguageRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/user/language-preference` | any signed-in |  | `server/routes/userLanguageRoutes.js:8` |
| POST | `/api/user/language-preference` | any signed-in |  | `server/routes/userLanguageRoutes.js:35` |

### translate.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/translate` | public |  | `server/routes/translate.js:15` |

### bilingual.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/bilingual/create` | admin, superadmin |  | `server/routes/bilingual.js:11` |
| GET | `/api/bilingual/get` | admin, superadmin |  | `server/routes/bilingual.js:56` |
| PUT | `/api/bilingual/update` | admin, superadmin |  | `server/routes/bilingual.js:96` |
| POST | `/api/bilingual/translate` | admin, superadmin |  | `server/routes/bilingual.js:142` |

### payment-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/payments/create-order` | student, accountant, admin |  | `server/routes/payment-routes.js:22` |
| POST | `/api/payments/verify-payment` | student, accountant, admin |  | `server/routes/payment-routes.js:25` |
| POST | `/api/payments/generate-invoice` | student, accountant, admin |  | `server/routes/payment-routes.js:28` |
| GET | `/api/payments/transactions/:studentId` | student, accountant, admin |  | `server/routes/payment-routes.js:31` |
| GET | `/api/payments/all-transactions` | student, accountant, admin |  | `server/routes/payment-routes.js:34` |

### subscription-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/subscriptions/current` | any signed-in |  | `server/routes/subscription-routes.js:19` |
| GET | `/api/subscriptions/check-feature-access` | any signed-in |  | `server/routes/subscription-routes.js:22` |
| POST | `/api/subscriptions/create-order` | superadmin, admin |  | `server/routes/subscription-routes.js:25` |
| POST | `/api/subscriptions/verify-payment` | superadmin, admin |  | `server/routes/subscription-routes.js:28` |
| POST | `/api/subscriptions/activate-free-trial` | superadmin, admin |  | `server/routes/subscription-routes.js:31` |
| POST | `/api/subscriptions/cancel` | superadmin, admin |  | `server/routes/subscription-routes.js:34` |

### demoRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/demo-requests` | public |  | `server/routes/demoRoutes.js:8` |
| GET | `/api/demo-requests` | superadmin |  | `server/routes/demoRoutes.js:124` |
| PATCH | `/api/demo-requests/:id/status` | superadmin |  | `server/routes/demoRoutes.js:159` |
| DELETE | `/api/demo-requests/:id` | superadmin |  | `server/routes/demoRoutes.js:193` |

### plan-inheritance-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/plan-inheritance/effective-plan` | superadmin, admin |  | `server/routes/plan-inheritance-routes.js:11` |
| POST | `/api/plan-inheritance/propagate` | superadmin, admin |  | `server/routes/plan-inheritance-routes.js:29` |
| POST | `/api/plan-inheritance/check-expiration` | superadmin, admin |  | `server/routes/plan-inheritance-routes.js:63` |
| GET | `/api/plan-inheritance/users-status/:superadminId` | superadmin, admin |  | `server/routes/plan-inheritance-routes.js:91` |

### plan-monitor-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/plan-monitor/status` | superadmin, admin |  | `server/routes/plan-monitor-routes.js:12` |
| POST | `/api/plan-monitor/force-check` | superadmin, admin |  | `server/routes/plan-monitor-routes.js:43` |
| GET | `/api/plan-monitor/cached-plan/:superadminId` | superadmin, admin |  | `server/routes/plan-monitor-routes.js:70` |
| POST | `/api/plan-monitor/toggle` | superadmin, admin |  | `server/routes/plan-monitor-routes.js:98` |

### transaction-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/transactions` | student, accountant, admin |  | `server/routes/transaction-routes.js:232` |
| POST | `/api/transactions` | student, accountant, admin |  | `server/routes/transaction-routes.js:282` |
| GET | `/api/transactions/student/:studentId` | student, accountant, admin |  | `server/routes/transaction-routes.js:340` |
| GET | `/api/transactions/stats` | student, accountant, admin |  | `server/routes/transaction-routes.js:374` |
| POST | `/api/transactions/generate-invoice` | student, accountant, admin |  | `server/routes/transaction-routes.js:397` |

### requirement-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/requirements` | mentor, storekeeper, accountant, admin | mentor, admin | `server/routes/requirement-routes.js:15` |
| GET | `/api/requirements` | mentor, storekeeper, accountant, admin | admin, storekeeper, accountant | `server/routes/requirement-routes.js:23` |
| GET | `/api/requirements/my-requests` | mentor, storekeeper, accountant, admin | mentor, admin | `server/routes/requirement-routes.js:31` |
| PATCH | `/api/requirements/:itemId/status` | mentor, storekeeper, accountant, admin | admin, storekeeper, accountant | `server/routes/requirement-routes.js:39` |

### orders-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/orders` | storekeeper, accountant, admin | admin, storekeeper | `server/routes/orders-routes.js:15` |
| GET | `/api/orders` | storekeeper, accountant, admin | admin, accountant | `server/routes/orders-routes.js:23` |
| GET | `/api/orders/my-orders` | storekeeper, accountant, admin | admin, storekeeper | `server/routes/orders-routes.js:31` |
| PATCH | `/api/orders/:orderId/status` | storekeeper, accountant, admin | admin, storekeeper | `server/routes/orders-routes.js:39` |

### expenses-routes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/expenses` | storekeeper, accountant, admin | admin, accountant | `server/routes/expenses-routes.js:15` |
| POST | `/api/expenses` | storekeeper, accountant, admin | admin, storekeeper | `server/routes/expenses-routes.js:23` |
| GET | `/api/expenses/summary` | storekeeper, accountant, admin | admin, accountant | `server/routes/expenses-routes.js:31` |
| PATCH | `/api/expenses/:expenseId/status` | storekeeper, accountant, admin | admin, accountant | `server/routes/expenses-routes.js:39` |

### accountantRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/accountant/dashboard` | accountant, admin |  | `server/routes/accountantRoutes.js:15` |
| GET | `/api/accountant/payments` | accountant, admin |  | `server/routes/accountantRoutes.js:104` |
| GET | `/api/accountant/expenses` | accountant, admin |  | `server/routes/accountantRoutes.js:124` |
| GET | `/api/accountant/vendor-invoices` | accountant, admin |  | `server/routes/accountantRoutes.js:144` |
| POST | `/api/accountant/pay-invoice/:invoiceId` | accountant, admin |  | `server/routes/accountantRoutes.js:205` |
| POST | `/api/accountant/download-invoice` | accountant, admin |  | `server/routes/accountantRoutes.js:277` |
| GET | `/api/accountant/fees-stats` | accountant, admin |  | `server/routes/accountantRoutes.js:480` |
| GET | `/api/accountant/students` | accountant, admin |  | `server/routes/accountantRoutes.js:531` |
| GET | `/api/accountant/student-installment-status` | student, accountant, admin |  | `server/routes/accountantRoutes.js:579` |
| POST | `/api/accountant/collect-offline-fee` | accountant, admin |  | `server/routes/accountantRoutes.js:597` |
| GET | `/api/accountant/student-payments-history` | student, accountant, admin |  | `server/routes/accountantRoutes.js:619` |

### storekeeperRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/storekeeper/vendors` | storekeeper, admin |  | `server/routes/storekeeperRoutes.js:15` |
| GET | `/api/storekeeper/inventory` | storekeeper, admin |  | `server/routes/storekeeperRoutes.js:68` |
| GET | `/api/storekeeper/vendor-stock` | storekeeper, admin |  | `server/routes/storekeeperRoutes.js:115` |

### stockRequestsRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/stock-requests` | storekeeper, accountant, admin |  | `server/routes/stockRequestsRoutes.js:29` |
| GET | `/api/stock-requests/:id` | storekeeper, accountant, admin |  | `server/routes/stockRequestsRoutes.js:129` |
| POST | `/api/stock-requests` | storekeeper, accountant, admin |  | `server/routes/stockRequestsRoutes.js:221` |
| PUT | `/api/stock-requests/:id` | storekeeper, accountant, admin |  | `server/routes/stockRequestsRoutes.js:336` |
| DELETE | `/api/stock-requests/:id` | storekeeper, accountant, admin |  | `server/routes/stockRequestsRoutes.js:398` |
| GET | `/api/stock-requests/dashboard/stats` | storekeeper, accountant, admin |  | `server/routes/stockRequestsRoutes.js:449` |

### requestTemplatesRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/stock-requests/templates` | storekeeper, accountant, admin |  | `server/routes/requestTemplatesRoutes.js:18` |
| GET | `/api/stock-requests/templates/:id` | storekeeper, accountant, admin |  | `server/routes/requestTemplatesRoutes.js:88` |
| POST | `/api/stock-requests/templates` | storekeeper, accountant, admin |  | `server/routes/requestTemplatesRoutes.js:153` |
| PUT | `/api/stock-requests/templates/:id` | storekeeper, accountant, admin |  | `server/routes/requestTemplatesRoutes.js:210` |
| DELETE | `/api/stock-requests/templates/:id` | storekeeper, accountant, admin |  | `server/routes/requestTemplatesRoutes.js:267` |

### vendorRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/vendor/stats` | vendor |  | `server/routes/vendorRoutes.js:22` |
| GET | `/api/vendor/invoices` | vendor |  | `server/routes/vendorRoutes.js:123` |
| GET | `/api/vendor/orders` | vendor |  | `server/routes/vendorRoutes.js:170` |
| PUT | `/api/vendor/orders/:id/status` | vendor |  | `server/routes/vendorRoutes.js:220` |
| GET | `/api/vendor/payments` | vendor |  | `server/routes/vendorRoutes.js:281` |
| GET | `/api/vendor/payment-stats` | vendor |  | `server/routes/vendorRoutes.js:334` |
| GET | `/api/vendor/stock/categories` | vendor |  | `server/routes/vendorRoutes.js:396` |
| GET | `/api/vendor/stock` | vendor |  | `server/routes/vendorRoutes.js:438` |
| GET | `/api/vendor/stock/stats` | vendor |  | `server/routes/vendorRoutes.js:478` |
| POST | `/api/vendor/stock` | vendor |  | `server/routes/vendorRoutes.js:532` |
| PUT | `/api/vendor/stock/:id` | vendor |  | `server/routes/vendorRoutes.js:580` |
| DELETE | `/api/vendor/stock/:id` | vendor |  | `server/routes/vendorRoutes.js:629` |
| GET | `/api/vendor/profile` | vendor |  | `server/routes/vendorRoutes.js:675` |
| PUT | `/api/vendor/profile` | vendor |  | `server/routes/vendorRoutes.js:711` |
| GET | `/api/vendor/requests` | vendor |  | `server/routes/vendorRoutes.js:751` |
| POST | `/api/vendor/requests/:id/respond` | vendor |  | `server/routes/vendorRoutes.js:821` |
| POST | `/api/vendor/requests/:id/quote` | vendor |  | `server/routes/vendorRoutes.js:888` |
| POST | `/api/vendor/requests/:id/bill` | vendor |  | `server/routes/vendorRoutes.js:942` |

### superadminRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| POST | `/api/superadmin/login` | public |  | `server/routes/superadminRoutes.js:45` |
| POST | `/api/superadmin/refresh-token` | public |  | `server/routes/superadminRoutes.js:199` |
| POST | `/api/superadmin/create-university` | superadmin |  | `server/routes/superadminRoutes.js:276` |
| POST | `/api/superadmin/create-user` | superadmin |  | `server/routes/superadminRoutes.js:283` |
| GET | `/api/superadmin/universities` | superadmin |  | `server/routes/superadminRoutes.js:290` |
| GET | `/api/superadmin/users` | superadmin |  | `server/routes/superadminRoutes.js:297` |
| PUT | `/api/superadmin/users/:id` | superadmin |  | `server/routes/superadminRoutes.js:304` |
| DELETE | `/api/superadmin/users/:id` | superadmin |  | `server/routes/superadminRoutes.js:311` |
| DELETE | `/api/superadmin/universities/:id` | superadmin |  | `server/routes/superadminRoutes.js:318` |
| GET | `/api/superadmin/internal/superadmins` | superadmin |  | `server/routes/superadminRoutes.js:327` |
| POST | `/api/superadmin/internal/create-superadmin` | superadmin |  | `server/routes/superadminRoutes.js:380` |
| POST | `/api/superadmin/internal/reset-password` | superadmin |  | `server/routes/superadminRoutes.js:482` |
| POST | `/api/superadmin/internal/delete-superadmin` | superadmin |  | `server/routes/superadminRoutes.js:531` |
| DELETE | `/api/superadmin/internal/delete-superadmin/:superadminId` | superadmin |  | `server/routes/superadminRoutes.js:586` |
| POST | `/api/superadmin/internal/disable-user` | superadmin |  | `server/routes/superadminRoutes.js:641` |

### universalRoutes.js

| Method | Path | Gate (accessPolicy) | Route roles | Defined at |
|---|---|---|---|---|
| GET | `/api/<entity>` | depends on the entity's rule (e.g. `/users`: staff read; `/progress`: learning roles) |  | `server/routes/universalRoutes.js:144` |
| GET | `/api/<entity>/:id` | depends on the entity's rule |  | `server/routes/universalRoutes.js:175` |
| POST | `/api/results` | mentor, admin |  | `server/routes/universalRoutes.js:198` |
| DELETE | `/api/results/:resultId` | mentor, admin |  | `server/routes/universalRoutes.js:269` |
| GET | `/api/student-classrooms` | student |  | `server/routes/universalRoutes.js:286` |
