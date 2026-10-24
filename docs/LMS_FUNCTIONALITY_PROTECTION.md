# LMS Functionality Protection Guide (UI Redesign)

Date: 22 October 2026
Companion to: `LMS_UI_AUDIT.md`, `LMS_UI_REDESIGN_PLAN.md`
Purpose: list what the UI redesign must not break, the contracts it must keep, and the regression checklist to run after each phase.

**Rule:** the redesign changes markup and styling only. If a change needs a different API call, payload, response handling, auth check, route path, localStorage key or database column, it is **out of scope** and needs a recorded decision (redesign plan, section 9).

Labels: **[V]** verified in code · **[A]** assumption · **[M]** must be confirmed manually.

---

## 1. Critical existing workflows

| # | Workflow | Roles | Key UI files (routed) | Key endpoints |
|---|---|---|---|---|
| W1 | Login / logout / role redirect | all | `pages/Home.jsx`, `components/QuickLoginModal.jsx`, `pages/superadmin/SuperAdminLogin.jsx`, `auth/auth.jsx`, `App.jsx` (`RootRedirect`), `ProtectedRoute.jsx` | `POST /auth/login`, `/superadmin/refresh-token` |
| W2 | Terms acceptance after first login | all | `ControlledTermsModal.jsx`, `App.jsx` | none (localStorage `terms_accepted_<id>`) |
| W3 | Password reset / OTP | all | `QuickLoginModal.jsx` (forgot password), `components/OTPInput.jsx`, `services/passwordResetService.js` | `/send-otp`, `/verify-otp`, `/reset-password`, `/check-cooldown` (under `/password-reset`) |
| W4 | Student onboarding: import and setup password | admin, student | `pages/admin/StudentImport.jsx`, `pages/StudentSetupPassword.jsx` | `/onboarding/*`, `/student-setup/check`, `/student-setup/complete` |
| W5 | Institute and staff management | superadmin | `SuperAdminDashboard.jsx`, `CreateUniversityForm.jsx`, `CreateUserForm.jsx`, `InternalAdminPortal.jsx` | `/superadmin/universities[/:id]`, `/superadmin/create-university`, `/superadmin/create-user`, `/superadmin/users[/:id]`, `/superadmin/internal/*`, `/demo-requests[/:id/status]` |
| W6 | Subscriptions and plan limits | superadmin, admin, student | `SuperAdminSubscription.jsx`, `pages/student/Subscription.jsx`, `QuotaLimitModal.jsx` | `/subscriptions/current`, `/cancel`, `/test-upgrade`, `/activate-free-trial`, `/verify-payment`, `/check-feature-access` |
| W7 | Users: create student or teacher, mentor approval | admin | `AddStudent.jsx`, `AddTeacher.jsx`, `UserList.jsx`, `MentorApproval.jsx` | `/admin/create-student`, `/admin/create-teacher`, `/admin/users[/:id]`, `/admin/mentors`, `/admin/approve-mentor/:id`, `/users/*` |
| W8 | Classrooms and enrolment | admin, mentor | `Classrooms.jsx`, `CreateClassroomModal.jsx`, `ClassroomDetails.jsx`, `MentorClassrooms.jsx`, `ClassroomDetail.jsx`, `AssignStudents.jsx` | `/classrooms[/:id]`, `/classrooms/:id/students`, `/classrooms/assign-student(s)`, `/classrooms/mentor/me`, `/classrooms/mentor/:id`, `/classrooms/my-classrooms`, `/classrooms/student-classrooms` |
| W9 | Courses, chapters, materials, progress | admin, mentor, student | `CreateCourseAdmin.jsx`, `CreateCourse.jsx`, `AddChapter.jsx`, `CourseTeacherPortal.jsx`, `CourseMaterialsUpload.jsx`, `Courses.jsx`, `CourseViewer.jsx`, `Progress.jsx` | `/courses/*`, `/chapters/*`, `/materials/*` (multipart upload), `/progress/*`, `/weeks`, `/live-classes/*` |
| W10 | Classic assessments | mentor, student | `CreateAssessment.jsx`, `DesignAssessment.jsx`, `AttemptAssessment.jsx` | `/assessments/create`, `/add-question`, `/questions[/:id]`, `/:id/questions`, `/:id/publish`, `/course/:id[/all]`, `/submit` |
| W11 | AI assessments and assignments | mentor, student | `TeacherAssessments.jsx`, `TeacherAssignments.jsx`, `StudentPerformance.jsx`, `StudentTests.jsx`, `StudentAttempt.jsx`, `StudentAssignments.jsx`, `StudentAssignment.jsx`, plus `AiAssessmentGenerator`, `QuestionEditor`, `AssignToModal`, `AssignmentSubmissions`, `AiPerformanceReport`, `reportPdf.js` | `/assessment-agent/teacher/*`, `/assessment-agent/student/*` |
| W12 | Attendance | mentor, student | `AttendanceManagement.jsx`, `components/mentor/SpeedAttendanceBar.jsx`, `StudentAttendance.jsx` | `/attendance`, `/attendance/mark`, `/attendance/classroom/:id/date/:date`, `/attendance/student`, `/attendance/download` |
| W13 | Results and gradebook | mentor, student | `ClassResults.jsx`, `AddResult.jsx`, `StudentResults.jsx`, `components/mentor/OverallAiReportModal.jsx` | `/results`, `/results/:id`, `/results/classroom/:id`, `/results/student/:id`, `/results/my-results` |
| W14 | Certificates | student | `Certificates.jsx` | `/certificates`, `/certificates/generate/:id`, `/view/:id`, `/download/:id` |
| W15 | Fee structures and installment plans | admin | `FeeStructure.tsx` | `/classrooms/fee-structures[/:id]`, `/feeStructures` |
| W16 | **Online fee payment (Razorpay)** | student | `PayFees.jsx`, `components/PaymentSuccess.jsx` | `/accountant/student-installment-status`, `/classrooms/fee-structures`, `/payments/create-order`, `/payments/verify-payment`, `/transactions/student/:id`. The Razorpay script loads from `checkout.razorpay.com`. |
| W17 | **Offline fee collection, reconciliation, history** | accountant | `FeesCollection_temp.jsx`, `OfflineFeeModal.jsx`, `LegacyReconciliation.tsx`, `PaymentHistory_temp.jsx`, `AccountantDashboard_temp.jsx` | `/accountant/collect-offline-fee`, `/accountant/students`, `/accountant/payments`, `/accountant/fees-stats`, `/accountant/payment-history`, `/accountant/student-payments-history`, `/accountant/unallocated-payments`, `/accountant/verify-payment`, `/accountant/dashboard`, `/accountant/download-invoice/:id` |
| W18 | Fee monitoring and reminders | mentor, accountant | `pages/mentor/ClassFeeStatus.jsx` (one file for both roles; the layout is chosen by role) | `/classrooms/teacher/students-fees`, `/classrooms/send-fee-reminder` |
| W19 | Expenses and vendor invoices | accountant | `Expenses_temp.jsx`, `VendorInvoiceManagement.jsx` | `/expenses`, `/accountant/vendor-invoices` |
| W20 | Inventory, stock requests, requirements | storekeeper, mentor | `InventoryManagementSimple.jsx`, `VendorManagementSimple.jsx`, `components/Requirements.tsx`, `storekeeper/RequestStatus.tsx` | `/storekeeper/*`, `/stock-requests[/:id]`, `/stock-requests/dashboard/stats`, `/stock-requests/templates`, `/requirements[/:id/status]`, `/requirements/my-requests`, `/inventory` |
| W21 | Vendor orders, stock, invoices, payments | vendor | `vendor/VendorDashboard.jsx`, `VendorOrders.jsx`, `VendorStock.jsx`, `VendorInvoices.jsx`, `VendorPayments.jsx` | `/vendor/stats`, `/vendor/orders[/:id/status]`, `/vendor/stock`, `/vendor/invoices`, `/vendor/payments`, `/vendor/payment-stats`. (`/vendor/requests/*` and `/vendor/profile` are used only by unrouted pages.) |
| W22 | Announcements and notifications | all | `AnnouncementBell.jsx`, `CreateAnnouncementModal.jsx` (component and page versions), `pages/Announcements.jsx`, `RealTimeNotification.jsx` | `/announcements`, `/announcements/:id/read`. Socket events (section 2.6). |
| W23 | Calendar and events | admin, mentor, student | `calendar/*` | `/calendar`, plus a socket for live updates |
| W24 | Reports and exports | admin, accountant | `pages/admin/DatabaseExport.jsx`, `pages/accountant/DatabaseExport.jsx`, `components/DatabaseExport.jsx`, `AccountantExportFixed.jsx`, `pages/accountant/reportData.js`, `jspdf` usage | `/database-export/*`, `/accountant-export/*`, `/export/*` (Excel, CSV and JSON downloads; some use `?token=` in the URL) |
| W25 | Language switching | all | `UniversalLanguageSelector.jsx` (+ 3 aliases), `TranslationContext.jsx`, `i18n/*` | `POST /user/language-preference` |
| W26 | Chatbot (read-only) | student, mentor, admin | `components/Chatbot/*` | section 2.4 |
| W27 | GuideBot tours | superadmin, admin, mentor, (student) | `guidebot/**`, `GuideBotLauncher.jsx` | none (localStorage prefix `core5_guidebot`, `guidebot/engine/core/StorageManager.js:7`) [V] |

