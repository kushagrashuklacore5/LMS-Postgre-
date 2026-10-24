# tours/student

- **onboardingTour.js** — `studentOnboardingTour` (id
  `student-onboarding-v1`), an 8-step walkthrough covering: dashboard
  overview, enrolled courses, course browsing, exam results, and
  attendance. Registers itself via `registerTour()` as a side effect of
  importing the module.
- All step targets are `[data-tour="..."]` selectors matching markers added
  to `StudentLayout.jsx`, `Student-Dashboard.jsx`, `Courses.jsx`,
  `StudentResults.jsx`, and `StudentAttendance.jsx`.
- Purely descriptive: it never submits forms, clicks buttons, or calls any
  API — it only highlights real UI and shows guidance text driven by the
  user's own "Next"/"Previous" clicks on the tour popover.

Not implemented yet: mounting this tour into `StudentLayout`, route-based
auto-advance, or first-login trigger logic.
