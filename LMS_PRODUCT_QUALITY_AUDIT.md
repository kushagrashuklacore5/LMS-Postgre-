# LMS Product Quality Audit — UI/UX, Features, Workflows & Notifications

**Audit date:** 13 Oct 2026 · **Type:** read-only product QA · **Codebase:** `LMS-PROTOTYPE-2/LMS-main` (HEAD `3fc2984` + 49 uncommitted changes)

Security, authorization and tenant isolation are owned by a separate developer. Where they block a product workflow, they are listed under §8 "Referred to security" and are not scored here.

---

## 1. Executive summary

**Weighted product-quality score: 4.5 / 10**

The LMS has a broad feature surface and a polished visual style. Two areas work end to end:
- **Teacher tests:** create → publish → attempt → score → results.
- **Fees** (new code): fee structure → balance → offline collection → history → reports → reminder.

Several everyday workflows are broken by small, specific defects:
- Students get **no classrooms** from the API, so the Timetable says "not assigned".
- Teachers **cannot add term results** (every insert fails).
- **Certificates** fail with 500.

The accountant **payment history** page is a static placeholder. Dashboards **disagree with each other**. **Real-time notifications never connect.** Fabricated financial screens were fixed in code today, but **those fixes are not live**: the backend has not been restarted since 10:32, so the running server is older than the code reviewed here.

| Category | Weight | Score | Weighted |
|---|---|---|---|
| UI/UX and usability | 15% | 5.0 | 0.75 |
| Feature completeness | 25% | 5.0 | 1.25 |
| End-to-end workflow reliability | 25% | 5.0 | 1.25 |
| Notifications | 15% | 4.0 | 0.60 |
| Data consistency | 20% | 3.0 | 0.60 |
| **Total** | 100% | | **4.45 → 4.5 / 10** |

**Evidence labels used throughout**

| Label | Meaning |
|---|---|
| **[WF]** | Exercised in today's in-process workflow harness. The *real* route code was driven across roles against a disposable copy of the real schema, with email and AI faked. 48 steps; the live database was never written. |
| **[BR-12]** | Seen in the controlled browser on **12 Oct**, on the backend running at that time. Valid where the screen's code is unchanged since; stale where marked. |
| **[CODE]** | Confirmed by reading current source. |
| **[DB]** | Read-only query on the live database (counts and IDs only). |
| **[INF]** | Inferred risk, not demonstrated. |
| **NOT VERIFIED** | No evidence gathered; not assumed to pass. |

---

## 2. Scorecard

### UI/UX and usability — 5 / 10

| + / − | Evidence |
|---|---|
| + | Consistent, modern visual design across Student, Admin and Accountant portals; clear cards and tables [BR-12] |
| + | All 47 `<img>` tags in the client have `alt` text [CODE] |
| − | Raw translation keys shown to users: sidebar/header `legacy_reconciliation`, Admin Announcements `no_announcements_available` [BR-12][CODE `AccountantLayout.jsx:68`, `pages/Announcements.jsx:48`] |
| − | Misleading zero states: Certificates page shows "Enrolled Courses 0 / Progress 0%" when the API fails; Admin Analytics shows all zeros [BR-12][WF] |
| − | Three date formats on related screens (`4/30/2026`, `30/04/2026`, `2026-01-31`) [BR-12] |
| − | 97 `alert()`/`window.confirm()` calls; 388 `console.log` calls left in the client [CODE] |
| − | Four production routes still render `*_temp` components (Accountant dashboard, payment history, expenses, fees) [CODE `App.jsx:63-86`] |
| − | Icon-only buttons without accessible names (unnamed `button` nodes in the page accessibility tree) [BR-12] |
| ? | Responsive/mobile layout, keyboard navigation, colour contrast — **NOT VERIFIED** |

### Feature completeness — 5 / 10

The inventory is broad (§3). Score reduced for features that exist but are broken or are placeholders: certificates (500), manual term results (500), timetable (empty), accountant payment history (static placeholder), Funds & Grants (no data source), admin Analytics (wrong data), student Subscription page (404).

### End-to-end workflow reliability — 5 / 10

