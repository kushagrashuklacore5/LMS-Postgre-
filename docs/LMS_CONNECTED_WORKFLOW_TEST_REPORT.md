# LMS Connected Workflow Test Report

**Date:** 5 October 2026
**Phase:** discovery and QA only. No code, schema or configuration was changed. Nothing was fixed.
**Environment:** local system (client `localhost:5174`, API `localhost:5002`, SQLite file `server/data/lms_permanent.db`), school "Core5 Academy" (id 20).

## How the tests were run

- Every workflow was performed in a visible Chrome window by clicking and typing in the real pages. After each step the database was read to confirm what the screen claimed.
- Student A, Student B, Student C and Teacher A signed in through the real login form with the passwords the system generated for them.
- The admin's password is not known to the tester, so the admin session was placed directly in the browser. Admin login itself is therefore NOT VERIFIED.
- Where the interface offered no control for a required step, the step was done by calling the same API the product's own pages use, and this is stated in the evidence.
- Status values: PASS, FAIL, PARTIAL, BLOCKED, NOT VERIFIED.
- Classification values: BUG, CONNECTION GAP, MISSING FEATURE, ARCHITECTURAL ISSUE, UNKNOWN.

## Test data used

| Item | Requested | What the system allowed |
| --- | --- | --- |
| Academic session | 2026-27 | Could not be created. No such concept exists. |
| Section | BCA-A | Created as "Grade 12 - BCA-A" (id 10). A school grade from 1 to 12 is mandatory; "BCA-A" could only go in the section text. |
| Teacher | Teacher A | Created (user id 51, role mentor). |
| Students | Student A, Student B | Created (user ids 49, 50). |
| Late joiner | Student C | Created (user id 52). |
| Course | Python Programming | Created (course id 20). |

---

## 1. Executive Summary

About half of the connected academic workflow works. Each module works on its own up to the point where it should hand data to the next module, and that hand-off is where most flows stop.

**What works end to end**

- Creating students and a teacher, and their first login with the generated password.
- A class-level test under "AI Assessments": create, publish to the class, student attempt with a correct timer, correct score, and a teacher report.
- An assignment: create, publish, student PDF upload, teacher marking, and the student seeing marks and feedback.
- Attendance: the teacher's marks reach the student with the right date and percentage.
- A course announcement reaches the enrolled students and not others.
- A manually created calendar event reaches the student.

**Where the chain breaks**

1. **Section to course.** A course cannot be linked to a section from the teacher's form, so students are hand-picked. A student who joins the section later does not get the course.
2. **Changing course students removes the existing ones.** Ticking only Student B in "Assign Students" removed Student A from the course.
3. **Course test set-up.** The "Manage Questions" page for a course test calls two endpoints that do not exist, so questions can only be added in the pop-up shown immediately after creating the test.
4. **Score to anywhere.** A score is stored and shown to the student once. It does not reach the student's Results page, the student dashboard, course progress, or the teacher's Class Results. For course tests the teacher cannot see the attempt at all.
5. **Attendance sheet scope.** The sheet for BCA-A listed all 13 students of the school and saved a row for every one of them under BCA-A.

**Scale of the result:** more than 90 individual checks across 12 workflows. 1 workflow passed outright, 10 were partial, 1 failed.

---

## 2. Workflow Results

