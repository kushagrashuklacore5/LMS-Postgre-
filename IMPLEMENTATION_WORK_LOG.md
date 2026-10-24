# Implementation Work Log — Overview

This log covers the LMS work from **28 September 2026** onward. The one-row-per-problem summary of all of it is in `IMPLEMENTATION_TRACKER_Sep-Oct_2026.xlsx` (columns: Problem Statement, What I Implemented, When Implemented). Both are updated together after every task.

## Entry 0: Work before 7 October 2026

This entry was written on 23 October 2026 from the records of that time: the git history of this repository and the README / ARCHITECTURE files of each module. Where a source gives no exact date, the month of the commit that brought the work into the LMS is used.

| When | Work | Source |
|------|------|--------|
| 28 September 2026 | **LMS prototype.** React + Vite client, Node/Express server, SQLite. Portals for Super Admin (schools, users, subscription plans), Admin (students, teachers, mentor approval, classrooms, courses, analytics), Mentor (classrooms, courses with weeks/chapters/materials, assessments, attendance, results), Student (dashboard, courses, tests, attendance, results, certificates), Accountant (fees, payments, expenses, inventory, vendor invoices, export), Storekeeper and Vendor (requirements, stock requests, orders). Also announcements, calendar, live-class records, translation. | git: "Initial commit - LMS Prototype" |
| 28 September 2026 | **GuideBot.** A product walkthrough built on driver.js, with no AI, in its own removable folder (`client/src/guidebot/`). Engine: tour state machine, route and element guards, saved progress. Tour schema and registry. Onboarding tours for Super Admin (14 steps), Admin (11), Mentor (10) and Student (8), plus overview tours and `data-tour` markers. | git (present in the initial commit); `client/src/guidebot/README.md` |
| 28–29 September 2026 | **AI Assessment Agent, Steps 1–4.** Read-only study of the host LMS (28 Sep). Teacher draft tests with MCQ questions, publish/unpublish. AI generation → validation → guard → teacher review → explicit save. Student attempts with a server-side timer, automatic grading, result page, teacher report. Sidebar entries. Gemini did not respond reliably (28–29 Sep), so the provider was switched to a Hugging Face open-weight model (Qwen3-Next-80B via DeepInfra), verified with a real call on 29 Sep. | `ai-modules/ai-assessment-agent/README.md`, `docs/ARCHITECTURE.md` |
| By 5 October 2026 | **AI Assessment Agent, later steps.** Test windows and "Close test", attempt reset/retake (at most 3), multiple-select and numerical questions, generation by question type with 10 intent templates, descriptive assignments with PDF upload, AI-assisted evaluation on the teacher's click, Student Performance Analyst and AI Performance Report, "Assign to" selected students and "Send to Student". | Same README (no dates given); git 5 Oct 2026 |
| By 28 September 2026 | **Student Onboarding Agent, Steps 1–9B.** Agent layer with a provider-neutral LLM contract; deterministic Excel import; canonical student schema and validator; LLM-assisted column mapping with deterministic guardrails (headers and masked samples only); import review and approval workflow; create-only student tools; real SQLite LMS adapter with transactions, quota and idempotency (migration applied 28 Sep). | `ai-modules/student-onboarding-agent/README.md`, `docs/ARCHITECTURE.md` |
| By 5 October 2026 | **Student Onboarding Agent, Steps 9D and 11.** Mounted in the LMS at `/api/onboarding` (school admins only, own school). One-time password-setup email link per imported student (hashed token, single use, 72 hours). | Same README; git 5 Oct 2026 |
| 1 October 2026 | **Golden theme.** Navy and gold theme with DM Serif headings across the LMS. Login modal redesigned with the Core5 Academy logo. Student dashboard full width; My Courses redesigned; StudentResults and StudentAttendance restyled. | git (16 commits on 1 Oct) |
| 5 October 2026 | AI Assessment Agent and Student Onboarding Agent integrated into the LMS. Gold theme applied to the SuperAdmin, Admin, Vendor, Accountant and Storekeeper portals. | git |
| 6 October 2026 | LMS product audit, connected-workflow test report and feature completion plan (`docs/`). | git |
| 7 October 2026 | Gold theme completed for AI assessments and alerts. | git |
| 9 October 2026 | Instalment plans with accountant integration and an instalment tracking service. | git |

Entries 1 to 17 below were written at the time of the work.

---
---

# Implementation Work Log — Student Class + Section Onboarding and Mentor Subject Templates

## 1. Project Work Summary

| Item | Detail |
|------|--------|
| Date of implementation | 7 October 2026 |
| Project | MyLMS Integrated V2 (React + Vite client, Node/Express server, SQLite database) |
| Features implemented | 1. Add Student with Class + Section and automatic classroom membership. 2. Class/section subject template for results with student-specific overrides. |
| Database used | SQLite (`server/data/lms_permanent.db`), the testing-environment database |

### Overall objective

Remove two repetitive manual steps from the daily workflow:

- An admin had to create a student and then, as a separate operation, add that student to a classroom.
- A mentor had to type the subject names and maximum marks again for every student when entering results.

### Problems that existed before

- The Add Student page had free-text "Class" and "Section" boxes. Whatever was typed was stored on the student record only; it was not checked against real classes and the student was not added to any classroom.
- There was no way to change a student's class from the admin user list.
- Results stored a list of subjects per result, and every subject name, marks, total and pass/fail value was typed by hand for each student.
- The Class Results page listed every student of the university instead of the students of the selected classroom.
- The authenticated result endpoint (`POST /api/results/add`) could not insert a new result on this database: it wrote to a `createdBy` column that the `results` table does not have.

### What the new workflow achieves

- The admin picks a Class and a Section from the classes that really exist. Saving the student also enrols the student in that classroom, in one step.
- The mentor configures the subjects and maximum marks once per class/section. Every student inherits them. Exceptions are handled per student without affecting anyone else.
- Marks can be typed straight into a table for the whole class and saved together.

---

## 2. Feature 1 — Student Class + Section Onboarding

### How class, section and classroom relate in this LMS

The codebase was inspected before any change. In this LMS a **classroom is a class (grade) plus a section**: the `classrooms` table has `grade`, `section` and a generated `name` such as `Grade 10 - A`. Membership is stored in `student_classroom_assignment (studentId, classroomId)` with a unique constraint on the pair. No separate class or section table exists, so none was created. The new dropdowns map onto this existing model.

### Previous workflow / problem

Admin opens Add Student → types class and section as free text → saves → opens the classroom → adds the student to the classroom manually.

### New Class dropdown

- Required field.
- Lists the distinct classes (grades) of the classrooms that exist in the admin's university.
- Nothing is hardcoded. The list is read from the existing `GET /api/classrooms` endpoint each time the page opens.

### New Section dropdown

- Required field. Disabled until a class is chosen, with the placeholder "Select a class first".
- Lists only the sections that exist for the chosen class.
- Each option carries the id of the classroom it stands for, so Class + Section resolves to exactly one classroom.
- If two classrooms share the same class and section (this exists in the sample data), the option label also shows the classroom name and id so the admin cannot pick the wrong one silently.

### Dynamic class and section loading

- A classroom created later appears in the dropdowns automatically, because the dropdowns read the live classroom list.
- Loading state: the Class dropdown shows "Loading classes...".
- Error state: a message with a Retry button.
- No classes yet: a message telling the admin to create a classroom first.
- Class with no sections: a message under the Section dropdown instead of an empty list.
- A class that has only one classroom is selected in a single click (the section is filled in automatically).

### Automatic classroom membership

On save the server, inside one database transaction:

1. creates the user,
2. creates the student record (grade and section taken from the classroom),
3. adds the membership row,
4. refreshes the classroom's student count,
5. gives the student the courses that belong to that classroom (same follow-up as the existing "assign student" flow).

If any step fails, everything is rolled back, so a student is never left without a class.

### Duplicate-membership protection

- The enrolment helper checks for an existing membership before inserting, so calling it twice creates one row.
- The table's existing `UNIQUE(studentId, classroomId)` constraint remains as a second guard.

### Existing student edit / reassignment behaviour

The admin user list had no edit action. A **Change Class** button was added for student rows. It opens a dialog that shows the current class and the same Class and Section dropdowns.

- The server moves the membership row to the new classroom and updates both classrooms' student counts, inside one transaction.
- Results, attendance, course enrolments and progress are **not** deleted. They are stored against the classroom and student ids and stay as history.
- If the student is already in the chosen classroom, nothing changes and a clear message is returned.
- If a student belongs to more than one classroom, the admin must choose which one is being changed. The server refuses to guess (HTTP 409).

### Validation and authorization

- Class is required; Section is required when the class uses sections. Both rules are enforced in the browser and on the server.
- The classroom must exist and belong to the admin's university. A classroom of another university is treated as not existing.
- If a classroom id is sent together with a class or section that does not match it, the request is rejected.
- Validation runs before the student is created, so a rejected request creates nothing.
- Creating a student and changing a class are admin-only.

### Frontend changes

- `ClassSectionSelect` — new reusable Class + Section dropdown pair.
- `AddStudent` page — free-text boxes replaced by the dropdowns; required checks added; the success message names the class the student was added to.
- `ChangeStudentClassModal` — new dialog for moving a student.
- `UserList` page — Change Class button on student rows.
- English labels added to the translation file; other languages fall back to English through the existing fallback.

### Backend changes

- `createStudent` validates and resolves the classroom, then creates and enrols in one transaction.
- New `getStudentClassrooms` and `changeStudentClassroom` controller functions and routes.
- New helper `classroomEnrollment.js` (resolve Class + Section to a classroom, idempotent enrol, student count refresh).
- New helper `dbAsync.js` (promise wrappers and a queued transaction helper for the shared SQLite connection).

### Database / migration changes

No database schema changes were required for Feature 1. It uses the existing `classrooms`, `student_classroom_assignment`, `students`, `users` and `course_students` tables.

---

## 3. Feature 2 — Mentor Subject Template + Student Overrides

### Previous problem

A result row stores its subjects as a list of `{ name, marks, total, status }`. Every part of that list was typed by hand for every student and every term.

### Data model chosen

An inheritance model, not a copy per student:

```
classroom_subjects            (the class/section template: subject + maximum marks)
        ↓ inherited by every student of the classroom
student_subject_overrides     (per-student exceptions: add / remove / max)
student_subject_settings      (per-student mode: inherit / custom)
```

The existing `results` table and its subject list are unchanged. A saved result keeps its own copy of subject names and maximum marks, which is what protects history.

### Class/section subject template

- A **Class Subjects** panel on the Class Results page shows the configured subjects and maximum marks.
- **Configure Subjects** opens a dialog to add, rename, re-mark and remove subjects.
- Saved once per classroom. Subject names are unique per classroom, ignoring upper/lower case.

### Default maximum marks

Each class subject has a maximum (1 to 1000). It becomes the default for every student of the class.

### Student inheritance

A student with no exceptions has no rows of their own. Their subjects are read from the class template each time, so a change to the template reaches them immediately.

### Student-specific subject removal

Removing an inherited subject for one student stores a `remove` exception for that student. The class subject itself is untouched. The removed subject is listed under "Removed for this student" with a Restore button.

### Student-specific subject addition

Adding a subject for one student stores an `add` exception with its own maximum marks. It is shown with a **Custom** badge.

### Replace All Subjects

- A red **Replace All Subjects** button opens a confirmation that states what will happen and what will not change.
- After confirmation the student's mode becomes `custom`: the class template is ignored for that student only, and the mentor adds the student's own subjects with the same Add Subject control.
- The server also requires an explicit `confirm: true` value, so the action cannot be triggered by accident.
- **Use Class Defaults** undoes it and returns the student to the class subjects.

### Student-specific maximum-mark override

Editing the Max box of an inherited subject stores a `max` exception. The subject is shown with an **Override** badge and a "Reset to class default (100)" link. Setting the value back to the class default removes the exception.

### How custom students differ from class defaults

| Student state | What the mentor sees |
|---------------|----------------------|
| Inherits everything | A marks box under each class subject column |
| Different maximum for a subject | The marks box plus the student's own maximum shown beneath it |
| Subject removed | A dash in that column |
| Has own subjects, or replaced all | One cell reading "Custom Subjects • Edit", which opens the result form for that student |

Badges are shown only for Custom, Override and "Saved earlier". Plain inherited subjects carry no badge.

### How historical results are protected

- Template and override changes never write to the `results` table.
- Changes affect results entered afterwards. A result that is already saved keeps the subject names and maximum marks it was saved with.
- When a saved result is edited, each subject may keep the maximum it was saved with, or the mentor can click "Use the current maximum" for that subject.
- A subject that was saved earlier but is no longer one of the student's subjects is still shown in the edit form, labelled "Saved earlier".
- Saving marks from the table keeps any saved subjects that are not table columns.

### Result entry screen

- The classroom list contains only the classrooms the mentor is allowed to manage.
- A Term box selects which term's results are shown and saved.
- Students listed are the members of the selected classroom.
- Marks are typed into the table and saved with **Save All Results**. A small P / F button marks a subject as Pass or Fail (default Pass, as before).
- The pencil opens the result form for one student with the subjects already filled in. The book icon opens Edit Subjects for that student.
- Fallback: when a class has no subjects configured, the result form works as before with typed subject rows, and a hint explains how to configure subjects once.

### Frontend changes

- `ClassResults` page rewritten around the new data, keeping the existing page route, the per-student result form and the GuideBot tour anchors.
- New `ClassSubjectsModal`, `StudentSubjectsModal` and a small request helper.
- One GuideBot tour sentence updated to describe the new table columns.

### Backend changes

- New `subjectConfigController.js` and `helpers/subjectConfig.js`.
- `resultController.addResult` now checks authorization, classroom membership, duplicate subjects, subject existence and marks against the maximum. It also no longer writes to the missing `createdBy` column.
- Ten new routes under `/api/results/subjects`.

### Database / migration changes

Three new tables and two indexes. See section 6.

---

## 4. File-Level Change Log

| File | Change | Reason |
|------|--------|--------|
| `server/helpers/dbAsync.js` | Created | Promise wrappers and a queued transaction helper for the shared SQLite connection |
| `server/helpers/classroomEnrollment.js` | Created | Resolve Class + Section to a classroom; idempotent enrolment; student count refresh |
| `server/helpers/subjectConfig.js` | Created | Authorization, validation and the inheritance calculation shared by subject and result code |
| `server/controllers/subjectConfigController.js` | Created | Class template and student override endpoints |
| `server/controllers/adminController.js` | Modified | `createStudent` validates the class and enrols in one transaction; added `getStudentClassrooms` and `changeStudentClassroom` |
| `server/controllers/resultController.js` | Modified | `addResult` validates against the student's subjects and maximum marks; removed the write to the missing `createdBy` column |
| `server/routes/adminRoutes.js` | Modified | Two new student classroom routes |
| `server/routes/resultRoutes.js` | Modified | Ten new subject configuration routes |
| `server/config/sqlite-db.js` | Modified | Creates the three new tables and two indexes at startup |
| `client/src/components/admin/ClassSectionSelect.jsx` | Created | Reusable Class + Section dropdowns |
| `client/src/components/admin/ChangeStudentClassModal.jsx` | Created | Dialog to change a student's class |
| `client/src/pages/admin/AddStudent.jsx` | Modified | Dropdowns replace free-text boxes; required checks; success message names the class |
| `client/src/pages/admin/UserList.jsx` | Modified | Change Class button for student rows |
| `client/src/components/mentor/resultSubjectsApi.js` | Created | Request helper for the result subject endpoints |
| `client/src/components/mentor/ClassSubjectsModal.jsx` | Created | Configure class subjects |
| `client/src/components/mentor/StudentSubjectsModal.jsx` | Created | Edit one student's subjects |
| `client/src/pages/mentor/ClassResults.jsx` | Rewritten | Marks table, class subjects panel, prefilled result form |
| `client/src/context/TranslationContext.jsx` | Modified | 18 English labels for the new admin screens |
| `client/src/guidebot/tours/mentor/overviewTour.js` | Modified | One sentence updated to match the new results table |
| `client/dist/` | Regenerated | Output of the production build run for verification |
| `IMPLEMENTATION_WORK_LOG.md` | Created | This document |

Files inspected and deliberately left unchanged: `client/src/components/admin/AddStudentModal.jsx` (not used by any page), `client/src/pages/mentor/AddResult.jsx` (older single-result page), `server/routes/universalRoutes.js` (older result endpoints).

---

## 5. API / Backend Change Log

### Modified endpoints

| Endpoint | Change |
|----------|--------|
| `POST /api/admin/create-student` | Now requires a class and section that resolve to an existing classroom of the admin's university. Accepts `classroomId`, `className`, `section`. Enrols the student. The response adds `student.classroom`. |
| `POST /api/results/add` | Now requires that the caller may manage the classroom and that the student is a member. Validates subjects and marks. The response adds `subjects`, `overallPercentage`, `overallStatus`. |

