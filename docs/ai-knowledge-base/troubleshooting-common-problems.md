---
id: troubleshooting-common-problems
title: Common problems and what to do
intent: troubleshooting
portal: all
roles: [admin, teacher, student, accountant]
navigation: "Depends on the problem"
related: [general-login-and-password, admin-add-student, admin-classrooms, admin-courses-create, teacher-live-classes, student-live-classes, unsupported-and-unknown]
sources: [server/middleware/apiAccessGate.js, server/middleware/authMiddleware.js, client/src/components/ProtectedRoute.jsx, client/src/pages/student/PayFees.jsx, client/src/calendar/CalendarPage.jsx]
verified: true
last_verified: 2026-10-21
---

# Common problems and what to do

## I cannot find a button or menu

| You are looking for | Where it is | If you do not see it |
|---|---|---|
| **Add Student** | Admin sidebar | Only admins have it. Teachers and students cannot add students. |
| **Add Teacher** | Admin sidebar | Admins only |
| **Create Classroom** | Admin → **Classrooms** | Admins only |
| **New course** | Admin → **Courses** | Admins create courses for classes. Teachers can also use **Create Course** on their class page. |
| **Assign Students** (on a class page) | Teacher → **My Classrooms** → class | Only the **class teacher** of that class sees it |
| **Start Class** | Teacher → **My Classrooms** → class | If no course is offered, you do not teach a course to that class |
| **Join** (live class) | Student → **Your Lectures**, or the top bar | It becomes active 10 minutes before the class |
| **Mentor Approval**, **Analytics** | Admin pages that are not in the sidebar | Open the addresses `/admin/mentors` and `/admin/analytics` |
| **My Certificates** | Student page that is not in the sidebar | **Courses → View Certificate**, or the address `/student/certificates` |

## Sign-in and session

| Symptom | Cause | What to do |
|---|---|---|
| "Invalid email or password" | Wrong email or password | Check both. To reset the password, see "Signing in, signing out and resetting a password". |
| "Your account is waiting for approval…" | Not approved yet | Ask your school admin |
| Suddenly signed out on every device | You (or a password change) signed out all sessions | Sign in again |
| "Your account is not attached to a school." | The account has no school | The Super Admin must link it to an institute |
| You opened another role's page and were sent back | Each role sees only its own portal | Use your own portal |

## "Not found" or "Access denied" when opening something

The LMS shows only what belongs to **your school**, and only what your role is allowed to see. A record of another school, or a course you are not part of, looks exactly like "not found".

- **Students:** you see only courses you are **enrolled** in.
- **Teachers:** you see only **your own** courses, and the classes you teach.

If you believe you should have access, ask your admin to enrol you or assign you.

## Data does not appear

| Symptom | Likely cause | What to do |
|---|---|---|
| A student does not see a course | Not enrolled in it. Being in the class is not enough. | Admin: **Courses** → class chip → tick the student |
| A teacher sees only some students of a class | They are the course teacher, not the class teacher | Expected |
| A teacher sees "No Classrooms Assigned" | Not a class teacher and has no course in any class | Admin assigns a class or a course |
| A new student did not get older courses | Those courses were for "Selected students" | Admin ticks the student for each course |
| Live class not listed for a student | Not enrolled in that course, or another class | Admin enrols the student |
| "Access to the calendar is restricted on your current plan." | The plan does not include the calendar | Ask the platform owner to upgrade the plan |
| Online fee payment says "not available yet" | Online payment is switched off | Pay at the school office; the accountant records it |
| Accountant's **Fee Monitoring & Reminders** is empty | Currently loads only for teachers (known problem) | Use **Fee Collection** |

## Saving fails

| Message | What to do |
|---|---|
| "… is required" | Fill the marked field |
| "Please enter a 10-digit number" | Correct the phone number, or leave it empty |
| "… already exists" | Use the existing record, or different details |
| A plan or limit message (for example "Course limit reached") | The school's plan limit was reached. Contact the platform owner. |
| "Server error" or nothing happens | Refresh the page and try again. If it repeats, report it with the page name and the time to your admin or support. |

## When to contact support

- The same error repeats after refreshing.
- A live class shows "Authentication failed" for everyone.
- Data you saved is missing.
- You need a password reset and your admin cannot help.

## Questions this answers

- I can't find the Add Student button / Add student ka button nahi dikh raha
- Why can't I see this course / class / student?
- Why does it say not found?
- Why am I logged out?
- What should I do if saving fails?
