# Workflows: live classes and notifications

## Live lectures (JaaS)

A live lecture is an online class for **one class and one course**, held inside the LMS through Jitsi as a Service (8x8 JaaS).

| Part | Code |
|---|---|
| Rules | `server/helpers/lectures.js` |
| Provider adapter | `server/helpers/jaas.js` |
| Routes | `server/routes/liveClassRoutes.js` |
| Schema | `server/config/sqlite-db.js`, `createLectureTables()` |
| Meeting page | `client/src/pages/LiveLecture.jsx` (`/live/:lectureId`) |
| UI pieces | `client/src/components/lectures/StartClassModal.jsx`, `LecturesTable.jsx` |
| Tests | `server/tests/integrity/liveLectures.test.js` (19), E2E checks TE-10 and ST-11 |

### Statuses

| Lecture status | Meaning | Next |
|---|---|---|
| `scheduled` | Has a future start time | `live` (teacher starts) or `cancelled` |
| `live` | Started; can be joined | `completed` (teacher or admin "End class", or the provider's `ROOM_DESTROYED` webhook) |
| `completed` | Finished; attendance finalised | (final) |
| `cancelled` | Cancelled before it started; the row is kept | (final) |
| `failed` | Reserved for a provider failure. The current code refuses before inserting instead of creating failed rows. | (final) |

What a student sees is separate from the lecture status. It is one of:

- **Upcoming:** the lecture is scheduled.
- **Live:** the lecture is running.
- **Attended:** at least 60 seconds of measured presence.
- **Missed:** nothing measured, set only after the lecture is completed.
- **Not measured** (`unknown`): the lecture completed with no join or leave event from anyone.
- **Cancelled.**

While a lecture is upcoming or live, a student is never "Missed".

### Start or schedule (teacher)

1. **Opening the form.** On the class page (`/mentor/classroom/:id`) the teacher clicks **Start Class**. The modal lists only `GET /api/live-classes/teaching/:classroomId/courses`: courses the teacher **mentors** that are taught to this class. Being the class teacher adds nothing.
2. **Submitting.** `POST /api/live-classes` with:
   - `classroomId`, `courseId`, `title`, optional `description`;
   - `mode`: `now` or `schedule`;
   - `scheduledStartTime` (an ISO time), when scheduling;
   - `durationMinutes` (10–480, default 60);
   - `requestKey`, a random value per form.
3. **Checks** (`lectures.createLecture`):
   - The caller is a teacher. Admins and students get 403.
   - The class is in the school, and the course is mentored by the caller and taught to that class (403 otherwise).
   - A topic is required, up to 200 characters; a description can be up to 2000.
   - A schedule must be at least 1 minute in the future and at most one year ahead (400).
   - "Now" needs JaaS credentials (503 otherwise, and **no row is created**).
4. **Duplicates.**
   - The same `requestKey` returns the first lecture (unique index `idx_live_classes_request`).
   - A second "start now" for the same teacher, class and course while one is live returns the live one.
5. **Stored values.** UTC times, an unguessable `providerRoom` (`lms-<uuid>`), `university_id` and `classroomId`.
6. **Notifications.** All students of the class who are enrolled in the course are notified: `LIVE_CLASS_STARTED` or `LIVE_CLASS_SCHEDULED`.

A scheduled lecture is started with `POST /api/live-classes/:id/start`:

- by its teacher only;
- from 30 minutes before the scheduled time;
- only one of two simultaneous starts takes effect;
- the students are notified once.

Lectures do not start automatically, and no scheduler runs for them.

### Join

`POST /api/live-classes/:id/join` returns the meeting details.

| Caller | Allowed when |
|---|---|
| The lecture's teacher | the lecture is live. They get **moderator** rights. |
| A student | the lecture is live, and the student is a member of the lecture's class **and** enrolled in its course. They get **participant** rights only. |
| An admin, another teacher, another school | never (403 or 404) |

- **Response:** `{domain: "8x8.vc", appId, roomName: "<appId>/<room>", jwt, expiresAt}`.
- **Token:** an RS256 JWT signed on the server with the JaaS private key (`helpers/jaas.js`, `joinDetails`). It names one room, carries the user's id and name and `moderator` true or false, and expires after `JAAS_TOKEN_TTL_MINUTES` (default 10). The private key never reaches the browser.
- **Meeting page.** `LiveLecture.jsx` loads `https://8x8.vc/<appId>/external_api.js` and embeds the meeting.
  - It shows loading, waiting ("not started yet"), live, left and rejoin, ended, and error states.
  - It disposes of the meeting when the user leaves the page.
- **Shared link.** One link serves everyone: the teacher's **Copy class link** copies `<site>/live/<id>`. Opening it repeats every check above, so the link alone gives no access.

### Attendance

- **Sources** (`lectures.recordPresence`, `handleProviderEvent`, `recomputeAttendance`):
  - **Provider webhooks:** `POST /api/live-classes/webhooks/jaas`. This path is public, but the request must carry a valid `X-Jaas-Signature` (HMAC-SHA256 of `t.rawBody` with `JAAS_WEBHOOK_SECRET`, within 5 minutes). Without the secret, every webhook is refused.
  - **The meeting page:** `POST /api/live-classes/:id/presence` `{kind: "join"|"leave"|"beat"}`, sent on join, on leave and every 60 seconds. The server uses the signed-in student and its own clock. Ids, times and durations sent by the browser are ignored, and naming another student gives 403.
- **Recomputation rules:**
  - Provider events win when a lecture has any.
  - Events are sorted by time and duplicates are ignored (`live_class_events.dedupKey` is unique), so repeated or out-of-order deliveries change nothing.
  - Several join and leave intervals add up.
  - An open interval closes at the lecture's end (provider events) or 90 seconds after the last heartbeat (page events).
- **Final status:** set only when the lecture completes. At least 60 seconds counts as attended; less is missed; no events at all for the lecture is `unknown`.
- **Who sees attendance:** `GET /api/live-classes/:id/attendance`, for the lecture's teacher or an admin.

### Lecture history ("Your Lectures")

| Who | API | Shows |
|---|---|---|
| Teacher | `GET /api/live-classes/mine?classroomId=&courseId=` | Their own lectures, with attended and missed counts. On the class page and the course page. |
| Student | `GET /api/live-classes/student` (`/student/lectures`) | Lectures of their classes and enrolled courses. Completed ones only if the student was part of them. The student's own status and minutes; Join when live. |
| Admin | `GET /api/live-classes/school?classroomId=&courseId=&teacherId=` | The school's lectures ("Lectures" tab on the admin class page) |

- **Ending and cancelling:**
  - `POST /:id/end`: by the teacher or an admin; calling it again changes nothing.
  - `POST /:id/cancel`: for scheduled lectures only. `DELETE /:id` also cancels; nothing is deleted.
  - Closing a browser tab never ends a lecture.
- **Gap: a lecture can stay "live".** If the server crashes and no webhook arrives, the lecture stays "live" until someone ends it. No end time is invented.
- **Legacy rows.** Rows created before this design have no `providerRoom` and cannot be joined through the embedded page.

### Operational note: clock

JaaS refuses tokens whose `nbf` (not before) lies in the future, with the message "Not acceptable by nbf". The client then shows "Authentication failed".

On 16 October 2026 the development machine's time zone was wrong, which put its UTC 4.5 hours ahead. This caused exactly that error. The server's clock must be correct (NTP); see [08](08_ERRORS_TROUBLESHOOTING.md).

## Notifications (the bell)

- **Storage.** Targeted notifications are rows in `announcements` with `recipientUserId` set (`server/services/notificationService.js`).
- **No duplicates.** `createNotifications()` stores each event once per recipient; the `dedupeKey` is unique.
- **Realtime.** Delivered over socket.io to `user:<id>`. The bell also polls, so a missed realtime event is not a lost notification.
- **Audience.** Always worked out on the server.
- **No links stored.** A notification stores `type`, `entityType` and `entityId`. The client decides where a click leads (`client/src/utils/notificationRoutes.js`).

| Type | Sent to | Trigger | Opens |
|---|---|---|---|
| `ASSESSMENT_PUBLISHED` | Recipients of an AI test | Test published | Course page or "My Tests" |
| `ASSIGNMENT_PUBLISHED`, `ASSIGNMENT_DUE_SOON`, `ASSIGNMENT_MISSED` | Recipients of an assignment | Publish; scheduler sweep | The assignment |
| `RESULT_AVAILABLE` | The student | Result or evaluation ready | Results or the assignment |
| `REPORT_SHARED` | The student | Teacher shares a performance report | The report |
| `CALENDAR_EVENT` | The audience of the event | Event created | Calendar at that event's month |
| `ASSIGNMENT_SUBMITTED`, `ATTEMPT_SUBMITTED` | The teacher | Student submits | Teacher pages |
| `ATTENDANCE_PENDING` | The class's teacher | Scheduler, after `ATTENDANCE_REMINDER_HOUR` | Attendance page |
| `MENTOR_PENDING_APPROVAL` | School admins | Teacher registered | Teacher approval page |
| `LIVE_CLASS_STARTED`, `LIVE_CLASS_SCHEDULED` | Enrolled students of the lecture's class | Lecture started or scheduled | `/live/<id>` or `/student/lectures` |

**Message text.** It comes from templates (`services/notificationText.js`). Some types may use AI wording when `NOTIFICATION_AI_TEXT_ENABLED` is on; the text is cleaned and length-limited (`sanitizeMessage`).

## Announcements

- **API:** `/api/announcements` (`announcementController.js`).
- **Admin:** must give `publishFor`, which is `students`, `mentors` or `both` (400 otherwise).
- **Teacher:** must be assigned to a class ("You are not assigned to any class yet" otherwise) and must choose a class and section. Course announcements are linked to a course.
- **Reading:** students and teachers see the announcements meant for their audience and their own classes and courses. `PUT /:id/read` marks one as read. Deleting checks the author (403 otherwise).
- **AI wording:** `POST /api/announcements/suggest-text` proposes wording (not traced).
