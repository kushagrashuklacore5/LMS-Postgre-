---
id: teacher-classrooms-and-students
title: My Classrooms, the class page and My Students (Teacher)
intent: task-procedure
portal: teacher
roles: [teacher]
navigation: "Mentor sidebar → My Classrooms → Open a class; Mentor sidebar → My Students"
related: [general-portals-and-roles, teacher-attendance, teacher-results, teacher-course-portal, teacher-live-classes]
sources: [client/src/pages/mentor/MentorClassrooms.jsx, client/src/pages/mentor/ClassroomDetail.jsx, client/src/pages/mentor/MyStudents.jsx, client/src/pages/mentor/MentorDashboard.jsx, server/controllers/classroomController.js]
verified: true
last_verified: 2026-10-21
---

# My Classrooms, the class page and My Students (Teacher)

## Dashboard

The teacher **Dashboard** shows:

- **Total Courses**, **Total Students** and **Active Courses**;
- **Your Courses**, with the buttons **View**, **Add Chapter**, **Assign** and **Assessment**;
- an **Announcement** button.

If no course is assigned yet, it says "You have not been assigned any courses yet." Courses are assigned by the admin.

## My Classrooms

Click **My Classrooms**. You see the classes you are linked to:

- **Class teacher:** you are responsible for the class.
- **Course teacher:** you teach a course to that class.

If none is shown, you see "No Classrooms Assigned". Contact your admin. Click **Open** on a class to open its page.

## The class page

It shows the class name, **Total Students** and **Total Courses**, and these actions:

| Action | What it does | Who sees it |
|---|---|---|
| **Start Class** | Start or schedule a live lecture (see "Live classes for teachers") | Any teacher of the class. Only your own courses are offered. |
| **Create Course** | Create a new course for this class; you become its teacher | Teachers of the class |
| **Assign Students** | Add students of the school to this class | **Class teacher only** |
| **Attendance** / **Add Result** | Shortcuts to those pages | Teachers of the class |
| **Your Lectures** | Your lectures in this class, with Start, Open, Cancel and attendance | Teachers of the class |

**Courses in this Classroom** lists only **your own** courses in this class. Each has:

- **Course Portal**, to add content, assessments and live classes;
- **Manage Course**.

### Who appears in the student list

- **Class teacher:** the title is **Class Students**. It is the whole class, and you can **Assign Students** and see **Remove** buttons. Removing is not available yet ("Student removal coming soon").
- **Course teacher only:** the title is **My Course Students**. It shows only the students of this class who are enrolled in your courses, and there are no add or remove buttons.

**Portal** opens a student's portal view.

## My Students

Click **My Students** ("Students enrolled in the courses you teach").

- **By course:** choose a course (**Choose a course**) to see its students grouped by class. Filter by class (**All classes**, or one class) and search by name, email or roll number.
- **By class:** choose a class (**Choose a class**), then a course, to see that class's students of that course.

You see only students enrolled in **your** courses. If you have no courses: "You have no courses yet. Your admin assigns courses to you."

## Questions this answers

- Where are my classes? / Meri class kahan hai?
- Where can I see my students? / Mere students kaun hain?
- Why do I see only some students of the class? (You are the course teacher, not the class teacher)
- Why can't I add students to the class? (Only the class teacher can)
- Why don't I see another teacher's course in my class? (Each teacher sees only their own courses)
- How many students do I have?
