---
id: admin-lectures-history
title: Live lecture history and attendance (Admin)
intent: task-procedure
portal: admin
roles: [admin]
navigation: "Admin sidebar → Classrooms → open a class → Lectures tab"
related: [teacher-live-classes, student-live-classes, admin-classrooms]
sources: [client/src/pages/admin/ClassroomDetails.jsx, client/src/components/lectures/LecturesTable.jsx, server/helpers/lectures.js]
verified: true
last_verified: 2026-10-21
---

# Live lecture history (Admin)

## See a class's lectures

1. Go to **Classrooms** and click the class.
2. Open the **Lectures** tab ("Lectures of this class").

It lists every live lecture of the class, from all its teachers, with:

- the date and time, course, topic and teacher;
- the duration and status;
- attendance ("N attended, N missed"). Click it to see each student's status and minutes.

## What admins can and cannot do

- **Cancel** a scheduled lecture: yes.
- **End** a live lecture: there is no End button on this screen. The lecture's teacher ends it (**Open**, then **End class**).
- **Start** or **join** lectures: no. Only the course teacher starts a lecture, and only the teacher and the enrolled students of that class join it.

## Questions this answers

- Where can I see the online classes held in a class?
- Did students attend the live class?
- Can the admin join or start a live class? (No)