### New admin endpoints (admin only)

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /api/admin/students/:studentId/classrooms` | Read a student's current classroom(s) | Student and list of classrooms |
| `PUT /api/admin/students/:studentId/classroom` | Change a student's class/section. Body: `classroomId`, optional `className`, `section`, `fromClassroomId` | Previous classroom, new classroom with student count |

### New subject endpoints (mentor or admin)

All paths start with `/api/results/subjects`.

| Endpoint | Purpose |
|----------|---------|
| `GET /classrooms` | Classrooms the caller may manage |
| `GET /classroom/:classroomId` | Read the class subject template |
| `PUT /classroom/:classroomId` | Save the class subject template (full list) |
| `GET /classroom/:classroomId/students?term=` | Students with their effective subjects and the result saved for the term |
| `GET /classroom/:classroomId/student/:studentId` | Effective subjects of one student |
| `POST /classroom/:classroomId/student/:studentId/subjects` | Add a subject for one student |
| `DELETE /classroom/:classroomId/student/:studentId/subjects` | Remove a subject for one student |
| `PUT /classroom/:classroomId/student/:studentId/max-marks` | Override maximum marks for one student and subject |
| `PUT /classroom/:classroomId/student/:studentId/replace-all` | Replace all subjects for one student (requires `confirm: true`) |
| `POST /classroom/:classroomId/student/:studentId/restore-defaults` | Restore one inherited subject, or all class defaults |

### Authorization rules

- All new endpoints use the project's existing `authMiddleware` and `roleMiddleware`.
- The classroom must belong to the caller's university.
- An admin may manage any classroom of their university.
- A mentor may manage a classroom only if they are its class teacher, are listed in `classroomAssignments` for it, or teach a course attached to it.
- The student must have the student role, belong to the same university and be a member of the classroom.
- Classroom and student ids from the browser are always re-checked on the server.

### Validation rules

- Subject name: required, at most 100 characters, unique per classroom and per student, ignoring case and extra spaces.
- Maximum marks: a number from 1 to 1000.
- At most 50 subjects in a template.
- Result marks: required, from 0 to the subject's maximum.
- When the student has configured subjects, a result subject must be one of them or already be part of that saved result; the maximum sent must equal the configured maximum or the saved one.
- Multi-step changes (create student, change class, save template, remove subject, change maximum, replace all, restore all) run in a transaction.

---

## 6. Database Change Log

### Migration mechanism

This project has no numbered migration files for the core LMS tables. Core tables are created at server startup by `CREATE TABLE IF NOT EXISTS` statements in `server/config/sqlite-db.js`. The new tables were added there, following that convention. They are created automatically the next time the server starts. No statement was run against the database by hand.

### Tables created

**`classroom_subjects`** — the class/section subject template

| Column | Notes |
|--------|-------|
| `id` | Primary key |
| `classroomId` | References `classrooms(id)` |
| `name`, `nameKey` | Display name and lower-cased name used for uniqueness |
| `maxMarks` | Default maximum marks |
| `sortOrder` | Display order |
| `createdBy`, `createdAt`, `updatedAt` | Audit columns |
| Constraint | `UNIQUE(classroomId, nameKey)` |

**`student_subject_overrides`** — per-student exceptions

| Column | Notes |
|--------|-------|
| `id` | Primary key |
| `classroomId`, `studentId` | Classroom and student the exception belongs to |
| `classSubjectId` | The inherited class subject (empty for a custom subject) |
| `subjectName`, `nameKey` | Subject name |
| `action` | `add`, `remove` or `max` (CHECK constraint) |
| `maxMarks` | Maximum for `add` and `max` |
| `createdBy`, `createdAt`, `updatedAt` | Audit columns |

Indexes:

- `idx_student_subject_overrides_inherited` — unique on `(classroomId, studentId, classSubjectId)` where `classSubjectId` is set. One exception per inherited subject per student.
- `idx_student_subject_overrides_custom` — unique on `(classroomId, studentId, nameKey)` where `action = 'add'`. No duplicate custom subjects.

**`student_subject_settings`** — per-student mode

| Column | Notes |
|--------|-------|
| `classroomId`, `studentId` | `UNIQUE(classroomId, studentId)` |
| `mode` | `inherit` or `custom` (CHECK constraint) |
| `updatedBy`, `updatedAt` | Audit columns |

### Why the change was necessary

The existing schema had no place to store subjects at class level. Subjects existed only inside each saved result.

### Backward compatibility

- The change is additive: no existing table or column was altered, renamed or dropped.
- No existing row is rewritten.
- Classes with no template and students with no exceptions behave as before.
- PostgreSQL: the repository has no PostgreSQL adapter file (`server/config/postgres-db.js` does not exist), so the tables were added for SQLite only. See section 11.

---

## 7. User Workflow — Before vs After

### Admin: adding a student

**Before**

```
Admin creates student (types class and section as text)
→ opens the classroom
→ manually adds the student to the classroom
```

**After**

```
Admin creates student
→ selects Class
→ selects Section
→ student is automatically a member of that classroom
```

### Admin: changing a student's class

**Before:** no action in the user list.

**After**

```
User list → Change Class on the student row
→ selects new Class and Section
→ membership moves; earlier results and attendance stay
```

### Mentor: entering results

**Before**

```
Student 1 → type each subject, marks, total → save
Student 2 → type each subject, marks, total → save
Student 3 → type each subject, marks, total → save
```

**After**

```
Configure Subjects once for the class (Physics 100, Chemistry 100, Mathematics 100, Biology 70)
→ table shows one marks box per student per subject
→ type marks → Save All Results
→ student with different subjects: "Custom Subjects • Edit"
```

---

## 8. Testing / Verification Log

### How the tests were run

- No automated test suite existed in `server/` or `client/` (there is no `test` script in either `package.json`).
- A focused API test script was written for this task and run against the running backend on `http://localhost:5002`. It logs in through the real login endpoint as the demo admin, mentor and student accounts of Demo University, creates its own classrooms and students, and checks results through the API and by reading the SQLite file read-only.
- The database file was backed up before the run and **restored afterwards**, so no test classrooms, students or results remain in the data.
- The script was run twice. Run 1: 51 of 52 passed. The one failure (F2-05) was a wrong expected value in the test itself (it expected 82%; the correct value for 295 out of 370 is 80%, which the application returned). The expected value was corrected. Run 2: **52 of 52 passed**. The table below records run 2.
- The script is not part of the repository.

### Feature 1 — API tests

| Test | What was tested | Expected | Actual | Result |
|------|-----------------|----------|--------|--------|
| SETUP-1 | Create two classrooms (Grade 9, two new sections) | 201 + 201 | 201 + 201 | PASS |
| F1-01 | New class/section appears in the dropdown data source | Both new classrooms listed | Both listed | PASS |
| F1-02 | Create student with Class 9 + Section A | 201 and classroom returned | 201, classroom returned | PASS |
| F1-03 | Student is actually enrolled, no second step | Listed in classroom; 1 membership row | Listed; 1 row | PASS |
| F1-04 | Student count and student grade/section updated | Count 1, grade 9 | Count 1, grade 9, section set | PASS |
| F1-05 | Enrolling an already enrolled student | 200 and still 1 membership row | 200, 1 row, "already in this class and section" | PASS |
| F1-06 | Class + Section resolve without a classroom id | 201, correct classroom | 201, correct classroom | PASS |
| SETUP-2 | Create two more students | 201 + 201 | 201 + 201 | PASS |
| F1-07 | Missing class | 400 "Class is required", nothing created | 400, nothing created | PASS |
| F1-08 | Missing section when the class uses sections | 400 "Section is required", nothing created | 400, nothing created | PASS |
| F1-09 | Non-existent classroom id | 400, nothing created | 400, nothing created | PASS |
| F1-10 | Class does not match the selected classroom | 400, nothing created | 400, nothing created | PASS |
| F1-11 | Section does not exist in the class | 400, nothing created | 400, nothing created | PASS |
| F1-12 | Classroom of another university | 400, nothing created | 400, nothing created | PASS |
| F1-13 | Mentor tries to change a student's class | 403 | 403 | PASS |
| F1-14 | Change class moves the membership | 200; member of new classroom only; counts 2 and 2 | 200; new classroom only; 2 / 2 | PASS |
| F1-15 | Academic history preserved after class change | Same 2 results, still linked to old classroom, visible to student | 2 results, old classroom, 2 visible | PASS |
| F1-16 | Invalid target class / unknown student | 400 + 404 | 400 + 404 | PASS |
| F1-17 | Admin reads a student's current classroom | 200 and the new classroom | 200, new classroom | PASS |

### Feature 2 — API tests

| Test | What was tested | Expected | Actual | Result |
|------|-----------------|----------|--------|--------|
| F2-01 | Mentor configures 4 class subjects once | 200; Biology max 70 | 200; Physics 100, Chemistry 100, Mathematics 100, Biology 70 | PASS |
| F2-02 | Duplicate subject in template (different case) | 400 | 400 "Duplicate subject" | PASS |
| F2-03 | Invalid maximum marks (0, -5, abc, 1001, empty) | All 400; template unchanged | All 400; 4 subjects | PASS |
| F2-04 | All students inherit the subjects | 3 students × 4 default subjects | 3 students; 4 / 4 / 4 | PASS |
| F2-05 | Results saved for two students without sending subject definitions | 201 + 201; Biology total 70; 80% | 201 + 201; 70; 80% | PASS |
| F2-06 | Marks above the maximum | 400 | 400 "between 0 and 70" | PASS |
| F2-07 | Subject not configured for the student | 400 | 400 "not configured" | PASS |
| F2-08 | Duplicate subject in one result; tampered maximum | 400 + 400 | 400 + 400 | PASS |
| F2-09 | Remove Biology for Student A only | 3 subjects; Biology listed as removed | 3 subjects; Biology removed | PASS |
| F2-10 | Add Computer Science for Student A only | 201; marked custom | 201; custom | PASS |
| F2-11 | Duplicate subject for a student (custom, inherited, removed) | 409 × 3 | 409 × 3 | PASS |
| F2-12 | Override Physics maximum to 80 for Student A | Max 80, override, class default 100 | 80, override, 100 | PASS |
| F2-13 | Marks checked against the overridden maximum | 85 rejected; 80 accepted with total 80 | 400; 201, total 80 | PASS |
| F2-14 | Removed subject cannot be used in a new result | 400 | 400 | PASS |
| F2-15 | Other students and class defaults unchanged | Student 3: 4 defaults, Physics 100; template unchanged | As expected | PASS |
| F2-16 | Replace All without confirmation | 400 | 400 | PASS |
| F2-17 | Replace All for Student B | Mode custom; 0 subjects | Custom; 0 | PASS |
| F2-18 | Student B builds a custom set | 4 custom subjects, English 50 | 4 custom, English 50 | PASS |
| F2-19 | Student B results use custom subjects only | Custom saved; Physics rejected | 201; 400 | PASS |
| F2-20 | Class defaults unchanged after replacement | Template unchanged; Student 3 inherits 4 | As expected | PASS |
| F2-21 | Saved results keep their subjects | A: Biology 60/70; B: 4 subjects | As expected | PASS |
| F2-22 | Changing a class maximum affects future entry only | Student 3 Biology max 90; A's saved result still 60/70 | As expected | PASS |
| F2-23 | Editing a saved result with its saved maximums | 200 | 200 | PASS |
| F2-24 | Results that existed before this work | 5 rows identical | Identical | PASS |
| F2-25 | Restore one subject, then all class defaults | Physics 100 default; 4 defaults, not customized | As expected | PASS |
| F2-26 | Mentor not assigned to the classroom (5 operations) | 403 × 5 | 403 × 5 | PASS |
| F2-27 | Other university, student role, no token | 403 × 3 | 403 × 3 | PASS |
| F2-28 | Student not a member of the classroom | 400 + 400 | 400 + 400 | PASS |
| F2-29 | Mentor classroom list | Assigned classroom only | Assigned classroom only | PASS |
| F2-30 | Class with no template accepts typed subjects | 201 | 201 | PASS |
| F2-31 | Older result endpoints still work | 201 + 200 + 200 | 201 + 200 + 200 | PASS |
| F2-32 | Two class subjects swap names in one save | 200 | 200 | PASS |
| F2-33 | Deleting a class subject | Overrides removed; results kept | 0 overrides left; 4 results kept | PASS |

### Browser checks (performed in Chrome against the running app)

| Test | What was tested | Expected | Actual | Result |
|------|-----------------|----------|--------|--------|
| UI-01 | Add Student: Class dropdown content | Real classes only | "Select class", "Grade 9" | PASS |
| UI-02 | Add Student: Section before a class is chosen | Disabled, "Select a class first" | Disabled, "Select a class first" | PASS |
| UI-03 | Add Student: Section after choosing Grade 9 | The sections of Grade 9 | 4 sections listed | PASS |
| UI-04 | Add Student: save without a section | Blocked with "Section is required" | Blocked with that message | PASS |
| UI-05 | Add Student: save with class and section | Success message naming the class; student enrolled; form reset | Message shown; enrolled confirmed through the API; form reset | PASS |
| UI-06 | User list: Change Class dialog | Shows current class; moves student | Current class shown; "Student class updated successfully" | PASS |
| UI-07 | Class Results: page content | Mentor's classrooms, class subjects, marks table | All shown | PASS |
| UI-08 | Class Results: type marks in the table and Save All | Saved and shown again after reload | 88, 70, 81 saved; 82% | PASS |
| UI-09 | Edit Subjects: change a maximum | Override badge and reset link | Shown | PASS |
| UI-10 | Edit Subjects: add a subject | Custom badge; row becomes "Custom Subjects • Edit" | Shown | PASS |
| UI-11 | Result form for a custom student | Subjects prefilled with badges; saved-maximum hint | Shown; saved; 86% | PASS |
| UI-12 | Replace All Subjects confirmation and Cancel | Confirmation text; Cancel changes nothing | Shown; subjects unchanged | PASS |
| UI-13 | Configure Subjects dialog | Existing subjects and maximums loaded | Loaded | PASS |
| UI-14 | Browser console on the results page | No errors | No errors | PASS |

### Not tested

- The out-of-range check in the marks table (UI-08 typed 120 first): the save was attempted, but the error message was not captured, so this is not recorded as a pass. The same rule is covered on the server by F2-06.
- The GuideBot tour was not run end to end. Its anchors were kept in the page.
- Attendance records were not created during the class-change test; only results were used as history. The class-change code does not touch the attendance table.
- Arabic and Urdu display of the new labels was not checked.
- A student who belongs to two classrooms (the 409 path of Change Class) was not exercised.

---

## 9. Build / Validation Results

| Check | Result |
|-------|--------|
| Frontend production build (`npm run build` in `client/`) | Succeeded: 3428 modules, built in about 41 seconds. One existing warning about bundle size. |
| Backend syntax check (`node --check`) on all 9 changed or new server files | All passed |
| Backend start with the new code | Started; the three new tables were created |
| Focused API tests | 52 of 52 passed (second run) |
| Browser checks | 14 of 14 passed |
| Frontend lint (`npm run lint`) | Could not run: the project has no ESLint configuration file. This existed before this work. |
| Backend test suite | None exists in the project |
| Frontend test suite | None exists in the project |
| Type checks | Not applicable; the project is plain JavaScript |

One error appears in the server log at startup: `no such column: updatedAt` from the plan monitor. It was present before this work and is unrelated to it.

---

## 10. Safety / Backward Compatibility

- **Existing data preservation:** no existing table, column or row was altered. The schema change only adds tables.
- **Existing result preservation:** the five results in the database before this work were compared before and after the test run and were identical (test F2-24).
- **Duplicate protection:** membership is checked before insert and guarded by the existing unique constraint; subjects are unique per classroom and per student through unique indexes and server checks.
- **Authorization:** university, role, mentor assignment and classroom membership are checked on the server for every new endpoint.
- **Validation:** the same required-field and range rules exist in the browser and on the server; the server is the authority.
- **Transactions:** multi-row changes commit together or not at all.
- **Older endpoints:** `POST /api/results`, `GET /api/results/classroom/:id`, `GET /api/results/student/:id` and `DELETE /api/results/:id` were left as they were and still work (test F2-31).
- **Test data:** the database was backed up before testing and restored afterwards.

---

## 11. Known Limitations / Future Work

