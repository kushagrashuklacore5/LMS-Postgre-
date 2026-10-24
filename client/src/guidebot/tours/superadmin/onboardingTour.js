// Super Admin onboarding walkthrough — deterministic, configuration-driven.
//
// This describes the EXISTING Super Admin journey only. It never creates
// institutes, users, or subscriptions, never submits forms, and never
// clicks anything on the page — Driver.js just highlights the real UI and
// shows guidance text; every "Next" is a user action on the tour popover,
// not on the app. All targets below reference the `data-tour="..."`
// markers added to the real Super Admin components in this same step.
//
// Journey covered: Dashboard -> onboarding -> Create Institute ->
// Institute Created -> Create Institute Administrator -> credentials/PDF ->
// Subscription/Quota -> Complete.

import { registerTour } from '../registry';

export const superAdminOnboardingTour = {
  id: 'superadmin-onboarding-v1',
  portal: 'superadmin',
  version: '1.0.0',
  description:
    'Guided walkthrough of the Super Admin console: dashboard overview, institute creation, staff provisioning, credentials, and subscription management.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
  },
  steps: [
    {
      id: 'welcome-overview',
      target: '[data-tour="header-subscription-timer"]',
      title: 'Welcome to Super Admin',
      description:
        'This console is your central command center. Your active subscription plan and countdown timer are always shown here.',
      placement: 'bottom',
      align: 'end',
    },
    {
      id: 'kpi-overview',
      target: '[data-tour="overview-stats"]',
      title: 'Your Empire at a Glance',
      description:
        'Track total institutes, active students, and live users right from the Overview tab.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'nav-add-institute',
      target: '[data-tour="nav-add-institute"]',
      title: 'Add Your First Institute',
      description:
        'Click here to open the institute registration form and add a new campus.',
      placement: 'right',
      align: 'center',
      // Nav steps only advance when the user actually clicks the
      // highlighted link (real navigation), not via a Next/Done button —
      // otherwise the walkthrough silently gets stuck on the next step,
      // which lives on a page the user never actually visited.
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'institute-form-name',
      target: '[data-tour="input-institute-name"]',
      title: 'Institute Details',
      description:
        "Enter the institute's name and contact details. Everything except the name is optional.",
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'institute-form-submit',
      target: '[data-tour="btn-submit-institute"]',
      title: 'Create the Institute',
      description: 'Once the form is filled in, use this button to register the institute.',
      placement: 'top',
      align: 'center',
    },
    {
      id: 'institute-created',
      target: '[data-tour="nav-institutes"]',
      title: 'Institute Created',
      description:
        'Your newly created institute now appears here, in the Institutes directory.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'nav-add-staff',
      target: '[data-tour="nav-add-staff"]',
      title: 'Add an Institute Administrator',
      description:
        'Click here to open the staff form and create an Administrator for your new institute.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'staff-form-role',
      target: '[data-tour="select-staff-role"]',
      title: 'Choose a Role',
      description: 'Select "Admin" to give this person full control of their institute.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'staff-form-university',
      target: '[data-tour="select-staff-university"]',
      title: 'Assign the Institute',
      description: 'Pick the institute you just created so this administrator is linked to it.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'staff-form-submit',
      target: '[data-tour="btn-submit-staff"]',
      title: 'Create the Staff Member',
      description:
        'Click here to create the account. A one-time password is generated automatically.',
      placement: 'top',
      align: 'center',
    },
    {
      id: 'credentials-banner',
      target: '[data-tour="credentials-banner"]',
      title: 'Save These Credentials',
      description:
        "This is the one-time password for your new administrator. It won't be shown again, so save it now.",
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'credentials-download',
      target: '[data-tour="btn-download-credentials-pdf"]',
      title: 'Download as PDF',
      description: 'Click here to save these credentials as a PDF for safekeeping.',
      placement: 'left',
      align: 'center',
    },
    {
      id: 'nav-subscription',
      target: '[data-tour="nav-subscription"]',
      title: 'Manage Your Subscription',
      description:
        'Visit this page anytime to review your plan, usage limits, and upgrade options.',
      placement: 'right',
      align: 'center',
      driverStepConfig: { advanceOnClick: true, popover: { showButtons: ['close'] } },
    },
    {
      id: 'subscription-plans',
      target: '[data-tour="subscription-plans"]',
      title: "You're All Set",
      description:
        'Compare plans and upgrade whenever your institution needs more room to grow.',
      placement: 'bottom',
      align: 'center',
    },
  ],
};

registerTour(superAdminOnboardingTour);