| Workflow | Status | Breaking point | Classification |
| --- | --- | --- | --- |
| 1. User + Section | PARTIAL | Students chosen in the Create Classroom dialog are not saved as members; no academic session | BUG; MISSING FEATURE |
| 2. Course Creation | PARTIAL | Form has no section field and no publish step | CONNECTION GAP; MISSING FEATURE |
| 3. Course Visibility | PARTIAL | Only hand-picked students see the course; re-assigning replaces the list | BUG; CONNECTION GAP |
| 4. Course Content | PARTIAL | Material is invisible on the teacher's page; opening it is not tracked | BUG; CONNECTION GAP |
| 5. Test → Attempt → Score | PARTIAL | "Manage Questions" page is broken; teacher cannot see course-test attempts; timer ignored | BUG; MISSING FEATURE |
| 6. Score → Results → Dashboard | FAIL | Score stops at the attempt record | CONNECTION GAP; BUG |
| 7. Assignment | PARTIAL | Works inside its module; marks go no further; hard for students to find | CONNECTION GAP |
| 8. Attendance | PARTIAL | Sheet lists the whole school and saves rows for non-members | BUG |
| 9. Announcement | PASS | None in the core path; visible only through the header bell | (minor BUG noted) |
| 10. Calendar | PARTIAL | Test and assignment dates never appear automatically | MISSING FEATURE |
| 11. Late Joiner | PARTIAL | Course does not follow section membership; a non-member can open the course by URL | CONNECTION GAP; BUG |
| 12. Role Connectivity | PARTIAL | Admin has no page that lists or manages courses | MISSING FEATURE |

---

## 3. Connected Flow Map

```
Student
   |  PARTIAL  (membership works once saved; the Create Classroom dialog loses the selected students,
   |            and the admin class page has no control to add a student)
Section
   |  FAIL     (no link from section to course; students are hand-picked per course)
Course
   |  PARTIAL  (material reaches students; teacher's own page does not list it; no view tracking)
Content
   |  PARTIAL  (course test: questions only through the creation pop-up; class test: works but is not in the course)
Test
   |  PASS     (student finds it, starts, answers)
Attempt
   |  PASS     (correct score; course-test countdown ignores the teacher's timer)
Score
   |  FAIL     (nothing is written to results; teacher cannot see course-test attempts)
Results
   |  FAIL     (Results page empty; dashboard calls an endpoint that does not exist)
Dashboard
```

---

## 4. Workflow detail

### Workflow 1 — User + Section Setup

**Status:** PARTIAL

**Actual Flow:** Admin opened Add Student and saved Student A and Student B (class "BCA", section "A" typed on the form). Each save showed a generated password. Admin saved Teacher A the same way. Admin opened Classrooms → Create Classroom, chose Grade 12, typed section "BCA-A", picked Teacher A as class teacher and selected Student A and Student B, and saved. The classroom was created with a stored student count of 2 but with no students actually in it. The admin's classroom page offered only "Go back". The two students were then placed in the class through the class-assignment API. Student A and Teacher A logged in through the login form and landed on the correct dashboards with the correct names and roles.

**Expected Flow:** Session exists → section created with its name → students selected in the dialog become members → users appear in the Users list → users log in and see their class.

**Breaking Point:** Saving the Create Classroom dialog: the selected students are counted but not saved as members.

**Evidence:**
- Academic session: no table whose name contains session, academic, semester or year; no admin menu item.
- Add Student: users 49 and 50 created; the typed class and section were stored on the `students` row as `grade = "BCA"` and `rollNumber = "A"`; classroom memberships created: 0.
- Create Classroom: toast "Classroom created successfully!"; row `{id: 10, name: "Grade 12 - BCA-A", studentCount: 2, classTeacherId: null}`; `student_classroom_assignment` rows for class 10: none. The class-teacher link was saved in `classroomAssignments` (teacher 51) but the classroom's own `classTeacherId` stayed empty.
- Grade dropdown offers "Grade 1 (Primary)" to "Grade 12 (Secondary)" only.
- `/admin/classrooms/10`: only a "Go back" button.
- `/admin/users`: the table showed 10 rows; `GET /api/admin/users` returned 19; the three new users were not among the rows shown. Whether a paging control exists was not established.
- Login: Student A → `/student/dashboard`, stored role "student"; Teacher A → `/mentor/dashboard`, stored role "mentor". No password change was requested. The student dashboard showed no class or section name.
- A Terms & Conditions dialog appeared after each sign-in and again on later page loads.

**Classification:**
- Selected students not saved as members, with the count saved anyway: BUG.
- Section typed on Add Student stored in the roll-number field and not linked to a classroom: BUG.
- No academic session: MISSING FEATURE.
- No way to name a section outside school grades: ARCHITECTURAL ISSUE (the class model is grade plus section).
- No add-student control on the admin class page: MISSING FEATURE.
- New users not visible on the Users page: UNKNOWN (possible paging; needs a manual look).

