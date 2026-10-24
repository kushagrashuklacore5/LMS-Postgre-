---
id: teacher-results
title: Enter term results and marks (Teacher)
intent: task-procedure
portal: teacher
roles: [teacher, admin]
navigation: "Mentor sidebar → Class Results"
related: [student-results-attendance-fees, teacher-classrooms-and-students]
sources: [client/src/pages/mentor/ClassResults.jsx, client/src/pages/mentor/AddResult.jsx, server/controllers/resultController.js]
verified: true
last_verified: 2026-10-21
---

# Enter term results and marks (Teacher)

## Steps

1. In the Mentor sidebar, click **Class Results**. The page is titled **Results Management**: "Add and manage student results".
2. Choose the class in **Select Classroom**.
3. Optional: check the class's subjects under **Class Subjects**, and change them with **Configure Subjects**.
4. Enter marks in one of two ways:
   - **Grid:** type each student's marks per subject in the table, then click **Save All Results**. The button shows the number of changed rows.
   - **One student:** click **Add Result**, choose the **Student**, enter the **Term** (for example "First Term"), the **Subjects** with marks and totals, optional **Comments**, then **Save Result**.
5. You will see "Result added successfully" or "Results saved for N students".

Each result shows **PASS** or **Fail**. Use the edit icon to change a result and the delete icon to remove one (after confirming).

## Rules

- At least one subject with marks is required.
- Marks must be between 0 and the subject's total. Otherwise: "marks for {subject} must be between 0 and {total}".
- **Edit Subjects** lets one student have different subjects or maximum marks; those are marked **Custom** or **Override**.

## How students see it

Under **Results**: subject-wise marks, **Overall Percentage** and **Status**. They also get a **Result available** notification.

## Common problems

| What you see | What to do |
|---|---|
| "You are not assigned to any classroom yet." | Ask the admin to link you to a class |
| "Please add at least one subject with marks" | Enter at least one subject |
| "Please select a student" | Choose the student |

## Questions this answers

- How do I add marks / results / report card? / Marks kaise daalun?
- How do I edit or delete a result?
- How do I change the subjects of a class?
- Where do students see their results?
