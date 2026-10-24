---
id: admin-add-teacher
title: Add a teacher (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Add Teacher"
related: [admin-classrooms, admin-courses-create, admin-manage-users]
sources: [client/src/pages/admin/AddTeacher.jsx, client/src/pages/admin/MentorApproval.jsx, server/controllers/adminController.js]
verified: true
last_verified: 2026-10-21
---

# Add a teacher (Admin)

Teachers are called **Mentor** in some screens. Only admins can add teachers.

## Steps

1. In the Admin sidebar, click **Add Teacher**. The page is titled **Add Teacher**, with the subtitle "Enter teacher details".
2. Fill in **Full Name** and **Email Address** (both required).
3. Optional fields:
   - **Phone** (10 digits), **Blood Group**, **Date of Birth**, **Address**;
   - **Qualification**, **Subject Expertise**, **Joining Date**.
4. Click **Save Teacher**.

## What happens after saving

- **Confirmation.** A green message **"Teacher created 🎉"** shows the **Temporary Password** with a **Copy password** button. It is shown only once; give it to the teacher.
- **Ready to use.** The teacher can sign in straight away (the account is approved).
- **Where the teacher now appears:**
  - in the **Class Teacher** list when you create a classroom;
  - in the **Assign Mentor** list when you create a course.

## Next steps

- Make them a class teacher: **Classrooms → Create Classroom → Class Teacher**.
- Give them a course: **Courses → New course → Assign Mentor**.

## Common problems

| What you see | What to do |
|---|---|
| "Name and Email are required" | Fill both |
| "Please enter a 10-digit number" | Correct the phone or leave it empty |
| Email already used | Use a different email |
| Password lost after closing the message | Ask the Super Admin to set a new password, or recreate the account |

## Teacher approval page

A separate **Mentor Approval** page lists teachers as **Approved** or **Pending**. It has **Approve**, **Reject** and **Remove** buttons, and an **Add Mentor** form.

- It is only needed for teachers who registered themselves, which is switched off by default.
- It is **not in the sidebar**; it opens at the address `/admin/mentors`.
- The password typed in its **Add Mentor** form is ignored: the LMS generates the password and shows it in the success message.

## Questions this answers

- How do I add a teacher / mentor / faculty? / Teacher kaise add karun? / Naya teacher kaise jodun?
- Where do I find the teacher's password?
- How do I approve a teacher?
- Why can't I select a teacher when creating a class? (Add the teacher first)
