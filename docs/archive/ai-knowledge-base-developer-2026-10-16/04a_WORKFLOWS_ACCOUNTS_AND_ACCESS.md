# Workflows: accounts and access

These are the end-to-end flows for signing in, account creation and school setup. Roles and enforcement layers are described in [03](03_ROLES_PERMISSIONS.md).

## Sign in

**Who:** every school role and vendors. The platform owner has extra paths; see [04d](04d_WORKFLOWS_FEES_PROCUREMENT_PLATFORM.md#platform-owner-superadmin).

1. **Frontend.**
   - `/login` renders `Home` (`client/src/App.jsx`). The form posts email and password.
   - On success the client stores `token` and the user object in `localStorage` (`client/src/auth/auth.jsx`) and sends the user to their role's dashboard.
2. **API.** `POST /api/auth/login` is public (`accessPolicy.js`) and rate limited per IP and email (`server/routes/auth-routes.js` uses `rateLimiters.login` from `middleware/rateLimiter.js`).
3. **Handler.** `server/controllers/auth-controller.js`, `exports.login` (line 123):
   1. Email and password are required (400 otherwise).
   2. If the email is not a user, the vendor table is tried (`loginVendor`).
   3. On a wrong email or password the answer is always "Invalid email or password" (401). The message does not reveal which part was wrong.
   4. A stored password in an older format is upgraded to bcrypt on a successful login (line 142).
   5. If `isApproved = 0`, the answer is 403 "Your account is waiting for approval by an administrator."
   6. On success a 7-day JWT is issued with `userId`, `role` and `universityId`.
4. **Every later request** is re-checked against the database ([02](02_SYSTEM_ARCHITECTURE.md#authentication-model)).

**Failure cases:** 400 for missing fields, 401 for bad credentials, 403 for an unapproved account, 429 when rate limited.

## Sign out

- **API:** `POST /api/auth/logout`, for any signed-in account.
- **Effect:** sets `users.sessions_valid_from` to the current time plus one second (`auth-controller.js`, line 183).
- **Result:** every token issued before that moment is refused from then on, so signing out ends sessions on every device.
- **Test:** `server/tests/security/authentication.test.js`. In the browser E2E run, check SA-5.

## Forgotten password (email code)

| Step | API | Rule (`server/services/otpService.js`) |
|---|---|---|
| Request a code | `POST /api/password-reset/send-otp` | Public, rate limited. A 1-minute resend cooldown (`check-cooldown`). The code is sent by email (`services/emailService.js`). |
| Verify the code | `POST /api/password-reset/verify-otp` | Valid for 10 minutes. At most 5 attempts per code, and every attempt counts. Compared in constant time. |
| Set a new password | `POST /api/password-reset/reset-password` | Allowed for 10 minutes after a correct code. Ends all existing sessions. |

**Evidence:** `otpService.js` lines 39–41 and 94–116. Test: `server/tests/security/passwordReset.test.js`.

## Self-registration

- `POST /api/auth/register` is **off unless** both are set:
  - `ALLOW_PUBLIC_REGISTRATION=true`;
  - `PUBLIC_REGISTRATION_SCHOOL_ID` names an existing school.
- Only `student` or `mentor` can be requested; any other role becomes `student`.
- Passwords need at least 8 characters.
- The account starts unapproved (`isApproved = 0`) and cannot sign in until an admin approves it.

**Evidence:** `auth-controller.js`, lines 25–76.

## Admin creates a student

1. **Frontend.**
   - `/admin/add-student` (`client/src/pages/admin/AddStudent.jsx`). The admin chooses a class and section; class and section are required.
   - A second entry point is `components/admin/AddStudentModal.jsx` inside the admin class page.
2. **API.** `POST /api/admin/create-student`. The gate allows `admin` only.
3. **Handler.** `server/controllers/adminController.js`, `exports.createStudent` (line 37):
   - **Checks:** the email must be valid, the class must be resolved within the admin's school, and the student quota must allow it. If the email already exists the answer is 400 "Student already exists".
   - **Password:** the server generates it (12 characters, `utils/passwordUtils.generatePassword`) and stores it hashed with bcrypt.
   - **Rows written:**
     - `users` (role `student`, approved, `university_id`);
     - `students` (profile: roll number, fees);
     - class membership via `enrollStudentInClassroom`, which also enrols the student in the class's "all students" courses (`helpers/courseClasses.js`, `enrollStudentInClassCourses`).
4. **Response.** It contains the generated password once. The page shows it in a notification with a **Copy password** button (`client/src/components/admin/PasswordNotice.jsx`). It is not stored anywhere in the browser.

## Admin creates a teacher

- **Frontend:** `/admin/add-teacher` (`AddTeacher.jsx`), `AddTeacherModal.jsx` or `MentorApproval.jsx`.
- **API:** `POST /api/admin/create-teacher` (`adminController.createTeacher`, line 389). It creates a `mentor` user in the admin's school with a generated password, returned once as `generatedPassword`.
- **Note:** the "password" field in `MentorApproval` and the two modals is ignored. The server always generates the password.
- **Teacher approval** for self-registered teachers: `PUT /api/users/approve-mentor/:userId` (approve) and `DELETE /api/users/reject-mentor/:userId` (reject). Both are admin only.

## Bulk import of students (Student Onboarding module)

- **Frontend:** `/admin/student-import` (`client/src/pages/admin/StudentImport.jsx`).
- **API:** `/api/onboarding/*` (mounted with `authMiddleware` and `requireTenant`; admin only in the gate and again inside the module).
- **Flow:**
  1. Upload an Excel file.
  2. The module proposes column mappings; it can use an LLM for this.
  3. The rows are validated.
  4. The admin reviews and approves.
  5. The import is executed.
  6. Optionally, a password is set per row (`/imports/:jobId/rows/:rowNumber/password`) or a setup link is emailed.
- **Setup link.** An imported student can set their own password through the public `/api/student-setup/check` and `/complete` endpoints (rate limited). The frontend page is `/setup-password`. Emails are sent only when `ONBOARDING_EMAIL_ENABLED` is on.
- **Evidence:** `ai-modules/student-onboarding-agent/backend/src/integration/lmsOnboarding.js`. Its header states the admin-only and same-school rules. Import jobs are kept in memory (`InMemoryImportJobStore`), so a server restart loses unfinished jobs (Inferred from the class name; not tested).

## Deleting a user

- **API:**
  - `DELETE /api/admin/users/:userId` (`adminController.deleteUser`, line 322);
  - `DELETE /api/users/:userId`.
- **Rules:**
  - Admin only.
  - Admin accounts cannot be deleted (403).
  - Users of another school cannot be deleted (403 or 404).
- **Rows deleted:** the `students` profile row and the `users` row.
- **Gap:** enrolments, attendance, results and submissions that reference the user are not deleted by this handler.
  - SQLite enforces foreign keys only when `LMS_ENFORCE_FOREIGN_KEYS=true` (`server/config/sqlite-db.js`, line 20). That setting is off by default.
  - By default those rows therefore remain as orphans (Inferred).
  - See [06](06_DATA_MODEL.md#deletion-behaviour). Treat user deletion as irreversible and consequential.

## Moving a student to another class

- **API:** `PUT /api/admin/students/:studentId/classroom` (`adminController.changeStudentClassroom`, line 239).
- **Rule:** the student must currently be a member of the class being changed (400 otherwise).
- **Unverified:** whether course enrolments follow the change was not traced.

## Creating a school and its admin

Only the platform owner can create a school and its admin: `POST /api/superadmin/create-university` and `POST /api/superadmin/create-user`. The response contains a one-time password for the new admin; the page offers a copy action (`client/src/pages/superadmin/CreateUniversityForm.jsx`). See [04d](04d_WORKFLOWS_FEES_PROCUREMENT_PLATFORM.md#platform-owner-superadmin).
