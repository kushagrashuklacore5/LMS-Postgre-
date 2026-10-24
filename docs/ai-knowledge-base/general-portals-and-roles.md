---
id: general-portals-and-roles
title: Portals and roles in Core5 Academy
intent: feature-explanation
portal: all
roles: [admin, teacher, student, accountant, storekeeper, vendor, superadmin]
navigation: "Login page → your portal opens automatically for your role"
related: [general-login-and-password, reports-and-counts, unsupported-and-unknown]
sources: [client/src/App.jsx, client/src/components/AdminLayout.jsx, client/src/components/MentorLayout.jsx, client/src/components/StudentLayout.jsx, client/src/components/AccountantLayout.jsx, client/src/components/SuperAdminLayout.jsx, client/src/components/VendorLayout.jsx]
verified: true
last_verified: 2026-10-21
---

# Portals and roles in Core5 Academy

Every person signs in on the same login page. The LMS then opens the portal for that person's role. You cannot switch to another role's portal yourself. If you need different access, ask your school admin.

## Which portal does what

| Role | Portal | Main menu (left sidebar) |
|---|---|---|
| **Admin** (runs one school) | Admin Portal | Dashboard, Users, Courses, Fee Structure, Calendar, Add Student, Add Teacher, Classrooms, Import Students |
| **Teacher** (shown as "Mentor") | Mentor portal | Dashboard, My Classrooms, My Students, Attendance, Class Results, Requirements, AI Assessments, Calendar |
| **Student** | Student Portal | Dashboard, Courses, My Tests, Assignments, Results, Your Lectures, Attendance, Calendar, Fees & Payments |
| **Accountant** | Accountant Portal | Dashboard, Fee Monitoring & Reminders, Vendor Invoices, Fee Collection, Expenses, Reports & Analysis |
| **Super Admin** (runs the whole platform, all institutes) | Super Admin portal | Overview, Institutes, Demo Leads, Add Institute, Add Staff, All Staff, Subscription |
| **Storekeeper** | Storekeeper dashboard | Inventory and requisition screens |
| **Vendor** (outside supplier) | Vendor Portal | Dashboard, Invoices, Orders, Stock, Payments |

Every portal also has **Collapse** (shrink the sidebar) and **Logout** at the bottom of the sidebar. The bell icon at the top right shows your notifications.

## Teachers: class teacher and course teacher

A teacher can be linked to a class in two ways:

- **Class teacher.** The teacher responsible for a whole class, chosen by the admin when the class is created.
  - Sees every student of the class.
  - Can add students to the class.
- **Course teacher.** The teacher of a course, chosen by the admin when the course is created.
  - Sees and manages only that course.
  - Sees only the students enrolled in that course.

One teacher can be both. Being the class teacher does not give access to another teacher's course.

## Students: class and course are different

- **Class:** a student belongs to a class, for example 5-A.
- **Course:** a student gets a course only when they are **enrolled** in it. The admin can enrol a whole class or only selected students.
- **Result:** two students of the same class can therefore have different courses.

## Questions this answers

- Which portal should I use? / Mera portal kaunsa hai?
- What can an admin / teacher / student do in the LMS? (See the table: each role's portal and menu)
- What is the difference between a class teacher and a course teacher?
- Why don't I see the same menu as my colleague?
- Can a teacher open the admin portal? (No, each role sees only its own portal.)
