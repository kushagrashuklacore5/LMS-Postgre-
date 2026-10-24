# LMS Feature Completion Plan

**Companion to** [LMS_PRODUCT_AUDIT.md](LMS_PRODUCT_AUDIT.md). The audit says what is wrong; this document says what each feature must become to be complete, and how to verify it.
**Date:** 5 October 2026
**Status:** proposal for review. Nothing here has been implemented. No major workflow change should start until its entry is approved.
**Out of scope:** security testing, which is a later dedicated phase. Where a change here depends on a security fix from the audit, it is listed under Dependencies only.

## Completeness rule used

A feature is complete only when its whole lifecycle works: it can be created, it reaches the right people, they can act on it, the outcome is recorded once, and the outcome appears wherever someone needs it. "The page exists and saves" is not complete.

## Decision labels

KEEP AS-IS · FIX · COMPLETE · RECONNECT · REBUILD · SIMPLIFY · MERGE · RETIRE · PARK · NEW FEATURE

---

## 1. Visible walkthrough results (5 October 2026)

These checks were run in a visible Chrome window against the local system, clicking through the real pages as a mentor (rishi), an admin, and two students of the same school. Sessions were signed locally rather than typed into the login form. Database rows were read afterwards to confirm what the screens showed.

| # | Check | Result | What was seen |
| --- | --- | --- | --- |
| A1 | Mentor creates a draft test | PASS | "Draft created"; class "Grade 12 - B" selected |
| A2 | Mentor adds two questions | PASS | Questions (2) |
| A3 | Mentor publishes to the whole class | PASS | "Published to the whole class", 1 recipient |
| A4 | Student dashboard shows the new test | **GAP** | Test title absent from the dashboard |
| A5 | Student is notified | **GAP** | No notification list exists |
| A6 | Student finds the test under My Tests | PASS | Row with subject, class, 2 questions, 5 min, Start |
| A7 | Student starts the timed attempt | PASS | Timer running, 2 questions |
| A8 | Student submits and sees the score | PASS | 1/2 (50%), as expected |
| A9 | Score appears on student Results page | **GAP** | "No results yet" |
| A10 | Score appears on student dashboard | **GAP** | Absent |
| A11 | Score appears in mentor Class Results | **GAP** | Student row shows "Not assigned" |
| A12 | Mentor sees the attempt in the test report | PASS | Submitted, 1/2, 50%, time taken 10 s |
| A13 | Database after the attempt | INFO | Attempt stored in the test tables; 0 rows written to results or progress |
| B1 | Mentor creates a course | PASS | "Course created successfully" |
| B2 | Course has an audience | **GAP** | Course saved with no classroom; the mentor form has no class field |
| B3 | Class student sees the course | **GAP** | Not shown; nobody is enrolled |
| B4 | Admin adds a late joiner to the class | PASS | Class count went from 1 to 2 |
| B5 | Late joiner sees the class's course | **GAP** | Not enrolled (inconclusive for class-linked courses, see note) |
| B6 | Late joiner sees a test already published to the whole class | PASS | Test row visible with Start |
| C1 | Mentor attendance page loads the roster | PASS | Class students listed |
| C2 | Student attendance shows a summary | PASS | Present, Absent, Attendance percentage |
| C3 | Announcements reachable from student sidebar | **GAP** | No sidebar entry on that page |
| C4 | Certificates page | **GAP** | Shows "No certificates yet" while its data request fails |
| D1 | Imported students are in a class | **GAP** | Only 1 of the 10 imported students was placed in a classroom |
| D2 | Class card count matches membership | PASS | 2 and 2 |

Notes on reading these results:

- **B5** does not prove the late-joiner defect for a course that is linked to a classroom, because the course made in B1 had no classroom. That defect is confirmed by reading the code (enrollment is copied once, at creation) but still needs a live test with a class-linked course.
- **B1 side effect:** the test script selected the placeholder option of the "Assign Students" dropdown, and the server saved an enrollment row whose student id is the text `Assign Students`. A person would not normally pick that option, but the server accepted a non-existent student without complaint.
- **D1:** the import matches a student's class by grade and section, and creates the student without a class when nothing matches. That is the most likely reason nine students have no classroom (this school has a single classroom, "Grade 12 - B"), but the cause was inferred from the code, not observed: the import itself was not run during this walkthrough, and whether its screen reported the unplaced students is unknown.
- **Test records left in the local database:** one test "AUDIT Test 78285" with one attempt; one course "AUDIT Course" (id 19) with the bad enrollment row; student Ananya Verma added to classroom 9. A backup taken just before the tests is at `server/data/backups/lms_permanent.before-functional-test-20261005-161942.db`.

---

## 2. Decision summary

