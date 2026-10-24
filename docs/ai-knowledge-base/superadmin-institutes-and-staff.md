---
id: superadmin-institutes-and-staff
title: Institutes, staff and demo leads (Super Admin)
intent: task-procedure
portal: superadmin
roles: [superadmin]
navigation: "Super Admin sidebar → Overview / Institutes / Demo Leads / Add Institute / Add Staff / All Staff / Subscription"
related: [general-portals-and-roles, general-login-and-password]
sources: [client/src/components/SuperAdminLayout.jsx, client/src/pages/superadmin/SuperAdminDashboard.jsx, client/src/pages/superadmin/CreateUniversityForm.jsx, client/src/pages/superadmin/CreateUserForm.jsx]
verified: true
last_verified: 2026-10-21
---

# Super Admin: institutes and staff

The Super Admin runs the whole platform: every institute (school) and its staff. School admins cannot do these things.

## Add an institute and its admin

1. Click **Add Institute**. The form is **Create New Institute**.
2. Enter:
   - the **Institute Name**;
   - the **Address**, **City** and **Country**;
   - the **Official Email (Admin Account)**;
   - the **Phone Number** (10 digits).
3. Click **Create Institute**.
4. You will see "Institute & Admin Created Successfully!", with the **Admin Login Email** and the **Generated Admin Password (Save this now)**. Click **Copy Password** and give it to the new admin. Then click **Continue to Dashboard**.

## Add staff to an institute

1. Click **Add Staff**. The form is **Create New Staff Member**: "Assign admin, accountant or storekeeper roles".
2. Enter the **Full Name** and **Email Address**, choose the **User Role**, and choose the **Institute / University**.
3. Click **Create Staff Member**. The new login details are shown once ("Team Member Created Successfully!").

## Manage staff

**All Staff** (**Empire Staff Directory**) lists the staff.

- Search them with "Search staff by name, email, role, university...".
- **Edit User** changes a person's name, email, role or institute.
- To set a new password, type it in **Reset Password (optional)**; leave it empty to keep the current one.

## Other screens

| Screen | What it shows |
|---|---|
| **Overview** | **Institutes & Universities**, **Total Enrolled Students**, **Active Online Users**, **Recent Activity** |
| **Institutes** | All institutes, with **View Details** and **Delete** |
| **Demo Leads** | **Institutional Demo Inquiries** from the website's "Book a Demo" form. Statuses: Pending, Contacted, Scheduled, Completed, Rejected. **Refresh Leads** reloads them. |
| **Subscription** | The platform plan. When it expires, a "Subscription Expired!" message asks you to **Upgrade Now**. |

## Questions this answers

- How do I add a new school / institute?
- How do I create a school admin?
- How do I reset a staff member's password?
- Where are the demo requests?
- How many institutes / students are on the platform?
