# tours/superadmin

- **onboardingTour.js** — `superAdminOnboardingTour` (id
  `superadmin-onboarding-v1`), a 14-step walkthrough covering: dashboard
  overview, creating an institute, confirming it was created, provisioning
  an institute administrator, saving/downloading their credentials, and
  reviewing subscription plans. Registers itself via `registerTour()` as a
  side effect of importing the module.
- All step targets are `[data-tour="..."]` selectors matching markers added
  to `SuperAdminLayout.jsx`, `SuperAdminDashboard.jsx`,
  `CreateUniversityForm.jsx`, `CreateUserForm.jsx`, and
  `SuperAdminSubscription.jsx`.
- Purely descriptive: it never submits forms, clicks buttons, or calls any
  API — it only highlights real UI and shows guidance text driven by the
  user's own "Next"/"Previous" clicks on the tour popover.

Not implemented yet: mounting this tour into `SuperAdminLayout`, route-based
auto-advance, or first-login trigger logic.
