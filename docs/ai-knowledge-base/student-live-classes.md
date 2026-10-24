---
id: student-live-classes
title: Join a live class (Student)
intent: task-procedure
portal: student
roles: [student]
navigation: "Student sidebar → Your Lectures → Join; or the red LIVE NOW bar at the top of any page; or the bell notification"
related: [teacher-live-classes, general-notifications-calendar]
sources: [client/src/components/lectures/LecturesTable.jsx, client/src/components/lectures/LiveNowBanner.jsx, client/src/pages/LiveLecture.jsx, client/src/pages/student/StudentLectures.jsx, server/helpers/lectures.js]
verified: true
last_verified: 2026-10-21
---

# Join a live class (Student)

Live classes open **inside the LMS**; you do not need another app.

## Three ways to join

1. **The bar at the top of every page:**
   - "**● LIVE NOW** … **Join now**" while the class is running;
   - "**Starting soon** … **Join class**" from 10 minutes before.
2. **Your Lectures** (Student sidebar). Every upcoming class has a **Join** button:
   - grey with a countdown ("**Join · opens in 45 min**") until 10 minutes before the start;
   - then **Join class**, which opens the waiting room;
   - then a red **● Join now** once the teacher starts.
3. **The bell:** click the **Live Class Started** notification.

**Waiting room.** If you join early, the page says "The class has not started yet". It joins **automatically** within seconds of the teacher starting.

**Not started.** If a class's whole time passed and the teacher never started it, it shows **Not started** and cannot be joined.

## Who can join

Only students **enrolled in that course** in **that class**. The class link works only for them, even if someone else shares it with you.

## Your attendance

- After the class, **Your Lectures** shows your status:
  - **Attended:** you were in the class for at least 1 minute;
  - **Missed:** you did not join;
  - **Not measured:** no attendance was recorded for anyone.
- **Missed** is only decided after the class ends. Joining late still counts.
- Keep the class page open while attending. Leaving and rejoining is fine; your time adds up.

## Common problems

| What you see | What to do |
|---|---|
| Join is grey | It becomes active 10 minutes before the start |
| "The class has not started yet" | Stay on the page; it joins automatically when the teacher starts |
| The class is not in Your Lectures | You are not enrolled in that course, or it is for another class. Ask your teacher. |
| "Authentication failed" in the meeting | Reload the page and join again. If it continues, tell your teacher. |
| Camera or microphone not working | Allow camera and microphone access in your browser when asked |

## Questions this answers

- How do I join the live class? / Live class kaise join karun? / Class ka link kahan hai?
- Why is the Join button not working? (It is too early)
- Where do I see my upcoming classes?
- Was I marked present in the live class?
