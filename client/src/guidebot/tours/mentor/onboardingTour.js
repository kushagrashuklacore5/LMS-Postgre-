// Mentor onboarding walkthrough — deterministic, configuration-driven.
//
// This describes the EXISTING Mentor journey only (Dashboard -> Classrooms
// -> Attendance -> Results -> Requirements), discovered from the real
// MentorDashboard.jsx, MentorClassrooms.jsx, AttendanceManagement.jsx,
// ClassResults.jsx, and Requirements.jsx components. It never creates,
// updates, or deletes data, never submits forms, never calls any API, and
// never clicks anything on the page — Driver.js just highlights the real
// UI and shows guidance text; every "Next" is a user action on the tour
// popover, not on the app. All targets below reference the
// `data-tour="..."` markers added to the real Mentor components in this
// same step.

import { registerTour } from '../registry';

export const mentorOnboardingTour = {
  id: 'mentor-onboarding-v1',
  portal: 'mentor',
  version: '1.0.0',
  description:
    'Guided walkthrough of the Mentor portal: dashboard overview, courses, classrooms, attendance, results, and requirements.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
  },
  steps: [
    {
      id: 'welcome-dashboard',
      target: '[data-tour="mentor-stats"]',
      title: 'Welcome to Your Dashboard',
      description:
        'Track your total courses, total students, and active courses right here.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'your-courses',
      target: '[data-tour="mentor-courses"]',
      title: 'Your Courses',
      description:
        'Manage your assigned courses — add chapters, assign students, and create assessments from here.',
      placement: 'top',
      align: 'start',
    },
    {
      id: 'nav-classrooms',
      target: '[data-tour="nav-my-classroom"]',
      title: 'View Your Classrooms',
      description: 'Click here to see every classroom assigned to you.',
      placement: 'right',
      align: 'center',
      // Nav steps only advance on the user's real click of the highlighted
      // link, not via Next/Done — otherwise later steps silently stall
      // waiting for a page the user never actually navigated to.
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'classrooms-header',
      target: '[data-tour="classrooms-header"]',
      title: 'Classroom Rosters',
      description: 'Each classroom here lists its students so you can manage them.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'nav-attendance',
      target: '[data-tour="nav-attendance"]',
      title: 'Mark Attendance',
      description: 'Click here to open attendance management for your classrooms.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'attendance-controls',
      target: '[data-tour="attendance-controls"]',
      title: 'Record Attendance',
      description: 'Pick a date and classroom, then mark each student present or absent.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'nav-results',
      target: '[data-tour="nav-results"]',
      title: 'Manage Results',
      description: 'Click here to add or update student results.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'results-controls',
      target: '[data-tour="results-controls"]',
      title: 'Add Student Results',
      description: 'Choose a classroom, then add results for its students.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'nav-requirements',
      target: '[data-tour="nav-requirements"]',
      title: 'Track Requirements',
      description: 'Click here to open classroom resource requirements.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'requirements-page',
      target: '[data-tour="requirements-page"]',
      title: "You're All Set",
      description: 'Track and manage classroom resource requirements here.',
      placement: 'bottom',
      align: 'center',
    },
  ],
};

registerTour(mentorOnboardingTour);
