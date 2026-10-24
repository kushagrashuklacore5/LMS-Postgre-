---
id: unsupported-and-unknown
title: Things the LMS does not do (or that are not confirmed)
intent: unsupported
portal: all
roles: [admin, teacher, student, accountant, storekeeper, vendor, superadmin]
navigation: "n/a"
related: [troubleshooting-common-problems, reports-and-counts]
sources: [client/src/App.jsx, client/src/pages/Home.jsx, client/src/pages/admin/Classrooms.jsx, client/src/pages/mentor/ClassroomDetail.jsx, client/src/pages/student/PayFees.jsx, server/controllers/classroomController.js]
verified: true
last_verified: 2026-10-21
---

# Things the LMS does not do (or that are not confirmed)

If someone asks for one of these, say that it is not available. Do not invent steps.

## Not available in the current screens

| Request | Status |
|---|---|
| Reset my own password by email ("Forgot password?") | Not available. The link only reloads the login page. Ask the Super Admin or your admin. |
| Admin resets a student's or teacher's password | No button for school admins. The Super Admin can set passwords (**All Staff → Edit User**). |
| Show a student's or teacher's password again later | Not possible. Passwords are shown only once, when created. |
| Delete a class | Not available on the screens |
| Remove a student from a class (teacher) | The button says "Student removal coming soon". Admins can move a student with **Users → Change Class**. |
| Disable or pause an account (school admin) | Not available. **Users → Delete** removes it permanently. |
| Pay fees online | Switched off at the moment. Pay at the school office. |
| Undo a cancelled live class | Not possible; schedule a new one |
| Record a live class | Not available |
| Admins starting or joining a live class | Not allowed. The course teacher and the enrolled students join. |
| Students seeing other students' marks, attendance or contact details (classmates' marks, results or phone numbers) | Not allowed. Each student sees only their own marks, attendance and fees. |
| A chatbot or assistant inside the LMS screens | Not part of the LMS screens. The "Ask us anything" button on the website opens the login form. |
| Typing your own meeting link (Zoom, Google Meet) for a live class | Not supported. Live classes use the built-in meeting. |
| Exporting the whole database (school admin, accountant) | Super Admin only |

## Partly verified (answer carefully)

- **Storekeeper and vendor screens:** see "Storekeeper and vendor portals". Detailed steps are not documented.
- **Student timetable:** a timetable page and a **Timetable (optional)** upload when creating a classroom exist. How a timetable reaches students was not verified.
- **Subscription and plan details:** plan names and limits depend on the platform owner's settings.
- **Self-registration** ("Request access" on the website): switched off by default. When the platform owner enables it, new accounts need the admin's approval.

## Questions this answers

- Can I recover my password by email?
- Can I delete a class?
- Can I pay fees online?
- Can I record the live class?
- Can the admin join a live class?
- Can I use Zoom / Google Meet?
- Can I see my classmates' marks? (No)
