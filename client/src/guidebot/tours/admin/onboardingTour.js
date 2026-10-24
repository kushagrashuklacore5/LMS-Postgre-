// Admin onboarding walkthrough — deterministic, configuration-driven.
//
// This describes the EXISTING Admin journey only (Dashboard -> Add Student
// -> Add Teacher -> verify in Users -> Classrooms), discovered from the
// real Admin-Dashboard.jsx, AddStudent.jsx, AddTeacher.jsx, UserList.jsx,
// and Classrooms.jsx components. It never creates/updates/deletes data,
// never submits forms, never calls any API, and never clicks anything on
// the page — Driver.js just highlights the real UI and shows guidance
// text; every "Next" is a user action on the tour popover, not on the app.
// All targets below reference the `data-tour="..."` markers added to the
// real Admin components in this same step.

import { registerTour } from '../registry';

export const adminOnboardingTour = {
  id: 'admin-onboarding-v1',
  portal: 'admin',
  version: '1.0.0',
  description:
    'Guided walkthrough of the Admin console: dashboard overview, adding a student, adding a teacher, verifying accounts, and creating a classroom.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
  },
  steps: [
    {
      id: 'welcome-overview',
      target: '[data-tour="admin-overview-stats"]',
      title: 'Welcome to the Admin Dashboard',
      description:
        'This is your control panel. Track total students, mentors, courses, and certificates right here.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'nav-add-student',
      target: '[data-tour="nav-add-student"]',
      title: 'Add a Student',
      description: 'Click here to open the student registration form.',
      placement: 'right',
      align: 'center',
      // Nav steps only advance on the user's real click of the highlighted
      // link, not via Next/Done — otherwise later steps silently stall
      // waiting for a page the user never actually navigated to.
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'student-form-name',
      target: '[data-tour="input-student-name"]',
      title: 'Student Details',
      description: "Enter the student's full name and email — the rest of the profile is optional.",
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'student-form-save',
      target: '[data-tour="btn-save-student"]',
      title: 'Save the Student',
      description:
        'Once the details are filled in, use this button to create the account. A login password is generated automatically.',
      placement: 'right',
      align: 'center',
    },
    {
      id: 'nav-add-teacher',
      target: '[data-tour="nav-add-teacher"]',
      title: 'Add a Teacher',
      description: 'Click here to open the teacher registration form.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'teacher-form-name',
      target: '[data-tour="input-teacher-name"]',
      title: 'Teacher Details',
      description: "Enter the teacher's full name and email — the rest of the profile is optional.",
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'teacher-form-save',
      target: '[data-tour="btn-save-teacher"]',
      title: 'Save the Teacher',
      description:
        'Once the details are filled in, use this button to create the account. A temporary password is generated automatically.',
      placement: 'right',
      align: 'center',
    },
    {
      id: 'nav-users',
      target: '[data-tour="nav-users"]',
      title: 'Verify Your Accounts',
      description: 'Open User Management to confirm the student and teacher you just added.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'user-list-stats',
      target: '[data-tour="user-list-stats"]',
      title: 'Accounts at a Glance',
      description: 'These counts update instantly as you add students, mentors, and admins.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'nav-classrooms',
      target: '[data-tour="nav-classrooms"]',
      title: 'Set Up a Classroom',
      description: 'Click here to open Classrooms, where you can group students under a teacher.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'create-classroom',
      target: '[data-tour="btn-create-classroom"]',
      title: "You're All Set",
      description: 'Use this button anytime to create a new classroom and assign students to it.',
      placement: 'bottom',
      align: 'center',
    },
  ],
};

registerTour(adminOnboardingTour);
