---
id: admin-courses-create
title: Create a course for classes (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Courses → New course (opens Create Course)"
prerequisites: ["At least one classroom exists", "The course teacher exists (Add Teacher)"]
related: [admin-courses-manage, admin-classrooms, admin-add-teacher, teacher-course-portal]
sources: [client/src/pages/admin/AdminCourses.jsx, client/src/pages/admin/CreateCourseAdmin.jsx, client/src/components/admin/ClassEnrollmentScope.jsx, server/helpers/courseClasses.js]
verified: true
last_verified: 2026-10-21
---

# Create a course for classes (Admin)

A course belongs to a teacher and is taught to one or more **classes**. Students get the course only when they are **enrolled**, either the whole class or students you pick.

## Steps

1. In the Admin sidebar, click **Courses**, then **New course**. The page is titled **Create Course**, with the subtitle "Assign a mentor and students".
2. Under **Course Details**, enter:
   - **Course Title** (required), for example "Advanced Web Development";
   - optional: **Category**, **Duration** (for example "8 Weeks"), **Description**.
3. Under **Assign Mentor**, choose the course teacher from **Select a Mentor** (required).
4. Under **Classes**, tick one or more classes (required). Each shows its number of students.
5. Under **Assign Students**, choose one option:
   - **All students of the class** (or "of these classes"). Everyone in the ticked classes is enrolled, and **students who join those classes later are enrolled automatically**.
   - **Selected students.** The students of each ticked class are listed. Tick the ones who should take the course; use **Select all** or **Clear** per class. Students who join the class later are **not** enrolled.
6. Click **Create Course & Assign Students**.

## What happens after creating

- **Confirmation.** "Course created successfully (N student(s) enrolled)". You are taken to the **Courses** page.
- **All or nothing.** The course, its classes and its students are saved together. If something is wrong, nothing is saved and an error is shown.
- **Who now has access:**
  - the chosen teacher sees the course under **My Classrooms → class → Courses in this Classroom**;
  - enrolled students see it under **Courses**.

## How to check it worked

On **Courses**, the new course shows its **Teacher**, its number of students, and one chip per class, for example "5-A — 3". The first class chosen is marked **(home)**.

## Common problems

| What you see | Why | What to do |
|---|---|---|
| "Title and Mentor are required" | Title or teacher missing | Fill both |
| "Choose at least one class for this course." | No class ticked | Tick at least one class |
| "No classes yet. Create a class first, then its courses." | The school has no class | Create a class on **Classrooms** |
| "Tick at least one student, or choose All students." | **Selected students** chosen but nobody ticked | Tick students, or switch to **All students** |
| "N selected student(s) are not in the chosen class(es)" | A ticked student's class was later unticked | Re-check the ticked students |
| "Course limit reached (… courses max per class for … plan)" | The school's plan limits courses per teacher per class | Choose another teacher or upgrade the plan |
| The teacher is not in the list | Not added yet | Add the teacher first (**Add Teacher**) |

## Questions this answers

- How do I create a course? / Course kaise banaun? / Where do I create a course?
- How do I give a course to a whole class?
- How do I give a course to only some students?
- How do I assign a teacher to a course?
- Why can't I create a course? (No class yet)
