---
id: admin-classrooms
title: Create and manage classrooms (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Classrooms → Create Classroom; click a class card to open it"
prerequisites: ["At least one teacher exists (Add Teacher) to be the class teacher"]
related: [admin-add-teacher, admin-add-student, admin-courses-create, admin-fee-structure, admin-lectures-history]
sources: [client/src/pages/admin/Classrooms.jsx, client/src/pages/admin/CreateClassroomModal.jsx, client/src/pages/admin/ClassroomDetails.jsx, server/controllers/classroomController.js]
verified: true
last_verified: 2026-10-21
---

# Create and manage classrooms (Admin)

A **classroom** (class) is a grade plus a section, for example "Grade 5 – A". Create classes **first**. Courses, fee structures and students all need a class.

## Create a classroom

1. In the Admin sidebar, click **Classrooms**. The page is titled **Classrooms**, with the subtitle "Manage classrooms & assign teachers".
2. Click **Create Classroom**.
3. Fill in the form:
   - **Grade.** Choose from **Select Grade Level** (Grade 1 (Primary) to Grade 12 (Secondary)), or type another class name in "Or type another class name (e.g. BSc)".
   - **Section** (required), for example A, B or C.
   - **Class Teacher** (required). Choose from **Select Class Teacher**. The list shows the teachers of your school.
   - optional: **Assign Students** (hold Ctrl/Cmd to select several), **Classroom Photo**, **Timetable**.
4. Click **Create**. You will see "Classroom created successfully!"

The new class appears as a card showing its **Students** count and its **Class Teacher**.

## Open a classroom

Click a class card. The class page shows the **Class Teacher** and three tabs:

| Tab | What it shows |
|---|---|
| **Courses** | Courses taught to this class, with their teacher |
| **Students** | **Enrolled Students** (Name, Email, Roll Number, Grade) |
| **Lectures** | All live lectures held or scheduled for this class ("Lectures of this class") |

## Add an existing student to a classroom

1. Open the class and click **Add Student**. If the class is empty, the button is **Add First Student**.
2. Search ("Search by name or email...") and select the student. The list shows students not yet in the class.
3. Click **Assign Student**. You will see "Student assigned to classroom successfully!"

The student is also enrolled in the class's courses that were assigned for **All students**. To create a brand-new student, use **Add Student** in the sidebar instead.

## Rules and limits

- **Every class needs a class teacher.** If nobody is listed, the form says "No teachers yet. Add a teacher first, then create the class."
- **The same grade and section cannot be created twice.** You will see "… already exists".
- **Classes cannot be deleted** from the screens.
- **To move a student to another class,** use **Users → Change Class**.

## Common problems

| What you see | Why | What to do |
|---|---|---|
| "Grade is required" / "Section is required" | A required field is empty | Fill it in |
| "Choose the class teacher." | No class teacher selected | Select one in **Class Teacher** |
| "Add a teacher first (Add Teacher), then create the class." | The school has no teachers yet | Add a teacher (**Add Teacher**), then create the class |
| "… already exists" | That grade and section exist | Use the existing class, or a different section |
| "No classrooms created. Click "Create Classroom" to get started." | The school has no classes yet | Create the first class |
| Fee Structure or New course asks for a class | Class-first rule | Create a class first |

## Questions this answers

- How do I create a class / section / classroom? / Class kaise banaun?
- How do I assign a class teacher?
- How do I add a student to a class?
- Where can I see the students of a class?
- Can I delete a class? (Not from the screens)
- Why can't I create a class? (No teacher yet, or it already exists)