---

## 2. Contracts that must remain compatible

### 2.1 Auth context: `useAuth()` [V]

- It returns `{ token, user, loginUser(token, user), logoutUser(), API, socket }`. Do not rename, remove or reshape these fields. More than 100 files read them.
- `user.role` values: `superadmin`, `admin`, `mentor`, `teacher`, `student`, `accountant`, `storekeeper`, `vendor`.
- `user.id` may appear as `id`, `_id` or `userId`; existing code reads all three.

### 2.2 Route paths [V]

Every path in `App.jsx`, the storekeeper nested paths (`inventory`, `vendors`, `vendor-stock`, `requirements`, `reports`, `welcome`) and the SuperAdmin `?tab=` values (`universities`, `demoLeads`, `createUniversity`, `createUser`, `users`) are part of the contract. Links, redirects, notification deep links, tour `route` fields and bookmarks depend on them. `ProtectedRoute`'s role rules (superadmin may use admin routes; teacher may use mentor routes) must behave the same.

### 2.3 Layout components [V]

`AdminLayout`, `MentorLayout`, `StudentLayout`, `AccountantLayout`, `VendorLayout` and `SuperAdminLayout` keep their default exports and their `({ children })` contract. `SuperAdminLayout` also receives props from `SuperAdminDashboard`; check its prop list before re-implementing it [A]. `storekeeper/Sidebar.tsx` and `StorekeeperDashboardSimple.jsx` keep their default exports.