**Recommendation:** Fix the Create Classroom save so chosen students become members and the count is derived from them. Give the admin class page an add and remove student control. Decide separately whether sessions and free-named sections are wanted (product decision).

### Workflow 2 — Course Creation

**Status:** PARTIAL

**Actual Flow:** Teacher A opened Create Course, entered title, category, duration and description, chose Teacher A in the teacher dropdown, selected Student A in the students list and saved. "Course created successfully" appeared. The course appeared on Teacher A's dashboard and its workspace opened with Add Week, Add Material, Add Assessment and Assign Students.

**Expected Flow:** Create course → teacher attached → section attached → saved → published → visible where expected.

**Breaking Point:** There is no section field on the form and no publish step.

**Evidence:**
- Course row: `mentorId = 51` (Teacher A), `classroomId = null`.
- Form fields: title, category, duration, description, a teacher dropdown, a multi-select of all the school's students. No class or section field.
- `courses` columns: id, title, description, mentorId, classroomId, category, duration, price, university_id, createdAt. No status column; no Publish control anywhere.
- `course_students` after save: Student A only (as selected).
- The teacher dropdown's placeholder shows the raw text `assign_course_teacher`.

**Classification:** No section on the form although the table has a `classroomId` column: CONNECTION GAP. No draft or publish state: MISSING FEATURE. Raw label text: BUG (minor).

**Recommendation:** Expose the existing classroom link on the course form. Whether courses need a publish state is a product decision.

### Workflow 3 — Course Visibility

**Status:** PARTIAL

**Actual Flow:** Student A saw Python Programming under My Courses and opened it. Student B did not see it. Teacher A opened Assign Students in the course, ticked Student B and saved. Student B then saw the course, and Student A no longer did.

**Expected Flow:** Both students of BCA-A see the course with its teacher and section, and can open it.

**Breaking Point:** (1) Visibility depends only on hand-picked enrollment. (2) Saving Assign Students replaces the whole list.

**Evidence:**
- Student B before assignment: `GET /api/courses/student` → 200 with 0 courses; no `course_students` row; member of BCA-A: yes. Reason for invisibility: missing enrollment (cause 1 of the six listed in the test plan), which in turn comes from the missing section link (cause 2).
- Assign Students dialog listed 12 students and did not list the already-enrolled Student A. After ticking only Student B: toast "Students assigned successfully"; `course_students` went from `[49]` to `[50]`.
- Student A afterwards: My Courses no longer showed the course; `course_students` row count 0.
- A further save with two names ticked again left exactly the ticked names (one of those ticks was the test script selecting the wrong name; the replace behaviour was the same).
- To continue testing, both students were re-enrolled through `POST /api/courses/20/assign-students` with both ids → 200.
- Course card and course page do not show the teacher's name. `GET /api/chapters/course/20` returned 500 on every load of the student course page.

**Classification:** Assign Students replacing existing enrollments while hiding them from the dialog: BUG. Course not following section membership: CONNECTION GAP. Chapters endpoint 500: BUG.

**Recommendation:** Make Assign Students show current enrollments ticked and save additions and removals. Fix the chapters endpoint. Linking courses to sections is the larger decision (see section 9).

### Workflow 4 — Course Content

**Status:** PARTIAL

**Actual Flow:** Teacher A used Add Material (type "PDF Link", week "General (No Week)") and saw "Material added successfully". The teacher's course page still said "0 weeks" and "No weeks added yet" and did not list the material. Student A opened the course, expanded a group labelled "Week 1" and saw the material with a View link pointing to the address the teacher entered.

**Expected Flow:** Material saved → listed for the teacher → visible to enrolled students → opens → viewing recorded.

**Breaking Point:** The teacher's page does not show a material that has no week. Viewing is not recorded.