| # | Feature | Decision | One-line reason |
| --- | --- | --- | --- |
| 1 | Course creation and audience | REBUILD | A course can be saved with no class, no students and no content, so it reaches nobody. |
| 2 | Enrollment | REBUILD | A one-time copy of the class list cannot follow students who join later. |
| 3 | Course content (weeks, chapters, materials) | COMPLETE | Works, but there is no draft state and materials do not count toward progress. |
| 4 | Tests (assessment module) | RECONNECT | The best-built feature; the score stops inside the module. |
| 5 | Legacy course assessments | RETIRE (merge into 4) | A second, weaker test system with unenforced deadlines. |
| 6 | Descriptive assignments | RECONNECT | Good lifecycle; marks do not leave the module and students cannot find it. |
| 7 | Term results | REBUILD as gradebook | Fully manual retyping of marks the system already has. |
| 8 | Student progress | RECONNECT | Counts chapter ticks only; ignores tests, assignments and materials. |
| 9 | Attendance | COMPLETE | Marking and the student view work; staff get no summary or defaulter list. |
| 10 | Announcements | COMPLETE | Posting works; students have no menu entry and no unread indication. |
| 11 | Notifications and upcoming work | NEW FEATURE | Nothing tells a student that work was set or marks were released. |
| 12 | Student dashboard | FIX and RECONNECT | Calls a missing endpoint and shows nothing about pending work. |
| 13 | Student import and activation | COMPLETE | Import is strong; class placement and first login are not finished. |
| 14 | Classrooms and academic session | REBUILD | No year or semester; the product cannot roll over. |
| 15 | User management | COMPLETE | Only hard delete; no inactive state. |
| 16 | Navigation | FIX | Built pages are missing from menus. |
| 17 | AI question generation and review | KEEP AS-IS | Works end to end with teacher review. |
| 18 | AI performance reports | KEEP AS-IS | Useful, explicit share step; revisit after the gradebook exists. |
| 19 | Calendar | SIMPLIFY and RECONNECT | Manual events only; due dates should appear without retyping. |
| 20 | Live classes | SIMPLIFY | Keep as a meeting link on a date. Do not build video. |
| 21 | Timetable | KEEP AS-IS | An uploaded timetable is enough. |
| 22 | Certificates | PARK | Broken and low value until courses have real completion. |
| 23 | Self-registration and mentor approval | RETIRE | Accounts should come from import or the admin. |
| 24 | Database export page | RETIRE | Broken; replace later with specific reports. |
| 25 | Fees, accountant, storekeeper, vendor, requirements | PARK | Not LMS; lowest quality; blocks nothing academic. |
| 26 | Subscription and plan gating | SIMPLIFY | One plan per school with a few server-side limits. |
| 27 | Translation (Arabic, Urdu) | PARK | Costly and visibly incomplete; restore only for a signed customer. |

**Build order implied by dependencies:** 14 → 1 and 2 → 3 → 4, 5, 6 → 7 → 8 → 11 → 12, with 9, 10, 13, 15 and 16 able to proceed in parallel.

---

## 3. Feature plans

### 3.1 Course creation and audience — REBUILD

**CURRENT IMPLEMENTATION:** One form. The mentor form asks for title, category, duration, mentor, an optional single student and a description. The admin form additionally assigns a mentor and students. The course table has no status. A classroom link exists in the database and API but the mentor form does not offer it.

**CURRENT USER FLOW:** Mentor opens Create Course from the dashboard → fills the form → saves → course exists.

**PROBLEM:** The saved course had no classroom and no students (walkthrough B1 to B3). No student could see it. There is no step that says who the course is for, and no difference between a course being prepared and one being taught.

**WHY IT DOES NOT MAKE SENSE:** A course with no audience is a private note. The teacher believes they have set up their subject; the class sees nothing and nobody is told why.

**RECOMMENDED IMPLEMENTATION:** A course offering is a course taught to one section by one teacher in one academic session. Creating one requires the section. It starts as Draft, becomes Published, and ends as Archived. Publishing is refused until a teacher, a section and at least one content item or activity exist.

**RECOMMENDED USER FLOW:**
1. Teacher or admin chooses New Course.
2. Enters title and description, picks the section (required) and the teacher.
3. Saves as Draft. Only staff can see it.
4. Adds content and activities.
5. Presses Publish. A checklist shows anything missing.
6. Students of the section see it under My Courses.
7. At session end the admin archives it; it becomes read-only history.

**AUTOMATIC DOWNSTREAM EFFECTS:** On publish: the course appears in My Courses for the section, and each student gets one notification. On archive: it leaves active lists and its activities close. No dashboard or gradebook effect at creation.

**ALTERNATIVE OPTIONS:**
- Option A: one offering per section, as above.
- Option B: one course shared by several sections, with per-section settings.

**RECOMMENDATION:** Option A.

**REASON:** Students and teachers think in "my class's subject". One section per offering keeps enrollment, gradebook and reports unambiguous, and needs no per-section override screens. A teacher who teaches two sections duplicates the course with a "copy to another section" action, which is simpler to build and to explain than shared courses. It scales by adding rows, not rules.

**DEPENDENCIES:** 3.14 (sections and sessions), 3.2 (enrollment).

**IMPLEMENTATION SCOPE:** `courses` table (status, section, session), course create and update API, mentor and admin create pages merged into one, course list pages for all three roles, publish validation service.

**TEST CASES:**
- A draft course is invisible to students of its section.
- Publish with no section, no teacher or no content is refused with a specific message.
- After publish, every current student of the section sees the course.
- An archived course is visible read-only and accepts no new activity.
- "Copy to another section" creates an independent draft.

**REGRESSION IMPACT:** Student My Courses, mentor dashboard course list, assign-students page, course materials, legacy assessments, live classes, calendar events and announcements that refer to a course.

### 3.2 Enrollment — REBUILD

**CURRENT IMPLEMENTATION:** A `course_students` table. If a course is created with a classroom through the API, the classroom's students at that moment are copied in. A separate page replaces the whole list by hand.

**CURRENT USER FLOW:** Mentor opens Assign Students → ticks students → saves, which deletes the old list and writes the new one.

**PROBLEM:** A student who joins the class later is not enrolled, and no one is prompted to fix it. The server also accepts a student id that does not exist (walkthrough B1 note).

**WHY IT DOES NOT MAKE SENSE:** Joining a class after the first week is routine. A system that needs a manual fix for every such student, in every course, will be wrong most of the time.

**RECOMMENDED IMPLEMENTATION:** Enrollment is derived, not copied. A student is in a course offering if they are an active member of its section, unless explicitly excluded; a student from elsewhere can be explicitly added. Only the exceptions are stored.

**RECOMMENDED USER FLOW:**
1. Admin adds a student to a section.
2. The student immediately sees every published course and every open whole-class activity of that section.
3. For an elective or a repeat, the teacher uses "Add student" or "Remove student" on the course, which records an exception.

