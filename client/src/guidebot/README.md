# GuideBot

Deterministic, config-driven product walkthrough module. **No AI, no LLM, no
agents, no RAG, no embeddings, no vector database, no external AI API of any
kind is used anywhere in this module.** Tour content, steps, and targets are
static data structures written by developers.

## Isolation contract

Everything belonging to GuideBot lives under this one folder. It should be
removable by deleting `client/src/guidebot/` (plus the later `data-guide`
attribute additions and the single provider mount point) with no impact on
the rest of the application.

- `engine/` — portal-agnostic core. Must never contain Admin- or Super
  Admin-specific logic. Only `engine/core/driverAdapter.js` talks to the
  `driver.js` library directly; everything else, including tours, goes
  through the public surface in `engine/index.js`.
- `tours/superadmin/`, `tours/admin/`, `tours/student/`, `tours/mentor/` —
  per-portal tour definitions. All four now have a registered
  `onboardingTour.js`.

## Status: Student + Mentor tour content + data-tour markers added

What exists right now:

- Folder structure (Step 1) + `driver.js` dependency.
- `engine/core/TourEngine.js` — lifecycle/state machine (`idle` / `active` /
  `paused` / `completed`), duplicate-tour prevention, Driver.js cleanup on
  every transition.
- `engine/core/RouteGuard.js` — `getCurrentRoute()` / `subscribeToRoute()`,
  native-browser-API route observation (no react-router dependency).
- `engine/core/TargetGuard.js` — `waitFor()` / `watch()`, bounded element
  waiting that can re-check itself across route changes with no leaked
  observers/timers.
- `engine/core/DOMGuard.js` — `waitForElement()`, the low-level bounded
  MutationObserver + timeout primitive underneath TargetGuard (no polling).
- `engine/core/StorageManager.js` — namespaced localStorage persistence for
  tour progress metadata only.
- `engine/core/driverAdapter.js` — the sole module that imports `driver.js`.
- `engine/index.js` — public boundary, exports `TourEngine`, `TOUR_STATES`,
  `TargetGuard`, `getCurrentRoute`, `subscribeToRoute` only. (`waitForElement`
  and `StorageManager` are internal now, used only by `TargetGuard` /
  `TourEngine` respectively.)
- `tours/schema.js` — generic tour/step shape + `validateTour()` /
  `normalizeTour()` / `TourValidationError`. Normalizes a `target` selector
  into Driver.js's `element` field, so tour authors never import `driver.js`.
- `tours/registry.js` — `registerTour()` / `getTour()` / `listTours()` /
  `hasTour()` / `unregisterTour()` / `clearRegistry()`, a single portal-
  agnostic in-memory registry with duplicate-id protection.
- `tours/superadmin/onboardingTour.js` — the real 14-step Super Admin
  onboarding tour (`superadmin-onboarding-v1`), registered via
  `registerTour()`. Purely descriptive — no API calls, clicks, or form
  submissions. See `tours/superadmin/README.md`.
- `data-tour="..."` markers added to `SuperAdminLayout.jsx`,
  `SuperAdminDashboard.jsx`, `CreateUniversityForm.jsx`,
  `CreateUserForm.jsx`, and `SuperAdminSubscription.jsx` — the 14 stable
  selectors the Super Admin tour targets.
- `tours/admin/onboardingTour.js` — the real 11-step Admin onboarding tour
  (`admin-onboarding-v1`), registered via `registerTour()`. Purely
  descriptive — no API calls, clicks, or form submissions. See
  `tours/admin/README.md`.
- `data-tour="..."` markers added to `AdminLayout.jsx`,
  `Admin-Dashboard.jsx`, `AddStudent.jsx`, `AddTeacher.jsx`,
  `UserList.jsx`, and `Classrooms.jsx` — the 11 stable selectors the Admin
  tour targets.
- `tours/student/onboardingTour.js` — the real 8-step Student onboarding
  tour (`student-onboarding-v1`), registered via `registerTour()`. See
  `tours/student/README.md`.
- `data-tour="..."` markers added to `StudentLayout.jsx`,
  `Student-Dashboard.jsx`, `Courses.jsx`, `StudentResults.jsx`, and
  `StudentAttendance.jsx` — the 8 stable selectors the Student tour targets.
- `tours/mentor/onboardingTour.js` — the real 10-step Mentor onboarding
  tour (`mentor-onboarding-v1`), registered via `registerTour()`. See
  `tours/mentor/README.md`.
- `data-tour="..."` markers added to `MentorLayout.jsx`,
  `MentorDashboard.jsx`, `MentorClassrooms.jsx`,
  `AttendanceManagement.jsx`, `ClassResults.jsx`, and `Requirements.jsx`
  (mentor page) — the 10 stable selectors the Mentor tour targets.

All four portal tours are purely descriptive — no API calls, clicks, or
form submissions anywhere in any of them.

See `engine/core/README.md` and `tours/README.md` for details on each module.

What does **not** exist yet (future steps):

- Wiring RouteGuard/TargetGuard into TourEngine itself (auto-advance)
- Mounting any tour into its layout (nothing imports any `onboardingTour.js`
  yet, so none are registered at app runtime)
- Any business-action detection or first-login onboarding logic

Nothing outside `client/src/guidebot/` was modified to build this, other
than the `driver.js` dependency added in Step 1
(`client/package.json` / `package-lock.json`).