**Evidence:**
- `course_materials` row: `{id: 5, courseId: 20, weekId: null, type: "pdf_link", uploadedBy: 51}`. `GET /api/materials/course/20` as Student A → 200, 1 item.
- Teacher page text after saving: "0 weeks", "No weeks added yet"; the title "Python Basics Notes" not present.
- Student page: group heading "Week 1" although the course has no weeks; "0 of 2 items completed"; the View link has `target="_blank"` and the correct address. The new browser tab itself was not observed by the test tool, so "opens" rests on the link being correct.
- After viewing: `progress` rows for Student A in this course: none; the page still read 0%. A tick mark is displayed next to View; whether it is a control was NOT VERIFIED.

**Classification:** Material without a week not shown to the teacher: BUG. No view tracking although a progress table and an "items completed" counter exist: CONNECTION GAP.

**Recommendation:** List week-less materials on the teacher page. Decide whether opening a material should count toward the existing counter.

### Workflow 5 — Test Creation → Attempt → Score

**Status:** PARTIAL

Two separate test features exist. Both were tested.

**Actual Flow (test inside the course, "Add Assessment"):**
1. Teacher A created "Python Test 1" from the course. A question pop-up opened; it was closed.
2. Assessments tab → "MANAGE QUESTIONS" opened a separate page. Adding a question there showed "Failed to add question" each time.
3. "Publish Assessment" on that page succeeded with zero questions.
4. Student A opened the test: "Total Questions: 0". Submitting showed "Submission failed: Assessment questions not found".
5. Teacher A created "Python Test 2" and this time added three questions in the pop-up that opens right after creation. All three saved. Publishing worked from the separate page.
6. Student A found the test inside the course, answered two correctly and one wrongly, submitted, and saw "You have passed the assessment — Score 67%".
7. Teacher A looked in the course's Assessments tab, Student Progress tab and the Progress page. None showed the attempt or the score.

**Actual Flow (class test, "AI Assessments"):** Teacher A created a three-question test, chose class "Grade 12 - BCA-A", published to the whole class (2 students). Student A found it under My Tests, the timer started at 4:58 for a 5-minute test, and the result showed 2/3 (66.67%). Teacher A's report listed Student A and Student B with the attempt. The test does not appear inside the Python Programming course, and its form has no course field.

**Expected Flow:** Course → test → student sees it → attempt → submission → score → teacher sees the score.

**Breaking Point:** Course test: adding questions after the creation pop-up is closed; and the teacher's view of attempts. Class test: none within the module, but it is not connected to the course.

**Evidence:**
- Manage Questions page calls `POST /api/assessments/add-question` → 404 and `GET /api/assessments/questions/8` → 404. The server defines `POST /api/assessments/questions` and `GET /api/assessments/:id/questions`.
- Test 1: `isPublished = 1` with 0 questions; student submit → `POST /api/assessments/submit` 404.
- Test 2: 3 rows in `assessment_questions`; attempt row `{score: 2, totalQuestions: 3, percentage: 67, result: "PASS"}`.
- Countdown on the course-test attempt page started at 178:27. The teacher set the timer to 10 minutes; the test window closed about 180 minutes later.
- Reopening the submitted course test showed the full question form again. Whether a second submission is accepted was not tested.
- Class test: `aia_assessments` row `{id: 2, status: "published", classroom_id: 10}`; score element "2/3 (66.67%)".

**Classification:**
- Manage Questions page calling non-existent endpoints: BUG.
- Publishing with no questions: BUG.
- Course-test countdown ignoring the timer: BUG.
- No teacher view of course-test attempts: MISSING FEATURE.
- Two unrelated test features, one tied to a course and one to a class: ARCHITECTURAL ISSUE (evidence: separate tables, separate pages, no shared field).

**Recommendation:** Point the Manage Questions page at the existing endpoints, block publishing an empty test, and use the timer field for the countdown. Which of the two test features the product keeps is a product decision.

### Workflow 6 — Score → Results → Dashboard

**Status:** FAIL

**Actual Flow:** After Student A's attempts, each downstream place was opened.