**AUTOMATIC DOWNSTREAM EFFECTS:** On joining a section: courses appear, open tests and assignments appear in upcoming work, the student appears in the gradebook with blank cells. On leaving: the student leaves active rosters; past scores remain.

**ALTERNATIVE OPTIONS:**
- Option A: derived membership with stored exceptions.
- Option B: keep the copied list and re-copy whenever class membership changes.

**RECOMMENDATION:** Option A.

**REASON:** Option B needs every membership change to remember to update every course and fails silently when one path is missed, which is today's defect in a different place. Option A cannot drift. The assessment module already behaves this way for whole-class tests (walkthrough B6 passed), so students and teachers see one consistent rule.

**DEPENDENCIES:** 3.1, 3.14.

**IMPLEMENTATION SCOPE:** Enrollment query used by courses, tests, assignments, gradebook; an exceptions table replacing `course_students`; Assign Students page reduced to add and remove; validation that every id is a student of the school.

**TEST CASES:**
- Late joiner sees existing published courses and open whole-class activities.
- A removed student no longer appears on new mark sheets; earlier scores are kept.
- An explicitly added outside student sees the course and nothing else of that section.
- Submitting a non-existent or other-school student id is refused.

**REGRESSION IMPACT:** My Courses, mentor progress, test recipients, assignment recipients, announcements addressed to a course, live class audience.

### 3.3 Course content — COMPLETE

**CURRENT IMPLEMENTATION:** Weeks, chapters and materials (file or link) per course. Students mark chapters complete in order.

**CURRENT USER FLOW:** Mentor adds weeks → adds chapters and uploads materials → students open them.

**PROBLEM:** Content is live the moment it is saved. Opening a material is not recorded. Weeks and chapters overlap as two ways to structure the same thing.

**WHY IT DOES NOT MAKE SENSE:** Teachers cannot prepare ahead without students watching the work in progress, and "progress" ignores the reading and video material that makes up most of a course.

