---
id: teacher-student-performance
title: See a student's performance and AI performance report (Teacher)
intent: task-procedure
portal: teacher
roles: [teacher]
navigation: "Mentor sidebar → AI Assessments → open a test → View Results Report → View Analytics (on a student)"
related: [teacher-ai-tests, student-tests-and-assignments, reports-and-counts]
sources: [client/src/pages/assessment-agent/TeacherAssessments.jsx, client/src/pages/assessment-agent/AssessmentReport.jsx, client/src/pages/assessment-agent/StudentPerformance.jsx, client/src/pages/assessment-agent/AiPerformanceReport.jsx, client/src/pages/assessment-agent/StudentPerformanceReport.jsx]
verified: true
last_verified: 2026-10-21
---

# See a student's performance and AI performance report (Teacher)

**In short:** to see how a student is performing, a teacher opens **AI Assessments**, opens a test, clicks **View Results Report**, and then **View Analytics** next to the student. That page shows the student's scores over time and can generate an **AI Performance Report**.

## See the results of one test

1. In the Mentor sidebar, click **AI Assessments**.
2. Open the test with **Open Test**.
3. Click **View Results Report**. This opens the **Results & Analytics Report**.
4. For every student it shows the **Status**, **Score**, **Correct**, **Incorrect**, **Unattempted**, **Submitted** and **Time taken**.

Click **Refresh** to update it. **Hide Report** closes it. If nobody has started yet: "No students in this classroom have initiated or completed the assessment yet."

## See one student's overall performance

1. In the **Results & Analytics Report**, click **View Analytics** next to the student.
2. The **Student Performance Analyst** page opens. It shows:
   - **Score Trajectory Trend**: how the student's scores moved across tests;
   - **Subject Competency Breakdown**: performance per subject;
   - **Cognitive Difficulty Distribution**: results by question difficulty;
   - **Assessment Log History**: each finished test, with **Score**, **Class avg**, **Time used**, **Attempt** and **Date**;
   - **Methodology & Data Scope**: what data the page uses.
3. **Back to AI Assessments** returns to the test list.

You see performance only for students and tests of **your own** courses. A student with no finished test shows "No finished tests yet."

## Generate an AI Performance Report

1. On the **Student Performance Analyst** page, go to **AI Performance Report**.
2. Optionally choose a **Report focus**, or add your own focus note. Focus notes refine the report; they cannot change the data it uses.
3. Click **Generate AI Report**. It is generated only when you click; **Regenerate** makes a new one.
4. The report shows:
   - an **Executive Summary**;
   - **Performance Overview**, **Strengths** and **Areas Requiring Attention**;
   - **Recommended Mentor Actions**;
   - a **Suggested Next Assessment**, with a **Generate this assessment** button that pre-fills a new AI test;
   - **Data Limitations**.
5. **Download PDF** saves the report.
6. **Send to Student** shares it with the student, who gets a notification and can open it (**AI Performance Report** in their portal).

The AI report needs at least one finished test ("The AI report becomes available after the first finished assessment."). A report marked **Preview / Not validated** is a draft to check before you rely on it.

## Let a student retake a test

In the **Results & Analytics Report**, use the reset action on the student's row ("Let this student take the test again"). A test can be reset at most 3 times per student; earlier attempts are kept.

## Questions this answers

- How do I see student performance? / Student ki performance kaise dekhun?
- How do I see test results of my class?
- Where is the student analytics / progress report?
- How do I make an AI report for a student?
- How do I send a performance report to a student?
- How does a student see the report the teacher shared? (Through the notification, as an **AI Performance Report**)