| Place | Course test (2/3) | Class test (2/3) |
| --- | --- | --- |
| Test result screen | PASS | PASS |
| Teacher sees the score | FAIL | PASS (report inside the test) |
| Student Results page | FAIL ("No results yet") | FAIL |
| Student dashboard | FAIL | FAIL |
| Course progress | FAIL (0%, "0 of 3 items completed") | not applicable |
| Teacher Class Results | FAIL ("Not assigned") | FAIL |

**Expected Flow:** Score → student results → teacher results → dashboard → progress.

**Breaking Point:** Immediately after the score is stored. The data stops at the attempt record.

**Evidence:**
- Database after both attempts: `assessment_attempts` rows for Student A: 1; `aia_attempts`: 1; `results` rows for Student A: 0; `progress` rows: 0.
- Student dashboard requests `GET /api/results/my-results` → 404 on every load.
- Class Results row: `Student A … Not assigned  -  -`.

**Classification:** No code path writes a test score to results or progress: CONNECTION GAP. Dashboard calling a non-existent endpoint: BUG. Nothing observed here requires a rebuild to connect; the tables and pages exist on both sides.

**Recommendation:** Decide what the Results page should contain (typed term results, test scores, or both), then connect scores to it. Fix or remove the dashboard's results request.

### Workflow 7 — Assignment

**Status:** PARTIAL

**Actual Flow:** The course page has no assignment action. Teacher A went to AI Assessments → Descriptive Assignments → New assignment, chose class BCA-A, total marks 10, a due date two days ahead and one question, and published. Student A's dashboard and sidebar did not mention it. From the My Tests page a link led to the assignments list, which showed "Python Assignment 1 — Not submitted — Due in 47 hours". Student A uploaded a PDF and saw "Assignment submitted successfully". Teacher A's list showed "1 of 2 submitted"; the submissions screen listed Student A's file and Student B as not submitted. Teacher A entered 8 marks and feedback and pressed "Save final marks". Student A then saw "Marks: 8 / 10" and the feedback.

**Expected Flow:** Assignment → submission → evaluation → marks → student result.

**Breaking Point:** After marks are saved. They are visible only inside the assignment.

**Evidence:**
- `aia_assignments` row `{id: 1, status: "published", classroom_id: 10, max_marks: 10}`.
- Submission row `{status: "submitted", original_filename: "student-a-answer.pdf", version: 1}`, later `{status: "evaluated", final_marks: 8, evaluated_by: 51}`; toast "Final marks saved: 8 / 10".
- Student Results page: no assignment; student dashboard: none; Class Results row for Student A: "Not assigned"; `results` rows: 0.
- Student sidebar items: Dashboard, Courses, Results, Attendance, My Tests. No assignment entry.

**Classification:** Marks not reaching results: CONNECTION GAP. Assignment not creatable from the course and tied to a class instead: ARCHITECTURAL ISSUE (same split as tests). No direct student navigation: MISSING FEATURE (menu entry).

**Recommendation:** Add a student menu entry. Connecting marks to results follows the Workflow 6 decision.

### Workflow 8 — Attendance

**Status:** PARTIAL

**Actual Flow:** Teacher A opened Attendance. The sheet had no class selector and listed 13 students, although BCA-A has 2 members. Student A was marked Present and Student B Absent, then saved. Student A's Attendance page showed 100% with a Present entry for today; Student B's showed 0% with an Absent entry. Reopening the teacher's sheet did not show the saved choices.

**Expected Flow:** Sheet for BCA-A lists its students → teacher marks → records saved for those students → teacher and students see them with the correct date and percentage.

**Breaking Point:** The sheet's student list, and what is saved from it.

**Evidence:**
- Students on the sheet: ids 30 and 39 to 50 (13). BCA-A members at that time: 49 and 50.
- Saved rows: 13 under `classroomId = 10` for today; 12 "present", 1 "absent". Eleven of those rows belong to students who are not in BCA-A, and they were saved as present without being marked.
- Rows for A and B: `{studentId: 49, date: "2026-10-05", status: "present", markedBy: 51}` and `{studentId: 50, …, status: "absent"}`.
- Toast text: "Attendance saved successfully! {present} present, {absent} absent" (placeholders not filled in).
- On reload, neither Student A's Present nor Student B's Absent option was selected.
- Student page names the class as "Classroom 10".

