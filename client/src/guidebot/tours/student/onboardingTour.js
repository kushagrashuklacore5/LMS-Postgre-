// Student onboarding walkthrough — deterministic, configuration-driven.
//
// This describes the EXISTING Student journey only (Dashboard -> Courses ->
// Results -> Attendance), discovered from the real Student-Dashboard.jsx,
// Courses.jsx, StudentResults.jsx, and StudentAttendance.jsx components.
// It never creates/updates/deletes data, never submits forms, never calls
// any API, and never clicks anything on the page — Driver.js just
// highlights the real UI and shows guidance text; every "Next" is a user
// action on the tour popover, not on the app. All targets below reference
// the `data-tour="..."` markers added to the real Student components in
// this same step.

import { registerTour } from '../registry';

export const studentOnboardingTour = {
  id: 'student-onboarding-v1',
  portal: 'student',
  version: '1.0.0',
  description:
    'Guided walkthrough of the Student portal: dashboard overview, enrolled courses, exam results, and attendance tracking.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
  },
  steps: [
    {
      id: 'welcome-dashboard',
      target: '[data-tour="stats-grid"]',
      title: 'Welcome to Your Dashboard',
      description:
        'Track your total courses, average progress, and attendance percentage right here.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'enrolled-courses',
      target: '[data-tour="enrolled-courses"]',
      title: 'Your Enrolled Courses',
      description: 'These are the courses you can access. Click any course to continue learning.',
      placement: 'top',
      align: 'start',
    },
    {
      id: 'nav-courses',
      target: '[data-tour="nav-courses"]',
      title: 'Browse All Courses',
      description: 'Click here anytime to see your full course list and progress.',
      placement: 'right',
      align: 'center',
      // Nav steps only advance on the user's real click of the highlighted
      // link, not via Next/Done — otherwise later steps silently stall
      // waiting for a page the user never actually navigated to.
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'courses-overview',
      target: '[data-tour="courses-overview"]',
      title: 'Course Overview',
      description: 'This shows how many courses you have total, completed, and in progress.',
      placement: 'left',
      align: 'start',
    },
    {
      id: 'nav-results',
      target: '[data-tour="nav-results"]',
      title: 'Check Your Results',
      description: 'Click here to view your exam results and report cards.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'results-page',
      target: '[data-tour="results-page"]',
      title: 'Results & Report Cards',
      description: 'Your results appear here as soon as your teachers publish them.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'nav-attendance',
      target: '[data-tour="nav-attendance"]',
      title: 'Track Attendance',
      description: 'Click here to open your attendance records.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'attendance-summary',
      target: '[data-tour="attendance-summary"]',
      title: "You're All Set",
      description:
        'These cards show your total classes, present/absent count, and attendance percentage.',
      placement: 'bottom',
      align: 'start',
    },
  ],
};

registerTour(studentOnboardingTour);
