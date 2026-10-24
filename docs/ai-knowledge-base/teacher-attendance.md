---
id: teacher-attendance
title: Mark attendance (Teacher)
intent: task-procedure
portal: teacher
roles: [teacher, admin]
navigation: "Mentor sidebar → Attendance"
related: [teacher-classrooms-and-students, student-results-attendance-fees]
sources: [client/src/pages/mentor/AttendanceManagement.jsx, server/controllers/attendanceController.js]
verified: true
last_verified: 2026-10-21
---

# Mark attendance (Teacher)

## Steps

1. In the Mentor sidebar, click **Attendance**. The page is titled **Attendance Management**: "Mark and manage student attendance".
2. Choose the **Class** and the **Date**.
3. For each student, choose **Present** or **Absent**. The counters **Present Today**, **Absent Today** and **Total Students** update as you go.
4. Click **Save Attendance**. You will see "Attendance saved successfully! N present, N absent".

**Download** exports the class's attendance file.

## Rules

- **No future dates.** Attendance cannot be marked for a future date.
- **Only Present or Absent.**
- **Only students of that class can be marked.**
- **Saving the same day again updates it.** You never get two entries for one student on one day.
- **Reminder:** if today's attendance is not marked by a set hour, the class teacher gets an **Attendance pending** notification.

## How students see it

Students see their own record under **Attendance**: Total Classes, Present, Absent and Attendance %.

## Common problems

| What you see | What to do |
|---|---|
| "Please select a classroom" | Choose the class first |
| "Attendance cannot be marked for a future date" | Pick today or an earlier date |
| A student is missing from the list | They are not in this class. The admin adds them (Classrooms → Add Student). |
| You see only some students of the class | You are not the class teacher of that class |

## Questions this answers

- How do I mark attendance? / Attendance kaise lagaun?
- Can I change attendance after saving? (Save the same date again)
- How do I download attendance?
- Can I mark attendance for tomorrow? (No)