**Classification:** Sheet listing and saving students outside the class, defaulting them to present: BUG. Saved marks not shown on reload: BUG. Toast placeholders and "Classroom 10": BUG (minor).

**Recommendation:** Limit the sheet to the class's members and save only what was marked. Load existing marks when the sheet opens.

### Workflow 9 — Announcement

**Status:** PASS

**Actual Flow:** Teacher A pressed Announcement on the dashboard, entered a title and message, chose course Python Programming and published. Student A and Student B each saw it after pressing the bell in the page header. A student who is not in the course did not see it.

**Expected Flow:** Announcement created → correct audience → student can see it.

**Breaking Point:** None in the core path.

**Evidence:**
- Row `{id: 4, courseId: 20, createdByRole: "mentor", publishFor: "all"}`; toast "Announcement published".
- Students A and B: visible in the header bell list. Not on the dashboard body, no sidebar entry, and the `/announcements` page did not show it for either student.
- Non-enrolled student (Aarav Sharma): not visible.
- The only audience a teacher can choose is one of their courses.
- One background request failed during publishing: `GET /api/api/subscriptions/check-feature-access` → 404 (address contains `/api` twice).

**Classification:** `/announcements` page not showing an announcement the bell shows: BUG (minor, UNKNOWN cause). Doubled `/api` in a request address: BUG.

**Recommendation:** Make the Announcements page and the bell use the same list. Correct the doubled address.

### Workflow 10 — Calendar

**Status:** PARTIAL

**Actual Flow:** Teacher A's calendar showed nothing for the two course tests, the class test or the assignment. Teacher A created an event "Python Lab Session" for the course for the next day. Student A's calendar showed the event on that date.

**Expected Flow:** Existing test and assignment dates appear with the right type and visibility; links work.

**Breaking Point:** Nothing puts test or assignment dates on the calendar.

**Evidence:**
- Before creating the manual event: `calendar_events` rows linked to course 20: 0, although two course tests with start and end times and one assignment with a due date existed.
- Manual event row `{id: 8, courseId: 20, startDate: "2026-10-06T12:09:00.000Z", createdByRole: "mentor"}`.
- Student A: event visible on the calendar; clicking it showed the title only. No event type is shown. The calendar is not in the student sidebar.

**Classification:** No automatic events for tests and assignments: MISSING FEATURE. Calendar unreachable from the student menu: MISSING FEATURE (menu entry).

**Recommendation:** Product decision on whether due dates should appear automatically. Add the menu entry.

### Workflow 11 — Late Joiner

**Status:** PARTIAL

**Actual Flow:** Admin created Student C. Before joining BCA-A, Student C's My Courses, My Tests, assignments list and announcements were empty, but opening the course address directly showed the course, its material and its test. Student C was then added to BCA-A (through the API, because the admin page has no control). Afterwards the class test and the assignment appeared for Student C. The course still did not appear under My Courses, and the course announcement did not appear.

**Expected Flow (observation only):** Before joining, no access. After joining, the section's course, material, test and assignment become visible.

**Breaking Point:** The course is not connected to the section, so joining the section changes nothing for the course. Separately, the course page does not check enrollment.

**Evidence:**

| Item | Before joining | After joining |
| --- | --- | --- |
| Python Programming in My Courses | No | No |
| Course page by direct address | Opens | Opens |
| Material inside the course | Visible | Visible |
| Course test inside the course | Visible | Visible |
| Class test (My Tests) | No | Yes |
| Assignment | No | Yes |
| Course announcement | No | No |

- After joining: `course_students` row for Student C: 0; `courses.classroomId`: null.
- Class test recipients are not stored per student for a whole-class test (`aia_assessment_recipients` rows: 0); membership is checked when the student opens the list.
- Typing class "BCA" and section "A" on the Add Student form created no classroom membership.