The workflow harness passed **40 of 48** steps [WF]. The 8 failures are concentrated in classroom visibility for students, term results, certificates, analytics and mentor approval (§4). The fee workflow passes completely in the **new** code, which is not live yet.

### Notifications — 4 / 10

| Works | Doesn't |
|---|---|
| Targeting by audience (students/mentors), university and course; per-user read state [WF] | Real-time push never connects (socket misconfigured) [BR-12][CODE] |
| Fee reminders now secure, targeted, de-duplicated and honestly reported (in code) [WF] | Reminder security fixes not live yet |
| | Any logged-in student can create announcements (referred to security) |
| | Legacy untargeted "fee reminders" are shown to students by name match |
| | Bulk-reminder result counts are misleading |
| | No email channel for announcements |

### Data consistency — 3 / 10

The same metric disagrees across screens:
- **Students:** 14 vs 7 vs 3.
- **Courses:** 2 vs 13; one student is enrolled in 13 courses from another university.
- **Fees:** ₹12,100 vs ₹8,050.
- **Mentors:** all "pending" on one page vs 0 pending on another.
- **Payment history:** "No payments" while payments exist.

Details are in §6.

---

## 3. Role-wise feature inventory

Status: **W** Working · **P** Partially working · **B** Broken · **M** Missing · **NV** Not verified.

### Student

| Feature | Status | Evidence / note |
|---|---|---|
| Login | W | [BR-12] |
| Dashboard | P | Loads; course list includes other universities' courses for at least one student [BR-12][DB]; 26+ progress calls per load |
| My Courses | P | Sees courses they are enrolled in [WF]; live data includes cross-university enrolments [DB] |
| Course page | P | Loads; "0/0 chapters" beside 25% progress; past live classes still "Join" [BR-12] |
| Classroom / Timetable | **B** | API returns no classrooms for any student: `getStudentClassrooms` reads `req.user.id`, middleware sets `req.user.userId` [WF][CODE `classroomController.js` getStudentClassrooms] |
| My Tests (teacher tests) | W | Sees published test, attempts, submits, gets score [WF][BR-12] |
| Assignments | P | List renders with "Missed" states [BR-12]; submission flow NV |
| Results | P | Teacher-test scores appear [WF]; manual term results cannot be created (see Mentor); live data shows results from other classrooms [DB] |
| Attendance | W | Own records shown [WF][BR-12]; live label "Classroom 8" belongs to another university's classroom [DB] |
| Calendar | P | Renders [BR-12]; event creation/sync NV |
| Certificates | **B** | `GET /api/certificates` → 500 (MongoDB-style model in a SQLite app) [WF][CODE `certificate-controller.js:144`] |
| Fees / Pay fees | P | Balance and history correct from API [WF]; itemised breakdown hard-coded [CODE `PayFees.jsx:50-57, 626-651`]; online payment NV (not exercised by design) |
| Payment history | W | Own offline payment listed [WF] |
| Announcements / bell | P | Receives targeted/course notices, read state per user [WF]; real-time push broken |
| Subscription | **B** | `/api/api/subscriptions/current` → 404 [BR-12] |

### Mentor / Teacher

| Feature | Status | Evidence / note |
|---|---|---|
| Dashboard, classrooms, course pages | NV | No mentor browser session |
| Create teacher test → publish → report | W | [WF] |
| AI question generation / performance report | NV | AI provider faked; real provider not exercised |
| Mark attendance | P | Class teacher can mark [WF]; **any** mentor can overwrite any classroom (referred to security) |
| Add term result | **B** | Every new result → 500: insert uses a `createdBy` column missing from the real `results` table [WF][CODE `resultController.js:68-71`][DB] |
| Course announcements | W | Enrolled students see them, non-enrolled do not [WF] |
| Fee monitoring + reminders | P | Real balances and secure reminders in new code [WF]; not live; bulk reporting misleading [CODE] |
| Assignments (descriptive, PDF) | NV | Module tests need Node ≥ 22.5; machine runs Node 18 |

### Admin

