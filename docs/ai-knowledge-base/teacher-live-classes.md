---
id: teacher-live-classes
title: Live classes for teachers (start, schedule, end, attendance)
intent: task-procedure
portal: teacher
roles: [teacher]
navigation: "My Classrooms → open a class → Start Class; the bar at the top of every page shows Start class / Open class when due"
related: [student-live-classes, admin-lectures-history, general-notifications-calendar]
sources: [client/src/components/lectures/StartClassModal.jsx, client/src/components/lectures/LecturesTable.jsx, client/src/components/lectures/LiveNowBanner.jsx, client/src/pages/LiveLecture.jsx, server/helpers/lectures.js]
verified: true
last_verified: 2026-10-21
---

# Live classes for teachers

The video meeting opens **inside the LMS**; nothing needs to be installed. Live classes are always for **one class and one of your courses**.

## Start a class now

1. Go to **My Classrooms**, **Open** the class, and click **Start Class**.
2. In **Start a class**:
   - choose the **Course**. Only courses you teach to this class are listed.
   - enter the **Topic** (required) and an optional **Description**.
3. Keep **Start now** selected and click **Start now**.
4. The meeting opens. Your students are notified straight away.

## Schedule a class for later

1. Open **Start Class** and fill in the course and topic as above.
2. Choose **Schedule**, then pick the **Date and time** and the **Minutes** (10 to 480).
3. Click **Schedule**. You will see "Scheduled for …".
4. Students are notified and see the class under **Your Lectures** as **Upcoming**.

## Start a scheduled class

From **30 minutes before** the scheduled time, either:

- use the bar at the top of every page ("Starting soon … **Start class**"); or
- on the class page under **Your Lectures**, click **Start class**.

Before that, the button is grey with a countdown, for example "Start · in 45 min". Classes never start by themselves.

## During the class

- **Moderator rights:** you are the meeting's moderator. Students are participants.
- **Copy class link:** copies the class's LMS link to share, for example on WhatsApp. Only students enrolled in that course and class can open it.
- **Leaving:** you can leave and come back with **Open** (on the bar or in **Your Lectures**). Closing the browser does **not** end the class.
- **End class:** click **End class** and confirm. This finishes the class for everyone and finalises attendance.

## Recording

Recording a live class is not available. Admins cannot start or join live classes.

## Cancel, history and attendance

- **Cancel:** under **Your Lectures**, **Cancel** a scheduled class. It stays in history as **Cancelled**; there is no undo.
- **History:** **Your Lectures** lists your classes with their date, course, topic, duration and status (**Upcoming**, **Live**, **Completed**, **Cancelled**, **Not started**).
- **Attendance:** click the attendance figure ("N attended, N missed") to see each student.
  - A student is marked **Attended** after at least 1 minute in the class.
  - **Missed** is only decided after the class ends.
  - **Not measured** means no join or leave was recorded at all.

## Common problems

| What you see | Why | What to do |
|---|---|---|
| "You do not teach a course to this class, so you cannot start a class here." | You are only the class teacher, or have no course in this class | Ask the admin to give you a course for this class |
| "Live classes are not set up yet (JaaS credentials missing)." | The video service is not configured for the school | Contact the LMS administrator or support |
| The Start button is grey | More than 30 minutes before the scheduled time | Wait until it becomes active |
| "Authentication failed" inside the meeting | Usually the server's clock or the video-service setup | Contact support |
| The class still shows Live after you left | Leaving does not end a class | Click **Open**, then **End class** |

## Questions this answers

- How do I start an online / live class? / Live class kaise start karun?
- How do I schedule a class for tomorrow?
- How will students join? (A notification, a "Join" button and a top bar in their portal)
- How do I end the class?
- Where can I see who attended?
- Can I share a link? (Yes, **Copy class link**)