**Classification:** Non-enrolled student able to open the course, its material and its test by address: BUG. Course not following section membership: CONNECTION GAP. Enrollment stored as a hand-picked list: ARCHITECTURAL ISSUE only if automatic follow-through is required; the existing `classroomId` column suggests it was intended.

**Recommendation:** Check enrollment before serving a course page. The section-to-course link is a product decision (section 9).

### Workflow 12 — Role Connectivity

**Status:** PARTIAL

**Actual Flow:** Admin: the menu has Dashboard, Users, Database Export, Fee Structure, Calendar, Add Student, Add Teacher, Classrooms, Import Students. None of the pages opened showed Python Programming, and opening the teacher's course address sent the admin back to the admin dashboard. Teacher A: full course workspace. Student A: every staff address tried redirected to the student dashboard, and the student course page showed no management buttons.

**Expected Flow:** Admin can see and manage course information; teacher manages academic content; student reaches only student functions.

**Breaking Point:** Admin has no page for existing courses.

**Evidence:**
- `GET /api/courses` as admin returns the course, so the data is available; no admin page lists it. A "Create Course" admin page exists but is not in the menu.
- Student A tried `/mentor/course/20`, `/mentor/attendance`, `/teacher/assessments`, `/admin/users`, `/admin/add-student`: all ended at `/student/dashboard`.

**Classification:** No admin course list: MISSING FEATURE.

**Recommendation:** Add an admin courses page using the existing endpoint.

---

## 5. Confirmed Bugs

Each was observed directly during the tests.

| # | Bug | Where seen |
| --- | --- | --- |
| B1 | Create Classroom saves the number of selected students but does not add them to the class. | W1 |
| B2 | Assign Students replaces the course's students with only those ticked, and does not show who is already enrolled. | W3 |
| B3 | The Manage Questions page for a course test calls two endpoints that do not exist (404), so questions cannot be added or listed there. | W5 |
| B4 | A course test can be published with no questions; the student then gets "Assessment questions not found". | W5 |
| B5 | The course-test countdown uses the time until the test window closes, not the timer the teacher set. | W5 |
| B6 | The attendance sheet lists every student in the school and saves a row for each one under the class, defaulting unmarked students to present. | W8 |
| B7 | Saved attendance is not shown when the teacher reopens the sheet. | W8 |
| B8 | A student who is not enrolled can open a course, its material and its test by typing the address. | W11 |
| B9 | A material added without a week does not appear on the teacher's course page. | W4 |
| B10 | The student dashboard requests `/api/results/my-results`, which does not exist (404). | W6 |
| B11 | `GET /api/chapters/course/:id` returns 500 on every student course page load. | W3 |
| B12 | The section typed on the Add Student form is stored in the roll-number field. | W1 |
| B13 | A request goes to `/api/api/subscriptions/check-feature-access` (404). | W9 |
| B14 | Text placeholders shown to users unfilled: attendance toast `{present}` / `{absent}`; dropdown label `assign_course_teacher`; class shown as "Classroom 10". | W2, W8 |
| B15 | The Announcements page does not show an announcement that the header bell shows. | W9 |

## 6. Confirmed Connection Gaps

| # | Gap | Evidence |
| --- | --- | --- |
| C1 | Section is not connected to course. | Course form has no section field; `courses.classroomId` null; late joiner gets no course. |
| C2 | Test scores are not connected to Results, dashboard, progress or Class Results. | `results` and `progress` rows stay at 0 after scored attempts. |
| C3 | Assignment marks are not connected to Results. | Marks 8/10 saved; Results and Class Results unchanged. |
| C4 | Class typed when adding a student is not connected to a classroom. | 0 membership rows after Add Student. |
| C5 | Opening a material is not connected to the existing "items completed" counter. | No progress row after viewing. |
| C6 | Class tests and assignments are not connected to the course they belong to. | No course field; not shown inside the course. |

## 7. Missing Features

Only things that do not exist anywhere in the current system.