### 2.4 Chatbot service API [V]

Do not edit these in the UI phase:

- `chatbotService.js`, `mentorChatbotService.js` and `adminChatbotService.js` each export `handleMessage(text, { API, token, user }) → Promise<string HTML>`, `esc`, `shouldAutoOpen(storage, userId)` and `markAutoOpened(storage, userId)`, plus `ENDPOINTS` and their render and map helpers.
- `LMSChatbot` keeps its default export and its `role` prop (`'student' | 'mentor' | 'admin'`, default `'student'`).
- localStorage keys: `core5_chatbot:autoOpened:<id>`, `core5_chatbot_mentor:autoOpened:<id>` and `core5_chatbot_admin:autoOpened:<id>`.
- Escaping: any new UI must render only the HTML the services return. It must never put raw API values or user input into `innerHTML`.

### 2.5 Translation contract [V]

- `useTranslation()` from `context/TranslationContext` returns `{ currentLanguage, supportedLanguages, isRTL, changeLanguage, t, isLoading, version, i18n, translations }`. `useSimpleTranslation()` returns its own subset (`loading`, not `isLoading`).
- The `react-i18next` `useTranslation(ns)` calls stay as they are.
- Language codes are `en-IN` and `hi-IN`. Legacy `en`/`hi` values are normalised.
- The 7 existing namespace files and their keys are never renamed. Add new keys; do not move existing ones.
- localStorage keys: `selectedLanguage` and `i18nextLng`.
- `axiosInstance` sends the `x-language` header.