| Feature | Status | Evidence / note |
|---|---|---|
| Dashboard | P | Counts correct per query [WF]; disagree with other screens (§6) |
| Users | P | List correct [BR-12]; Admins count blank [BR-12] |
| Classrooms (create, assign) | W | [WF]; live card counts include deleted users [DB] |
| Create course | P | API works incl. mentor list [WF]; browser page got 403 on the mentor list on 12 Oct [BR-12] — page/token issue, cause NV |
| Fee structure | W | Create works and flows to the student fee source [WF] |
| Mentor approval | **B** | All mentors shown "Pending": API omits `isApproved` [WF][CODE `adminController.js:358`] |
| Analytics | **B** | Page expects `{users, courses, certificates}`, API returns a per-teacher array → all zeros [WF][CODE `Analytics.jsx:53-66`] |
| Announcements | P | Publishing works [WF]; empty state shows raw key [BR-12] |
| Database export | P | Works; access concerns referred to security |

### Accountant

| Feature | Status | Evidence / note |
|---|---|---|
| Dashboard | P | Real fee total; cross-university figures on old server [BR-12] |
| Fee collection (offline) | W | [WF] (disposable DB only) |
| Legacy reconciliation | P | Fixed in code; on 12 Oct it returned 500 [BR-12]; post-fix browser NV |
| Fee monitoring | P | Real data in new code [WF]; not live |
| Reports & export | P | Fabricated data removed in code [WF]; not live; Funds & Grants has no source (M) |
| Payment history page | **B** | Static placeholder, no API call [CODE `PaymentHistory_temp.jsx`] although `/api/accountant/payments` now works [WF] |
| Vendor invoices / expenses | P | Invoices list real [BR-12]; `/api/accountant/expenses` deliberately 501 (no consumer) |

### SuperAdmin, Storekeeper, Vendor

| Role | Status | Note |
|---|---|---|
| SuperAdmin | NV | No session; login design referred to security |
| Storekeeper | NV | Pages exist (`/storekeeper/*`); not exercised |
| Vendor | NV | Vendor login exists in code; portal not exercised |

---

## 4. End-to-end workflow results [WF]

Each workflow ran against the real route code with disposable records.

| # | Workflow | Result | Failing step(s) |
|---|---|---|---|
| W1 | Admin creates classroom (teacher + students) → admin list → student sees classroom | **3/4** | Student's classroom list is empty (bug B-01) |
| W2 | Admin creates course (mentor + classroom) → mentor, students, classroom view, dashboard | **7/7** | — (students auto-enrolled from classroom at creation) |
| W3 | Announcements: admin → students; mentor → course; read state; isolation | **8/9** | A *student* can create an announcement (security referral S-01) |
| W4 | Attendance: class teacher marks → student sees | **2/3** | A non-class-teacher mentor can overwrite (security referral S-02) |
| W5 | Teacher adds term result → student Results | **0/2** | Insert fails 500 (bug B-02) |
| W6 | Teacher test: create → question → publish → attempt → answer → submit → score → teacher report → Results page | **10/10** | — |
| W7 | Fees: admin structure → student balance → offline collection → student history → accountant payments → fee stats → fee monitoring → reminder (fake email) → student sees reminder | **11/11** | — *(new code; not live until restart)* |
| W8 | Certificates list; admin Analytics data; mentor approval data | **0/3** | B-03, B-06, B-07 |
| | **Total** | **40/48** | |

Harness limits:
- **Payments:** online payment (Razorpay) was not exercised, by design.
- **Email:** faked; no real email sent.
- **AI:** provider faked, so AI generation was not tested.
- **Courses:** students added to a classroom *after* a course exists were not tested.

---

## 5. Notification audit