- **Older unauthenticated result endpoint.** `POST /api/results` in `server/routes/universalRoutes.js` existed before this work, has no login check, and does not apply the new validation. The new screens do not use it, but it remains reachable. It was not changed because the older Add Result page still depends on it.
- **Older Add Result page.** `/mentor/add-result` (opened from My Classroom) was not changed. It still uses typed subjects and the older endpoint.
- **Mentor classroom list is stricter than before.** The Class Results page now lists only classrooms a mentor is assigned to. Previously a mentor saw every classroom of the university on this page.
- **Transactions share one connection.** The application uses a single SQLite connection. Transactions started by the new helper are queued so they never overlap each other, but an unrelated query from another request that runs during a transaction would be part of it.
- **PostgreSQL.** The new tables are defined for SQLite only. The repository has no PostgreSQL adapter, so equivalent table definitions will be needed when the deployment database is set up.
- **Pass / Fail is still chosen by the mentor.** No pass mark exists in the system, so the status defaults to Pass as before.
- **Translations.** New admin labels were added in English only. The new mentor dialogs use English text directly, as the existing result form does.
- **Regenerated build output.** `client/dist/` was rebuilt by the verification build.

---

## 12. Implementation Ownership / Contribution

- This implementation introduced Class and Section dropdowns backed by the existing classroom data, and automatic, idempotent classroom enrolment on student creation.
- This work added an admin action and two endpoints for changing a student's class while keeping academic history.
- This work added a class/section subject template with per-student add, remove, maximum-mark override, replace-all and restore operations: three tables, ten endpoints and three interface components.
- This change modified the result save endpoint to enforce authorization, membership and marks validation, and corrected its insert so it works on the current schema.
- This change rewrote the mentor Class Results page as a class-wide marks table.
- The work was verified with 52 API tests, 14 browser checks and a production build.

---

## 13. Final Implementation Summary

Two workflow improvements were delivered end to end, in the interface, the API and the database.

An admin now adds a student by choosing a real Class and Section, and the student is enrolled in that classroom in the same step, with validation, duplicate protection and a safe way to change the class later.

A mentor now configures subjects and maximum marks once per class. Students inherit them, individual students can differ, and marks are entered in a single table. Saved results keep the subjects and maximum marks they were saved with.

Existing data and older endpoints were left intact. The remaining items are listed in section 11.


---
---

# Work Log Entry 2 — Report Sharing, Publish-Once, Notifications, Terms Modal

**Date of implementation:** 7 October 2026 (second entry of the day)

## 2.1 Summary

| # | Objective | Status |
|---|-----------|--------|
| 1 | AI Performance Report sharing works end to end (teacher shares, student is notified, opens the report, downloads the PDF) | Implemented and tested |
| 1 | Hugging Face configuration placed in the correct env file with a placeholder | Implemented |
| 1 | Short notification text from templates, with optional AI wording and safe fallback | Implemented and tested |
| 2 | A published assessment cannot be published again | Implemented and tested |
| 3 | Existing announcement/notification system connected to real workflows | Implemented and tested |
| Add-on | Terms & Conditions modal matches the LMS look | Implemented and checked in the browser |

## 2.2 What was found before changing anything

- **Notification system.** The LMS has one: the `announcements` table, the `/api/announcements` routes and the bell (`AnnouncementBell`). It could only broadcast by role (students / mentors / both) or by course. It could not address one person, carried no information about what it was about, and nothing happened on click. No second system existed and none was created.
- **Report sharing.** The backend of the AI Assessment Agent already stored reports, shared them idempotently and enforced that only the intended student can open one. The chain broke after that:
  1. Sharing created **no notification**. The student saw the report only as a list inside the My Tests page.
  2. There was **no report page**. The list offered a download button only, so a notification had nowhere to lead.
  3. The **bell was missing** on every student page except the dashboard.
  4. The bell's realtime socket connected to the **web page's own address**, not the backend, and the server never sent announcement events. Only the 10-second polling worked.
  5. **No AI provider was configured** in `server/.env`, so a new report could not be generated at all.
- **Publish duplication.** The page is the mentor portal's My Classroom → course → Create Assessment → Design Assessment (`/mentor/assessment/:id`). After a successful publish the Publish button and the question form stayed exactly as they were. The server accepted every repeat, did not check who was publishing, and reloading the page did not show that the assessment was already published.

## 2.3 Priority 1 — AI report sharing

- "Send to Student" now creates **one notification** for the student the report is about ("Performance Report Shared"). It is created on the first share only; repeat clicks return "already shared" and add nothing.
- New student page **`/student/assessment-agent/reports/:reportId`** shows the shared report and has a **Download PDF** button. The PDF is built in the browser from the same server data, with the same `reportPdf.js` the teacher uses. No second report system was built.
- The report list on My Tests gained a **View Report** link next to Download.
- Authorization is unchanged and server-side: a report is returned only when it belongs to the signed-in student's school, is about that student, and has been shared. Anything else is "not found".
- Existing report history was not modified.
- Report **generation** itself was not changed. It is covered by the module's existing tests with a mock provider (see 2.10).

## 2.4 Hugging Face configuration

```
ENV FILE:    server/.env
VARIABLE:    HF_TOKEN
PLACEHOLDER: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- `server/.env` is loaded by `server/server.js` (dotenv). The AI Assessment Agent has no env file of its own; it reads the server's environment in `ai-modules/ai-assessment-agent/backend/src/llm/generationConfig.js`. `HF_TOKEN` is the variable that file already defines for Hugging Face, so no new name was invented.
- Two companion settings were added beside it: `AIA_LLM_PROVIDER=huggingface` and `AIA_LLM_MODEL=Qwen/Qwen3-Next-80B-A3B-Instruct:deepinfra` (the example model from the module's own documentation; confirm the model before going live).
- The same block was added to `server/.env.example`, because `server/.env` is git-ignored.
- With the placeholder the module reports the key as invalid format, keeps AI **off** and calls nothing. AI switches on when a real `hf_...` token is put in.
- The token is backend only. It is sent only in the Authorization header to Hugging Face and is not an enumerable property, so it does not appear in logs, API responses or frontend code.

## 2.5 Notification text and prompt templates

File: `server/services/notificationText.js`.

- Eleven fixed templates, one per notification type, produce the title and a deterministic message.
- For three types (assessment published, assignment published, calendar event) an AI-written sentence may be used when a provider is configured. The prompt is built by the application from cleaned, trusted values (title, deadline, date).
- The AI controls **only** the sentence. Recipient, type, target, ids, permissions and dates are decided by application code.
- AI output is validated before use: it must be valid JSON with a `message`, 10–180 characters, contain the title, and contain no link, markup, placeholder or JSON. The same validation is applied to a message typed by an admin or teacher.
- Any failure (not configured, timeout after 8 seconds, provider error, unusable text) falls back to the template. The notification is still created and the user sees no error.

## 2.6 Priority 2 — publish once

**Backend** (`PUT /api/assessments/:assessmentId/publish`):

- Only the assessment's creator, the course teacher, or an admin of the course's school may publish (previously unchecked).
- An already published assessment returns **409** with `alreadyPublished: true` and changes nothing.
- The update runs with `WHERE isPublished = 0`, so simultaneous requests publish exactly once.
- The existing `isPublished` state is reused; no second lifecycle was added.

**Frontend** (`DesignAssessment.jsx`, `CreateAssessment.jsx`):

- The page reads the published state from the server, so a refresh shows it.
- After publishing, the Publish button and the question form are replaced by a success panel: "Assessment published successfully." with **View Course**, **Back to Classroom** and **Create New Assessment**.
- An immediate lock means rapid clicks send one request.
- Create Assessment ignores a double click while the request is running.

The AI-agent tests (`/teacher/assessments`) already rejected a second publish with 409; that was verified, not changed.

## 2.7 Priority 3 — notification architecture

**Storage.** Five columns were added to the existing `announcements` table:

| Column | Meaning |
|--------|---------|
| `recipientUserId` | The one user who may see the row. Empty = an ordinary announcement, as before. |
| `type` | What kind of notification it is. |
| `entityType`, `entityId` | What it is about. Used for click routing. |
| `dedupeKey` | Unique key: one notification per event per recipient. |

**Rules.**

- A targeted notification is visible to its recipient only. Other students, teachers and admins of the same school cannot list it, open it by id or mark it read.
- Recipients are always worked out on the server from the database. Recipient ids from the browser are never used.
- Every notification is created inside the recipient's own school.
- No URL is stored. The frontend maps `type + entityType + entityId` to a screen in `client/src/utils/notificationRoutes.js`.
- De-duplication is enforced by a unique index, so retries, double clicks, page refreshes and repeated reminder sweeps cannot duplicate.

**Delivery.** The existing bell shows the notifications, with an unread count, and each one opens its screen on click. The bell's socket now connects to the backend; a signed-in socket joins its own room and receives a `notification:new` event. The existing 10-second polling remains as the fallback. The bell was added to all student pages.

**Scheduler.** `server/schedulers/notification-scheduler.js` runs every 15 minutes (first run 20 seconds after start) for the time-based reminders.

### Scenarios implemented

| Recipient | Trigger | Notification | Opens |
|-----------|---------|--------------|-------|
| Student | AI-agent test published (whole class or selected students) | New Assessment | My Tests |
| Student | Course assessment published | New Assessment | The course page |
| Student | Assignment published | New Assignment | The assignment |
| Student | Assignment due within 24 hours and not submitted | Assignment Due Soon | The assignment |
| Student | Assignment deadline passed in the last 3 days, no submission | Assignment Deadline Missed | The assignment |
| Student | Teacher saves final marks for a submission | Result Available | The assignment |
| Student | Mentor saves a new result (Class Results) | Result Available | My Results |
| Student | Teacher shares an AI Performance Report | Performance Report Shared | That report |
| Student / Mentor | Calendar event created with "Notify participants" | New Calendar Event | Calendar |
| Mentor | Student submits an assignment | Assignment Submitted | Assignments |
| Mentor | Student finishes a test | Assessment Attempt Submitted | AI Assessments |
| Mentor | Attendance not marked today after 11:00 (not Sundays) | Attendance Pending | Attendance for that class |
| Admin | A teacher account is waiting for approval | Teacher Awaiting Approval | Mentor approvals |

Ordinary announcements (item 8 of the brief) already reached their audience through the bell and were left as they were.

### Calendar event → notification

The Create Event dialog has a **Notify participants** checkbox (off by default). When ticked, a message box appears with a **Suggest a message** button; the admin or teacher can edit the text or leave it empty for the standard message. The audience is the event's own audience: an admin event reaches the students, the mentors or both of that school as chosen; a mentor event reaches the students of that course, and only if the mentor teaches it.

### Not implemented / Remaining

- **"AI evaluation requires teacher confirmation" / "AI report pending review".** Not implemented. Both are produced by the teacher's own click and shown on the same screen at once, so a notification would only repeat what the teacher is looking at.
- **Preview/edit of the message when publishing a test or assignment.** Not implemented; those notifications use the template (or AI text when configured). Adding a preview step there would have meant redesigning the publish dialogs. Preview and edit exist for calendar events.
- **Pending/unactivated students for admins, workflow-failure alerts.** Not implemented.
- **Announcement details page.** Clicking an ordinary announcement in the bell still does nothing, as before.

## 2.8 Terms & Conditions modal

Presentation only; the acceptance logic, storage keys and terms text were not changed.

- Reused the LMS's existing visual language: gold `#B99652` primary button and accent, navy `#1e1b4b` text, cream `#fffdf4` surfaces, `#ebdcaa` borders, square corners and the DM Serif Display heading font, as used by the admin pages and dialogs.
- Removed the blue-to-purple gradient header. The header is now compact, white, with a gold top line and one supporting sentence.
- Section headings use the serif font with a light divider; line height and spacing were increased; the notice box uses the LMS cream/gold instead of blue.
- The footer is a separate cream action area. The Accept button uses the LMS primary button style and stays grey and disabled until the box is ticked.
- Added dialog semantics (`role="dialog"`, `aria-modal`, labelled title), a visible focus ring, and a scroll lock so the page behind does not scroll.
- The same styling was applied to the Terms dialog opened from the login page (`TermsConditionsModal.jsx`) so both look alike.

## 2.9 APIs, database, files

### APIs / routes

| Route | Change |
|-------|--------|
| `GET /api/announcements` | Also returns the caller's targeted notifications; hides other users' |
| `GET /api/announcements/:id` | New. One announcement/notification the caller may see |
| `PUT /api/announcements/:id/read` | A targeted notification can be marked read by its recipient only |
| `POST /api/announcements/suggest-text` | New. Admin/mentor preview of a short message; returns text only |
| `POST /api/calendar` | Accepts `notify` and `notifyMessage` |
| `PUT /api/assessments/:assessmentId/publish` | Ownership check; 409 when already published; notifies enrolled students |
| `POST /api/results/add` | Notifies the student when a result is first saved |
| `/api/assessment-agent/*` | No route added or changed. Six existing actions now report an event to the LMS after they succeed |
| Socket.IO | A connection with a valid token joins the room `user:<id>`; event `notification:new` |

### Database

No migration files were added. Following the project's existing convention for core tables, `server/config/sqlite-db.js` adds the five columns to `announcements` with `ALTER TABLE ... ADD COLUMN` at server start (ignored when they already exist) and creates two indexes: `idx_announcements_dedupe` (unique, on `dedupeKey` where set) and `idx_announcements_recipient`. Existing rows are untouched. The AI Assessment Agent's own tables and migrations were not changed.

### Files

| File | Change |
|------|--------|
| `server/services/notificationService.js` | Created. Creates targeted notifications in `announcements`; audience lookups |
| `server/services/notificationText.js` | Created. Templates, validation, optional AI text with fallback |
| `server/services/assessmentAgentNotifications.js` | Created. Turns AI-agent events into notifications |
| `server/schedulers/notification-scheduler.js` | Created. Deadline, attendance and approval reminders |
| `server/tests/notificationText.test.js` | Created. 16 unit tests |
| `server/config/sqlite-db.js` | Columns and indexes on `announcements` |
| `server/controllers/announcementController.js`, `server/routes/announcementRoutes.js` | Targeted visibility, read rule, two new handlers |
| `server/controllers/calendarController.js` | Optional notification on create |
| `server/controllers/assessmentController.js` | Publish once, ownership, notification |
| `server/controllers/resultController.js` | Notification on new result |
| `server/routes/assessmentAgentRoutes.js` | Passes the event handler to the agent |
| `server/server.js` | Socket rooms; starts the scheduler |
| `server/.env`, `server/.env.example` | Hugging Face block with placeholder |
| `ai-modules/ai-assessment-agent/backend/src/http/createAssessmentRouter.js` | Optional `onEvent` hook |
| `ai-modules/ai-assessment-agent/backend/src/assignments/assignmentRoutes.js` | Reports publish, submit and evaluate events |
| `ai-modules/ai-assessment-agent/backend/src/integration/lmsAssessmentAgent.js` | Passes `onEvent` through |
| `client/src/utils/notificationRoutes.js` | Created. Notification → screen |
| `client/src/pages/assessment-agent/StudentPerformanceReport.jsx` | Created. Student report page |
| `client/src/components/AnnouncementBell.jsx` | Backend socket, unread count, click routing |
| `client/src/components/StudentLayout.jsx` | Bell on student pages |
| `client/src/pages/assessment-agent/StudentReportNotifications.jsx` | View Report link |
| `client/src/App.jsx` | Report page route |
| `client/src/calendar/CreateEventModal.jsx` | Notify participants, message box, suggestion |
| `client/src/pages/mentor/DesignAssessment.jsx`, `CreateAssessment.jsx` | Publish-once behaviour |
| `client/src/components/ControlledTermsModal.jsx`, `TermsConditionsModal.jsx` | Styling |
| `client/dist/` | Regenerated by the verification build |

## 2.10 Tests performed

No real AI call was made in any test.

### Unit tests — `server/tests/notificationText.test.js` (node:test): 16 of 16 passed

Templates for every type and the agreed wording; unknown type refused; validation accepts a plain sentence and rejects links, markup, placeholders, JSON and bad lengths; a valid AI sentence is used and the title is never taken from the AI; provider failure, timeout and seven kinds of unusable output fall back to the template; the AI is not called when unconfigured or for template-only types; `HF_TOKEN` is the variable read, the placeholder keeps AI off; the token is absent from printed configuration and provider objects; with a fake fetch the token appears only in the Authorization header and in no log line, including on a rejected-credentials error.

### AI Assessment Agent's own suite (`npm test` in the module)

| | Before this work | After |
|---|---|---|
| Passed | 422 | 422 |
| Failed | 0 | 0 |
| Cancelled | 93 | 93 |

The 93 cancelled tests are the module's HTTP integration suites. They cannot start on this copy of the server because they require `server/config/jwt` and `server/middleware/requireTenant`, which do not exist here. This was the case before this work. The passing tests include report generation, validation and storage with a mock provider.

### API tests against the running server: 44 of 44 passed

Run on a backed-up database that was restored afterwards. Test users were signed in with locally signed development tokens; one unshared report was inserted as a fixture (a copy of an existing report) because generating one needs a real AI call. The first run scored 41 of 44: all three failures were wrong expectations in the test script (a status code name, and a membership row pointing at a user that does not exist), not application faults. After correcting the script the suite was rerun on a freshly restored database.

