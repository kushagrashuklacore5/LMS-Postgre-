// Admin "Dashboard + Users" walkthrough — deterministic, configuration-driven.
// One continuous GuideBot session. A and B are navigation-level introductions
// (they highlight the left-sidebar Dashboard / Users items, "what is this
// tab for?"); A1-A3 and B1-B3 explain the contents of those pages. Purely
// descriptive: the only thing GuideBot ever clicks is its own sidebar target
// on an autoNavigate step (the same existing link a user would click), so the
// page actually switches before that page's steps are highlighted. Separate
// from admin-onboarding-v1. All targets are stable `data-tour` markers.
//
// Interaction: the application is non-interactive while this tour is active
// (`disableActiveInteraction` below — Driver.js's own config). A future step
// that genuinely needs the user to act on its highlighted target opts in
// explicitly, for that step only:
//   driverStepConfig: { disableActiveInteraction: false }

import { registerTour } from '../registry';

export const adminOverviewTour = {
  id: 'admin-overview-v1',
  portal: 'admin',
  version: '1.2.0',
  description:
    'Guided walkthrough of the Admin Dashboard, the Users section, and the Database Export, Calendar (including creating an event), Add Student, and Add Teacher navigation items.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
    // Default: the highlighted UI cannot be clicked, focused or typed into,
    // and the page cannot be scrolled by the user. (Everything outside the
    // highlight is already inert while Driver.js is active.)
    disableActiveInteraction: true,
    allowScroll: false,
  },
  steps: [
    // ---- A: Dashboard (nav-level intro, then the page's own contents) ----
    {
      id: 'nav-dashboard',
      target: '[data-tour="nav-dashboard"]',
      title: 'Admin Dashboard',
      description:
        "Your control panel at a glance: a quick overview of your institution's students, mentors, courses, and certificates, plus quick actions and recent activity.",
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'announcement',
      target: '[data-tour="admin-announcement-btn"]',
      title: 'Announcements',
      description: 'Use this to create and view announcements for the relevant users in your institution.',
      placement: 'bottom',
      align: 'end',
    },
    {
      id: 'dashboard-statistics',
      target: '[data-tour="admin-overview-stats"]',
      title: 'Dashboard Statistics',
      description:
        "These cards give a quick summary of your institution's current students, mentors, courses, and certificates.",
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'recent-activity',
      target: '[data-tour="admin-recent-activity"]',
      title: 'Recent Activity',
      description: 'A quick view of recent user and course-related activity across your institution.',
      placement: 'top',
      align: 'start',
    },
    // ---- B: Users (continues the SAME journey, no restart) ----
    {
      id: 'nav-users',
      target: '[data-tour="nav-users"]',
      title: 'Users',
      description: 'The Users section is where you view and manage the user accounts within your institution.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'user-statistics',
      target: '[data-tour="user-list-stats"]',
      title: 'User Statistics',
      description: 'These counters give a quick overview of your different user categories: students, mentors, and admins.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'user-filters',
      target: '[data-tour="user-list-filters"]',
      title: 'Search & Role Filters',
      description: 'Use these controls to find a specific user by name or email, and to filter the list by role.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'user-table',
      target: '[data-tour="user-list-first-record"]',
      title: 'User Records',
      description:
        'Each user is listed as a row like this one, showing their name, email address, and role, along with the actions available to manage that account.',
      placement: 'bottom',
      align: 'start',
    },
    // ---- C: Database Export (opens the page, then highlights its nav item) ----
    {
      id: 'nav-database-export',
      target: '[data-tour="nav-database-export"]',
      title: 'Database Export',
      description:
        "Use this section to export your institution's data to Excel, so you can keep a copy or work with it outside the LMS.",
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    // ---- D: Fee Structure (opens the page, then highlights its nav item) ----
    {
      id: 'nav-fee-structure',
      target: '[data-tour="nav-fee-structure"]',
      title: 'Fee Structure',
      description:
        "Use this section to set up and manage your institution's fee structures for the primary and secondary levels.",
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    // ---- E: Calendar ----
    // The ONE exception to "opening a nav step opens its page first": the
    // Calendar page has no sidebar of its own, so this step must NOT navigate
    // while it is being shown — the Fee Structure page stays open, the nav
    // item is highlighted, and Calendar (the real nav link) only opens when
    // Next is pressed.
    {
      id: 'nav-calendar',
      target: '[data-tour="nav-calendar"]',
      title: 'Calendar',
      description:
        'The Calendar is where you schedule institution events and choose who they are shown to. Press Next to open it.',
      placement: 'right',
      align: 'center',
      clickOnNext: true,
    },
    {
      id: 'calendar-create-event',
      target: '[data-tour="calendar-create-event"]',
      title: 'Create Event',
      description:
        'This button creates a new calendar event. Press Next and GuideBot will open the Create Event form for you.',
      placement: 'right',
      align: 'start',
      clickOnNext: true,
    },
    // Interactive step: the user works with the real modal. No Next button;
    // it completes when the event is really created (existing app code
    // dispatches the success signal only after the create request succeeds)
    // or when the modal is dismissed with Cancel. A failed/invalid create
    // leaves the modal open, so the step stays.
    {
      id: 'calendar-event-modal',
      target: '[data-tour="calendar-create-event-modal"]',
      title: 'Create Calendar Event',
      description:
        'Enter an <b>Event Title</b> (the name shown on the calendar), an optional <b>Description</b>, and the <b>Start</b> and <b>End</b> date and time.<br><br><b>Display for</b> controls who sees the event: students, faculty, or both.<br><br><b>Create</b> saves the event and <b>Cancel</b> closes this form without creating one. The tour continues as soon as you do either.',
      placement: 'left',
      align: 'center',
      driverStepConfig: {
        disableActiveInteraction: false,
        popover: { showButtons: ['close'] },
      },
      action: {
        signal: 'guidebot:action-success',
        matches: (detail) => !!detail && detail.actionId === 'calendar-event-created',
        timeout: 30 * 60 * 1000,
      },
      completeOnTargetGone: true,
      historyBackOnComplete: true,
    },
    // ---- F/G: Add Student, Add Teacher (open the page, highlight the nav item) ----
    {
      id: 'nav-add-student',
      target: '[data-tour="nav-add-student"]',
      title: 'Add Student',
      description: 'Add Student is where you create a new student account and add them to your institution.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'nav-add-teacher',
      target: '[data-tour="nav-add-teacher"]',
      title: 'Add Teacher',
      description: 'Add Teacher is where you add a teacher’s details and manage their onboarding.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
  ],
};

registerTour(adminOverviewTour);
