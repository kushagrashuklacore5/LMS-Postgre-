# engine/core

Portal-agnostic core engine. Nothing here knows about Admin, Super Admin,
Student, or Mentor — it only operates on whatever generic `{ id, steps }`
tour object, selector, or route it's given.

## Public (re-exported from `engine/index.js`)

- **TourEngine.js** — owns tour lifecycle/state (`idle` / `active` /
  `paused` / `completed`), exposes `start` / `pause` / `resume` / `stop` /
  `complete` / `destroy`, prevents duplicate concurrent tours, and cleans up
  Driver.js on every transition.
- **TargetGuard.js** — waits for a tour-step target element. `waitFor()` is
  a one-shot bounded wait; `watch()` additionally re-runs that wait every
  time the route changes (via RouteGuard), always keeping at most one
  MutationObserver/timeout alive per instance. `stop()` cancels everything
  and is idempotent.
- **RouteGuard.js** — `getCurrentRoute()` reads the current
  pathname/search/hash; `subscribeToRoute(listener)` notifies on route
  changes using only native browser APIs (a pass-through wrap of
  `history.pushState`/`replaceState` plus `popstate`/`hashchange`, restored
  automatically once the last subscriber unsubscribes). No react-router
  dependency.

## Internal only (not exported from `engine/index.js`)

- **driverAdapter.js** — the only module allowed to import `driver.js`
  directly. Used solely by `TourEngine`.
- **StorageManager.js** — namespaced (`core5_guidebot:<tourId>`)
  localStorage access for tour progress metadata only (status + current
  step index). Never stores tokens, credentials, form values, or business
  data. Used solely by `TourEngine`.
- **DOMGuard.js** — `waitForElement(selector, options)`, the low-level
  bounded-wait primitive (immediate check, then MutationObserver + timeout,
  no polling). Used solely by `TargetGuard`; not exported directly so
  target-waiting always goes through `TargetGuard`'s cleanup guarantees.

Not implemented yet (future steps): wiring `TargetGuard`/`RouteGuard` into
`TourEngine` itself, actual tour content, business-action/auto-advance
detection, and any UI/presentation layer.
