---
id: general-login-and-password
title: Signing in, signing out and resetting a password
intent: task-procedure
portal: all
roles: [admin, teacher, student, accountant, storekeeper, vendor]
navigation: "Login page (Log In to Your Account) → SIGN IN; Forgot password? link on the same form"
related: [general-portals-and-roles, troubleshooting-common-problems]
sources: [client/src/pages/Home.jsx, client/src/pages/Login.jsx, client/src/pages/StudentSetupPassword.jsx, server/controllers/auth-controller.js, server/services/otpService.js]
verified: true
last_verified: 2026-10-21
---

# Signing in, signing out and resetting a password

## Sign in

1. Open the LMS login page. The form is titled **Log In to Your Account**.
2. Enter your email in **Email or Username** and your **Password**.
3. Click **SIGN IN**.
4. You land on your own portal's Dashboard.

Messages you may see:

| Message | Meaning | What to do |
|---|---|---|
| "Invalid email or password" | The email or password is wrong. The LMS does not say which one. | Check both; use **Forgot password?** if needed |
| "Your account is waiting for approval by an administrator." | The account exists but is not approved yet | Ask your school admin to approve it |
| "Too many login attempts. Please try again later." | Several tries in a short time | Wait a few minutes, then try again |

## First password for new accounts

There are three ways an account gets its first password:

- **Created on Add Student or Add Teacher.** The LMS creates a temporary password and shows it **once**, to the admin, in a green message with a **Copy password** button. The admin gives it to the person.
- **Imported students** may get an email with a link. The link opens **Set your password**: enter a **New password** of at least 8 characters, then **Confirm password**.
- **Each new institute's admin password** is shown once to the Super Admin, under **Generated Admin Password (Save this now)**, with **Copy Password**.

## Forgot password

**Current limitation:** the **Forgot password?** link on the login form only reloads the login page. The current screens do not let you reset your own password.

What to do instead:

- **Staff accounts** (admin, accountant, storekeeper): the **Super Admin** can set a new password. They go to **All Staff**, open the person with **Edit User**, type the new password in **Reset Password (optional)**, and save.
- **Students and teachers:** ask your school admin. The admin screens do not have a password-reset button, so the admin escalates to the Super Admin or the LMS support team.

The LMS server does support resetting a password with a 6-digit emailed code (10 minutes, 5 attempts), but that screen is not linked in the current version. Do not tell users to look for it.

## Sign out

Click **Logout** at the bottom of the sidebar. Signing out ends your session on **all** devices, not only the current one.

## Questions this answers

- How do I log in? / Login kaise karun?
- I forgot my password / password bhool gaya
- The reset code is not working
- Where do I get my first password?
- Why am I logged out on my phone after logging out on my laptop?
- My account says waiting for approval