| Area | Tests | Result |
|------|-------|--------|
| Hugging Face: AI reported off with the placeholder; no token in the response; suggestion falls back to the template; students and unknown types refused | HF-01 to HF-04 | 4 PASS |
| Report: persisted and listed; correct student opens it; another student, another school and a teacher refused; re-share safe; cannot be opened or shared by the wrong people before sharing; share creates one notification with the right target; repeated shares add none; visible to the recipient only; cannot be read or marked by id by others; read/unread works; history unchanged | RPT-01 to RPT-12 | 12 PASS |
| Publish: once; repeat rejected with one row; refresh shows published; three simultaneous requests publish once; non-owner and student refused, empty assessment refused; a further assessment still publishes | PUB-01 to PUB-06 | 6 PASS |
| Notifications: course assessment, AI-agent test, nobody outside the class, attempt submitted, assignment published, assignment submitted, final marks, other school cannot open the target, mentor result, calendar without notify, calendar students only, edited message used, unsafe message replaced, mentor course event, due soon, missed deadline, attendance reminder, no duplicates after refreshes and sweeps, ordinary announcements still work, old announcements unchanged, every notification structured with a unique key and no URL, none crosses schools | NTF-01 to NTF-22 | 22 PASS |

Also checked: the server log of the test run contains neither the placeholder nor any `hf_` text, and no notification error.

### Browser checks (Chrome, running app): all passed

| Check | Result |
|-------|--------|
| Student bell shows the unread count and the list, including each new notification type | PASS |
| Clicking "Performance Report Shared" opens `/student/assessment-agent/reports/2` with the report's seven sections | PASS |
| Download PDF produces a PDF file (about 19.7 KB) with no error | PASS |
| After reading, the unread count clears | PASS |
| Another student opening the same report address sees "This report is not available" and no download | PASS |
| Publish: button and question form replaced by the success panel; refresh shows "This assessment is published" | PASS |
| Publish: three rapid clicks send one request (after the click lock was added; before it, three were sent and the server rejected two) | PASS |
| Create New Assessment from the success panel opens an empty form | PASS |
| Calendar: Notify participants is off by default, reveals the message box, Suggest a message fills it | PASS |
| Terms: new look shown on opening the portal; 10 sections unchanged; no gradient; page behind does not scroll | PASS |
| Terms: Accept disabled until the box is ticked, then active; accepting closes the dialog and stores acceptance | PASS |
| Terms at 500 px width: fits the viewport, no horizontal scroll, button inside and reachable | PASS |

### Build

Frontend production build: succeeded (3430 modules). Backend syntax check passed on all changed files. Lint could not run (the project has no ESLint configuration; unchanged from before).

### Not tested

- A real Hugging Face call (deliberately; needs a real token).
- Generating a brand-new report through the interface (needs a real AI call).
- The "Teacher Awaiting Approval" notification: the data has no unapproved teacher, so the rule ran but had nothing to create.
- Realtime arrival of a notification over the socket in the browser. Arrival through the bell's polling was observed.
- The GuideBot tours, phone-width layouts below 500 px, and Arabic/Urdu text.

## 2.11 Known limitations

- **First start on existing data.** When the server starts, students who missed an assignment deadline in the last three days, and class teachers whose attendance is not marked today, receive their notifications straight away.
- **Bell marks everything read on open.** This is the existing behaviour and was kept; a notification is not marked read individually on click.
- **Two bells on dashboards.** Admin, mentor and student dashboards already rendered a bell in addition to the layout's; this was not changed. The student layout hides its bell on the dashboard to avoid a third.
- **Attendance reminder hour** is fixed at 11:00 server time unless `ATTENDANCE_REMINDER_HOUR` is set; the LMS has no timetable to derive it from.
- **Re-publishing after unpublishing** an AI-agent test does not notify the students a second time.
- **Generic CRUD routes.** `server/routes/universalRoutes.js` still exposes generic update routes for many tables, including `announcements`, as it did before. The new read route takes precedence for `GET /api/announcements/:id`.
- **Calendar events have no school column.** Notifications are scoped to the creator's school; the calendar listing itself is unchanged.
- **Model name.** `AIA_LLM_MODEL` is set to the example from the module's documentation and must be confirmed.
- **Default JWT secret.** `server/.env` sets no `JWT_SECRET`, so the development default is in use. The tests relied on this to sign local test tokens. Set a real secret before deployment.

## 2.12 Implementation ownership / contribution

- This work connected the existing announcement system to thirteen workflow events, with per-user targeting, structured click routing and de-duplication, without adding a second notification system.
- This work completed the AI report sharing chain with a notification and a student report page, and configured the Hugging Face provider location with a placeholder.
- This change made assessment publishing idempotent on the server and unmistakable in the interface.
- This change restyled the Terms & Conditions dialogs to the LMS design language without altering their behaviour.
- Verified with 16 unit tests, 44 API tests, the module's 422 passing tests and the browser checks listed above.


---
---

# Work Log Entry 3 — Teaching Scope, Class/Section Targeting, Calendar Fix, Class Creation, AI Classroom, Question Pictures

**Date of implementation:** 8 October 2026

## 3.1 Implementation summary

| Workflow | Status |
|----------|--------|
| Shared teacher access scope (classes → sections → courses) with server-side checks | Implemented and tested |
| Announcements by Class → Section → optional Course | Implemented and tested |
| Calendar events by Class → Section → optional Course, with school and class scope | Implemented and tested |
| Calendar "Notify participants" end to end | Fixed and tested |
| Create a missing class/section from Add Student | Implemented and tested |
| AI assessment requires an authorized classroom | Implemented and tested |
| Academic level (grade + section) passed to AI generation | Implemented and tested |
| Optional picture on every question type, private storage | Implemented and tested |

No request/approval workflow, no new notification system and no multimodal AI were added, as decided.

## 3.2 Workflows changed

### Teaching scope (Phase 1)

One small helper, `server/helpers/teachingScope.js`, is now the single place that answers "may this user act on this classroom or course?".

- **Admin:** every classroom of their school and the courses inside them.
- **Teacher:** classrooms where they are the class teacher, are listed in `classroomAssignments`, or teach a course. Inside those, the courses they teach; a class teacher or assigned teacher may act on every course of that classroom.
- `authorizeClassroom` and `authorizeCourse` re-check every id that arrives from the browser. `authorizeCourse` also checks that the course belongs to the class and section that was selected.
- The result/subject code from Entry 1 now uses this helper instead of its own copy.
- `GET /api/classrooms/teaching-scope` returns the whole Class → Section → Course tree in two queries.

### Announcements (Phase 2)

- A teacher chooses **Whole class and section** or **One course**, then Class → Section (→ Course).
- A general class announcement is stored with the classroom and no course, and is shown to the students of that classroom only.
- A course announcement must name a course of the selected class and section.
- The admin's school-wide announcement is unchanged.

### Calendar (Phase 2)

- Teachers: Class → Section, optional Course. Admins: the existing "Display for" choices plus **One class and section**.
- Every event now stores its school and, when targeted, its classroom.
- The calendar list is limited to the user's own school, and to the user's own classes and courses.
- Editing an event can no longer change who it is for.

### Calendar "Notify participants" (the reported fault)

- **Root cause:** `calendar_events` had no school column. An event created by an admin of one school appeared on every school's calendar, while its notifications (correctly) went only to the creator's school. The two test events were created by `admin@gmail.com` of Demo University; their notifications existed, for Demo University users.
- **Fix:** events carry `university_id` and `classroomId`; the list is filtered by school; the audience is resolved from the event itself: course → enrolled students, class/section → students of that classroom, school-wide → students/mentors of the school.
- Clicking the notification opens the calendar on the month of that event (`?eventId=`).
- **Quote bug:** a message beginning with a quotation mark lost it. Only a pair of quotes wrapping the whole text is now removed.
- A notification failure does not undo the event; this was already the behaviour and was kept.

### Class creation from Add Student (Phase 3)

- Under the Class and Section dropdowns there is a link, **Class or section not listed? Create it**. The admin types the class and section, it is created, the list reloads and the new entry is selected.
- Only admins can do this, which matches who can add students and who can already create classrooms.
- The server refuses a duplicate class + section within a school (ignoring case and spaces) and returns the existing classroom, which the form then selects.
- Class names are no longer limited to Grade 1–12. Numbered grades keep the name "Grade 10 - A"; a named class becomes "BSc - A". The Create Classroom dialog also accepts a typed class name.
- A classroom is always created as class + section together, so a section cannot exist without its class.

### AI assessment (Phase 4)

- Generating questions and saving AI-reviewed questions now require a classroom, checked on the server.
- The classroom must be one the teacher is assigned to. This applies to every place the AI agent accepts a classroom from a teacher: creating and editing a test, publishing, listing students, generation, and assignments.
- The AI screen lists only the teacher's classes.
- A manually typed draft may still be started without a class, as before.
- The prompt now carries a structured `audience` object with **grade** and **section**, and one added rule telling the model to write for that academic level.
- **Deliberate difference from the brief:** the class *name* is not sent. The module has an existing privacy rule and test that the free-text class name never reaches the AI provider. Grade and section already state the level, so the rule was kept.
- No extra AI evaluation step was added; the existing output validation and content guard still apply.

### Question pictures (Phase 5)

- Every question type can carry one optional picture: single MCQ, multiple-select, numerical, descriptive (assignment) questions, AI-generated questions during review, and legacy course-assessment questions.
- **Storage:** the AI module's existing private file store, in its own folder `data/question-images` (git-ignored). The database holds only a short key. Nothing is placed in the public `/uploads` folder.
- **Upload:** PNG, JPG, GIF or WebP up to 2 MB. The type is detected from the file's bytes and must match the declared type. SVG is refused. Teachers only.
- **Viewing:** teachers load a picture by its key. Students are never given the key: they request "the picture of question N of test T", and the server checks that the student may see that question before returning it. The browser loads it with the user's token and shows it from memory.
- **Legacy course assessments:** the "paste image URL" box was replaced by the same upload control. Older questions that hold a web address still display. The `questionImage` value was previously dropped because the column did not exist; it is now stored.
- No multimodal AI: the picture is for people to look at; it is not sent to the AI.

## 3.3 Files changed

| File | Change |
|------|--------|
| `server/helpers/teachingScope.js` | Created. Classroom/course scope and authorization |
| `server/helpers/subjectConfig.js` | Uses the shared scope instead of its own copy |
| `server/controllers/classroomController.js`, `server/routes/classroomRoutes.js` | Scope endpoint; teacher classroom list fixed; duplicate check; named classes |
| `server/controllers/course-controller.js` | Role-limited list; access checks on classroom list, create, update, delete |
| `server/controllers/announcementController.js` | Class/section/course targeting and audience |
| `server/controllers/calendarController.js` | School + class scope, audience, list rewrite, fixed target on edit |
| `server/controllers/assessmentController.js`, `server/routes/assessmentRoutes.js` | Legacy question picture stored and served |
| `server/routes/assessmentAgentRoutes.js` | Shared private picture store |
| `server/config/sqlite-db.js` | Additive columns (see 3.4) |
| `server/services/notificationText.js` | Quote fix |
| `ai-modules/ai-assessment-agent/backend/src/core/questionImage.js` | Created. Picture validation and key format |
| `.../adapters/lms/migrations/009_aia_question_images.sql` and `.down.sql` | Created |
| `.../backend/scripts/applyMigration.js` | Knows migration 009 |
| `.../adapters/lms/SqliteAssessmentLmsAdapter.js`, `sqliteAssignmentStore.js` | Teacher classrooms; picture key read/write |
| `.../assignments/LocalSubmissionFileStore.js` | Same class can also hold picture files |
| `.../core/AssessmentService.js`, `.../assignments/AssignmentService.js` | Teacher classroom checks; classroom required on review-save; student picture lookup |
| `.../core/assessmentValidation.js`, `.../assignments/assignmentValidation.js`, `.../core/questionTypes.js` | `imageKey` on questions; `hasImage` for students |
| `.../core/ai/generationRequest.js`, `.../core/ai/generationPrompt.js` | Classroom required; `audience` |
| `.../http/createAssessmentRouter.js`, `.../integration/lmsAssessmentAgent.js` | Picture routes and store |
| `ai-modules/ai-assessment-agent/tests/scope/teacherScopeAndImages.test.js` | Created. 10 tests |
| Eight existing module test files and two test helpers | Updated for the new rules (classroom in requests, teacher assignments, new prompt field, new column) |
| `client/src/components/ClassSectionCoursePicker.jsx` | Created. Shared picker |
| `client/src/components/QuestionImage.jsx` | Created. Upload control and private image display |
| `client/src/components/announcements/CreateAnnouncementModal.jsx`, `client/src/calendar/CreateEventModal.jsx` | Use the picker |
| `client/src/calendar/CalendarPage.jsx`, `client/src/utils/notificationRoutes.js` | Open on the notified event |
| `client/src/components/admin/ClassSectionSelect.jsx`, `client/src/pages/admin/CreateClassroomModal.jsx` | Create class in place; named classes |
| `client/src/pages/assessment-agent/` — `AiAssessmentGenerator`, `QuestionEditor`, `questionForm`, `TeacherAssessments`, `StudentAttempt`, `TeacherAssignments`, `StudentAssignment` | Classroom required; pictures |
| `client/src/pages/mentor/DesignAssessment.jsx`, `client/src/pages/student/AttemptAssessment.jsx` | Legacy pictures |
| `client/src/context/TranslationContext.jsx` | Six English labels |
| `client/dist/` | Regenerated by the verification build |

## 3.4 Database / schema changes

All additive. No table, column or row was removed or rewritten, except the one back-fill noted below.

| Where | Change | Mechanism |
|-------|--------|-----------|
| `announcements` | `classroomId` | `sqlite-db.js` at server start |
| `calendar_events` | `university_id`, `classroomId` | `sqlite-db.js` at server start |
| `calendar_events` | Existing rows: `university_id` set to the school of the user who created the event | Same; runs only where the value is empty |
| `assessment_questions` | `questionImage` | `sqlite-db.js` at server start |
| `aia_questions`, `aia_assignment_questions` | `image_key` | Module migration **009**, applied with the module's own `applyMigration.js` after a backup |

All 10 existing calendar events had a known creator, so none was left without a school. No class relationship was invented for old events.

## 3.5 API changes

| Route | Change |
|-------|--------|
| `GET /api/classrooms/teaching-scope` | New. Class → Section → Course tree for the caller |
| `GET /api/classrooms/my-classrooms`, `/mentor/:id` | Teacher gets assigned classrooms only (previously every classroom of the school); 403 for other roles |
| `POST /api/classrooms` | 409 on duplicate class + section; named classes |
| `GET /api/courses` | Admin: school; teacher: courses they teach; student: enrolled courses |
| `GET /api/courses/classroom/:id` | Access-checked |
| `POST /api/courses/create-course`, `PUT`/`DELETE /api/courses/:id` | Classroom / ownership checked |
| `POST /api/announcements` | Teachers send `classroomId` and optional `courseId`; both validated. A course-only request is still accepted for a course the teacher may manage |
| `POST /api/calendar` | Accepts `classroomId` and `courseId`; validated |
| `GET /api/calendar` | Limited to the caller's school, classes and courses |
| `PUT /api/calendar/:id` | Only title, description and dates can change |
| `POST /api/assessments/add-question` | Stores `questionImage` |
| `GET /api/assessments/questions/:questionId/image` | New. Legacy question picture, access-checked |
| `POST /api/assessment-agent/teacher/question-images` | New. Upload |
| `GET /api/assessment-agent/teacher/question-images/:key` | New. Teacher view |
| `GET /api/assessment-agent/student/assessments/:id/questions/:questionId/image` | New |
| `GET /api/assessment-agent/student/assignments/:id/questions/:position/image` | New |
| `POST /api/assessment-agent/teacher/assessments/generate`, `/from-review` | `classroomId` required and must be the teacher's |
| Question payloads in the AI agent | Optional `imageKey`; student views return `hasImage` |

## 3.6 Authorization changes (bugs closed)

| Before | Now |
|--------|-----|
| Mentor classroom endpoints returned every classroom of the school | Assigned classrooms only |
| `GET /courses` returned every course of the school to any role | Limited by role |
| Classroom course list had no access check | Admin of the school, assigned teacher, or member student |
| A teacher could update or delete any course | Only one they may manage |
| A teacher could post an announcement for any course id | Class and course both validated |
| A teacher could create an event for any course id | Class and course both validated |
| The AI agent accepted any classroom of the school from a teacher | Only the teacher's classrooms |
| Calendar events were visible across schools | Limited to the creator's school |
| Editing an event could change its course or audience | Not possible |

## 3.7 Notification inventory (final)