### 2.6 Browser storage and socket contracts [V]

Storage keys read across the app, which must keep their names and formats:

- `token` (32 uses), `user` (JSON, 9), `userId`, `selectedLanguage`, `i18nextLng`
- `terms_accepted_<userId>`, `termsAccepted`, `termsAcceptedDate`
- `superadminSubscriptionStatus`, `superadminPlanName`
- `unstop_token` and `authToken` (legacy fallbacks; do not remove readers)
- `inventoryOrders`, `subscription-updated`

Socket events listened to in the UI: `assessment-submitted`, `course-progress-updated`, `student-assigned`. Announcement and calendar real-time handlers must stay wired up after the markup changes [A: exact event names for those two not listed here; check before editing those files].

### 2.7 GuideBot anchors [V]

There are 282 `data-tour="…"` attributes in the UI, and the tour configs under `guidebot/tours/**` target them by selector. Any redesigned element that carries a `data-tour` attribute **must keep it** (or the tour config must be updated in the same change). Layout nav items take their `data-tour` from the `tourId` fields in each layout's nav array.

### 2.8 Server behaviour the UI depends on (do not "fix" from the UI side) [V]

- `authMiddleware` treats a missing or invalid token as `guest` and returns `200` with empty data on many routes. The UI must not read "empty" as "logged out" or the other way round. Existing pages rely on today's behaviour.
- `/classrooms/my-classrooms` is not scoped to the mentor on the server. The mentor chatbot filters on the client. Do not remove that filtering.
- API errors come back as `{ success, message }` (common shape [A]). Toasts often show `message` verbatim.
- Database schema: tables are created at boot in `server/config/sqlite-db.js` (SQLite, `server/data/lms_permanent.db`). The redesign adds **no** columns, tables or migrations.

### 2.9 Third-party integration points [V]

- Razorpay checkout in `PayFees.jsx` and in `SuperAdminSubscription`/`Subscription` [A]: order creation goes through the server, then the Razorpay modal, then server-side verification. Do not change the order of calls, the payload fields or the success handler. Restyle only the surrounding UI.
- File downloads (Excel, PDF, CSV) and uploads (materials, timetable, imports) use specific `responseType: 'blob'`, `FormData` field names and `?token=` query parameters. Keep the request code untouched when restyling the buttons.

---

## 3. Regression testing checklist

Run the full list at P0 (baseline) and after P2, P5 and P7. Run the relevant portal section after each P4 portal.

For every portal section, test:

- **(a)** desktop at 1440px and mobile at 360px;
- **(b)** English, then Hindi switched live without a reload;
- **(c)** refreshing the page on a deep URL.

Record each result as Pass, Fail (with a note) or Baseline-fail.

### A. Global

- [ ] **A1** Each role logs in through Home → Quick Login and lands on its dashboard (`RootRedirect` map). Superadmin logs in through `/superadmin/login`.
- [ ] **A2** Logout from each portal clears the session and returns to `/login`. Reloading after logout does not restore the session.
- [ ] **A3** Opening another role's URL redirects to your own dashboard. Superadmin can open `/admin/*`; teacher can open `/mentor/*`.
- [ ] **A4** The terms modal appears on the first login for a new user ID and does not appear again after acceptance.
- [ ] **A5** The forgot-password OTP flow sends, verifies and resets, and the cooldown message appears.
- [ ] **A6** The language selector switches EN ↔ HI without a reload; the choice survives a refresh and a logout/login; `POST /user/language-preference` fires when logged in.
- [ ] **A7** Toasts appear for success and error, and every replacement for `alert()`/`confirm()` keeps the same yes/no outcome.
- [ ] **A8** Announcement bell: unread count, opening, marking as read, and the real-time arrival of a new announcement.
- [ ] **A9** Calendar (admin/mentor/student): create and edit an event (admin/mentor), the back button works, and live update reaches a second browser.
- [ ] **A10** No new console errors compared with the baseline, and no failed network requests that were passing at baseline.

