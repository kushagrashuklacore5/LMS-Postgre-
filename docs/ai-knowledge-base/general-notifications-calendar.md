---
id: general-notifications-calendar
title: Notifications, announcements and the calendar
intent: feature-explanation
portal: all
roles: [admin, teacher, student, accountant, storekeeper]
navigation: "Bell icon (top right); Admin Dashboard → + Announcement; sidebar → Calendar → Create Event"
related: [teacher-live-classes, student-live-classes]
sources: [client/src/components/AnnouncementBell.jsx, client/src/pages/announcements/CreateAnnouncementModal.jsx, client/src/calendar/CalendarSidebar.jsx, client/src/calendar/CreateEventModal.jsx, client/src/calendar/CalendarPage.jsx, client/src/utils/notificationRoutes.js, server/services/notificationText.js]
verified: true
last_verified: 2026-10-21
---

# Notifications, announcements and the calendar

## The bell (notifications)

The **bell icon** at the top right of every portal shows announcements and personal notifications. A red dot means something is unread. Clicking a notification opens the related screen.

| Notification | Who gets it | Opens |
|---|---|---|
| **Live Class Started** | Students enrolled in the course, of that class | The live class (join) |
| **Live Class Scheduled** | Same students | **Your Lectures** |
| New test published | Students the test was assigned to | The course or **My Tests** |
| New assignment, due soon, deadline missed | Students of the assignment | The assignment |
| Result available | The student | **Results** or the assignment |
| Performance report shared | The student | The report |
| New calendar event | The event's audience | The **Calendar**, at that month |
| Assignment or test submitted | The teacher | The teacher's AI Assessments pages |
| Attendance pending | The class teacher, when today's attendance is not marked | **Attendance** |
| Teacher awaiting approval | School admins | Teacher approval page |

## Post an announcement (Admin)

1. On the Admin **Dashboard**, click **+ Announcement**.
2. In **New Announcement**, enter the title and the message.
3. Choose who sees it: **Students**, **Faculty** or **Both**.
4. Click **Publish**. You will see "Announcement published".

Teachers post announcements from their **Dashboard** with the **Announcement** button. They can post only to the classes and courses they are assigned to. A teacher with no class gets "You are not assigned to any class yet".

## Calendar

- **Opening it:** **Calendar** in the sidebar (admin, teacher, student). The page is titled **Academic Calendar**.
- **Creating events:** only **admins and teachers** see **Create Event**. In **Create Calendar Event**:
  1. Enter the **Event Title** and an optional description.
  2. Choose **Display for**: **Students Only**, **Faculty/Mentors Only** or **Both Students & Faculty**.
  3. Teachers choose the target: one class and section, or one course.
  4. Optionally tick **Notify participants**, with your own message.
- **Students** see the events meant for them.
- **Plan restriction:** if the page says "Access to the calendar is restricted on your current plan.", the school's subscription does not include the calendar. The platform owner must upgrade the plan.

## Questions this answers

- Where are my notifications? / Notification kahan dikhega?
- How do I send an announcement to students?
- How do I add an event / holiday / exam to the calendar?
- Why can't I open the calendar? (Plan restriction)
- Will students be told when a live class starts? (Yes, through the bell)
