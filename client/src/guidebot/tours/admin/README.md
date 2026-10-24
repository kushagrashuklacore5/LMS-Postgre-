# tours/admin

- **onboardingTour.js** — `adminOnboardingTour` (id `admin-onboarding-v1`),
  an 11-step walkthrough covering: dashboard overview, adding a student,
  adding a teacher, verifying both accounts in User Management, and
  creating a classroom. Registers itself via `registerTour()` as a side
  effect of importing the module.
- All step targets are `[data-tour="..."]` selectors matching markers added
  to `AdminLayout.jsx`, `Admin-Dashboard.jsx`, `AddStudent.jsx`,
  `AddTeacher.jsx`, `UserList.jsx`, and `Classrooms.jsx`.
- Purely descriptive: it never submits forms, clicks buttons, or calls any
  API — it only highlights real UI and shows guidance text driven by the
  user's own "Next"/"Previous" clicks on the tour popover.

Not implemented yet: mounting this tour into `AdminLayout`, route-based
auto-advance, or first-login trigger logic.
