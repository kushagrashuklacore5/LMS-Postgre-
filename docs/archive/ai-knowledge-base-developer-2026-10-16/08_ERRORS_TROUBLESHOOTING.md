# Errors and troubleshooting

All checks below are read-only unless stated otherwise.

- Never run the scripts at the repository root or the `check-*.js` and `add_*.js` scripts in `server/` against a real database: several of them write to it.
- Before any database change, copy the database file into `server/data/backups/`.

## Where to look

| Source | Location |
|---|---|
| API server console | The terminal or window running `node server.js`. Startup migrations, CORS origins and errors are printed here. |
| Access log | Printed per request unless `LMS_ACCESS_LOG=off` (`server/server.js`, line 50). It includes the caller's school. |
| Browser | DevTools Network tab: status code and JSON `message` of the failing `/api` call |
| Tests | `cd server && node --test --test-force-exit "tests/**/*.test.js"` (temporary databases only) |

## Common failures

| Symptom | Likely cause | Evidence | Safe check |
|---|---|---|---|
| `node` / `npx` "not recognized" (Windows) | Node.js not on PATH | Development machine history | `node -v`. Use the full path or install Node LTS. |
| Page shows "Failed to fetch" | The API server is not running, or the wrong port or origin is used | — | Is `PORT` (5002) listening? Is the web origin in `CORS_ORIGINS`? |
| 401 everywhere after it worked | Token expired, user signed out elsewhere (`sessions_valid_from`), account unapproved or deleted, role or school changed | `authMiddleware.js` | Sign in again; check `users.isApproved`, role and school |
| 403 "Your account is not attached to a school." | A school role with no `university_id` | `apiAccessGate.js`, line 39 | Fix the account's school |
| 403 "Access denied" on a whole area | The role is not in the `accessPolicy` rule | `accessPolicy.js` | Compare the role with the rule for that path ([03](03_ROLES_PERMISSIONS.md)) |
| 404 for a record that exists | The record is in another school, or outside the caller's scope (not enrolled, not the mentor). The id guard answers 404 on purpose. | `schoolScope.js` | Check the relationship: enrolment, mentor, class membership |
| 403 "You can only access your own records." | A student's request contains another person's `studentId` or `userId` | `requestIdsInCallerSchool` | Remove the field; the server uses the session |
| A teacher cannot see a class's students | The teacher is a course teacher, not the class teacher, and no student of that class is enrolled in their courses | `classroomController.getClassroomStudents` | This is intended |
| A teacher sees "Teacher: Not Assigned" on a course card | The course has no `mentorId` | `getCoursesByClassroom` returns `courseTeacher: null` | Assign a teacher to the course |
| "Course limit reached (N courses max per class for … plan)" | Plan quota per teacher per home class | `checkMentorCourseQuotaPerClass` | Use another teacher or plan |
| "Choose a class…" when creating a course | Class-first rule | `createCourse` | Create the class first |
| "N selected student(s) are not in the chosen class(es)" | A ticked student belongs to a class that was later unticked, or to another school | `checkAssignment` | Re-tick students after changing classes |
| Online fee payment answers 503 | Razorpay keys are absent (intended for now) | `payment-controller.js`, line 17 | None needed |
| "Start Class" answers 503 "Live classes are not set up yet" | `JAAS_APP_ID`, `JAAS_API_KEY_ID` or the private key is missing | `jaas.isConfigured()` | `GET /api/live-classes/config` returns `configured` |
| JaaS shows "Authentication failed / you're not allowed to join" | (1) The server clock or time zone is wrong (the error says "Not acceptable by nbf"); (2) the key id does not match the uploaded public key; (3) the token expired (`JAAS_TOKEN_TTL_MINUTES`) | Observed on 16 October 2026 | Compare the server's UTC with a public time source. Check the key id in the JaaS console. |
| A lecture stays "live" | The server crashed or no `ROOM_DESTROYED` webhook arrived | `lectures.js` | The teacher or an admin clicks "End class" |
| Webhook answers 401 | `JAAS_WEBHOOK_SECRET` is missing or wrong, the signature is older than 5 minutes, or the body was altered | `jaas.verifyWebhook` | Check the secret; check the server clock |
| Uploaded file link answers 403 or 404 | The signed link expired (`UPLOAD_LINK_TTL_MINUTES`) or was edited | `uploadPolicy.requireSignedUploadLink` | Reload the page to get a fresh link |
| Upload refused | The extension or MIME type is not allowed, the file is too large, or its content does not match | `uploadPolicy.PROFILES` | Use an allowed type and size |
| Password-reset code refused | Older than 10 minutes, 5 attempts used, or the reset window expired | `otpService.js` | Request a new code after the 1-minute cooldown |
| Emails not sent | `EMAIL_*` not set, or `EMAIL_TRANSPORT=mock` (messages kept in memory) | `emailService.js` | Check the configuration names ([09](09_INTEGRATIONS_AND_CONFIGURATION.md)) |
| "Database migrations did not finish" in tests | The schema is created asynchronously at startup | `server/tests/helpers/testApp.js` | Re-run; check the console for a migration error |
| A deleted class is still there | `DELETE /api/classrooms/:id` is a stub | `classroomController.deleteClassroom` | Known gap ([12](12_GAPS_AND_OPEN_QUESTIONS.md)) |

## Known error-handling gaps

- **Response formats are mixed.** Older handlers answer `{message}` and newer ones answer `{success, message}`. Clients and future tools must accept both.
- **Some older handlers log and answer 500 with "Server error".** The cause is then only in the server console.
- **Some legacy controllers swallow database errors and continue**; for example, `liveClassController.js` (no longer mounted) did.
- **The AI Assessment module answers its own error codes** (for example `NOT_IN_COURSE`) through its own error handler (`assessmentAgent.errorHandler`).