### B. Navigation and shell (each portal)

- [ ] **B1** Every sidebar item opens its page, and the active item is highlighted.
- [ ] **B2** Mobile: the drawer opens and closes, every item is reachable, and the backdrop closes it.
- [ ] **B3** The collapse toggle works, and content is never hidden under the sidebar.
- [ ] **B4** Long Hindi labels wrap or fit without overlapping icons or badges.
- [ ] **B5** The page scrolls to the bottom (no content clipped by `overflow-hidden`).

### C. SuperAdmin

- [ ] **C1** The institutes list loads; create an institute; view and edit an institute.
- [ ] **C2** Create staff; the all-staff list; edit and disable a user.
- [ ] **C3** Demo leads list, and changing a lead's status.
- [ ] **C4** Subscription page: current plan, upgrade or test-upgrade path, cancel, plan-limit display.
- [ ] **C5** Internal admin portal is accessible only to the configured account.
- [ ] **C6** The superadmin overview tour runs to the end in EN and HI.

### D. Admin

- [ ] **D1** The dashboard stats match the baseline numbers for the same data.
- [ ] **D2** Add a student and add a teacher; both appear in Users; edit and delete from Users.
- [ ] **D3** Mentor approval: approve a pending mentor.
- [ ] **D4** Create a course; it appears for the assigned mentor.
- [ ] **D5** Create a classroom, assign a class teacher and students; classroom details show them.
- [ ] **D6** Fee structure: create and edit a structure with installment options; it shows on the student's Pay Fees page.
- [ ] **D7** Student import: upload a file, review the AI mapping, import; the created students receive the setup-password flow (W4).
- [ ] **D8** Database export: list tables, preview, Excel download opens.
- [ ] **D9** Analytics page loads.
- [ ] **D10** The admin chatbot answers Overview, Classrooms, Mentors and Students with no money figures.

### E. Mentor / Teacher

- [ ] **E1** Dashboard; My Classrooms; the classroom detail page shows the correct students only.
- [ ] **E2** Attendance: mark a date (including the speed bar), edit, download; the student sees it.
- [ ] **E3** Results: add a result for a student; class results and the AI report modal; the student sees the result.
- [ ] **E4** Course portal: chapters, materials upload (file opens), live class start and join, student progress.
- [ ] **E5** Classic assessment: create, add questions, publish; the student attempts it; the score is visible.
- [ ] **E6** AI assessments: generate, edit questions, assign to a classroom, view submissions and performance, export the PDF report.
- [ ] **E7** Fee monitoring shows statuses; send a fee reminder; the student receives the announcement.
- [ ] **E8** Requirements: raise a request; the storekeeper sees it; the status updates back.
- [ ] **E9** The mentor chatbot shows only this mentor's classrooms, students, results and courses.
- [ ] **E10** Test with a `teacher`-role account as well as a `mentor` one (pages load; chatbot behaviour matches the baseline).

### F. Student

- [ ] **F1** Dashboard stats, enrolled courses, attendance and results widgets.
- [ ] **F2** Courses: search and filter; open a course; complete a chapter; progress updates.
- [ ] **F3** Classic assessment attempt and submit.
- [ ] **F4** AI tests: list, attempt, submit, see the result; assignments: list, open, submit.
- [ ] **F5** Results and attendance pages match the mentor's entries.
- [ ] **F6** Certificates: generate, view, download.
- [ ] **F7** Pay Fees: the installment status and amounts match the admin's fee structure; Razorpay test payment succeeds, verifies, and appears in history and on the accountant side; a failed or cancelled payment shows an error and records nothing.
- [ ] **F8** Timetable and subscription pages load.
- [ ] **F9** The student chatbot: four chips work; privacy block ("other student's marks"); an expired session shows a session message, not "no records".