| Trigger | Recipient | Type | Entity | Route | Status |
|---------|-----------|------|--------|-------|--------|
| Admin announcement | Students / mentors of the school | plain | — | none | Working |
| Teacher announcement, whole class | Students of the classroom | plain | classroom | none | Fixed (new targeting) |
| Teacher announcement, course | Enrolled students | plain | course | none | Fixed (course now validated) |
| AI test published | Class or selected students | ASSESSMENT_PUBLISHED | aia_assessment | My Tests | Working |
| Course assessment published | Enrolled students | ASSESSMENT_PUBLISHED | course | Course page | Working |
| Assignment published | Class | ASSIGNMENT_PUBLISHED | aia_assignment | Assignment | Working |
| Assignment due in 24h | Non-submitters | ASSIGNMENT_DUE_SOON | aia_assignment | Assignment | Working |
| Assignment deadline missed | Non-submitters | ASSIGNMENT_MISSED | aia_assignment | Assignment | Working |
| Final marks saved | That student | RESULT_AVAILABLE | aia_assignment | Assignment | Working |
| Mentor result saved | That student | RESULT_AVAILABLE | result | My Results | Working |
| Report shared | That student | REPORT_SHARED | performance_report | Report page | Working |
| Calendar event + notify | Course, class or school audience | CALENDAR_EVENT | calendar_event | Calendar on that event | Fixed |
| Assignment submitted | Teacher | ASSIGNMENT_SUBMITTED | aia_assignment | Assignments | Working |
| Test attempt submitted | Teacher | ATTEMPT_SUBMITTED | aia_assessment | AI Assessments | Working |
| Attendance not marked | Class teacher | ATTENDANCE_PENDING | classroom | Attendance | Working |
| Teacher awaiting approval | School admins | MENTOR_PENDING_APPROVAL | user | Approvals | Partial: rule runs, never exercised (no such data) |
| Stock request status | Requester | `request_notifications` table | request | — | Backend only (no screen reads it); untouched |
| Subscription expiry | SuperAdmin | — | — | — | Not implemented (log line only); untouched |
| Realtime announcement socket events | — | — | — | — | UI only (server never emits them); polling covers it |

"Working" and "Fixed" rows were exercised by the tests in 3.8. No notification type was added in this entry.

## 3.8 Tests executed

No real AI call was made: the test server ran with `AIA_AI_GENERATION_ENABLED=false`. The database was backed up first and restored afterwards.

### API tests for this entry: 45 of 45 passed

Passed on the first run, and again after the class-teacher comparison fix described below.

