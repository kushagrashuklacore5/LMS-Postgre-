---
id: admin-add-student
title: Add a single student (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Add Student"
prerequisites: ["At least one classroom exists (Classrooms page)"]
related: [admin-import-students, admin-classrooms, admin-manage-users, admin-courses-create]
sources: [client/src/pages/admin/AddStudent.jsx, client/src/components/admin/ClassSectionSelect.jsx, client/src/components/admin/PasswordNotice.jsx, server/controllers/adminController.js]
verified: true
last_verified: 2026-10-21
---

# Add a single student (Admin)

**In short:** to add a new student, an admin opens **Add Student** in the Admin sidebar, fills in the student's name, email, class and section, and clicks **Save Student**.

**Who can do this:** school admins only. Teachers and students cannot create student accounts.

**Before you start:** the student's class must already exist. Create it on **Classrooms** first (see "Create a classroom"). For many students at once, use **Import Students** instead.

## Steps

1. In the Admin sidebar, click **Add Student**. The page is titled **Add Student**, with the subtitle "Enter student details".
2. Under **Personal Information**, fill in:
   - **Full Name** (required)
   - **Email Address** (required; must be a valid, unused email)
   - optional: **Parent Name**, **Phone** (exactly 10 digits), **Blood Group**, **Date of Birth**, **Address**
3. Under **Academic Information**, choose the **Class** (required) and the **Section** (required). **Admission Date** is optional.
4. Click **Save Student**. The button shows "Saving..." while it works.

## What happens after saving

- **Confirmation.** A green message says **"Student created successfully"**, the class the student was added to, and the **Login Password**.
- **Password.** The LMS creates the password automatically and shows it **only this once**. Click **Copy password** in the message and give it to the student.
- **Class.** The student is added to the chosen class.
- **Courses.**
  - The student is enrolled automatically in that class's courses that were assigned for **All students of the class**.
  - Courses assigned only to *selected* students are **not** added; enrol the student in those from **Courses** (see "Manage a course's classes and students").
- **Form.** It clears, ready for the next student.

## How to check it worked

- **Users** page: search the student's name or email.
- **Classrooms** → open the class: the student is listed under **Enrolled Students**.

## Common problems

| What you see | Why | What to do |
|---|---|---|
| "Name and Email are required" | Full Name or Email is empty | Fill both |
| "Class is required" / "Section is required" | No class or section chosen | Choose both |
| "Please enter a 10-digit number" | Phone is not 10 digits | Enter 10 digits or leave it empty |
| "Student already exists" | The email is already used | Use another email, or find the existing student on **Users** |
| "No classes have been created yet. Create a classroom first, then add the student." | The school has no class | Create the class on **Classrooms** |
| The class is not in the list | It has not been created | Create it on **Classrooms**. The small "Class or section not listed? Create it" link on this form currently fails, because every class now needs a class teacher, which that link cannot set. |
| A message about a plan or student limit | The school's plan allows no more students | Contact the platform owner about the plan |
| You closed the message and lost the password | It is shown only once | There is no "show password again" button. Ask the Super Admin to set a new password, or recreate the account. |

## Questions this answers

- How do I add a student? / Student kaise add karun? / Naya student kaise banaun?
- Where can I register a new student?
- I cannot find the Add Student button (it is in the **Admin** sidebar; teachers do not have it)
- What is the student's password after I add them?
- What happens after I save the student?
- Why is the student not seeing a course after I added them?
