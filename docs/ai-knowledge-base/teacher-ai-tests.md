---
id: teacher-ai-tests
title: Create, publish and review tests in AI Assessments (Teacher)
intent: task-procedure
portal: teacher
roles: [teacher]
navigation: "Mentor sidebar → AI Assessments"
related: [teacher-assignments, teacher-student-performance, student-tests-and-assignments, teacher-course-portal]
sources: [client/src/pages/assessment-agent/TeacherAssessments.jsx, client/src/pages/assessment-agent/AiAssessmentGenerator.jsx, client/src/pages/assessment-agent/AssignToModal.jsx, client/src/pages/assessment-agent/AssessmentReport.jsx, ai-modules/ai-assessment-agent/README.md]
verified: true
last_verified: 2026-10-21
---

# AI Assessments: tests (Teacher)

Open **AI Assessments** in the Mentor sidebar. The page is titled **AI Assessments Studio**. A test belongs to **one class and one of your courses** taught to that class.

## Create a test by hand

1. Click **New Test**. If you have no tests yet, the button is **Create Manual Test**.
2. Fill in:
   - **Assessment Title** (required) and **Subject** (required);
   - **Classroom** (required);
   - **Course** (required). Only courses you teach to that class are listed. If none: "You mentor no course taught to this class. Ask your admin to assign one."
   - optional: **Duration in Minutes**, **Opens At**, **Closes At**, **Description**.
3. Click **Create Draft Test**.
4. Under **Questions**, add each question.
   - Types: single choice, multiple-select, or a numerical answer.
   - A choice question has 4 options with the correct answer marked.
   - Click **Add Question**, or **Save Question** when editing.
5. Click **Publish Test…**. In **Assign Assessment**, choose the students: **Select all**, or tick some. Click **Confirm & Assign**.

Only students of that class who are **enrolled in the course** can receive the test.

## Create a test with AI

1. Click **Generate with AI**.
2. Choose the **Classroom (required)**, the topic, the subject, the **Question Count**, the **Difficulty** and the question format. An educational intent and extra instructions are optional.
3. Review the proposal (**Draft Proposal (Unsaved)**): edit questions, **Regenerate** a single question, **Remove** questions, or **Add Custom Question Manually**.
4. Finish with **Save as Draft** or **Save & Assign to Class…**. **Discard** throws the proposal away.

AI questions are proposals. Nothing is saved until you save it, and you should check every answer key.

## After publishing

- **Unpublish:** allowed only while no student has started.
- **Close Test:** stops new attempts.
- **View Results Report:** shows each student's score; **View Analytics** on a student opens their performance page (see "See a student's performance and AI performance report").
- **Reset:** gives one student a fresh attempt, at most 3 times per student per test. The earlier attempt is kept in history.
- **Timer:** each attempt is timed by the server. When time is up, the answers are submitted automatically.
- **Grading:** marks are calculated automatically, without AI.
- **Legacy (no course):** tests made before tests needed a course show this tag. Open one and choose its course to link it.

## Questions this answers

- How do I create a test / quiz / MCQ? / Test kaise banaun?
- How do I make questions with AI?
- How do I give the test to only some students?
- How do I let a student retake a test?
- Where do I see test results?
- Why is my course not in the list? (It is not taught to that class, or you are not its teacher)
