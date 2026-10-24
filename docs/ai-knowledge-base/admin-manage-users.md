---
id: admin-manage-users
title: Find, filter, move or delete users (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Users"
related: [admin-add-student, admin-add-teacher, reports-and-counts]
sources: [client/src/pages/admin/UserList.jsx, client/src/components/admin/ChangeStudentClassModal.jsx, server/controllers/adminController.js]
verified: true
last_verified: 2026-10-21
---

# Find, filter, move or delete users (Admin)

## Open the user list

In the Admin sidebar, click **Users**. The page is titled **User Management**, with the subtitle "Manage all user accounts".

At the top, three cards count your school's accounts: **Students**, **Mentors** (teachers) and **Admins**. Click **Refresh** to reload.

## Search and filter

- **Search** finds users by part of their name or email ("Name or email...").
- **Role** filters the list: **All Roles**, **Student**, **Mentor** or **Admin**.
- **Clear Filters** resets both.
- The list shows 10 users per page. Use **Previous** and **Next** to move between pages.

For each user the list shows the **Name**, **Email Address**, role and ID. Students also show their Roll No.

## Move a student to another class

1. Find the student and click **Change Class**. This button appears only for students.
2. The **Current class** is shown. Choose the new class and section.
3. Click **Update Class**. You will see "Student class updated successfully".

The student's existing results, attendance and other records are kept.

## Delete a user

1. Find the user and click **Delete**.
2. Confirm "Delete user {name}? This cannot be undone."

Rules:

- **Deletion is permanent.** There is no undo.
- **Admin accounts cannot be deleted** from this page.
- **The deleted person can no longer sign in.**
- **To pause someone's access instead,** contact the Super Admin. This page has no "disable" option.

## Questions this answers

- Where can I see the list of all students / teachers? / Saare students ki list kahan hai?
- How do I search for a student?
- How do I change a student's class / section?
- How do I delete a user / remove a student?
- How many students / teachers / admins does my school have? (see the cards at the top, and "Reports and counts")
