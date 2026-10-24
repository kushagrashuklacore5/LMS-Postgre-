---
id: admin-import-students
title: Import many students from Excel (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Import Students"
prerequisites: ["Students' classes exist on Classrooms", "An Excel file with one student per row"]
related: [admin-add-student, admin-classrooms]
sources: [client/src/pages/admin/StudentImport.jsx, ai-modules/student-onboarding-agent/backend/src/integration/lmsOnboarding.js]
verified: true
last_verified: 2026-10-21
---

# Import many students from Excel (Admin)

Use this to add many students at once instead of **Add Student** one by one. Only admins can import.

## Steps

The page is titled **Import Students** and works in four numbered steps.

1. **Upload the student file.**
   - Click **Download Template** if you need the expected layout.
   - Choose your Excel file and click **Upload and check**.
2. **Column mapping.**
   - For each **Excel column**, check which **Student field** it fills.
   - An **AI Suggested Mapping** may propose fields. Accept a suggestion with **Approve**, or choose **Don't import this column**.
   - New custom fields that the AI suggests need approval (**Approve** / **Reject**).
   - **Check again** re-validates after changes.
3. **Issues.** Rows with problems are listed with their Excel row number. Fix those cells in Excel and upload the file again.
4. **Approve and import.**
   - Click **Approve import**: "Import approved. It can no longer be changed."
   - Then click **Execute import**: "Import finished."

## After importing

- **Import results** lists each Excel row with its Student, Student ID, Classroom and Setup email status.
- **Passwords:**
  - Where shown, **Password (temporary)** and **Set password** let you give a student a first password (8+ characters, typed twice).
  - Students may instead get an email with a setup link to choose their own password.
- **Running it twice is safe.** Running the same approved import again shows its earlier results ("This import had already run…; nothing was created again").

## Common problems

| What you see | What to do |
|---|---|
| Rows listed under Issues | Correct those rows in Excel and upload again |
| A column is not imported | Map it to a field, or approve a new custom field |
| A student received no setup email | Email may not be configured for your school; use **Set password** for that row |
| Unfinished import disappeared | An import that was never executed may be lost if the server restarts; upload it again |

## Questions this answers

- How do I upload students from Excel? / Excel se students kaise add karun?
- Bulk add students / import student list
- Is there a template for the student import?
- Why were some rows not imported?
- How do imported students get their password?
