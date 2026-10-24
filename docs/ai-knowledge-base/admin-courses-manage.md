---
id: admin-courses-manage
title: Manage a course's classes and students (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Courses"
related: [admin-courses-create, admin-classrooms, teacher-classrooms-and-students]
sources: [client/src/pages/admin/AdminCourses.jsx, client/src/components/admin/ClassEnrollmentScope.jsx, server/helpers/courseClasses.js]
verified: true
last_verified: 2026-10-21
---

# Manage a course's classes and students (Admin)

Open **Courses** in the Admin sidebar. Each course card shows:

- its **Teacher**;
- the number of students enrolled;
- one chip per class, for example "5-A — 3": the class and how many of its students take the course.

Chip markers:

- **(home)** marks the first class the course was created for.
- **(individual)** marks a class whose students were added one by one; the class itself is not assigned.

Use **Search courses...** to find a course.

## Give a course to more classes

1. On the course card, click **Assign to classes**.
2. Tick the new classes.
   - Classes already given this course are shown as **Assigned · N/M**, with a **Remove class** button. They cannot be ticked again.
3. Choose **All students of the class** or **Selected students** (and tick students).
4. Click **Assign N**. A message shows how many students were enrolled.

## Choose which students of a class take the course

1. On the course card, click the class chip, for example **5-A — 3**.
2. The whole class is listed. Ticked students take the course; unticked students do not.
3. Tick students to add them and untick students to remove them. Rows show "will be enrolled" or "will be removed".
4. Click **Save**.
   - **Only adding:** saved straight away.
   - **Removing anyone:** a box **Remove from course?** names the students, the course and the class. Click **Remove N student(s)** to confirm, or **Cancel** to keep everything as it was.

Notes:

- **Removing a student only removes the course.** Their account, class, marks and submissions stay.
- **Removing anyone from an "All students" class turns it into "Selected students".** Students who join that class later are then not enrolled automatically.
- **To return to "all":** click **Enrol the whole class, and students who join it later**.

## Remove a class from a course

1. Click the small **×** on the class chip, or **Remove class** in **Assign to classes**.
2. Confirm **Remove class assignment?**, which names the class and the course.

Students enrolled through that class lose the course; students added individually keep it. A course must keep at least one class. If you remove the home class, another class becomes home.

## Questions this answers

- How do I enrol / assign students to a course? / Course mein student kaise add karun?
- How do I remove a student from a course?
- How do I assign a course to another class?
- How do I remove a class from a course?
- Why does a student of the class not see the course? (They are not ticked for it)
- What do (home) and (individual) mean?
