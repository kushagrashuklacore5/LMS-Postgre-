---
id: student-courses-and-learning
title: My courses, studying content and certificates (Student)
intent: task-procedure
portal: student
roles: [student]
navigation: "Student sidebar → Courses → Continue (opens the course)"
related: [student-tests-and-assignments, student-live-classes, admin-courses-manage]
sources: [client/src/pages/student/Courses.jsx, client/src/pages/student/CourseViewer.jsx, client/src/pages/student/Certificates.jsx, client/src/pages/student/Student-Dashboard.jsx, server/controllers/certificate-controller.js]
verified: true
last_verified: 2026-10-21
---

# My courses, studying and certificates (Student)

## See your courses

1. Click **Courses** in the Student sidebar. The page is titled **My Courses**: "You have N course(s) enrolled".
2. Filter with **All**, **In Progress** or **Completed**, or search with **Search my courses...**.
3. Click **Continue** (or **Continue Learning**) on a course to open it.

You see **only the courses you are enrolled in**. Being in a class does not automatically give you every course of that class, because your school chooses who takes each course.

If you see "No courses assigned", your school has not enrolled you in a course yet.

## Study a course

The course page shows **Course Overview**, the **Overall Progress** and the **Course Content** week by week.

- **Videos:** **Watch Video**.
- **PDFs:** **View PDF**.
- **Course Materials:** **View**.
- After finishing an item, click **Mark Complete**. It then shows **Completed**, and your progress goes up.
- **Quizzes:** under **Assessments & Quizzes**, click **Start Quiz**. A quiz marked **Locked** is not open yet. You can attempt each quiz once.
- **Live classes:** this course's live classes are listed under **Your Lectures** on the page.

## Certificates

- **When you earn one:** after you complete **every chapter** of a course.
- **Where to find it:** the course card on **Courses** shows **View Certificate**. All your certificates are on the **My Certificates** page, which is not in the sidebar; it opens at `/student/certificates`.
- **What you can do with it:** **Download PDF**, or **Open in New Tab**.

If it says "Certificate is not ready yet", complete the remaining chapters or try again in a moment.

## Dashboard

The **Dashboard** shows:

- **Total Courses**, **Avg Progress** and **Attendance**;
- **My Classroom**, with the **Class Teacher**;
- **Continue Learning**;
- **Attendance Summary** and **Academic Results**;
- quick links, for example **Pay Institute Fees**.

## Questions this answers

- Where are my courses? / Mere courses kahan hain?
- Why can't I see a course my friend has? (You are not enrolled in it)
- How do I mark a lesson complete?
- How do I get my certificate?
- How do I start a quiz?
