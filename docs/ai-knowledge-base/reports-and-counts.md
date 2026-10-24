---
id: reports-and-counts
title: Where to see numbers and reports (how many students, courses, fees)
intent: data-and-reports
portal: all
roles: [admin, teacher, student, accountant, superadmin]
navigation: "Depends on role: see the table"
related: [admin-manage-users, admin-classrooms, teacher-classrooms-and-students, accountant-fees-and-payments, superadmin-institutes-and-staff]
sources: [client/src/pages/admin/Admin-Dashboard.jsx, client/src/pages/admin/UserList.jsx, client/src/pages/admin/Classrooms.jsx, client/src/pages/admin/AdminCourses.jsx, client/src/pages/admin/Analytics.jsx, client/src/pages/mentor/MentorDashboard.jsx, client/src/pages/mentor/ClassroomDetail.jsx, client/src/pages/mentor/MyStudents.jsx, client/src/pages/mentor/AttendanceManagement.jsx, client/src/pages/student/Student-Dashboard.jsx, client/src/pages/accountant/FeesCollection_temp.jsx, client/src/pages/mentor/ClassFeeStatus.jsx, client/src/pages/superadmin/SuperAdminDashboard.jsx]
verified: true
last_verified: 2026-10-21
---

# Where to see numbers and reports

These numbers are live. They are shown on the screens below and change as data changes. This help text does not contain the numbers themselves, so open the screen to read the current value. A chat assistant must not guess a number.

## "How many students are there?"

| You are | Where to look | What the number means |
|---|---|---|
| **Admin** | **Dashboard** → card **Total Students** (click **View →** to open Users) | All students of your school |
| **Admin** | **Users** → card **Students** | All student accounts of your school |
| **Admin** | **Classrooms** → each class card shows **Students** | Students in that class |
| **Admin** | **Courses** → each course shows "N student(s)", and each class chip shows "5-A — N" | Students enrolled in that course (per class) |
| **Teacher** | **Dashboard** → **Total Students** | The enrolments of all your courses added together. A student in two of your courses is counted twice. For unique students, use **My Students**. |
| **Teacher** | **My Classrooms** → open a class → **Total Students** | Class teacher: the whole class. Course teacher only: the class's students enrolled in your courses. |
| **Teacher** | **My Students** | Students enrolled in the courses you teach, per class or per course |
| **Teacher** | **Attendance** → choose the class → **Total Students**, **Present Today**, **Absent Today** | That class on the chosen date |
| **Accountant** | **Fee Collection** → **Total Students** | Students counted for fees. **Fee Monitoring & Reminders** currently loads no data for accountants. |
| **Super Admin** | **Overview** → **Total Enrolled Students** | Students across all institutes |

Students cannot see how many students are in the school or in a class.

## Other numbers and reports

| Need | Where (role) |
|---|---|
| Total courses, certificates | Admin **Dashboard**: **Total Courses**, **Certificates** |
| Teachers count | Admin **Dashboard**: **Total Mentors**; **Users**: **Mentors** card |
| Recent sign-ups, pending teachers, published courses | Admin **Dashboard**: **Recent Activity** |
| Course completion, user breakdown, certificate statistics | Admin **Analytics Dashboard**, at the address `/admin/analytics` (not in the sidebar) |
| A course's students per class | Admin **Courses**, or teacher **My Students** |
| Live lecture attendance | Teacher **Your Lectures** (class page) → attendance link; admin: class page → **Lectures** tab |
| Test results | Teacher **AI Assessments** → open a test → **View Results Report** |
| One student's performance over time, AI performance report | Teacher **AI Assessments** → open a test → **View Results Report** → **View Analytics** on the student |
| Fees collected | Accountant **Fee Collection** (**Total Fees Collected**) |
| Dues per student | **Student Fee Status & Reminders** (**Pending Fee Dues**, **Total Dues Amount**). It currently loads only for teachers, at the address `/mentor/fee-monitoring`, which is not in the teacher sidebar. |
| Student's own progress, attendance %, results | Student **Dashboard**, **Attendance**, **Results**, **Courses** |
| Institutes and staff | Super Admin **Overview**, **Institutes**, **All Staff** |
| Whole-database Excel export | Super Admin only. The **Database Export** quick action on the admin Dashboard does not work for school admins. |

## Questions this answers

- How many students are there? / Kitne students hain? / Total students kitne hain?
- How many students are in class 5-A?
- How many students take this course?
- How many teachers do we have?
- Where can I see reports / analytics / statistics?
- How much fee has been collected?
