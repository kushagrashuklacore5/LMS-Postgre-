# tours

Generic tour configuration layer, separate from `engine/` per the GuideBot
architecture (Core Engine | Tour Config as siblings). Nothing here imports
`driver.js` directly or contains Admin/SuperAdmin-specific behavior.

- **schema.js** — `validateTour(rawTour)` / `normalizeTour(rawTour)` /
  `TourValidationError`. Defines the generic, author-facing tour shape
  (`id`, `steps[].target`, presentation fields) and normalizes it into
  exactly what `TourEngine.start()` expects. A `target` CSS selector is
  normalized into Driver.js's `element` field so tour authors never need to
  know Driver.js's own field names.
- **registry.js** — `registerTour()` / `getTour()` / `listTours()` /
  `hasTour()` / `unregisterTour()` / `clearRegistry()`. A single in-memory
  registry shared by every portal; `listTours({ portal })` filters on the
  free-form `portal` metadata field, it doesn't hardcode any portal name.
- **superadmin/onboardingTour.js**, **admin/onboardingTour.js**,
  **student/onboardingTour.js**, **mentor/onboardingTour.js** — real,
  registered onboarding tours for all four portals. Each calls
  `registerTour(...)` with a config matching `schema.js`'s shape.

Not implemented yet (future steps): `data-tour` mounting into any layout or
provider, route-based auto-advance, first-login trigger logic.