| Area | Tests | Covers (numbers refer to the brief's checklist) |
|------|-------|--------------------------------------------------|
| Teaching scope and courses | SCP-01 to SCP-08 | 6, 7, 8, 10, 14: assigned classes only; admin school-wide; course under its own class + section; course list by role; changing the classroom id refused; other teacher's course cannot be edited or deleted |
| Announcements | ANN-01 to ANN-05 | 11, 12: other class 403; course of another class 400; other teacher's course 403; general class announcement seen by that class only; course announcement; admin unchanged |
| Calendar | CAL-01 to CAL-12 | 13, 15, 16, 18, 19: other class/course refused; stored with school and class; exactly the class's students notified; quote kept; reaches the student's notification list with a routable target; shown on that class's calendar only; course event notifies enrolled students; another school's event invisible here and notifies nobody here; old events back-filled and readable; admin class and school-wide events; no duplicates; edit cannot re-target |
| Class creation and Add Student | CLS-01 to CLS-04 | 1, 2, 3, 4, 5: BSc created; duplicate refused (also different case/spaces); new section; numbered name kept; teacher refused; listed at once; student added once |
| AI assessment | AI-01 to AI-04 | 25, 26: missing classroom 400; unassigned or unknown classroom 400; authorized classroom passes validation; review-save needs an authorized classroom; AI screen lists own classes; manual draft still allowed |
| Question pictures | IMG-01 to IMG-12 | 28–35: upload; content, size, type and role checks; MCQ, multiple-select and numerical keep a picture; AI-reviewed save with a picture; add and remove on edit; forged key refused; survives publish and reload; student sees `hasImage` and never the key; identical bytes returned; other class, other school, student on the teacher route, no login and the public URL all refused; descriptive question; legacy picture and legacy web address kept; legacy access rules; only keys in the database |

Checklist item 9 (search cannot escape scope): the search box filters the list already loaded for that class in the browser, and the server re-checks the submitted course (ANN-01, CAL-01). The box appears only above six courses, and no class in the test data has that many, so the search box itself was not exercised.

Checklist item 27 (grade context reaches the generation layer) is covered by the module test below, since the API test deliberately made no AI call.

### Regression: the 44 notification and publish tests from Entry 2

- On a freshly restored database: **44 of 44 passed** (items 20–24).
- Two adjustments were needed to the test script, both because of this entry's rules: the teacher who creates AI-agent tests for classroom 10 must now be the teacher assigned to it, and the attendance check now counts today's reminders only.
- When the same script was later run on a database already used by the other suite, one count (NTF-01) was off by one because that suite had published one more assessment in the same course. On the clean database it passes.

### AI module test suite

| | Before this entry | After |
|---|---|---|
| Passed | 422 | 432 |
| Failed | 0 | 0 |
| Cancelled | 93 | 93 |

- Ten new tests were added in `tests/scope/teacherScopeAndImages.test.js`: assigned classes only; class-teacher and course-teacher relationships; an unassigned teacher of the same school refused; classroom required for AI paths but not for a manual draft; a Grade 9 and a Grade 12 prompt differ and carry `audience` without the class name; pictures for every type, hidden from students; forged keys refused; descriptive question pictures; upload validation by content.
- Existing tests were updated where the rules changed on purpose: requests now include a classroom, the fixture assigns teachers to their classes, and expectations include the new `audience` field and `image_key` column.
- The 93 cancelled tests are the module's HTTP suites, which cannot start on this copy of the server (they need `server/config/jwt` and `requireTenant`). Unchanged from before.
- One of the new tests found a real defect: the class-teacher check compared a text column with a number, which matched or not depending on the database driver. The comparison was made type-safe in the module and in the server helper, and all suites were rerun.

### Unit tests: `server/tests/notificationText.test.js` — 16 of 16 passed

### Browser checks (Chrome, running app)

| Check | Result |
|-------|--------|
| Add Student: create "BScUI…" section A in place; it appears in the Class list and is selected; a duplicate shows "already exists"; the student is saved into it | PASS |
| Add Student page crashed on first load of the new panel (found here, fixed, rechecked) | Fixed, PASS |
| Teacher calendar: Class shows only Grade 12, Section only BCA-A; course list shows only that class's two courses; event saved with school 20, classroom 10 | PASS |
| Student: bell shows the new calendar notification; clicking opens `/student/calendar?eventId=16` on May 2027 with the event visible | PASS |
| Teacher announcement: class required; course required in "One course" mode; published | PASS |
| Question editor: "Add a picture (optional)" uploads, shows a preview, saves the key; the question list shows the picture | PASS |
| Student attempt page shows the picture, loaded privately; no key in the page | PASS |
| Browser console on the attempt page | No errors |

### Not tested

- The AI generator screen in the browser: AI was switched off for the test server, so the screen was unavailable. Its rules are covered by API and module tests.
- A real AI generation with the new `audience` field (no real AI call was made; the Hugging Face account also has no credits).
- The course search box (needs more than six courses in one class).
- Legacy picture upload and display in the browser (covered by API tests IMG-10, IMG-11).
- The Create Classroom dialog's typed class name in the browser (the same server path is covered by CLS-01, CLS-03).
- GuideBot tours, Arabic/Urdu text, phone-width layouts of the new forms.

## 3.9 Build results

- Frontend production build: succeeded (3432 modules).
- Backend syntax check: passed on every changed file.
- Lint: not available (no ESLint configuration in the project).

## 3.10 Existing-data issues found (reported, not changed)

- **Teacher in one school, classes in another.** `rishi@core5.co.in` belongs to school 20 but is the class teacher of classrooms 4 and 8, and teaches courses 4–18, which all belong to school 15. Under the new rules he sees only his school-20 classrooms (9 and 11) and none of those courses.
- **Courses not attached to a class.** In school 20, courses 19 and 20 have no classroom, so no course appears under any class in the picker until courses are created in, or attached to, a class.
- **Memberships pointing at a missing user.** Classroom 10 and course 20 list student id 50, which does not exist.
- **Duplicate classrooms.** School 15 has two "Grade 10 - A" and two "Grade 10 - C". New duplicates are now refused; these were left as they are.
- **Class teacher stored as text.** `classrooms.classTeacher` holds the teacher id as text; the new checks handle this.

## 3.11 Known limitations

- **Orphan picture files.** A picture that is uploaded but never saved with a question, or is later replaced, stays on disk. Nothing references it and it cannot be reached without its key.
- **Test files left on disk.** Four test pictures and two test PDFs written during testing remain in `ai-modules/ai-assessment-agent/data/question-images` and `data/submissions`. The database was restored, so nothing references them. They can be deleted by hand.
- **No unique index on class + section.** Existing duplicates prevent adding one, so two simultaneous create requests could still both succeed.
- **Legacy assessment questions.** Adding a question to a course assessment still has no ownership check; that was not part of this work.
- **Admin class-targeted announcements.** Admins still announce by audience (students / mentors / both); only teachers got class and course targeting.
- **Plain announcements have no click target**, as before.
- **Transactions share one connection**, as noted in Entry 1.

## 3.12 Backward compatibility

- Text-only questions, existing tests, assignments, results and reports are unchanged.
- Older clients that send only a `courseId` for an announcement or event are still accepted, when the teacher may manage that course.
- Old calendar events remain visible to their own school and course audience.
- Old legacy questions that hold a web address still display.
- A database without migration 009 keeps working; pictures are simply unavailable until it is applied.

---

# Work Log Entry 4 — Critical Security Remediation, School Isolation and Verification Suite

**Date of implementation:** 12 October 2026

## 4.1 Implementation summary

| Workstream | Status |
|------------|--------|
| Deny-by-default API gate with one access policy for every route | Implemented and tested |
| Strict sessions: signed token plus account, role and school re-read from the database | Implemented and tested |
| Removal of the guest fallback, the unsigned superadmin token, demo logins and role-at-registration | Implemented and tested |
| Central school isolation and ownership checks (URL, query and body ids) | Implemented and tested for the LMS core, fees, expenses, orders, requirements; not verified with data for inventory, vendors, stock requests |
| Generic CRUD router reduced to read-only, school-scoped access | Implemented and tested |
| Password reset rework (hashed codes, attempt limit, single use, real rate limits) | Implemented and tested |
| Payment and subscription verification; credentials removed from source | Implemented and tested without gateway calls; credential rotation pending with the owner |
| Upload policy, CORS allow-list, authenticated sockets, log and error hygiene | Implemented and tested; authenticated file download not built |
| Start-up safety (configuration checks, no implicit seeding, restart tests) | Implemented and tested |
| Automated security and integrity suite for the server core | 226 new tests, all passing |

The work follows the Phase 0 audit (`docs/LMS_PRODUCT_AUDIT.md`). It addresses the audit's P0 list and its P1 security findings. The data-model findings (foreign keys, duplicate sources of truth, student key mismatch) and the product-shape decisions in section 21 of the audit were not part of this entry. The finding-by-finding record is in `docs/security/SECURITY_REMEDIATION_PLAN.md`; a plain-language version is in `docs/security/SECURITY_FIXES_SIMPLE_HINGLISH.md`.

## 4.2 Why the work was necessary

The audit showed that the core server could be read and changed without logging in, that authentication could be bypassed in four ways, and that schools were not isolated. Before changing anything, the untouched code was started from a separate worktree on an empty database and the audit's attacks were repeated: nine reproduced live (for example a user record with its password hash returned with no login, a hand-written superadmin token accepted, a demo admin logged in with no password, a record deleted with no login). One further defect appeared during that run: an unauthenticated password-reset request stopped the server process.

## 4.3 What was found before changing anything

- The repository was clean on `main`. The local database held only the built-in demo seed, so no real school data was at risk on this machine. A copy was taken and the commit tagged `pre-security-remediation-baseline`.
- The two companion documents named in the brief (feature inventory, workflow gap register) do not exist in this repository. The audit report was used alone.
- The AI Assessment module's HTTP tests expect `server/config/jwt.js` and `server/middleware/requireTenant.js`. Both were missing (the 93 cancelled tests noted in Entries 2 and 3). Their expected behaviour was taken from those tests and both modules were written to match.
- The audit's "fee structures deleted at start-up" (DATA-012) did not reproduce: start-up only inserted default rows into an empty table. That seeding was still gated, because it re-created rows an admin had removed and created demo accounts with a public password.
- The client contained a superadmin email and password in source and built the unsigned superadmin token itself.

## 4.4 Architecture decisions

**One gate instead of per-route checks.** `server/middleware/apiAccessGate.js` runs before every router and reads `server/config/accessPolicy.js`, an ordered table of path, method and allowed roles. A request that matches no rule is refused. The 16 public endpoints are an explicit list, and a test fails if that list changes. The existing per-route `authMiddleware` and `roleMiddleware` calls were left in place as a second layer.

**Identity from the database.** `authMiddleware` verifies the token (HS256, no fallback secret), then loads the account. Role and school come from the row. A token whose role or school no longer matches is refused, as is a deleted or unapproved account. This removed the `universityId || 1` default from 49 places.

**School and relationship rules in one module.** `server/helpers/schoolScope.js` maps each record type to its school, directly or through a parent (a week through its course, a result through its classroom). It is applied three ways: `router.param` guards on 18 routers, a check of every known id field in the query string and JSON body inside the gate, and an explicit call after multipart parsing for uploads. Students are limited to their own records, classrooms and courses; teachers to the classrooms, courses and students they teach, reusing the definition from `helpers/teachingScope.js` (Entry 3). A record of another school is answered with 404.

**Remove rather than guard.** The generic router's create, update, delete, bulk and export routes, 16 debug, test and demo endpoints, and the `test-upgrade` subscription route were deleted after checking that the client does not depend on them. The API went from 523 registered routes to 369.

**Testability without new dependencies.** `server.js` now exports the app and listens only when run directly. The database path, uploads folder, background jobs, mail transport and `.env` loading can each be redirected by an environment variable. Tests use `node:test`, as the existing suites do.

## 4.5 Files changed

New server modules:

- `config/accessPolicy.js`, `config/jwt.js`, `config/securityConfig.js`, `config/dbPath.js`
- `middleware/apiAccessGate.js`, `middleware/requireTenant.js`, `middleware/uploadPolicy.js`
- `helpers/schoolScope.js`
- `scripts/security/reconcile-school-ownership.js`

Rewritten:

- `server.js`, `middleware/authMiddleware.js`, `middleware/rateLimiter.js`
- `controllers/auth-controller.js`, `controllers/passwordResetController.js`, `services/otpService.js`
- `routes/universalRoutes.js`, `routes/subscription-routes.js`, `config/razorpay-config.js`, `utils/passwordUtils.js`, `.env.example`

Modified (guards, school filters, removed fallbacks or debug code): 18 route files, `controllers/` for assessments, attendance, students, users, subscriptions, requirements, expenses, orders and classrooms, `routes/accountantRoutes.js`, `routes/transaction-routes.js`, `routes/superadminRoutes.js`, `routes/translationRoutes.js`, `routes/databaseExportRoutes.js`, `services/emailService.js`, `config/sqlite-db.js`, `middleware/global-error-handler.js`, the four upload middlewares.

Client: `pages/superadmin/SuperAdminLogin.jsx` (real login, credentials removed), `auth/auth.jsx`, `pages/mentor/MentorCourseDetails.jsx`, `store/transactionStore.ts` (sockets send the session token). `client/dist` was rebuilt.

Tracked env-like files: the mailbox password in six files was replaced with a placeholder.

Tests: `server/tests/helpers/` (test app, route inventory, server process) and ten suites under `server/tests/security/` and `server/tests/integrity/`. `server/package.json` gained `test` and `test:security` scripts.

## 4.6 Database changes

All changes are additive and run at start-up. No row is modified or deleted.

| Change | Purpose |
|--------|---------|
| `users.created_at`, `users.updated_at`, `users.created_by` added when missing | A database created from the current schema lacked columns the controllers query |
| `expenses`, `orders`, `inventory`, `vendors` gain a nullable `university_id` | School ownership for procurement records |
| Unique index on `attendance (classroomId, studentId, date)` | One register entry per student per day; skipped with a warning if an old database holds duplicates |
| `otp_reset` created on first use | The table was only created by a one-off script |
| `PRAGMA foreign_keys` behind `LMS_ENFORCE_FOREIGN_KEYS=true` | Off by default until orphaned rows are reconciled |

Rows that predate the school column have no school and are hidden from school accounts. `scripts/security/reconcile-school-ownership.js` reports them, fills in the school where an existing link proves it, and can assign the remainder to one school for a single-school database. It backs the file up first and refuses to bulk-assign when the database holds more than one school.

## 4.7 Tests executed

All server tests run against a new SQLite file in the system temp folder, seeded with two synthetic schools and one account per role. `server/.env` is not loaded, mail goes to an in-memory outbox, and the harness refuses to start if a real mail, payment or AI credential is in the environment. The real data folder was checked after the runs and was unchanged by them.

| Suite | Tests | Passed |
|-------|-------|--------|
| Authentication | 42 | 42 |
| Authorization (role matrix, escalation, payments) | 60 | 60 |
| Route coverage (every registered route) | 10 | 10 |
| School isolation | 26 | 26 |
| Sensitive data in responses | 11 | 11 |
| Password reset | 10 | 10 |
| Uploads | 19 | 19 |
| Hardening (sockets, logs, assessment window, password formats) | 10 | 10 |
| Start-up and restarts (separate processes) | 21 | 21 |
| Data integrity and reconciliation script | 17 | 17 |
| Notification text (existing) | 16 | 16 |
| **Server total** | **242** | **242** |

Regression:

- **Student Onboarding module:** 343 of 343, unchanged.
- **AI Assessment module:** 524 of 525. Before this entry 432 passed and 93 were cancelled; the 93 now run. The one failure (`from-review` after numerical generation) is in the module's own save path and was hidden until those suites could start.
- **Client production build:** passes.
- **Development server:** started with the local `.env` on the demo database; login with the seeded password, admin dashboard and user list returned 200, the same admin on a superadmin route returned 403, a request without a token returned 401.

## 4.8 Not tested

- The four portals in a real browser. The changed superadmin login page was built but not clicked through.
- A real payment, a real email, a real AI call, PostgreSQL, the hosted site, behaviour under load.
- School isolation for inventory, vendors, stock requests and vendor invoices: those tables are not created on a fresh database, so the suite had no rows to leak.
- Vendor login end to end (a fresh database has no vendor password column); the password check itself is unit tested.
- Client lint: the client has no ESLint configuration file.

## 4.9 Trade-offs and compatibility

- **Intentional behaviour changes.** Fourteen are listed in section 2 of the remediation plan. The ones users will notice: no access without login, demo addresses need their password, unapproved accounts cannot sign in, public registration is off unless enabled, the "test upgrade" buttons and the Database Export pages stop working for school roles.
- **Admin keeps access to role-restricted routes.** `roleMiddleware` still lets a school admin through. This is acceptable now that every handler is limited to the admin's own school, and it avoids breaking admin workflows.
- **Generic reads stay school-wide for staff.** A teacher can list the school's students for enrolment. Reading a specific student's records requires teaching that student.
- **Uploads keep the 500 MB material limit** so existing video uploads continue to work.
- **Uncaught errors are logged and the process keeps running.** Without a supervisor, exiting would turn one bad request into an outage. A supervisor remains the proper fix.
- **Line endings.** Several files were written with LF; Git reports it will convert them on commit.

## 4.10 Remaining risks and dependencies

- **Credentials in Git history.** The mailbox password and the Razorpay test and live keys were committed and are on the remote. They were removed from the working tree but must be rotated by their owners. Until then they should be treated as compromised.
- **Demo accounts in real databases** keep their publicly known passwords until deleted or reset.
- **Uploaded files** are served to anyone who has the URL. Names are now random and the files cannot run as pages, but access is not tied to a session.
- **Open audit findings:** DATA-001, DATA-002, DATA-003, DATA-006, the remainder of DATA-004, SEC-020 (token storage, per-device logout), SEC-023, SEC-024.
- **Subscription pricing** is not checked against a server-side price list.
- **Pre-existing failures unrelated to this entry:** certificate and one payment-history endpoint still use unconnected Mongoose models; stock-request and vendor-stock tables are missing on a fresh database.

## 4.11 Current status and next steps

The work is on the local branch `security/critical-remediation`, uncommitted and not pushed. Suggested order:

1. Owner actions from section 7 of the remediation plan (rotate credentials, remove demo accounts, production environment values).
2. Browser walk-through of the four portals on a staging copy, including the superadmin login.
3. Run the reconciliation script on a copy of the production database and review its report.
4. Authenticated file download, then the open data-integrity findings.
5. Confirm what the hosted site runs and deploy.

---

# Work Log Entry 5 — Production Readiness: Private Files, Trusted Pricing, Reliability, Measured Indexes

**Date of implementation:** 12 October 2026 (second session)

## 5.1 Implementation summary

| Workstream | Status |
|------------|--------|
| Uploaded files private behind expiring signed links | Implemented and tested |
| Subscription price, period and payment status decided by server and gateway | Implemented and tested with a stand-in gateway |
| Logout and password reset end sessions on the server | Implemented and tested |
| Certificates, payment history and fee-payment recording moved off the unconnected MongoDB models | Implemented and tested |
| Async error handling, readiness check, request ids, body limit | Implemented and tested |
| Graceful shutdown | Implemented, not tested |
| Lookup indexes | Implemented and measured |
| Course roster replacement in one transaction | Implemented and tested |
| AI Assessment suite | 525 of 525 (the one failure was a stale test request) |
| Deployment, backup, rollback and operations documentation | Written (remediation plan, Part 2) |

The entry closes the items Entry 4 left open that could be closed without the owner. The system is ready for staging. Production remains blocked on credential rotation and the other owner actions.

## 5.2 What was verified first

The code on the branch matched Entry 4 and the remediation plan: the gate, policy, isolation helper and upload policy were present, and the server suite passed 242 of 242 before any new change. The working tree was left as it was; nothing was reset.

## 5.3 Decisions

**Private files without changing the client.** Three options were compared. Requiring the session token on `/uploads` breaks every link and image, because a browser does not send the token for those. A cookie session needs cross-site cookie configuration the project does not have. The chosen option keeps the plain path in the database and rewrites it into a signed, expiring link inside each authorised API response; the download route checks the signature. Access to a file therefore follows access to the record that mentions it, and no page needed editing. Trade-off: a link works for anyone who obtains it until it expires (4 hours by default).

**One price source.** `config/subscriptionPlans.js` holds the plan list; prices are operator configuration, not constants in code. A plan without a configured price cannot be bought, which is safer than a default.

**Session ending by timestamp.** A `sessions_valid_from` value per account, compared with the token's issue time, ends all of an account's sessions. A per-token revocation list would allow single-device logout but needs storage and cleanup; it was not justified yet.

**Async errors.** Express 4 does not catch a rejected promise from a handler. A twelve-line patch of the router layer was chosen over wrapping some 370 handlers or adding a dependency that does the same thing.

**No new infrastructure.** No queue, cache, supervisor or monitoring service was added. Supervisor choice is a deployment decision and is documented as one. SQLite was kept; its limits (one instance, one writer) are stated in the plan.

**Stock-request tables not wired into start-up.** Their only definition is a setup script that drops the tables first. Turning that into safe start-up schema is a schema-consolidation task, so procurement isolation for those tables stays unverified and is listed as open.

## 5.4 Files changed in this entry

- New: `config/subscriptionPlans.js`, `middleware/asyncErrors.js`, tests `security/subscriptionPayments.test.js`, `integrity/reliability.test.js`, `integrity/feesAndCertificates.test.js`.
- Rewritten: `controllers/certificate-controller.js`.
- Modified: `middleware/uploadPolicy.js` (signed links), `middleware/apiAccessGate.js`, `server.js` (request ids, readiness, shutdown, body limit), `middleware/authMiddleware.js`, `controllers/auth-controller.js`, `routes/auth-routes.js`, `config/accessPolicy.js`, `controllers/passwordResetController.js`, `controllers/subscription-controller.js`, `controllers/payment-controller.js`, `controllers/course-controller.js`, `routes/universalRoutes.js` (paging), `config/sqlite-db.js` (indexes, session column, demo school), `.env.example`, `tests/security/uploads.test.js`, `tests/security/authorization.test.js`.
- AI Assessment module: one test request in `tests/lms-integration/questionTypes-http.test.js`.
- Client: `auth/auth.jsx` (logout calls the server). `client/dist` rebuilt.

## 5.5 Database changes

Additive, applied at start-up: `users.sessions_valid_from`; 26 lookup indexes on foreign-key columns; a unique index on `assessment_attempts (assessmentId, studentId)`, skipped with a warning if duplicates exist. No row is changed.

## 5.6 Performance measurement

Synthetic database: 20 schools, 40,800 users, 80,000 enrolments, 200,000 attendance rows, 80,000 results, 80,000 payments. Median of 25 runs, with and without the new indexes.

| Query | Before (ms) | After (ms) |
|-------|-------------|------------|
| Results of one student | 5.34 | 0.08 |
| Payments of one student | 5.15 | 0.09 |
| Results of a classroom | 5.46 | 0.21 |
| Attendance of one student | 1.05 | 0.08 |
| Fees collected in one school | 14.37 | 1.20 |
| Students of one school | 5.21 | 1.71 |

Enrolment checks and course content lists were already served by existing unique indexes and did not change. Request latency under concurrent load and frontend performance were not measured.

## 5.7 Tests executed

| Suite | Tests | Passed | Failed | Skipped |
|-------|-------|--------|--------|---------|
| Server (`npm test`, 14 files) | 279 | 279 | 0 | 0 |
| AI Assessment module | 525 | 525 | 0 | 0 |
| Student Onboarding module | 343 | 343 | 0 | 0 |
| Client production build | — | Passes | | |

The reconciliation script was run in report-only mode on a copy of the local database: it reported no schools, five inventory rows and two vendor rows without a school, and changed nothing. The local database is the demo seed, so this confirms the tool, not production data.

## 5.8 Not tested

Graceful shutdown; the four portals in a browser; real email, payment or AI calls; load; the hosted site; procurement isolation for inventory, vendors, stock requests and vendor invoices. Client lint cannot run without a configuration, and adding one needs new dependencies.

## 5.9 Remaining risks and next steps

1. Owner actions: rotate the mailbox password and Razorpay keys, set production secrets and plan prices, remove demo accounts, choose a supervisor. The deployment checklist is in section 13 of the remediation plan.
2. Staging walk-through in a browser, including a test-mode payment and a real password-reset email.
3. Consolidate the procurement table definitions into start-up schema, then add isolation tests for them.
4. Open data-model findings (DATA-001, DATA-002, DATA-003, DATA-006) and the two remaining multi-step writes.

The work is on the local branch `security/critical-remediation`, uncommitted and not pushed.


---

# Work Log Entry 6 — Customer Walkthrough, Third Audit Pass, Load Test, Backup Drill

**Date of implementation:** 12–13 October 2026

## 6.1 Implementation summary

| Workstream | Status |
|------------|--------|
| Walkthrough of one school through the API, as a customer would use it | Done; nine defects fixed |
| Third audit pass (14 areas, 12 hardening checks) | Done; findings in the remediation plan, Part 3 |
| Login-page credentials, invented rows, weak generated passwords, unchecked links | Fixed and tested |
| Procurement tables at start-up and school isolation for them | Fixed and tested |
| Load test tool and first measurement | Done (reads only, one machine) |
| Backup-and-verify tool and restore drill | Done in isolation |
| CI workflow | Written, never executed |
| Browser run, dependency scan, deployment checks | Not done |

Verdict recorded in the plan: not ready for production, ready for a staging deployment.

## 6.2 What was verified first

Branch `security/critical-remediation`, HEAD `8946567`, no commits ahead of `origin/main`, nothing staged. The working tree held the uncommitted work of Entries 4 and 5 and was left as it was. The server suite passed before any change of this entry.

Node.js is not installed on this machine; the only `node.exe` belongs to another tool's bundled runtime, and its folder changed between sessions. There is no `npm`. Tests were run with `node --test` directly and the client with `node node_modules\vite\bin\vite.js build`.

## 6.3 Customer walkthrough

A school ("Green Valley Public School") was created in the local development database through the endpoints the pages call: school and admin, two teachers, classes, five students, courses, chapters, a quiz, attendance, results, announcements, calendar, an AI-module test, fee collection, a certificate. The data was kept at the owner's request. No browser was used.

| Defect | Fix | File |
|--------|-----|------|
| Quiz with numeric options marked every answer wrong | Compare the option text before treating the value as a position | `controllers/assessmentController.js` |
| Editing one course field blanked the others | `COALESCE` on unsent fields | `controllers/course-controller.js` |
| Course could not be attached to a class or teacher after creation | Admin may set `classroomId` and `mentorId`, checked against the school | `controllers/course-controller.js` |
| Late-joining student did not see the class's courses | Student course list includes courses of the student's class | `controllers/course-controller.js` |
| Marks above the total or below zero accepted | Validation on `POST /results` | `routes/universalRoutes.js` |
| Attendance accepted for a future date | Refused | `controllers/attendanceController.js` |
| Chapter insert failed on a new database | `imageUrl`, `videoUrl`, `fileUrl` added at start-up | `config/sqlite-db.js` |
| Certificate row without a file | The file is generated on request | `controllers/certificate-controller.js` |
| AI tests unavailable | Module migrations applied to the local database (a deployment step elsewhere) | — |

## 6.4 Third audit pass: changes

- `client/src/pages/superadmin/SuperAdminLogin.jsx`: the "Default Credentials" block removed.
- `client/src/pages/mentor/ClassFeeStatus.jsx`, `client/src/pages/accountant/DatabaseExport.jsx`: invented fallback rows removed.
- `controllers/adminController.js`, `controllers/superAdminController.js`: first passwords from `crypto`, 12 characters.
- New `helpers/safeUrl.js`; applied to material `linkUrl`, chapter `videoUrl` and `imageUrl`, live-class `meetingLink`.
- `middleware/rateLimiter.js`: 60 uploads per 15 minutes per account.
- `config/sqlite-db.js`: the `CREATE TABLE` and `CREATE INDEX` statements of `database/stock_requests_schema.sql` run as `IF NOT EXISTS`; the file's `DROP` statements are not executed.
- Razorpay key id read from `VITE_RAZORPAY_KEY_ID` in four client files. Payments stay unconfigured by the owner's decision; payment endpoints answer 503.
- `client/vercel.json`: security headers. `client/index.html`: description.
- New `.github/workflows/tests.yml`: server suite, both module suites, client build, a non-blocking audit step.
- New `server/scripts/ops/load-test.js`, `server/scripts/ops/backup-and-verify.js`.

## 6.5 Decisions

1. **Other-school and unsafe input are refused, not cleaned.** A link that is not http or https returns 400; nothing is rewritten silently.
2. **Stock tables are created from the existing schema file** rather than a second definition, so there is one source for their shape.
3. **The load test starts its own server on a temporary database** and reuses the test harness safeguards; it cannot be pointed at a real database.
4. **The backup tool verifies by reopening the backup**, since a backup that was never opened proves nothing. Row counts may grow between count and copy, never shrink.
5. **The audit step in CI does not block yet**: the first results have not been seen.
6. **Not changed:** terms-consent storage, third-party translation calls, bundle splitting. Each needs a product or legal decision, or is larger than a safe fix.

## 6.6 Measurements

Load test, `node scripts/ops/load-test.js` (Intel i5-7300U, 4 threads, 8 GB RAM, Windows; generator on the same machine; 2 schools × 2,000 students; 10 s per step; five student read pages):

| Concurrency | Requests/s | p50 ms | p95 ms | p99 ms | Errors |
|-------------|------------|--------|--------|--------|--------|
| 10 | 570 | 15.5 | 27.8 | 34.9 | 0 |
| 50 | 653 | 68.6 | 121.5 | 138.9 | 0 |
| 100 | 683 | 130.2 | 232.5 | 253.3 | 0 |
| 200 | 686 | 258.6 | 464.2 | 487.5 | 0 |

Admin user list (2,041 rows): p50 18.5 ms for one caller; p50 170 ms with ten. Throughput levels off near 680 requests per second.

Backup drill on a copy of the local database: 51 tables, 96 rows, integrity check passed.

## 6.7 Tests executed

| Command | Result |
|---------|--------|
| `cd server; node --test --test-force-exit "tests/**/*.test.js"` | 285 passed, 0 failed, 0 skipped |
| `cd ai-modules/ai-assessment-agent; node --test "tests/**/*.test.js"` | 525 passed, 0 failed |
| `cd ai-modules/student-onboarding-agent; node --test` | 343 passed, 0 failed |
| `cd client; node node_modules\vite\bin\vite.js build` | Built; no key, password or source map in the output |

One AI Assessment test had been failing because its request omitted `classroomId`, which the route requires; the request was corrected, the assertion unchanged.

## 6.8 Not tested

- No browser session: portals, layouts, keyboard use, loading and error states.
- `npm audit` and client lint (no `npm`, no lint configuration).
- The CI workflow (nothing was pushed).
- Security headers on the client host (apply only on a deployment).
- Writes, logins, uploads and AI calls under load; a soak run; production hardware.
- Graceful shutdown; real mail; real payments; vendor invoices.

## 6.9 Remaining risks and next steps

1. Owner: rotate the mailbox password, deactivate the Razorpay keys that were in source, replace the demo and superadmin passwords in every real database.
2. Owner: install Node.js LTS; run `npm audit`.
3. Staging run in a browser, with one real password-reset email.
4. Hosting and supervisor for the server; scheduled `backup-and-verify.js` with off-server copies; uptime check on `/health/ready`.
5. Decisions: terms-consent record, third-party translation and fonts, data retention.
6. Open data-model findings (DATA-001, DATA-002, DATA-003, DATA-006); client bundle splitting; paging on the admin user list.

The work is on the local branch `security/critical-remediation`, uncommitted and not pushed.


---

# Work Log Entry 7 — Browser Run of the Four Portals, Dependency Audit, Release Candidate

**Date of implementation:** 13 October 2026

## 7.1 Implementation summary

| Workstream | Status |
|------------|--------|
| Browser run of the four portals in a visible Chrome window, fixing as found | Done; 93 screenshots |
| Scripted browser run in the repository | Done; 28 of 28 pass on the final code |
| Client: one API address, session on every request, session-end handling, downloads | Done |
| Cross-school side effect of fee structures (P0) | Fixed and tested |
| Fee and plan payment pages on the server-verified flow only | Fixed; unconfigured path verified, paid path not testable |
| First dependency audit and upgrades | Done; no critical or high advisory in shipped code |
| Graceful shutdown | Tested |
| Foreign-key enforcement | Measured; cannot be enabled yet |
| Load test and soak repeated | Done |
| Deployment and rollback runbook | Written, never executed on a host |

Verdict recorded in the plan (Part 4): ready for staging validation; not for real schools.

## 7.2 What was verified first

Branch `security/critical-remediation`, HEAD `8946567`, no commits ahead of `origin/main`, nothing staged; 109 modified and 36 untracked files from Entries 4–6, left as they were. No `CLAUDE.md` exists in the repository. No server was running. Baseline before any change: server 285, AI Assessment 525, Onboarding 343, all passing.

The Claude-in-Chrome tools were not available to the session and the `chrome-devtools` plugin did not connect, so the owner's signed-in Chrome could not be driven. `puppeteer-core`, already in `server/node_modules`, drove a separate visible Chrome window with its own temporary profile. At the owner's request the interaction was made visible (pointer overlay, stepped mouse movement, key-by-key typing) and sign-in was done from `/login`.

## 7.3 Method

`server/tests/e2e/stack.js` starts the server on a new database in the temp folder through the existing `serverProcess` helper (which strips real-service variables, redirects the database and uploads, and uses mock mail), builds the client with `VITE_BACKEND_URL` set to that server, and serves it with `vite preview`. Server fixes were re-checked without losing the data by restarting only the API process on the same temporary file.

Each defect followed the same path: seen in the browser, traced to its cause, fixed, covered by a server test where the cause was on the server or in the request contract, then seen working in the browser.

## 7.4 Changes

**Client**

- New `client/src/config/api.js` (`API_BASE`, `API_ORIGIN`, `fileLink`), `config/sessionRequests.js` (session header on LMS requests; a 401 for the stored session clears it and opens sign-in), `config/download.js` (`downloadWithSession`).
- 23 files moved to the shared address; `auth/auth.jsx` and `pages/mentor/MentorCourseDetails.jsx` pass the server address to `io()` (the address had been given as an option, which Socket.IO ignores).
- `pages/superadmin/SuperAdminLogin.jsx`: posts to the API. `SuperAdminSubscription.jsx`, `pages/student/Subscription.jsx`: no `test-upgrade`. `pages/student/PayFees.jsx`: `openPayment` defined; order and verification through the server; simulated success removed.
- `pages/admin/CreateCourseAdmin.jsx`: `id` instead of `_id`, JSON body, cover-image field removed. `pages/student/Certificates.jsx`, `pages/Announcements.jsx`, `pages/student/CourseViewer.jsx` and three teacher pages: corrected requests and file links.
- Five export components: no session token in an address.
- `context/TranslationContext.jsx`: no per-call logging; readable fallback for missing keys. `vite.config.js`: production builds drop `console.log/debug/info`.

**Server**

- `controllers/classroomController.js`: fee update limited to the caller's school; `readFeeAmounts` validates parts and computes the total; class list without emails for students.
- New `helpers/validators.js` (`isEmail`), used in `adminController.js`, `superAdminController.js`, `auth-controller.js`.
- `controllers/assessmentController.js`: quiz window and timer checks; students get published quizzes only. `routes/universalRoutes.js`: `studentCourse` and `studentOnly` rules.
- `routes/classroomRoutes.js`: `GET /mentor/me`. `controllers/user-controller.js`: teacher list carries the email. `controllers/payment-controller.js`: order amount in whole paise within limits.
- `server.js`: clean stop on the `shutdown` process message. `tests/helpers/serverProcess.js`: IPC channel and `shutdownGracefully`.
- `package.json`, `package-lock.json`: in-range security updates; `nodemailer` 10, `sqlite3` 6, `puppeteer` 25; scripts `e2e:stack`, `e2e:browser`. `client/package-lock.json`: in-range security updates.

**Repository**

- `.gitignore`: `client/public/` is no longer caught by the blanket `public` rule. `.github/workflows/tests.yml`: Node 24, the version the results were produced on.
- New `docs/DEPLOYMENT_RUNBOOK.md`.

## 7.5 Decisions

1. **A separate visible browser instead of the owner's.** Restarting the owner's Chrome in debugging mode would have closed their tabs, and Chrome refuses remote debugging on a default profile. Stated to the owner at the time.
2. **One place for the session header and for the session's end.** Adding the header page by page had already been missed in several pages; the wrapper only touches requests to the LMS server and never replaces a header a page set.
3. **Payments are reported by the server only.** The pages had three ways of showing success on their own. With the gateway unconfigured by the owner's decision, the pages say so.
4. **Major upgrades were tried in a scratch folder first.** `sqlite3` 6 loads on this Node only after its prebuilt binary is fetched; that step is in the runbook.
5. **Foreign keys were not forced on.** With enforcement on, 37 of 298 tests pass; the declared reference of `payments.studentId` is wrong, and repairing it means rebuilding a table that holds money records.
6. **Not changed, on purpose:** legal text, landing-page claims, plan prices and limits, the first-password flow, the admin export entry. Each alters what the product promises or how it behaves for customers.
7. **Tests were corrected twice, not weakened:** a fixture that enrolled the student in a second course, and two "equal" timestamps that were a millisecond apart.

## 7.6 Measurements

Dependency advisories, critical/high — server 2/27 → 0/3 (0/0 without development tools); client 1/21 → 0/6 (0/0).

Load, `node scripts/ops/load-test.js` (same data and laptop as Entry 6; other programs running): 446, 545, 563, 566 requests per second at 10, 50, 100, 200 concurrent, p95 38.6, 145.9, 282.8, 564.2 ms, no errors. Soak 120 s at 50 concurrent: 68,820 requests, 574 per second, p95 133.5 ms, no errors; server memory level at 381–393 MB; one core fully used. About 15% below Entry 6; cause not separated.

Foreign keys: database from the browser run, 0 violations; copy of the local database, 1 (`payments → students`).

## 7.7 Tests executed

| Command | Result |
|---------|--------|
| `cd server; node --test --test-force-exit "tests/**/*.test.js"` | 298 passed, 0 failed, 0 skipped |
| `cd ai-modules/ai-assessment-agent; node --test "tests/**/*.test.js"` | 525 passed, 0 failed |
| `cd ai-modules/student-onboarding-agent; node --test` | 343 passed, 0 failed |
| `cd server; node tests/e2e/stack.js` and `node tests/e2e/portals.e2e.js` | 28 passed, 0 failed |
| `cd client; node node_modules\vite\bin\vite.js build` | Built; no source maps; scanned strings absent |
| `npm audit --omit=dev` in four packages | 0 critical, 0 high |

## 7.8 Not tested

- Password reset in a browser and any real email; the paid payment path; the AI assessment pages (their migration was not applied to the E2E database); accountant, storekeeper and vendor portals; phone layouts; keyboard-only use.
- Plan upgrade, demo leads and export downloads were fixed but not opened again in the browser.
- The CI workflow; client lint (no configuration); security headers on the client host; any deployment.
- Writes, sign-ins and uploads under load; a soak of hours.

## 7.9 Remaining risks and next steps

1. Owner: rotate the mailbox password; deactivate the Razorpay keys that were in source; remove or re-password demo accounts.
2. Owner: install Node.js 24 with npm; choose the API host; provide a backup location.
3. Staging by the runbook: AI module migrations, one real password-reset email, the browser run again, an uptime check on `/health/ready`, a scheduled verified backup.
4. Rebuild `payments` against `users(id)` on a backup, then enable foreign keys.
5. Owner and legal: Terms text, landing-page claims, consent record, translation and font transfers, prices and plan limits.
6. Backlog: client code splitting, paging on the admin user list, first-password flow, the remaining three portals in the browser run.

The work is on the local branch `security/critical-remediation`, uncommitted and not pushed.


---

# Work Log Entry 8 — Courses Assigned to Whole Classes, Teacher's Class and Course Views

**Date of implementation:** 14 October 2026

## 8.1 Summary

| Item | Status |
|------|--------|
| Admin assigns a course to one or more whole classes; their students are enrolled | Done; tested (API and browser) |
| Students who join an assigned class later are enrolled | Done; tested |
| Removing a class removes only the enrolments it created | Done; tested |
| Teacher view "By class": class, then course, then that class's students | Done; tested |
| Teacher view "By course": students of a course in every class, grouped, with counts, class filter and search | Done; tested |
| Chosen improvements: admin course list page; admin menu entry that always answered 403 removed; class name instead of "Classroom N" on the student attendance page | Done |
| Found by the browser run and fixed: teacher attendance page could not switch class | Done; tested in the browser |

## 8.2 Design decision (confirmed by the owner before coding)

The existing model is "one course = one class" (`courses.classroomId`), used by the class→course menus, `authorizeCourse`, class-teacher access, the AI module and automatic enrolment. A course taught to several classes needs more than that column. Three options were put to the owner; the owner chose the **linking table**:

- New table `course_classrooms(courseId, classroomId, assignedBy, createdAt, UNIQUE(courseId, classroomId))`. `courses.classroomId` stays the course's home class, so older features keep working.
- New nullable column `course_students.enrolledViaClassroomId`: which class assignment enrolled the student (NULL = enrolled individually).
- Enrolment stays in `course_students`. Assigning a class inserts its students with `INSERT OR IGNORE` (no duplicates; an existing individual enrolment is left as it is).
- Who takes a course, everywhere it is decided (course lists, school-scope checks, generic reads): enrolled in `course_students`, or member of the home class or of an assigned class.
- A teacher "works in" a class when they teach a course whose home class or assigned class it is (one query parameter, so every caller kept its parameters).
- Access: the course's teacher and the school's admins see its students; only admins assign or remove classes.
- An admin-created course with no home class takes the first class assigned to it as home class.
- Not changed: moving a student to another class keeps their earlier class-derived enrolments (unchanged behaviour); the AI module still reads the home class.

## 8.3 API

| Method and path | Who | What |
|---|---|---|
| `GET /api/courses/teaching/overview` | teacher (own courses), admin (school) | Courses with their classes and student counts; classes with the caller's courses |
| `GET /api/courses/:courseId/roster?inClass=&q=` | course teacher, admin | Enrolled students grouped by class; `inClass` for one class, `q` searches name, email, roll number |
| `GET /api/courses/:courseId/classrooms` | course teacher, admin | Classes of the course with sizes |
| `POST /api/courses/:courseId/classrooms` `{ classroomIds }` | admin | Assign; answers per class: students, enrolled now, already enrolled |
| `DELETE /api/courses/:courseId/classrooms/:classroomId` | admin | Remove a class (home class refused) |

The roster filter is `inClass`, not `classroomId`, because the gate checks a `classroomId` against the classes the caller works in, while a teacher may filter by the class of any student enrolled in their course; the roster never contains anyone outside the course.

## 8.4 Files

- Server: new `helpers/courseClasses.js`; `config/sqlite-db.js` (table, column, index; no data copied at start-up, so restarts change nothing); `routes/course-routes.js`; `helpers/schoolScope.js`, `helpers/teachingScope.js`, `routes/classroomRoutes.js`, `routes/universalRoutes.js`, `controllers/student-controller.js`, `controllers/course-controller.js` (the shared rules above); `helpers/classroomEnrollment.js`, `controllers/classroomController.js` (class joiners enrolled in all class courses); course deletion removes its class links.
- Client: new `pages/admin/AdminCourses.jsx`, `pages/mentor/MyStudents.jsx`; `pages/admin/CreateCourseAdmin.jsx` (classes chosen in the form, then the course list); `pages/mentor/AttendanceManagement.jsx` (class selector); `pages/student/StudentAttendance.jsx` (class name); `components/AdminLayout.jsx`, `components/MentorLayout.jsx`, `App.jsx`.
- Tests: new `tests/integrity/courseClasses.test.js` (15); `tests/helpers/testApp.js` waits for the new column; `tests/e2e/portals.e2e.js` (+5 steps).

## 8.5 Tests

| Command | Result |
|---|---|
| `cd server; node --test --test-force-exit "tests/**/*.test.js"` | 313 passed, 0 failed |
| `cd ai-modules/ai-assessment-agent; node --test "tests/**/*.test.js"` | 525 passed |
| `cd ai-modules/student-onboarding-agent; node --test` | 343 passed |
| `cd client; node node_modules\vite\bin\vite.js build` | Built |
| `node tests/e2e/stack.js` + `node tests/e2e/portals.e2e.js` | 33 passed, 0 failed |

Two problems were found by the tests and fixed in the code, not in the tests: the class guard refused a teacher choosing an assigned (non-home) class; the class-first list left out classes whose students were enrolled one by one. A start-up copy of home classes into the new table was removed because it made restarts change data (two existing restart tests failed).

## 8.6 Not done

- Moving a student to another class does not remove the enrolments of the old class (existing behaviour kept).
- The AI assessment module targets the home class only.
- `students.rollNumber` holds the section letter for students created through the admin form (seen in the roster: "A", "B"); not changed.
- The roster has no paging (fine for a few hundred students per course; not measured beyond).

---

# Work Log Entry 9 — Class First, Explicit Enrolment, Teacher Visibility, AI Tests Linked to a Course

**Date of implementation:** 15 October 2026

## 9.1 Decision (confirmed by the owner before coding)

Until now a member of a course's home class, or of a class the course was assigned to, took the course without a `course_students` row. That made "selected students of a class" impossible. The owner chose **explicit enrolment**: a student takes a course only when enrolled in `course_students`.

- `course_classrooms.enrollAll` (new, default 1): 1 = all students of the class, and students who join later; 0 = only the students the admin selected.
- One-time migration at start-up (`PRAGMA user_version` 0 → 1): records each home class as an "all students" class and enrols its current members, so nobody lost a course; only adds rows; copies the database file to `data/backups/*.pre-explicit-enrolment.*.bak` first when there is anything to convert; never runs again.

## 9.2 Rules now enforced on the server

| Rule | Where |
|---|---|
| A student takes a course only when enrolled | `helpers/schoolScope.js`, `controllers/student-controller.js`, `controllers/course-controller.js`, `routes/universalRoutes.js`, `helpers/courseClasses.js` |
| Assign a course to classes for all or selected students; selected students must be in the classes; no duplicates; individual enrolments keep their origin; "selected" never narrows an "all" class | `helpers/courseClasses.js` (`POST /api/courses/:id/classrooms` `{ classroomIds, scope, studentIds }`) |
| A teacher sees a class only as its class teacher (classTeacher, classTeacherId or a `class_teacher` row in classroomAssignments) or as mentor of a course taught to it | `helpers/teachingScope.js`, `helpers/schoolScope.js`, `routes/classroomRoutes.js`, AI module adapter |
| A teacher acts only on the courses they mentor (a class teacher no longer acts on another teacher's course of their class) | `authorizeCourse`, `teacherHasCourse`, `getTeachingScope` |
| The teacher class list says `class_teacher` or `course_teacher` (it said `class_teacher` for every class) | `controllers/classroomController.js` |
| An admin's course needs a class; `enrollScope: "none"` creates it without enrolling anyone yet | `controllers/course-controller.js` |
| A fee structure needs at least one class in the school | `controllers/classroomController.js` |
| AI test: class and a course the teacher mentors that is taught to the class; audience = the class's students enrolled in the course; tests from before are `legacy` (no course guessed) | AI module migration 010, `AssessmentService`, `SqliteAssessmentLmsAdapter` |

Kavita Rao (local data): she is class teacher of 5-B and mentors Science and English; English was assigned to 5-A, 5-B and 9-A on 14 Oct. Under the requested rule she sees those three classes; what was wrong was the "Class teacher" badge on all of them, now "Course teacher" where she only teaches a course.

## 9.3 Client

Admin course list and create-course form choose classes and then all or selected students (`components/admin/ClassEnrollmentScope.jsx`); the create form refuses a course without a class; the fee page warns when there is no class; teacher class cards show the real role (and no made-up initials); the AI test form and AI generator require a course of the chosen class, the "assign to" list shows the course's students, and listings mark legacy tests.

## 9.4 Tests

| Command | Result |
|---|---|
| `cd server; node --test --test-force-exit "tests/**/*.test.js"` | 326 passed (13 new: `classFirstRules.test.js` 11, migration across restarts 1, class-first create 1) |
| `cd ai-modules/ai-assessment-agent; node --test "tests/**/*.test.js"` | 532 passed (7 new: `courseLink/courseLink.test.js`) |
| `cd ai-modules/student-onboarding-agent; node --test` | 343 passed |
| `cd client; vite build` | Built |
| `node tests/e2e/stack.js` + `node tests/e2e/portals.e2e.js` | 38 passed (stack now applies the AI module migrations to its throw-away database) |

One existing AI module test was updated: the migration-runner test now expects migration 010's new `course_id` column (old columns still compared exactly; every new value NULL).

## 9.5 Applied to the local development database

Verified backup `server/data/backups/lms_permanent-2026-10-15T12-09-43-290Z.db`; AI migration 010 applied; backend restarted, which ran the one-time enrolment migration (its own backup `lms_permanent.db.pre-explicit-enrolment.2026-10-15T12-10-00-866Z.bak`). Result: one class member of Mathematics enrolled; the three existing AI tests are legacy (no course).

## 9.6 Not done

- Moving a student to another class still keeps their earlier enrolments.
- Students added by the onboarding import are enrolled only in "all students" courses at their next class assignment through the LMS; the import itself does not call the enrolment.
- AI descriptive assignments (`aia_assignments`) are not linked to a course; only tests are.
- The admin course page does not show per-class scope ("all" / "selected") on the chips.

---

# Work Log Entry 10 — Teacher Class and Course Visibility (follow-up)

**Date of implementation:** 15 October 2026

The rules of Entry 9 were re-checked endpoint by endpoint. One teacher-facing list still broke the course rule: `GET /api/courses/classroom/:classroomId` gave a class teacher every course of their class, with each course's enrolled students. It now gives a teacher only the courses they mentor (admins still get all), and lists courses assigned to the class as well as those whose home class it is. File: `server/controllers/course-controller.js`.

Tests added to `server/tests/integrity/classFirstRules.test.js` (3): the class's course list per role, another teacher's course data unreachable by changing ids (students, assessments, chapters, class links, adding a chapter), and the class-teacher label winning over course-teacher. Results: server 329 passed, AI Assessment 532 passed. Local backend restarted on the fix; Kavita sees 5-A and 9-A as course teacher, 5-B as class teacher, and only Science and English.

# Entry 11: Course enrolment management, authorization audit, Copy password
**Date of implementation:** 16 October 2026

- **One-request course creation** (`POST /api/courses/create-course` with `classroomIds`, `scope` "all" | "selected", `studentIds`). Everything is checked first: the teacher, the classes and the students must belong to the admin's school, and each selected student must be in one of the chosen classes. Then the course, its class links and its enrolments are written in one transaction, so a course is never left without its classes. The older single-class form still works and now also checks that the teacher and students it names belong to the school. Files: `server/helpers/courseClasses.js` (`checkAssignment`, `applyAssignment`, `createCourseWithClasses`), `server/controllers/course-controller.js`, `client/src/pages/admin/CreateCourseAdmin.jsx`, `client/src/components/admin/ClassEnrollmentScope.jsx` (unticking a class drops its ticked students).
- **One class of a course** (admin only): `GET`/`PUT /api/courses/:courseId/classrooms/:classroomId/students`.
  - GET returns the whole class roster, with each student marked enrolled or not.
  - PUT adds and removes enrolments for that course and class only. Removing anyone switches the class to "selected"; `scope: "all"` enrols the whole class again.
  - No account, class membership, result or submission is touched (`course_students` has no dependent foreign keys).
- **Removing a class from a course:**
  - The home class can now be removed while another class is still assigned; that class becomes the new home class.
  - The last remaining class cannot be removed.
- **Courses page** (`client/src/pages/admin/AdminCourses.jsx`):
  - Assigned classes show as "Assigned" with a separate "Remove class" button.
  - Clicking a class chip opens its roster with checkboxes.
  - Removals need a confirmation that names the student, the course and the class; adding students does not.
  - Buttons are disabled while saving, so a double click sends one request.
- **Audit fixes:**
  - `getCourseById` and `getChapters` no longer let a class member in without an enrolment (the global guard already blocked this; now the controllers check too).
  - Students no longer receive classmates' email addresses from `GET /courses/:id` or `GET /courses/:id/students`.
  - `assign-students` writes only what changed, so the class each enrolment came through is kept.
  - A teacher creating a course is always its mentor.
- **Copy password** (`client/src/components/admin/PasswordNotice.jsx`):
  - One shared notification is used by AddStudent, AddTeacher, AddStudentModal, AddTeacherModal and MentorApproval.
  - The two modals previously reported success even when the request failed, and never showed the generated password.
- **Tests:**
  - `server/tests/integrity/courseEnrolmentManagement.test.js` (18 new); full server suite 348/348.
  - Client build passes.
  - Browser E2E 40/40: AD-13, AD-14 and the Copy password checks in AD-2 and AD-4 are new.
- **Not changed:** a course mentor still sees, on class-level screens, the classes their course is taught to (the Entry 9 rule). Course-level lists show only enrolled students.

# Entry 12: Course teachers see only their enrolled students; live lectures (JaaS)
**Date of implementation:** 16 October 2026

**Course teacher vs class teacher (fix).**
- On the class page (`GET /api/classrooms/:id/students`), a teacher who only teaches a course to the class now sees only the class's students enrolled in their courses. The class teacher still sees the whole class.
- `teacherHasStudent` no longer opens unenrolled classmates' records to a course teacher.
- Only an admin or the class teacher can add students to a class.
- Files: `server/helpers/schoolScope.js`, `server/controllers/classroomController.js`, `client/src/pages/mentor/ClassroomDetail.jsx` (Assign/Remove buttons only for the class teacher).

**Live lectures.**
- **Provider adapter:** `server/helpers/jaas.js`.
  - Room names are random.
  - The join JWT is RS256, scoped to one room, valid for 10 minutes, and gives moderator rights to the teacher only.
  - Webhooks are checked with HMAC `X-Jaas-Signature`, with a 5-minute tolerance.
- **Rules and attendance:** `server/helpers/lectures.js`.
- **Routes:** `server/routes/liveClassRoutes.js` (the old routes are kept and now run on the new rules).
- **Schema** (`server/config/sqlite-db.js`, additive only):
  - New columns on `live_classes`.
  - New tables `live_class_events` (deduplicated) and `live_class_attendance`.
  - Unique indexes on (teacher, requestKey) and on the room.
- **Webhook route:** public, signature checked (`config/accessPolicy.js`). `server.js` keeps the raw body for that path only.
- **Rules:**
  - Start or schedule only for a course the teacher mentors that is taught to the class.
  - Join only for students in the class who are enrolled in the course, while the lecture is live.
  - Typed meeting links are no longer stored.
  - "Delete" now cancels, so history is kept.
  - Closing a tab never ends a lecture. It ends through "End class" (teacher or admin) or the provider's ROOM_DESTROYED webhook.
- **Attendance:**
  - Provider events are used when present. Otherwise the meeting page's join/leave/heartbeat is used, with server time and the signed-in student only.
  - Attended means at least 60 s. Missed is set only after completion. A completed lecture with no events at all is "unknown".
- **Client:**
  - `pages/LiveLecture.jsx` (`/live/:id`, JaaS IFrame API).
  - `components/lectures/StartClassModal.jsx` and `components/lectures/LecturesTable.jsx`.
  - Student page `/student/lectures`, with a nav item.
  - Teacher class page: Start Class and Your Lectures.
  - Admin class page: Lectures tab.
  - The old course pages now use the table (no public meet.jit.si links).
- **Config:** `JAAS_*` variables in `server/.env.example`; tests refuse to run if real JaaS secrets are set.
- **Tests:**
  - `tests/integrity/liveLectures.test.js` (18, provider mocked: locally generated key pair and test webhook secret) and one regression test for the class list.
  - `hardening` and `routeCoverage` updated for the intended public webhook and the removal of typed links.
  - Server 367/367. Client build passes. Browser E2E 42/42 (new: TE-10, ST-11).
- **Local DB:** backed up to `data/backups/*.pre-live-lectures.*.bak`, then the backend was restarted; the new columns and tables were added and the existing row is unchanged.

**Not verified:**
- No real video call was made, because there are no JaaS credentials.
- The webhook signature format follows the JaaS documentation and has not been tested against live JaaS.
- The production frontend host must allow `https://8x8.vc` in `script-src` and `frame-src` if it sets a CSP.

# Entry 13: JaaS "Authentication failed" (clock); live-class notifications and shared link
**Date:** 16-17 October 2026

**Cause of the JaaS error: the machine's clock, not the code.**
- JaaS answered "Not acceptable by nbf".
- Windows was set to the "GMT Standard Time" zone while the clock showed Indian time, so UTC was 4 h 29 min ahead and every token looked "not valid yet" to JaaS.
- Fixed by setting the time zone to India Standard Time and the clock from internet time (Google and 8x8 Date headers).
- Verified in the browser: a teacher token and a student token from `helpers/jaas.js` both joined a JaaS room.
- The Windows Time service (w32time) could not be started on this machine, so the clock does not resync by itself. Production servers must keep NTP time.

**Notifications.**
- New types `LIVE_CLASS_STARTED` and `LIVE_CLASS_SCHEDULED` (`services/notificationText.js`).
- They are sent from `helpers/lectures.js` (`notifyStudents`) to the class's students who are enrolled in the course, through the existing notification service. Each is stored once per student per event, and the bell shows it.
- `LIVE_CLASS_STARTED` opens `/live/<id>` (`client/src/utils/notificationRoutes.js`). This is the one link everyone shares: each person is checked again when opening it and gets their own token.

**Shared link.** A "Copy class link" button on the teacher's meeting page.

**Tests.** `liveLectures.test.js` has one more test: recipients are exactly the eligible students, and a repeated start sends nothing twice. Server 368/368, client build passes.

# Entry 14: Help assistant in the header, with the signed-in role (22 October 2026)

**Header button.** `client/src/components/ChatbotButton.jsx` ("Ask AI", navy and gold) sits beside the notification bell (`AnnouncementBell.jsx`) in the admin, teacher and student portals, and in the accountant header. It loads the universalChatbot widget with its round button hidden and opens it.

**Role from the session, not the browser.**
- New `routes/assistantRoutes.js`, mounted at `/api/assistant` (rule `"/assistant"`, signed in, in `config/accessPolicy.js`).
- `POST /api/assistant/api/v1/chat` takes only the question and session id. Role and school come from `req.user` (loaded from the database by `authMiddleware`); a role, school or app id in the body is ignored. Mentor is sent as the chatbot role "teacher".
- The call to the chatbot carries `X-Caller-Key` (`CHATBOT_CALLER_KEY` in `server/.env`, same value as `LMS_CALLER_KEY` in the chatbot's `.env`). The user's session token is not passed on.
- The widget sends the LMS session token to the LMS (`window.ragChat.headers`). Signing out, or another account in the same tab, clears the conversation (`rag-chat:reset`, `auth/auth.jsx`).
- `server/.env` backup before the change: `data/backups/env.pre-chatbot.*.bak`.

**Tests.** `tests/integrity/assistant.test.js` 9/9 (no session refused, role and school from the account, spoofed fields ignored, input checks, error pass-through, not configured, chatbot down, app info). Security and integrity suite 361/361. Client build passes.

# Entry 15: Help assistant read-only live-data tools (22 October 2026)

**What the assistant can now look up, live, as the signed-in user:**
- the count, a list (paginated, at most 20 rows, optional name filter) or the details of students, teachers, classrooms, courses, live classes and announcements;
- only through the endpoint each role already uses on its screens (`helpers/assistantTools.js`, `LISTS` / `DETAILS`).

**How it is protected:**
- The chatbot only names a tool and arguments. `routes/assistantRoutes.js` checks them against strict allowlists and calls this server's own GET endpoints with the user's session token, so the API gate, school scope and controller checks apply unchanged.
- A role without such a screen gets "not available for your role". Another school's id gets "not found or not available".
- Only allowlisted fields go back: no emails, fees, passwords, tokens or nested objects; text is cut at 300 characters.
- At most 3 calls and one round per question. A second tool round from the chatbot is refused (502).

**Tests:** `tests/integrity/assistantTools.test.js` 12/12. Security and integrity suite 373/373.

**Limit:** on the CPU-only development machine a tool answer needs two model calls and may exceed the 290 s limit.

# Entry 16: Help assistant tool round verified end to end (22 October 2026)

- The model now chooses between live tools and help pages for every question that is not a cached help answer. A keyword list sent "my courses" from teachers and students to the help pages.
- **Chatbot guards:** a details id must be written in the question; a name filter must be words the user wrote. qwen3:8b invented both.
- `routes/assistantRoutes.js` logs per-stage timings with tool names only (no question, arguments or records).
- **Measured:** LMS tool calls take under 0.25 s. All other time is model inference on the CPU-only machine (2–3 tokens/s).
- **Tests:** `assistantTools.test.js` now covers teacher and student access, a missing record and an expired session. Security and integrity suite 376/376.

# Entry 17: Help assistant: full read-only tool set, relationships, follow-up context (22 October 2026)

**Tools (`helpers/assistantTools.js`):**
- count, list (name and status filters, at most 20 per page, `has_more`), details, search by name, resolve a name (several matches come back as candidates, never a guess), related records.
- Every tool reads an existing GET endpoint as the user.

**What each role reads:**

| Role | Records | Endpoints |
|---|---|---|
| Admin | students, teachers, classes, courses with teachers, live classes, announcements, calendar | `/admin/students`, `/admin/mentors`, `/admin/classrooms`, `/courses` + mentors, `/live-classes/school`, `/announcements`, `/calendar` |
| Teacher | the students of their classes, their classes, their courses, their live classes, their students' progress, announcements, calendar | `/classrooms/mentor/me` + `/classrooms/:id/students`, `/courses/mentor`, `/live-classes/mine`, `/progress/mentor` |
| Student | their class, their courses with teachers, their live classes, their attendance and results, announcements, calendar | `/student/:id/classroom`, `/courses/student`, `/live-classes/student`, `/attendance/student`, `/results/my-results` |
| Accountant, storekeeper | announcements | `/announcements` |

**Relationships:**
- They are read only for a record the user can already see, through the endpoint of that relation, so they cannot reach records the user could not open.
- Class rosters and course rosters are given to admins and teachers only. Students cannot read classmates through the assistant.

**Follow-ups (`helpers/assistantContext.js`):**
- Kept in memory per account, role, school and widget session: the records shown last (id and label), the record in focus, and the last list request.
- 30 idle minutes, at most 500 conversations, and lists older than 3 turns are dropped.
- A record id is accepted only if the user typed it or this conversation showed it. Each tool still runs with the user's session.

**Fixes from live runs:**
- A one-record relation no longer replaces the list in context.
- A student with no class gets "no class" instead of "not available".

**Tests:** `tests/integrity/assistantTools.test.js` 25 tests. Full `npm test` 402/402.

**Not supported (no endpoint, or not allowed):**
- attendance lists for teachers or admins (the endpoint needs a class and date);
- class results for teachers;
- superadmin and vendor data;
- fees (excluded on purpose);
- a "course is active" filter (courses have no status).

# Entry 18: Help assistant: a teacher's "my students" question failed (23 October 2026)

**Problem.** Teacher Kavita Rao asked "how many students do I have in all my classes, list the names" and "what can I see in my classroom". Both answers were "This information is not available for your role." The model had chosen admin-only tools (a student's classes, a teacher's classes), which the LMS correctly refused.

**Fix:**
- The LMS now sends, with every question, what the signed-in role can read (`capabilitiesFor` in `helpers/assistantTools.js`): the record types it has a source for and the relations it may follow.
- The chatbot offers the model only those tools and types, and drops any call outside them before it reaches the LMS. The LMS still checks every call.
- The planner prompt has short examples. "How many and their names" now uses `listRecords`, which gives the total and the names.

**Checked with the real model and data:**
- Kavita's two questions now choose `listRecords(students)` and `listRecords(classrooms)`. The second answered through the LMS proxy with her 4 classes.
- She has 6 distinct students. The dashboard's "11" adds up course enrolments, so a student in two of her courses is counted twice.

**Tests.** Chatbot `test_tools.py` and LMS `assistantTools.test.js` cover what each role is sent, calls outside the role and the narrowed tool list. LMS assistant tests 35/35.