**RECOMMENDED IMPLEMENTATION:** One structure: a course has units (today's weeks), a unit has items (a material, a link, a test, an assignment). Each item has a visible or hidden flag. Opening a material marks it viewed for that student.

**RECOMMENDED USER FLOW:**
1. Teacher adds a unit and its items, hidden by default while the course is a draft.
2. Teacher reveals a unit when ready.
3. Student opens items; viewed items show a tick.

**AUTOMATIC DOWNSTREAM EFFECTS:** Progress update when an item is viewed. No notification for each uploaded file (that would be noise); one notification when a unit is revealed.

**ALTERNATIVE OPTIONS:**
- Option A: merge weeks and chapters into units and items.
- Option B: keep both and add visibility flags to each.

**RECOMMENDATION:** Option A.

**REASON:** One structure is easier for teachers to learn and halves the screens and tests. Chapters currently hold no data in the local system, so the merge is cheap now and expensive later.

**DEPENDENCIES:** 3.1, 3.8.

**IMPLEMENTATION SCOPE:** `weeks`, `chapters`, `course_materials`, `progress`; course builder page; student course viewer; material upload API.

**TEST CASES:**
- Hidden units and items are invisible to students.
- Opening a material records a single viewed mark, however many times it is opened.
- Deleting an item removes it from progress totals.

**REGRESSION IMPACT:** Student course viewer, mentor progress, certificate eligibility, materials upload limits.

**DO NOT EXPAND:** release schedules by date, prerequisites between items, SCORM packages, in-app video hosting. None is needed to run a class.

### 3.4 Tests (assessment module) — RECONNECT

**CURRENT IMPLEMENTATION:** Manual or AI-drafted questions (single answer, multiple select, numerical), draft and publish, whole class or selected students, optional open and close window, one timed attempt with autosave, automatic scoring, teacher report, attempt reset.

**CURRENT USER FLOW:** Teacher creates and publishes → student opens My Tests → attempts → sees score → teacher opens the report inside the test.

**PROBLEM:** Everything up to the score works (walkthrough A1 to A8, A12). The score then goes nowhere: not to the student's Results page, not to the dashboard, not to Class Results (A9 to A11, A13). The student is not told the test exists (A4, A5). The test belongs to a classroom, not to a course.

**WHY IT DOES NOT MAKE SENSE:** The system knows the mark and still makes the teacher type it again elsewhere, and makes the student guess that a test has been set.

**RECOMMENDED IMPLEMENTATION:** A test is an activity of a course offering. On publish it joins the course's activity list and each recipient's upcoming work. When an attempt is finalised the score is written to the course gradebook. Lifecycle stays as it is.

**RECOMMENDED USER FLOW:**
1. Teacher opens a course → Add test → writes or generates questions → reviews.
2. Sets maximum marks, optional window, recipients (default: whole section) → Publish.
3. Student sees it on the dashboard under upcoming work and in the course.
4. Student attempts and sees the score.
5. The score is already in the gradebook and on the student's results page.

**AUTOMATIC DOWNSTREAM EFFECTS:** On publish: upcoming work entry and one notification per recipient. On finalised attempt: gradebook cell, student results, progress for that item. On reset: the gradebook cell clears. Not recommended: an announcement per test, or email by default.

**ALTERNATIVE OPTIONS:**
- Option A: tests belong to a course offering.
- Option B: tests stay classroom-level and the teacher picks a "subject" label used for grouping.

**RECOMMENDATION:** Option A.

**REASON:** With Option B the gradebook must match free-text subject names, which fails on the first spelling difference. Option A gives one place per subject for students, removes the teacher's retyping, and makes reports a simple query.

**DEPENDENCIES:** 3.1, 3.2, 3.7, 3.11.

**IMPLEMENTATION SCOPE:** `aia_assessments` (course link, maximum marks), publish and finalise services in the assessment module, teacher test pages moved inside the course, student My Tests, gradebook writer.

**TEST CASES:**
- Published test appears in the course, on the student dashboard and in My Tests for every recipient.
- Finalised attempt writes exactly one gradebook cell with the right score.
- Auto-submit at the deadline also writes the score.
- Reset clears the cell and lets the student retake.
- A student not among the recipients sees nothing and has no gradebook cell.
- Unpublish before any attempt removes it from upcoming work.

**REGRESSION IMPACT:** All existing assessment-module behaviour (it has its own automated tests), student results page, mentor class results, performance reports.

**DO NOT EXPAND:** question banks, randomised papers, negative marking, proctoring.

### 3.5 Legacy course assessments — RETIRE (merge into 3.4)

**CURRENT IMPLEMENTATION:** An older test feature attached to a course, with start time, end time and timer, its own question and attempt tables and its own pages.

**CURRENT USER FLOW:** Mentor creates an assessment from the dashboard → adds questions → publishes → student opens it from the course page.

**PROBLEM:** It duplicates 3.4 with fewer safeguards: the start and end times are shown but not enforced when a student submits, and questions can be changed after students have attempted.

**WHY IT DOES NOT MAKE SENSE:** Two test systems means two places to look, two sets of scores and twice the testing, for no extra capability.

**RECOMMENDED IMPLEMENTATION:** Remove the legacy pages and endpoints. Move the seven existing legacy assessments into the assessment module as drafts for their owners to review.

**RECOMMENDED USER FLOW:** Teachers use Add test inside a course (3.4). Nothing else.

**AUTOMATIC DOWNSTREAM EFFECTS:** None beyond 3.4.

**ALTERNATIVE OPTIONS:**
- Option A: retire and migrate.
- Option B: keep both and fix the legacy one.

**RECOMMENDATION:** Option A.

**REASON:** Fixing the legacy flow means rebuilding what the assessment module already does well. Removing it reduces what students must learn and what the team must maintain.

**DEPENDENCIES:** 3.4 linked to courses first.

**IMPLEMENTATION SCOPE:** `assessments`, `assessment_questions`, `assessment_attempts`; legacy create, design and attempt pages; a one-time migration script.

**TEST CASES:**
- Every legacy assessment exists as a draft test with the same questions and correct answers.
- Past legacy attempts remain viewable as history or are exported before removal (decision needed).
- No menu or link leads to a removed page.

**REGRESSION IMPACT:** Student course viewer, mentor dashboard buttons, progress entries of type assessment.

### 3.6 Descriptive assignments — RECONNECT

**CURRENT IMPLEMENTATION:** Teacher creates an assignment for a classroom with questions and marks, optional due date; students upload one PDF and may replace it until the due date; teacher marks by hand or asks for AI-suggested marks and confirms them.

**CURRENT USER FLOW:** Teacher: AI Assessments → Descriptive Assignments → create → publish → open submissions → mark. Student: must know the page address.

**PROBLEM:** Students have no menu entry to reach assignments. Confirmed marks stay in the module. Teachers have no single list of what is waiting to be marked.

**WHY IT DOES NOT MAKE SENSE:** An assignment the class cannot find will not be submitted, and marks that must be retyped defeat the point of marking online.

**RECOMMENDED IMPLEMENTATION:** Same pattern as tests: an activity of a course offering, shown in upcoming work with its due date; confirmed marks written to the gradebook; a "To mark" list for the teacher across all their courses. After the due date, uploads are accepted and flagged late until the teacher closes the assignment.

**RECOMMENDED USER FLOW:**
1. Teacher adds an assignment in a course with due date and marks → Publish.
2. Student sees it under upcoming work → uploads the PDF.
3. Teacher opens To mark → reviews, optionally uses AI suggestions → confirms marks and feedback.
4. Student is notified and sees marks and feedback; the gradebook is already updated.

**AUTOMATIC DOWNSTREAM EFFECTS:** Publish: upcoming work and notification. Submission: appears in the teacher's To mark list. Marks confirmed: gradebook cell, student results, one notification. One reminder 24 hours before the due date to students who have not submitted.

**ALTERNATIVE OPTIONS:**
- Option A: accept late uploads, flagged as late.
- Option B: refuse uploads after the due date.

**RECOMMENDATION:** Option A, with a per-assignment switch to choose B.

**REASON:** Colleges differ on lateness, and a hard cut-off generates support requests and manual workarounds. A visible "late" flag lets the teacher decide without the system losing the work.

**DEPENDENCIES:** 3.1, 3.2, 3.7, 3.11, 3.16.

**IMPLEMENTATION SCOPE:** `aia_assignments` (course link, late policy), submission service, teacher To mark page, student assignment pages and menu, gradebook writer.

**TEST CASES:**
- Assignment appears in upcoming work with the correct due date for each recipient.
- Upload before due is on time; upload after due is flagged late or refused according to the switch.
- AI-suggested marks never reach the student or gradebook until the teacher confirms.
- Confirmed marks create one gradebook cell; editing marks updates it.
- The To mark count falls as submissions are marked.

**REGRESSION IMPACT:** Assessment-module assignment tests, file storage, AI evaluation limits.

**DO NOT EXPAND:** plagiarism detection, group submissions, rubric builders, multiple files, in-browser annotation.

### 3.7 Term results — REBUILD as a course gradebook

**CURRENT IMPLEMENTATION:** A mentor types subject names and marks per student and term. Stored as one text blob per student, class and term.

**CURRENT USER FLOW:** Mentor → Class Results → pick a student → type each subject and mark → save. Student → Results.

**PROBLEM:** Entirely manual and unconnected to any test or assignment (walkthrough A9, A11). Subject names and terms are free text.

**WHY IT DOES NOT MAKE SENSE:** The teacher re-enters marks the system already holds, per student, per subject. Typing errors and mismatches with test scores are certain.

**RECOMMENDED IMPLEMENTATION:** One gradebook per course offering: students down the side, activities across the top. Cells fill automatically from tests and assignments. The teacher can add a manual column for offline work and can override a cell, which is marked as overridden. Each activity has a maximum and an optional weight. A student's term result is the list of their course totals for the session, released by the teacher or admin.

**RECOMMENDED USER FLOW:**
1. Teacher opens a course → Gradebook.
2. Sees automatic scores already present; adds "Unit test (paper)" as a manual column and types those marks.
3. Reviews totals → presses Release results.
4. Students see per-course totals and the breakdown.
5. Admin can lock a session's results.

**AUTOMATIC DOWNSTREAM EFFECTS:** Release: students notified once per course; student results page and dashboard update. Lock: cells become read-only. No effect on attendance.

**ALTERNATIVE OPTIONS:**
- Option A: gradebook per course offering; term result is a roll-up.
- Option B: keep manual term results and add an "import from tests" button.

**RECOMMENDATION:** Option A.

**REASON:** Option B keeps two copies of each mark and relies on someone pressing a button. Option A has one copy, removes retyping for faculty, gives students an explanation of their total, and gives admin a class report for free.

**DEPENDENCIES:** 3.1, 3.2, 3.4, 3.6, 3.14.

**IMPLEMENTATION SCOPE:** New gradebook tables (activity, score, override); teacher gradebook page replacing Class Results and Add Result; student Results page; retirement of the `results` table after migrating its 4 existing rows.

**TEST CASES:**
- A test score and an assignment mark appear in the right cells without manual action.
- A manual column accepts marks up to its maximum and rejects higher.
- An override is shown as overridden and survives a later automatic recalculation.
- Unreleased results are invisible to students; released ones match the teacher's view exactly.
- A locked session rejects edits.
- A late joiner shows blank, not zero, for activities before they joined.

**REGRESSION IMPACT:** Student Results, mentor Class Results, student dashboard, performance reports, any export.

**DO NOT EXPAND:** grade-point averages, credit hours, grading curves, transcript printing. Add only when a customer's exam rules require it.

### 3.8 Student progress — RECONNECT

**CURRENT IMPLEMENTATION:** Students tick chapters complete in strict order; a certificate row is created when all chapters are ticked.

**CURRENT USER FLOW:** Student opens a chapter → presses mark complete.

**PROBLEM:** Progress is self-declared and covers chapters only. Tests taken, assignments submitted and materials read do not count.

**WHY IT DOES NOT MAKE SENSE:** A student can tick every chapter without opening anything, and a student who did all the work but did not press the button shows zero.

**RECOMMENDED IMPLEMENTATION:** Progress is computed: items viewed, tests attempted and assignments submitted, out of the visible items in the course. No manual tick.

**RECOMMENDED USER FLOW:** None. The student works; the percentage moves.

**AUTOMATIC DOWNSTREAM EFFECTS:** Course card and dashboard show the percentage; teacher sees a per-student column in the course.

**ALTERNATIVE OPTIONS:**
- Option A: computed from activity.
- Option B: keep manual ticks and add automatic ones for tests.

**RECOMMENDATION:** Option A.

**REASON:** A computed figure is honest and needs no user action or enforcement rules. It also removes the sequential-lock logic.

**DEPENDENCIES:** 3.3, 3.4, 3.6.

**IMPLEMENTATION SCOPE:** `progress` table and controller, student course viewer, mentor progress page.

**TEST CASES:**
- Viewing an item, attempting a test and submitting an assignment each raise progress once.
- Hiding an item removes it from the denominator.
- Progress never exceeds 100% and never falls when new items are added without recalculating correctly.

**REGRESSION IMPACT:** Certificates, mentor progress view, student dashboard.

### 3.9 Attendance — COMPLETE

**CURRENT IMPLEMENTATION:** A mentor marks each student of a classroom for a date. The student page shows present, absent and a percentage (walkthrough C2).

**CURRENT USER FLOW:** Mentor → Attendance → class and date → mark → save. Student → Attendance.

**PROBLEM:** Staff get nothing back. The class teacher and admin cannot see who is below a required percentage, and a saved day is silently replaced by the next save for that day.

**WHY IT DOES NOT MAKE SENSE:** Colleges record attendance to act on low attendance. Recording without a defaulter view leaves the acting to manual counting.

**RECOMMENDED IMPLEMENTATION:** Keep daily section attendance. Add a per-school minimum percentage, a class summary for the class teacher (each student's percentage for the session, sorted lowest first, those below the minimum highlighted), and the same roll-up for admin by section. Saving a day that is already marked asks to confirm an edit and records who edited.

**RECOMMENDED USER FLOW:**
1. Teacher marks today's attendance.
2. Teacher opens the class summary and sees students below the minimum.
3. Admin opens Attendance overview for all sections.
4. Student sees their percentage and, if below the minimum, a plain warning.

**AUTOMATIC DOWNSTREAM EFFECTS:** Percentages recalculate on save. One notification to a student when they first fall below the minimum in a session. No effect on tests or results.

**ALTERNATIVE OPTIONS:**
- Option A: daily attendance per section.
- Option B: attendance per course or per period.

**RECOMMENDATION:** Option A now.

**REASON:** Period-wise attendance multiplies the teacher's daily effort and requires a timetable engine the product does not have. Option A delivers the defaulter list, which is the business need, at a fraction of the cost. Revisit B only if a customer's regulations require subject-wise attendance.

**DEPENDENCIES:** 3.14 (session boundaries), 3.11.

**IMPLEMENTATION SCOPE:** `attendance` (one row per student, section and date), attendance API, mentor attendance page, new summary pages, student attendance page, school setting for the minimum.

**TEST CASES:**
- Marking a day twice leaves one row per student and records the edit.
- Percentage equals present days divided by marked days for the session.
- A student who joined mid-session is measured from their joining date.
- Students below the minimum appear highlighted for teacher and admin and receive one notification.
- A holiday with no marking does not lower anyone's percentage.

**REGRESSION IMPACT:** Attendance download, student attendance page, admin analytics.

**DO NOT EXPAND:** biometric or QR check-in, parent SMS, leave applications.

### 3.10 Announcements — COMPLETE

**CURRENT IMPLEMENTATION:** Admin or mentor posts a message to a role or a course. Readers are stored as a list on the announcement.

**CURRENT USER FLOW:** Poster → Announcements → write → choose audience → post. Reader → must open the Announcements page, which is not in the student menu (walkthrough C3).

**PROBLEM:** Students cannot reach the page from the menu and cannot tell that something new was posted.

**WHY IT DOES NOT MAKE SENSE:** An announcement nobody is shown is not an announcement.

**RECOMMENDED IMPLEMENTATION:** Add Announcements to every role's menu with an unread count; show the latest unread ones on the dashboard. Audience choices become: whole school, a section, or a course.

**RECOMMENDED USER FLOW:**
1. Teacher posts to their course or section.
2. Students see an unread count and the item on their dashboard.
3. Opening it marks it read.

**AUTOMATIC DOWNSTREAM EFFECTS:** Unread count and dashboard entry. No separate notification, because the unread count is the signal.

**ALTERNATIVE OPTIONS:**
- Option A: unread count on a menu item.
- Option B: also send every announcement by email.

**RECOMMENDATION:** Option A; email as a later opt-in per school.

**REASON:** In-app unread is enough to make announcements seen and adds no delivery cost or spam risk.

**DEPENDENCIES:** 3.16, 3.14.

**IMPLEMENTATION SCOPE:** `announcements` plus a per-user read table, announcement API, menus, dashboards.

**TEST CASES:**
- Only the chosen audience sees the announcement.
- Unread count falls by one when opened and stays down after reload.
- Two readers opening at the same time are both recorded.
- An announcement for an archived course is hidden.

**REGRESSION IMPACT:** Announcement creation and deletion, dashboards.

### 3.11 Notifications and upcoming work — NEW FEATURE

**CURRENT IMPLEMENTATION:** None.

**CURRENT USER FLOW:** Students must check each page to discover new tests, assignments and marks.

**PROBLEM:** Publishing a test produced nothing on the student's dashboard (walkthrough A4, A5).

**WHY IT DOES NOT MAKE SENSE:** Students miss work they did not know existed, and teachers resort to messaging apps to say "check the LMS".

**RECOMMENDED IMPLEMENTATION:** Two small things. (1) Upcoming work: a computed list on the student dashboard of open tests and assignments with due or close dates, not stored. (2) Notifications: one stored row per user for a short fixed list of events, shown under a bell with an unread count.

Events that create a notification: course published, test or assignment published, marks released, due within 24 hours and not done, attendance fell below the minimum. Nothing else.

**RECOMMENDED USER FLOW:**
1. Student logs in and sees "Due soon" with dates.
2. The bell shows new items; pressing one opens the related page.

**AUTOMATIC DOWNSTREAM EFFECTS:** This feature is the downstream effect of others.

**ALTERNATIVE OPTIONS:**
- Option A: in-app only, fixed event list.
- Option B: in-app plus email and push, with per-user preferences.

**RECOMMENDATION:** Option A.

**REASON:** It solves "I did not know" with one table and one query. Preferences, email delivery and push add several screens, external services and failure modes before the basic need is met.

**DEPENDENCIES:** 3.4, 3.6, 3.7, 3.9.

**IMPLEMENTATION SCOPE:** New `notifications` table, a small service the other modules call, bell component, dashboard widget, upcoming-work query.

**TEST CASES:**
- Each listed event creates exactly one notification per affected user.
- Upcoming work lists only open items the student is a recipient of, earliest first, and drops them once done or closed.
- The 24-hour reminder is sent once and not to students who already finished.
- Opening a notification marks it read and goes to the right page.

**REGRESSION IMPACT:** Dashboards, page headers.

**DO NOT BUILD:** activity feed, chat, announcements generated from system events, real-time pop-ups.

### 3.12 Student dashboard — FIX and RECONNECT

**CURRENT IMPLEMENTATION:** A banner and statistics; it requests a results endpoint that does not exist.

**CURRENT USER FLOW:** Student logs in and lands here.

**PROBLEM:** The first screen answers none of a student's questions: what is due, what is new, how am I doing.

**WHY IT DOES NOT MAKE SENSE:** The landing page is the most-viewed screen and currently carries the least information.

**RECOMMENDED IMPLEMENTATION:** Four blocks: Due soon (3.11), New announcements (3.10), My courses with progress (3.8), Recent marks (3.7), plus attendance percentage.

**RECOMMENDED USER FLOW:** Log in → see what needs doing → press an item to go there.

**AUTOMATIC DOWNSTREAM EFFECTS:** None; it only reads.

**ALTERNATIVE OPTIONS:** Option A: fixed four blocks. Option B: configurable widgets.

**RECOMMENDATION:** Option A.

**REASON:** Every student needs the same four answers. Configurable dashboards are a large build that few users touch.

**DEPENDENCIES:** 3.7, 3.8, 3.10, 3.11.

**IMPLEMENTATION SCOPE:** Student dashboard page, one summary endpoint.

**TEST CASES:**
- Each block matches its source page.
- A failed request shows an error with retry, not an empty state.
- A new student with no data sees helpful empty states.

**REGRESSION IMPACT:** Login redirect, student layout.

### 3.13 Student import and activation — COMPLETE

**CURRENT IMPLEMENTATION:** Upload an Excel file; columns are mapped automatically with AI help; the admin reviews, approves and runs the import; extra columns can become custom fields. First-password emails are switched off by default; the admin can set a password for each imported student one at a time.

**CURRENT USER FLOW:** Admin → Import Students → upload → review → approve → import → set each student's password by hand.

**PROBLEM:** Two gaps after a successful import. Nine of ten imported students were not placed in any class because their class value matched no classroom (walkthrough D1). None could log in until an admin set a password for each.

**WHY IT DOES NOT MAKE SENSE:** The import saves the typing and then leaves the admin to place and activate every student individually, which is most of the work.

**RECOMMENDED IMPLEMENTATION:**
- Class placement becomes part of the review. Each distinct class value in the file is shown with its match: an existing section, "create this section", or "choose a section". The import cannot be approved while any class value is unresolved, unless the admin explicitly chooses "import without a class".
- Activation uses one-time set-password links by email, with a status column (sent, opened, activated) and a resend action. For schools without student email, the admin can download a sheet of one-time codes.

**RECOMMENDED USER FLOW:**
1. Upload file.
2. Review columns (as today).
3. Review class matches; fix or create sections in place.
4. Approve and import.
5. Activation links go out; the admin sees who has activated and can resend or print codes.

**AUTOMATIC DOWNSTREAM EFFECTS:** Students appear in their section, and therefore in its courses and open activities (3.2). Section counts update. No notification, because the students have not logged in yet.

**ALTERNATIVE OPTIONS:**
- Option A: resolve classes during review, as above.
- Option B: import everyone, then show an "unplaced students" list to fix afterwards.

**RECOMMENDATION:** Option A, with B's list also available on the Users page as a safety net.

**REASON:** Problems are cheapest to fix while the admin is looking at the file. Fixing afterwards depends on someone noticing. The safety-net list costs little and catches students added by other routes.

**DEPENDENCIES:** 3.14, outbound email, 3.15.

**IMPLEMENTATION SCOPE:** Import job service and review screen in the onboarding module, section creation call, set-password service (already built), activation status page, Users page filter "not in any class".

**TEST CASES:**
- A file with an unknown class cannot be approved until it is resolved or explicitly waived.
- "Create this section" creates one section even if 50 rows use it.
- After import, every student is in the expected section and sees its courses.
- Each student receives one valid link; a used or expired link is refused; resend issues a new one.
- Re-uploading the same file creates no duplicates.
- A server restart mid-review does not lose the review (requires stored jobs).

**REGRESSION IMPACT:** Onboarding module tests (343), Add Student form, classroom counts, login.

### 3.14 Classrooms and academic session — REBUILD

**CURRENT IMPLEMENTATION:** A classroom has a name, grade, section, class teacher and a stored student count. Creating one requires a matching fee structure. There is no year or semester anywhere.

**CURRENT USER FLOW:** Admin → Classrooms → create → assign teacher → add students.

**PROBLEM:** Nothing is tied to a period of time, so last year's attendance, results and courses cannot be separated from this year's. A classroom cannot be created without first defining fees.

**WHY IT DOES NOT MAKE SENSE:** Every academic record belongs to a year or semester. Without that, the second year overwrites or mixes with the first. Tying class creation to fees forces an academic user through a finance step.

**RECOMMENDED IMPLEMENTATION:** Add an academic session (name, start, end, current flag). Rename classroom to section in the interface; a section belongs to a session and optionally to a program. Remove the fee-structure requirement. A year-end action copies sections into the next session and moves students up, with a review screen.

**RECOMMENDED USER FLOW:**
1. Admin creates the session "2026-27" and marks it current.
2. Creates sections (or copies last year's).
3. Adds students by import or by hand.
4. At year end: Close session → review promotions → confirm.

**AUTOMATIC DOWNSTREAM EFFECTS:** Every list defaults to the current session. Closing a session archives its courses and freezes its gradebooks and attendance.

**ALTERNATIVE OPTIONS:**
- Option A: session and section only; program as an optional label.
- Option B: full hierarchy of department, program, batch, semester, section.

**RECOMMENDATION:** Option A.

**REASON:** Option A is enough for a school and for a small college, and it is what unblocks every other item here. A deep hierarchy adds setup screens that most customers will fill with one value each. The optional program label leaves room to grow.

**DEPENDENCIES:** None; this is first.

**IMPLEMENTATION SCOPE:** New `sessions` table; `classrooms` gains session and program; classroom API and pages; session selector in admin and teacher layouts; promotion service.

**TEST CASES:**
- Records created in one session do not appear in another.
- Copying sections creates empty sections with the same names.
- Promotion moves each student once, keeps their history, and can be reviewed before confirming.
- A section can be created with no fee structure.
- Closing a session makes its academic records read-only.

**REGRESSION IMPACT:** Everything that lists classrooms, students, attendance, results or courses.

**DO NOT EXPAND:** timetable generation, room allocation, credit and elective rules.

### 3.15 User management — COMPLETE

**CURRENT IMPLEMENTATION:** Admin lists, edits and permanently deletes users.

**CURRENT USER FLOW:** Admin → Users → edit or delete.

**PROBLEM:** The only way to stop someone using the system is to delete them, which strands their attendance, marks and submissions.

**WHY IT DOES NOT MAKE SENSE:** Students leave and staff change every term; their records must remain.

**RECOMMENDED IMPLEMENTATION:** Replace Delete with Deactivate. An inactive user cannot log in and leaves active rosters; history stays. Reactivation restores access. Permanent removal is a separate admin action available only when the user has no academic records.

**RECOMMENDED USER FLOW:** Admin → Users → Deactivate → confirm dialog states what happens → user moves to the Inactive filter.

**AUTOMATIC DOWNSTREAM EFFECTS:** Removed from rosters, mark sheets going forward, and upcoming work. A deactivated teacher's courses are flagged "needs a teacher" for the admin.

**ALTERNATIVE OPTIONS:** Option A: active and inactive. Option B: add graduated, transferred, suspended.

**RECOMMENDATION:** Option A, with a free-text reason.

**REASON:** Two states cover the behaviour the system needs; the reason field records the nuance without adding rules for each status.

**DEPENDENCIES:** 3.2.

**IMPLEMENTATION SCOPE:** `users` (status, reason, date), login check, roster queries, Users page.

**TEST CASES:**
- An inactive user cannot log in and an existing session stops working.
- Their past marks and attendance remain visible to staff.
- They do not appear on new attendance sheets or gradebooks.
- A course whose teacher is deactivated is flagged for reassignment.

**REGRESSION IMPACT:** Login, all rosters, counts on dashboards, import duplicate checks.

### 3.16 Navigation — FIX

**CURRENT IMPLEMENTATION:** Each role has a sidebar. Several built pages are not in it.

**CURRENT USER FLOW:** Users reach some features only from dashboard buttons or by typing an address.

**PROBLEM:** Student menu lacks Assignments, Announcements, Calendar, Timetable, Certificates and Fees. Mentor course tasks live only on the dashboard. Admin menu lacks Create Course, Announcements and Analytics.

**WHY IT DOES NOT MAKE SENSE:** Work was done to build these pages and users cannot find them.

**RECOMMENDED IMPLEMENTATION:**
- Student: Dashboard, My Courses, Tests and Assignments, Results, Attendance, Announcements, Calendar.
- Teacher: Dashboard, My Courses (all course actions inside a course), To Mark, Attendance, Announcements, Calendar.
- Admin: Dashboard, Sessions and Sections, Users, Import Students, Courses, Attendance Overview, Announcements, Calendar, Settings.

Remove routes for features that are retired or parked.

**RECOMMENDED USER FLOW:** Every task is reachable in at most two presses from the menu.

**AUTOMATIC DOWNSTREAM EFFECTS:** None.

**ALTERNATIVE OPTIONS:** Option A: role menus as above. Option B: one menu with items hidden by permission.

**RECOMMENDATION:** Option A.

**REASON:** The three roles do different jobs; purpose-built menus are shorter and clearer than one long filtered list.

**DEPENDENCIES:** Decisions on retired and parked features.

**IMPLEMENTATION SCOPE:** Three layout components, route table.

**TEST CASES:**
- Every route in the application is reachable from a menu or from a page reached by a menu, or is deliberately removed.
- No menu item leads to an error or to another role's page.

**REGRESSION IMPACT:** All page layouts, deep links, redirects after login.

---

## 4. Features that should not be expanded

| Feature | Decision | Why not more |
| --- | --- | --- |
| AI question generation and review | KEEP AS-IS | Already complete: generate, review, edit, save as draft. Adding auto-publish would remove the teacher check that makes it trustworthy. |
| AI performance reports | KEEP AS-IS | Clear value with an explicit share step. Wait for the gradebook before widening what it analyses. |
| Calendar | SIMPLIFY and RECONNECT | Keep manual events. Show test close dates and assignment due dates automatically so nobody retypes them. Do not add recurring events, invitations or external calendar sync. |
| Live classes | SIMPLIFY | A title, a time and a meeting link shown on the calendar and in the course. Drop start, end, join and leave tracking. Building or embedding video is a separate product. |
| Timetable | KEEP AS-IS | An uploaded image or PDF per section is enough. A timetable editor needs rooms, periods and clash rules. |
| Certificates | PARK | The page fails today, and a certificate is only meaningful once courses have real completion (3.8). Hide the menu entry until then. |
| Self-registration and mentor approval | RETIRE | Accounts come from import or the admin. The approval queue has nothing to approve. |
| Database export page | RETIRE | Fails on load. Replace later with two or three named reports (class marks, attendance summary). |
| Fees, accountant, storekeeper, vendor, requirements | PARK | Not part of teaching and learning, and the least reliable area. Remove from the LMS menus; decide separately whether it becomes its own product. |
| Subscription and plan gating | SIMPLIFY | One plan per school, checked on the server at a few limits (students, storage, AI usage). Remove the student-level subscription page and plan checks from individual academic features such as the calendar. |
| Translation (Arabic, Urdu) | PARK | Untranslated keys are visible in headings today. Ship English first; restore languages from static files when a customer needs them. |

---

## 5. Decisions needed before work starts

| # | Decision | Recommended answer |
| --- | --- | --- |
| 1 | Is a course taught to one section (3.1 Option A)? | Yes |
| 2 | Is enrollment derived from section membership (3.2 Option A)? | Yes |
| 3 | Merge weeks and chapters into units and items (3.3)? | Yes |
| 4 | Retire legacy course assessments and migrate the seven existing ones (3.5)? | Yes |
| 5 | What happens to past legacy attempts: keep viewable or export and remove? | Export and remove |
| 6 | Late assignment uploads: accept and flag, with a per-assignment switch (3.6)? | Yes |
| 7 | Replace manual term results with the gradebook (3.7)? | Yes |
| 8 | Daily section attendance only, with a school minimum percentage (3.9)? | Yes |
| 9 | Notifications in-app only for the fixed event list (3.11)? | Yes |
| 10 | Session and section only, program as optional label (3.14)? | Yes |
| 11 | Park finance and procurement, certificates and translation? | Yes |
| 12 | Should the test records created during the walkthrough be removed? | Yes, by restoring the pre-test backup or deleting the three items listed in section 1 |

---

*Nothing in this plan has been implemented. Each entry needs approval before work begins.*
    