| Check | Result | Evidence |
|---|---|---|
| Admin announcement reaches only the chosen audience (students vs mentors) | PASS | [WF] |
| Other university's students do not see it | PASS | [WF] |
| Mentor course announcement reaches only enrolled students | PASS | [WF] |
| Read/unread is per user (`readBy` list); bell computes unread from it | PASS | [WF][CODE `AnnouncementBell.jsx:39-50`] |
| Real-time push (new announcement appears without reload) | **FAIL** | The socket is created with `io({ url: SOCKET_URL, ... })` (`auth.jsx:80-81`); the bell uses the same pattern (`AnnouncementBell.jsx:187`). As I read socket.io-client, it takes the server URL as its first argument and ignores `url` inside the options, so the client connects to the page's own origin (Vite, port 5173); the browser logged 160+ failed `ws://localhost:5173/socket.io` attempts in minutes [BR-12][CODE]. The active announcement controller also emits no socket event (only the `-backup` copy does) [CODE] |
| Fee reminder: only to students with real outstanding dues, server-calculated amount, one per 24 h, targeted | PASS (new code) | [WF] + Phase 1B suite |
| Fee reminder delivery feedback (sent / email not configured / failed) | PASS backend; **FAIL** frontend bulk | Bulk action counts email failures as "sent" and labels 401/403/5xx as "skipped (reminded recently…)" [CODE `ClassFeeStatus.jsx:106-113`] |
| Legacy untargeted "Fee Payment Reminder" notices | **RISK** | Shown to any student whose name matches "Dear \<name\>," (`announcementController.js:139`); 4 such rows live [DB] |
| Who can create announcements | **FAIL** (referred) | Students can post (200) [WF] |
| Email for announcements | MISSING | Only fee reminders send email |

---

## 6. Data consistency findings

| ID | Mismatch | Root cause | Evidence |
|---|---|---|---|
| D-1 | Students 14 (admin dashboard) vs 7 (sum of classroom cards) vs 3 (classroom detail) | Cards show a stored `studentCount` that still includes 2 assignments to deleted users; only 5 of 14 students are in any classroom | [DB][CODE `Classrooms.jsx:152`] |
| D-2 | Courses 2 (admin) vs 13 (student) | Student 30 has 13 enrolment rows, all for university 15's courses; the student-course query has no university filter | [DB][CODE `course-controller.js:382-393`] |
| D-3 | Fee ₹12,100 (total) vs ₹8,050 (breakdown) | Breakdown rows fall back to hard-coded amounts because the API returns no line items; the page's own default total is also ₹8,050 | [CODE `PayFees.jsx:50-57, 161-162, 626-651`] |
| D-4 | Accountant reports showed ₹20,000 / ₹9,10,000 / ₹95,500 | Mock fallbacks — **removed in code today, not live** | [BR-12][CODE][WF] |
| D-5 | Accountant payment history "No Payments Yet" with 2 payments in DB | Page is a static placeholder | [CODE][DB] |
| D-6 | Mentors "Pending 3" vs dashboard "Pending 0" | API omits `isApproved`; page treats missing as pending | [WF][CODE][DB] |
| D-7 | Admin Analytics all zeros | Response-shape mismatch | [WF] |
| D-8 | Student results/attendance from classrooms they are not in | Live rows reference other classrooms, some in another university | [DB] |
| D-9 | Fee structure 916: total ₹8,050 but components sum to ₹8,500 | Data entry inconsistency, no server validation | [DB] |
| D-10 | Core5 Academy has no fee structure; its students were shown university 1's | Fixed in code (now "Fee Not Configured"); needs Core5's admin to create one | [DB][WF] |

---

## 7. UI/UX issues

| ID | Screen | Steps to reproduce | Expected | Actual | Evidence |
|---|---|---|---|---|---|
| U-1 | Accountant sidebar & header | Log in as accountant | "Legacy Reconciliation" | `legacy_reconciliation` | [BR-12] |
| U-2 | Admin → Announcements (empty) | Open with no announcements | Friendly empty state | `no_announcements_available` | [BR-12] |
| U-3 | Student → Certificates | Open page | Error message or real list | API 500; page shows "Enrolled Courses 0 / Progress 0%" | [BR-12][WF] |
| U-4 | Student → Timetable | Open as an assigned student | Their classroom timetable | "You are not assigned to any classroom yet" | [BR-12][WF] |
| U-5 | Student → Subscription | Open page | Plan details | "Unable to load subscription" (404 on `/api/api/...`) | [BR-12] |
| U-6 | Student → Course page | Open a course | Consistent progress | "0/0 chapters" with 25%; past live classes offer "Join" | [BR-12] |
| U-7 | Accountant → Payment History | Open page | Payment list | "No Payments Yet" always | [CODE] |
| U-8 | Admin → Analytics | Open page | Real statistics | All zeros | [BR-12][WF] |
| U-9 | Fee monitoring → Notify all | Click with mixed outcomes | Accurate sent / failed / skipped counts | Failures counted as sent; auth/server errors labelled "skipped" | [CODE] |
| U-10 | Single reminder with email failure | Send when email fails | Warning-style message | Green success toast with "could not be sent" text | [CODE] |
| U-11 | Several screens | Compare dates | One format | `4/30/2026`, `30/04/2026`, `2026-01-31` | [BR-12] |
| U-12 | Classroom names | Admin/student views | "Grade 12 – BCA-A" | "Grade 12 - BCA-A - BCA-A" | [BR-12] |
| U-13 | All pages | Watch console | Quiet | Continuous socket reconnect warnings | [BR-12] |
| U-14 | Fee reminder email | Receive email | Link to the real site | "Pay now" points to `http://localhost:5173` | [CODE `feeReminderEmail.js`] |