### G. Accountant

- [ ] **G1** Dashboard figures match the baseline.
- [ ] **G2** Offline fee collection: choose a student, choose a plan or installment, record a payment; it appears in Payment History and in the student's Pay Fees page.
- [ ] **G3** Legacy reconciliation: unallocated payments listed; allocate one.
- [ ] **G4** Vendor invoices: list, verify or pay, download.
- [ ] **G5** Expenses: add and list.
- [ ] **G6** Reports and export (`/accountant/database-export` and `/accountant/reports`): Excel downloads.
- [ ] **G7** Fee monitoring with the accountant layout.

### H. Storekeeper

- [ ] **H1** Landing page after login (note the R6 baseline behaviour).
- [ ] **H2** Inventory: list, add, edit stock.
- [ ] **H3** Vendors and vendor stock: list vendors, browse stock, raise a stock request.
- [ ] **H4** Requirements: view a mentor request, change its status.
- [ ] **H5** The request status widget in the sidebar updates.

### I. Vendor

- [ ] **I1** Dashboard stats.
- [ ] **I2** Orders: list, update status.
- [ ] **I3** Stock: list, add, edit.
- [ ] **I4** Invoices and payments lists; payment stats.

### J. Chatbot UI replacement (P5)

- [ ] **J1** `node --test src/components/Chatbot/` reports 52 of 52 passing, and the service files are unchanged (`git diff --stat` shows no service edits).
- [ ] **J2** Auto-open happens only on the first visit per user and role; reopening after close works.
- [ ] **J3** The greeting updates on a language switch before the first message.
- [ ] **J4** Restart clears the conversation; Escape closes; focus returns to the launcher.
- [ ] **J5** HTML answers (tables, badges, cards) render with no broken styles; an API value containing `<script>` renders as text.
- [ ] **J6** Phone (360px): full-screen sheet, keyboard does not hide the composer [M].
- [ ] **J7** The chatbot is not rendered for unauthorised roles (accountant, storekeeper, vendor, superadmin).

### K. Multilingual (each redesigned page)

- [ ] **K1** No raw keys (`snake_case` text) visible in EN or HI.
- [ ] **K2** No English left on the page in HI mode, except proper nouns and server messages.
- [ ] **K3** `<html lang>` is `hi` in Hindi mode.
- [ ] **K4** Devanagari renders in the design font; no clipped matras in buttons or inputs (check line-height).
- [ ] **K5** Numbers, currency (₹) and dates are formatted consistently.
- [ ] **K6** The i18n check script passes (parity, unresolved keys, legacy-only keys).

### L. Accessibility smoke test (each redesigned page)

- [ ] **L1** Keyboard only: reach every control; visible focus; modals trap and return focus; Escape closes.
- [ ] **L2** Every icon-only button has an accessible name; the active nav item has `aria-current`.
- [ ] **L3** The Lighthouse accessibility score does not drop below the P0 baseline (chrome-devtools `lighthouse_audit`).
- [ ] **L4** Text contrast meets AA for body and small text.

### M. Automated checks to run every phase

- [ ] `node --test src/components/Chatbot/` (client)
- [ ] `npm test` in `ai-modules/ai-assessment-agent` and `ai-modules/student-onboarding-agent`
- [ ] `npm run build` in `client` completes. Run it on the branch: it rewrites `client/dist`, which is tracked in git.
- [ ] `npm run lint` shows no new errors compared with the baseline.
- [ ] The server `scripts/test_*.js` scripts relevant to payments and fees (for example `test_pay_invoice_endpoint.js`, `test_payment_history_integration.js`, `test_phase1b_fee_reminder.js`) still pass. These are backend checks, and the redesign should not affect them; any change in their results flags an accidental logic edit.
