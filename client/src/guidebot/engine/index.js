// GuideBot Core Engine — public integration boundary.
//
// Only the exports below are intended for use outside guidebot/engine.
// Tour definitions (guidebot/tours/*) and application code must never
// import 'driver.js' or reach into engine/core internals directly.

export { default as TourEngine, TOUR_STATES } from './core/TourEngine';
export { default as TargetGuard } from './core/TargetGuard';
export { default as ActionGuard } from './core/ActionGuard';
export { getCurrentRoute, subscribeToRoute } from './core/RouteGuard';