---

## 8. Prioritized bug list

| ID | Sev | Title | Roles | Impact | Recommended fix | Evidence |
|---|---|---|---|---|---|---|
| B-01 | **High** | Students get no classrooms | Student | Timetable, dashboard classroom info empty | Use `req.user.userId` in `getStudentClassrooms` | [WF][CODE][BR-12] |
| B-02 | **High** | Adding a term result always fails | Mentor, Student | Manual results impossible | Remove `createdBy` from the insert, or add the column via an approved migration | [WF][CODE][DB] |
| B-03 | **High** | Certificates 500 | Student | Feature unusable; misleading zeros | Rewrite controller for SQLite; show error state | [WF][CODE] |
| B-04 | **High** | Accountant payment history is a placeholder | Accountant | Cannot review payments in the UI | Wire page to `/api/accountant/payments` | [CODE][WF] |
| B-05 | **High** | Fixes for fabricated finance data and reminders not live | Accountant, Mentor, Student | Old behaviour still served | Controlled backend restart (see Phase 1B review) | process start time vs file times |
| B-06 | Medium | Admin Analytics wrong data | Admin | Zero dashboards | Dedicated analytics endpoint matching the page | [WF][CODE] |
| B-07 | Medium | Mentor approval shows all pending | Admin | Wrong approval state | Return `isApproved` | [WF][CODE] |
| B-08 | Medium | Real-time notifications never connect | All | No live updates; console noise | `io(SOCKET_URL, {...})`; emit on announcement create | [BR-12][CODE] |
| B-09 | Medium | Student fee breakdown hard-coded | Student | Wrong itemised amounts | Return fee components from API; remove defaults | [CODE] |
| B-10 | Medium | Classroom card counts stale | Admin | Wrong class sizes | Compute count from assignments of existing users | [DB][CODE] |
| B-11 | Medium | Cross-university enrolment/result/attendance rows | Student | Students see other schools' content | Data review (approval); filter student course query by university | [DB][CODE] |
| B-12 | Medium | Bulk reminder reporting misleading | Mentor, Accountant | Staff think emails went out | Count by `emailStatus`; distinguish error classes | [CODE] |
| B-13 | Medium | Subscription page 404 (`/api/api`) | Student | Page unusable | Fix URL | [BR-12] |
| B-14 | Low | Raw translation keys | Accountant, Admin | Unprofessional | Add translations | [BR-12][CODE] |
| B-15 | Low | Inconsistent dates and duplicated classroom names | All | Confusing | Shared formatter | [BR-12] |
| B-16 | Low | `*_temp` components, 97 alerts, 388 console logs | All | Maintainability, noise | Clean-up pass | [CODE] |
| B-17 | Low | Reminder email link hard-coded to localhost | Student | Broken link in production | Use configured site URL | [CODE] |

**Referred to security (not scored, blocking or affecting product workflows)**

| ID | Issue | Evidence |
|---|---|---|
| S-01 | Any logged-in student can create announcements (`POST /api/announcements` → 200) | [WF] |
| S-02 | Any mentor can overwrite attendance for any classroom | [WF] |
| S-03 | `POST /api/accountant/download-invoice` lets any logged-in user generate a "PAID" receipt from request values | [CODE] |
| S-04 | Earlier audit items (SuperAdmin token, export access, guest pass-through, results/attendance read access) | previous reports |