| # | Missing | Evidence |
| --- | --- | --- |
| M1 | Academic session (year or semester). | No table, no menu. |
| M2 | A teacher's view of who attempted a course test and their scores. | Three pages checked; none shows it. |
| M3 | Admin control to add or remove a student on a class page. | Only "Go back". |
| M4 | Admin page listing existing courses. | Not in menu or pages. |
| M5 | Draft or publish state for a course. | No column, no control. |
| M6 | Automatic calendar entries for test and assignment dates. | 0 linked events. |
| M7 | Student menu entries for assignments, announcements and calendar. | Sidebar has 5 items. |
| M8 | Any indication on the student dashboard of new or pending work. | Dashboard never mentioned the tests or the assignment. |

## 8. Potential Architecture Issues

Raised only where the current design, not a defect, prevents the workflow.

| # | Issue | Why it is more than a bug |
| --- | --- | --- |
| A1 | Two separate test features: one belongs to a course, the other to a class. | Different tables and pages with no shared field. The course-based one has the defects above; the class-based one works but cannot be placed in a course. |
| A2 | Assignments belong to a class, courses to hand-picked students. | The same students can be in a class but not in the course taught to that class, and vice versa. |
| A3 | A class is a school grade plus a section. | A college section such as "BCA-A" has no natural place; it was entered as Grade 12, section "BCA-A". |
| A4 | Results are typed per student and term and stored as one block of text. | There is nowhere for an individual test or assignment score to go without a design decision on what "Results" means. |

These are observations. None was assumed in advance, and none should be acted on without a product decision.

## 9. Recommended Fix Order

**P0 — blocks the core academic workflow**
- B2 Assign Students replaces existing students.
- B3 Manage Questions page broken.
- B6 Attendance sheet lists and saves the whole school.
- B1 Create Classroom loses selected students.
- B8 Non-enrolled student can open a course.

**P1 — important workflow connections**
- C1 Section to course.
- C2 and C3 Scores and marks to Results.
- M2 Teacher view of course-test attempts.
- B4 Publishing an empty test. B5 Timer ignored. B7 Saved attendance not reloaded.
- M3 Admin add student to class. C4 Class typed on Add Student.

**P2 — usability and secondary**
- B9 Material not shown to the teacher. B10 Dashboard 404. B11 Chapters 500.
- M7 Student menu entries. M4 Admin course list. M8 Dashboard pending work. C5 View tracking. M6 Calendar entries.

**P3 — polish**
- B12, B13, B14, B15.

## 10. DO NOT IMPLEMENT YET

These need a product or architecture decision first.

1. Whether a course belongs to a section, and whether enrollment should follow section membership (C1, A2).
2. Which of the two test features is kept, or how they are joined (A1, C6).
3. What the Results page is for: typed term results, automatic scores, or both (C2, C3, A4).
4. Whether academic sessions are introduced (M1).
5. Whether sections may be named freely instead of by school grade (A3).
6. Whether courses get a draft and publish state (M5).
7. Whether test and assignment dates should appear on the calendar automatically (M6).
8. Whether opening a material should count as progress (C5).

The bugs in section 5 do not depend on these decisions and can be fixed as they stand once approved.

---

## Test records left in the local database

Backup taken before this run: `server/data/backups/lms_permanent.before-workflow-test-20261005-165633.db`.

| Record | Detail |
| --- | --- |
| Users | Student A (49), Student B (50), Teacher A (51), Student C (52) |
| Classroom | "Grade 12 - BCA-A" (10) with members 49, 50, 52 |
| Course | Python Programming (20) with students 49 and 50 |
| Material | "Python Basics Notes" (5) |
| Course tests | "Python Test 1" (8, published, no questions), "Python Test 2" (9, 3 questions, 1 attempt) |
| Class test | "Python Class Test" (2, 1 attempt) |
| Assignment | "Python Assignment 1" (1) with one evaluated submission and its uploaded PDF |
| Attendance | 13 rows for today under classroom 10, of which 11 belong to students outside the class (side effect of bug B6) |
| Announcement | "Python class shifted to Lab 2" (4) |
| Calendar event | "Python Lab Session" (8) |

*End of report. Nothing has been fixed or changed in the product.*
