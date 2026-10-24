// Super Admin "Overview + Institutes + Add Institute + Add Staff + All
// Staff + Subscription" walkthrough — deterministic, configuration-driven.
// One continuous GuideBot session (A1-A4, B1-B3, C1, D1-D4, E1-E2, F1); the
// runtime is never stopped/restarted between sections. Separate from the
// full superadmin-onboarding-v1 journey. Purely descriptive: never submits
// forms, never clicks a business/action button (Create, Delete, Submit,
// Search, ...), and never calls any API. Nav-type steps (autoNavigate:
// true) are the one deliberate exception: the runtime clicks THEIR OWN
// sidebar link for real — using the app's existing navigation, not a
// second routing system — so the page actually switches before the step
// is highlighted, instead of leaving the old page open behind a highlight
// that points at an inactive tab.

import { registerTour } from '../registry';

export const superAdminOverviewTour = {
  id: 'superadmin-overview-v1',
  portal: 'superadmin',
  version: '4.0.0',
  description:
    'Guided walkthrough of the Super Admin Overview, Institutes, Add Institute, Add Staff, All Staff, and Subscription sections.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
  },
  steps: [
    {
      id: 'nav-overview',
      target: '[data-tour="nav-overview"]',
      title: 'Overview',
      description:
        'This is your Super Admin dashboard. It brings together system statistics, recent activity, and quick actions in one place.',
      placement: 'right',
      align: 'center',
      // GuideBot clicks this nav link itself (real navigation) before
      // presenting, so it works correctly regardless of which tab the
      // user is on when the tour starts.
      autoNavigate: true,
    },
    {
      id: 'overview-statistics',
      target: '[data-tour="overview-stats"]',
      title: 'System Snapshot',
      description:
        'These cards give you a quick snapshot of your system: total universities, active students, and active users.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'recent-activity',
      target: '[data-tour="recent-activity"]',
      title: 'Recent Activity',
      description:
        'This section shows the latest activity across your institutes and system, so you can stay up to date at a glance.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'quick-actions',
      target: '[data-tour="quick-actions"]',
      title: 'Quick Actions',
      description:
        'Shortcuts to the things you do most: add an institute, add staff, or jump straight to your institutes or staff directory.',
      placement: 'left',
      align: 'start',
    },
    // ---- B: Institutes (continues the SAME journey, no restart) ----
    {
      id: 'nav-institutes',
      target: '[data-tour="nav-institutes"]',
      title: 'Institutes',
      description:
        'This tab lists every university or institute you’ve added, along with the information and management options available for each.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'university-record',
      target: '[data-tour="university-card"]',
      title: 'Institute Record',
      description:
        'Each card shows an institute’s name, location, and admin contact. Click a card to view more details, or use Delete to remove it.',
      placement: 'bottom',
      align: 'start',
      // Skipped entirely (and excluded from the progress total) when no
      // institute has been created yet. The card markup itself only
      // exists after navigating to this tab, so a different, always-
      // rendered signal (the raw institute count on SuperAdminDashboard's
      // outer wrapper) is used to decide this up front instead.
      optional: true,
      existsHint: {
        target: '[data-tour-universities-count]',
        predicate: (el) => {
          const count = parseInt(el.getAttribute('data-tour-universities-count'), 10);
          return Number.isFinite(count) && count > 0;
        },
      },
    },
    {
      id: 'search-universities',
      target: '[data-tour="search-universities"]',
      title: 'Search Universities',
      description: 'Use this field to quickly find a specific university or institute by name.',
      placement: 'bottom',
      align: 'start',
    },
    // ---- C: Add Institute (continues the SAME journey, no restart) ----
    {
      id: 'nav-add-institute',
      target: '[data-tour="nav-add-institute"]',
      title: 'Add Institute',
      description:
        'Use this section to create a new university or institute by entering its required information.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    // ---- D: Add Staff (continues the SAME journey, no restart) ----
    {
      id: 'nav-add-staff',
      target: '[data-tour="nav-add-staff"]',
      title: 'Add Staff',
      description:
        'Use this section to create a new staff member and assign them to the appropriate role and university.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'staff-user-info',
      target: '[data-tour="staff-user-info"]',
      title: 'User Information',
      description: "Enter the staff member's basic details here — their full name and email address.",
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'staff-role-assignment',
      target: '[data-tour="staff-role-assignment"]',
      title: 'Role & Assignment',
      description: "Choose the staff member's role and the university or institute they'll be assigned to.",
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'staff-create-button',
      target: '[data-tour="btn-submit-staff"]',
      title: 'Create Staff Member',
      description:
        'Once the details, role, and university are filled in, use this button to create the staff member.',
      placement: 'top',
      align: 'center',
    },
    // ---- E: All Staff (continues the SAME journey, no restart) ----
    {
      id: 'nav-all-staff',
      target: '[data-tour="nav-all-staff"]',
      title: 'All Staff',
      description:
        'This section shows every staff member in the LMS, along with their role, university, status, and the actions available for each.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'search-staff',
      target: '[data-tour="search-staff"]',
      title: 'Search Staff',
      description: 'Use this field to quickly find a staff member from the listed staff records.',
      placement: 'bottom',
      align: 'start',
    },
    // ---- F: Subscription (continues the SAME journey, no restart) ----
    {
      id: 'nav-subscription',
      target: '[data-tour="nav-subscription"]',
      title: 'Subscription',
      description:
        "View the available subscription plans here, and understand the limits and features included with each.",
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
  ],
};

registerTour(superAdminOverviewTour);