---

## 9. Top 10 recommended product improvements

1. **Controlled backend restart** to make today's fee, report and reminder fixes live, followed by a browser re-check with all roles.
2. **Fix the three one-line/one-column breakages:** student classrooms (B-01), term results (B-02), mentor approval field (B-07).
3. **Wire the accountant Payment History page** to the existing payments API (B-04).
4. **Rebuild Certificates** on the SQLite data model, with an honest error state (B-03).
5. **One source of truth for counts:** computed classroom sizes, university-filtered course lists, an analytics endpoint shaped for the page (B-06, B-10, B-11).
6. **Show real fee line items** on the student fee page; remove every hard-coded fee default (B-09).
7. **Fix real-time notifications** (socket URL plus server emits), and add an unread count and "mark all read" (B-08).
8. **Honest feedback everywhere:** replace `alert()`s with consistent toasts; correct the bulk reminder summary (B-12, U-10).
9. **Data clean-up decisions** with the school: cross-university enrolments and results, orphaned classroom assignments, fee structure 916, the 4 untargeted reminders, and Core5's fee structure.
10. **UI polish and QA tooling:** translations, one date format, remove `*_temp` and debug logging, plus a client test runner with Node 22 available so the assessment module's own suite can run.

---

## 10. Testing coverage

| Area | Browser | Workflow harness | Code | Notes |
|---|---|---|---|---|
| Student portal | 12 Oct (old server) | Yes | Yes | No live session today |
| Admin portal | 12 Oct (old server) | Yes | Yes | |
| Accountant portal | 12 Oct (old server) | Yes | Yes | Reports/fee monitoring changed since 12 Oct — browser evidence stale |
| Mentor portal | **No** | Yes (API) | Partial | NV in UI |
| SuperAdmin | **No** | No | Security only | NV |
| Storekeeper / Vendor | **No** | No | No | NV |
| Online payments (Razorpay) | No | No | No | Excluded by design |
| Real email delivery | No | Faked | Yes | Excluded by design |
| AI generation / reports | No | Faked provider | Partial | NV |
| Assessment module's own test suite | — | — | — | Requires Node ≥ 22.5; machine has Node 18 → NV |
| Responsive / accessibility (beyond `alt`) | No | — | Partial | NV |
| Assignments (PDF upload/evaluation) | Partial (list) | No | No | NV |

**Untested and why:**
- **No live portal sessions today:** the controlled browser lost its logins in the 10:32 restart, so every portal screen is browser-evidenced only as of 12 Oct.
- **Old backend still running:** it predates today's changes.
- **Write operations** were done only in disposable databases.

---

## 11. Confirmed findings vs assumptions

**Confirmed by running code (harness, disposable DB):**
B-01, B-02, B-03, B-06, B-07; S-01, S-02; all working items marked [WF].

**Confirmed by reading code:**
B-04, B-09, B-12, B-14, B-16, B-17; the socket misconfiguration (B-08); the legacy reminder name-matching rule.

**Confirmed by live database (read-only):**
D-1, D-2, D-8, D-9, D-10; 4 untargeted reminders.

**Observed in browser on 12 Oct (old server):**
U-1 to U-6, U-8, U-11 to U-13, B-13; dashboard mismatches.

**Inferences, not demonstrated:**
- That the Create Course page's 403 (12 Oct) comes from the page's token handling. The API itself works [WF].
- The bell (`AnnouncementBell.jsx:187`) uses the same `io({...})` call pattern as `auth.jsx`, which I confirmed; the claim that both ignore `url` rests on my reading of socket.io-client.
- That cross-university enrolment rows came from an earlier data import or tool. The origin is unknown.

**Not verified:** everything marked NV above, including Mentor/SuperAdmin/Storekeeper/Vendor UIs, responsive behaviour, AI features, online payments and real email.

---

*Method note: the workflow harness and the cross-process experiment ran from a scratch directory outside the project. They substituted every database module (including `config/sqlite-db`) and the email service before loading any route. Each run confirmed the live database file was not written. No project file other than this report was created or changed. No service was restarted, and no email, payment or live record was created.*
