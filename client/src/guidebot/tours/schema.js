// Generic, portal-agnostic tour configuration shape + validation/
// normalization. Produces exactly the { id, steps, driverConfig } shape
// TourEngine.start() expects (see engine/core/TourEngine.js) — Driver.js
// itself is never imported here; the `target` field is normalized into
// Driver.js's `element` field, keeping tour authors decoupled from the
// vendor library (only engine/core/driverAdapter.js imports 'driver.js').
//
// Author-facing raw tour shape:
//   {
//     id: string,                 // required, unique
//     steps: [{
//       id?: string,               // stable step id (auto-generated if omitted)
//       target: string,             // CSS selector — required
//       title?: string,              // -> popover.title
//       description?: string,        // -> popover.description
//       placement?: 'top'|'right'|'bottom'|'left',  // -> popover.side
//       align?: 'start'|'center'|'end',              // -> popover.align
//       driverStepConfig?: object    // escape hatch: any other Driver.js
//                                     // DriveStep field (advanceOnClick,
//                                     // skipMissingElement, popover.*, ...)
//       action?: {                    // optional — GuideBot-runtime-only,
//                                     // Driver.js never sees this. When
//                                     // present, the step only advances on
//                                     // this signal, never on Next/Done.
//         signal: string,              // required — a window CustomEvent name
//         timeout?: number,            // optional, finite positive number
//         matches?: (detail) => boolean, // optional filter predicate
//       },
//       optional?: boolean,           // GuideBot-runtime-only. When true, the
//                                     // runtime may skip this step entirely
//                                     // (it isn't shown and doesn't count
//                                     // toward the progress total) if
//                                     // existsHint says it won't apply.
//       existsHint?: {                 // GuideBot-runtime-only, used only when
//                                     // optional is true. Lets the runtime
//                                     // decide, as early as possible, whether
//                                     // this step will apply — useful when the
//                                     // step's own target only exists after
//                                     // navigating somewhere, but a different,
//                                     // always-rendered element already
//                                     // signals whether it eventually will.
//         target: string,              // a stable, always-rendered selector
//         predicate?: (el) => boolean, // defaults to "element exists"
//       },
//       autoNavigate?: boolean,       // GuideBot-runtime-only. When true, once
//                                     // this step's own target is found, the
//                                     // runtime clicks it for real (via the
//                                     // app's own existing navigation, e.g. a
//                                     // sidebar <Link>) before presenting the
//                                     // popover — for genuine navigation
//                                     // targets only, never business/action
//                                     // buttons.
//       skipIfMissing?: boolean | {   // GuideBot-runtime-only. For steps whose
//                                     // target depends on real data (an enrolled
//                                     // course, a result...): when the target is
//                                     // genuinely absent the step is dropped
//                                     // (and removed from the progress total)
//                                     // instead of stalling the tour.
//         route?: string,              // skip unless location.pathname starts
//                                     // with this (e.g. a detail page that was
//                                     // never navigated to)
//         ready?: string,              // selector present once the page has
//                                     // finished loading; the target is judged
//                                     // missing only after this appears
//         openVia?: string,            // selector of an existing UI control that
//                                     // reveals the target (a sidebar tab, an
//                                     // expandable header); clicked at most once
//                                     // per page, only if the target is absent
//         dependsOn?: string,          // id of an earlier step; if that step was
//                                     // skipped (no data), this one is skipped
//                                     // immediately too
//         timeout?: number,            // bounded wait (ms) when there is no
//                                     // `ready` marker
//       },
//       skipStepLabel?: string,       // GuideBot-runtime-only, for an interactive
//                                     // (optional-action) step: adds a clearly
//                                     // labelled control to the popover that
//                                     // completes just this step and moves on.
//       advanceWhenPresent?: string,  // GuideBot-runtime-only, for an interactive
//                                     // step whose target is a button the USER
//                                     // clicks: once this selector appears in the
//                                     // page (the modal the button opens), the
//                                     // step is complete and the tour moves on.
//       clickOnNext?: boolean | string, // GuideBot-runtime-only. When true, pressing
//                                     // Next first clicks this step's own target
//                                     // for real (the app's existing UI action —
//                                     // e.g. a nav link, or a button that opens a
//                                     // modal) and then moves on; the next step's
//                                     // target is awaited through the normal
//                                     // TargetGuard. Nothing is clicked on entering
//                                     // the step.
//       completeOnTargetGone?: boolean, // GuideBot-runtime-only, for an interactive
//                                     // step whose target is a dismissible surface
//                                     // (a modal): once the target leaves the DOM
//                                     // (dismissed/cancelled) — or the step's
//                                     // action success signal fires — the tour
//                                     // advances on its own.
//       historyBackOnComplete?: boolean, // GuideBot-runtime-only, with the one above:
//                                     // when the step completes and the route is
//                                     // still the one it was shown on, step back
//                                     // one browser-history entry (the router
//                                     // reacts to it as it does to any Back) —
//                                     // for pages that have no layout/nav of
//                                     // their own to continue from.
//     }],
//     portal?: string,              // free-form metadata, e.g. 'admin'
//     version?: string,
//     description?: string,
//     driverConfig?: object         // passthrough top-level Driver.js Config
//   }

const ALLOWED_PLACEMENTS = new Set(['top', 'right', 'bottom', 'left']);
const ALLOWED_ALIGNMENTS = new Set(['start', 'center', 'end']);

export class TourValidationError extends Error {
  constructor(tourId, errors) {
    super(`Invalid GuideBot tour${tourId ? ` "${tourId}"` : ''}: ${errors.join('; ')}`);
    this.name = 'TourValidationError';
    this.errors = errors;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates a raw tour config without throwing.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTour(rawTour) {
  const errors = [];

  if (!isPlainObject(rawTour)) {
    return { valid: false, errors: ['tour must be a plain object'] };
  }

  if (!isNonEmptyString(rawTour.id)) {
    errors.push('"id" is required and must be a non-empty string');
  }

  if (!Array.isArray(rawTour.steps) || rawTour.steps.length === 0) {
    errors.push('"steps" is required and must be a non-empty array');
  } else {
    rawTour.steps.forEach((step, index) => {
      const label = `steps[${index}]`;
      if (!isPlainObject(step)) {
        errors.push(`${label} must be an object`);
        return;
      }
      if (!isNonEmptyString(step.target)) {
        errors.push(`${label}.target is required and must be a non-empty CSS selector string`);
      }
      if (step.id !== undefined && !isNonEmptyString(step.id)) {
        errors.push(`${label}.id must be a non-empty string when provided`);
      }
      if (step.title !== undefined && typeof step.title !== 'string') {
        errors.push(`${label}.title must be a string when provided`);
      }
      if (step.description !== undefined && typeof step.description !== 'string') {
        errors.push(`${label}.description must be a string when provided`);
      }
      if (step.placement !== undefined && !ALLOWED_PLACEMENTS.has(step.placement)) {
        errors.push(`${label}.placement must be one of: ${[...ALLOWED_PLACEMENTS].join(', ')}`);
      }
      if (step.align !== undefined && !ALLOWED_ALIGNMENTS.has(step.align)) {
        errors.push(`${label}.align must be one of: ${[...ALLOWED_ALIGNMENTS].join(', ')}`);
      }
      if (step.driverStepConfig !== undefined && !isPlainObject(step.driverStepConfig)) {
        errors.push(`${label}.driverStepConfig must be an object when provided`);
      }
      if (step.action !== undefined) {
        if (!isPlainObject(step.action)) {
          errors.push(`${label}.action must be an object when provided`);
        } else {
          if (!isNonEmptyString(step.action.signal)) {
            errors.push(`${label}.action.signal is required and must be a non-empty string`);
          }
          if (
            step.action.timeout !== undefined &&
            !(typeof step.action.timeout === 'number' && Number.isFinite(step.action.timeout) && step.action.timeout > 0)
          ) {
            errors.push(`${label}.action.timeout must be a finite positive number when provided`);
          }
          if (step.action.matches !== undefined && typeof step.action.matches !== 'function') {
            errors.push(`${label}.action.matches must be a function when provided`);
          }
        }
      }
      if (step.optional !== undefined && typeof step.optional !== 'boolean') {
        errors.push(`${label}.optional must be a boolean when provided`);
      }
      if (step.existsHint !== undefined) {
        if (!isPlainObject(step.existsHint)) {
          errors.push(`${label}.existsHint must be an object when provided`);
        } else {
          if (!isNonEmptyString(step.existsHint.target)) {
            errors.push(`${label}.existsHint.target is required and must be a non-empty string`);
          }
          if (step.existsHint.predicate !== undefined && typeof step.existsHint.predicate !== 'function') {
            errors.push(`${label}.existsHint.predicate must be a function when provided`);
          }
        }
      }
      if (step.autoNavigate !== undefined && typeof step.autoNavigate !== 'boolean') {
        errors.push(`${label}.autoNavigate must be a boolean when provided`);
      }
      if (step.skipIfMissing !== undefined && step.skipIfMissing !== true) {
        const s = step.skipIfMissing;
        if (!isPlainObject(s)) {
          errors.push(`${label}.skipIfMissing must be true or an object when provided`);
        } else {
          ['route', 'ready', 'openVia', 'dependsOn'].forEach((key) => {
            if (s[key] !== undefined && !isNonEmptyString(s[key])) {
              errors.push(`${label}.skipIfMissing.${key} must be a non-empty string when provided`);
            }
          });
          if (s.timeout !== undefined && !(typeof s.timeout === 'number' && Number.isFinite(s.timeout) && s.timeout > 0)) {
            errors.push(`${label}.skipIfMissing.timeout must be a finite positive number when provided`);
          }
        }
      }
      if (step.advanceWhenPresent !== undefined && !isNonEmptyString(step.advanceWhenPresent)) {
        errors.push(`${label}.advanceWhenPresent must be a non-empty string when provided`);
      }
      if (step.clickOnNext !== undefined && typeof step.clickOnNext !== 'boolean' && !isNonEmptyString(step.clickOnNext)) {
        errors.push(`${label}.clickOnNext must be a boolean or a non-empty selector string when provided`);
      }
      if (step.skipStepLabel !== undefined && !isNonEmptyString(step.skipStepLabel)) {
        errors.push(`${label}.skipStepLabel must be a non-empty string when provided`);
      }
      ['completeOnTargetGone', 'historyBackOnComplete'].forEach((flag) => {
        if (step[flag] !== undefined && typeof step[flag] !== 'boolean') {
          errors.push(`${label}.${flag} must be a boolean when provided`);
        }
      });
    });
  }

  if (rawTour.portal !== undefined && !isNonEmptyString(rawTour.portal)) {
    errors.push('"portal" must be a non-empty string when provided');
  }
  if (rawTour.version !== undefined && typeof rawTour.version !== 'string') {
    errors.push('"version" must be a string when provided');
  }
  if (rawTour.description !== undefined && typeof rawTour.description !== 'string') {
    errors.push('"description" must be a string when provided');
  }
  if (rawTour.driverConfig !== undefined && !isPlainObject(rawTour.driverConfig)) {
    errors.push('"driverConfig" must be an object when provided');
  }

  return { valid: errors.length === 0, errors };
}

function normalizeStep(step, index, tourId) {
  const stepId = isNonEmptyString(step.id) ? step.id.trim() : `${tourId}::step-${index}`;
  const driverStepConfig = isPlainObject(step.driverStepConfig) ? step.driverStepConfig : {};

  const popover = {
    ...(isPlainObject(driverStepConfig.popover) ? driverStepConfig.popover : {}),
    ...(step.title !== undefined ? { title: step.title } : {}),
    ...(step.description !== undefined ? { description: step.description } : {}),
    ...(step.placement !== undefined ? { side: step.placement } : {}),
    ...(step.align !== undefined ? { align: step.align } : {}),
  };

  return {
    ...driverStepConfig,
    element: step.target.trim(),
    ...(Object.keys(popover).length > 0 ? { popover } : {}),
    data: { ...driverStepConfig.data, guidebotStepId: stepId },
    // Preserved as-is for GuideBotRuntime; Driver.js itself ignores this
    // key. Shallow-copied (not the same object as the raw step's) so
    // normalization never lets a caller mutate the raw tour through the
    // returned value, while the `matches` function reference is kept intact.
    ...(isPlainObject(step.action) ? { action: { ...step.action } } : {}),
    ...(typeof step.optional === 'boolean' ? { optional: step.optional } : {}),
    ...(isPlainObject(step.existsHint) ? { existsHint: { ...step.existsHint } } : {}),
    ...(typeof step.autoNavigate === 'boolean' ? { autoNavigate: step.autoNavigate } : {}),
    ...(step.skipIfMissing === true ? { skipIfMissing: {} } : {}),
    ...(isPlainObject(step.skipIfMissing) ? { skipIfMissing: { ...step.skipIfMissing } } : {}),
    ...(typeof step.skipStepLabel === 'string' ? { skipStepLabel: step.skipStepLabel } : {}),
    ...(typeof step.advanceWhenPresent === 'string' ? { advanceWhenPresent: step.advanceWhenPresent } : {}),
    ...(typeof step.clickOnNext === 'boolean' || typeof step.clickOnNext === 'string' ? { clickOnNext: step.clickOnNext } : {}),
    ...(typeof step.completeOnTargetGone === 'boolean' ? { completeOnTargetGone: step.completeOnTargetGone } : {}),
    ...(typeof step.historyBackOnComplete === 'boolean' ? { historyBackOnComplete: step.historyBackOnComplete } : {}),
  };
}

/**
 * Validates and normalizes a raw tour config into the exact shape
 * TourEngine.start() expects: { id, steps, driverConfig }.
 * Throws TourValidationError (with a populated `.errors` array) if invalid
 * — a tour config either normalizes cleanly or fails loudly, it is never
 * partially registered.
 */
export function normalizeTour(rawTour) {
  const { valid, errors } = validateTour(rawTour);
  if (!valid) {
    throw new TourValidationError(isNonEmptyString(rawTour?.id) ? rawTour.id : undefined, errors);
  }

  const id = rawTour.id.trim();

  return {
    id,
    steps: rawTour.steps.map((step, index) => normalizeStep(step, index, id)),
    ...(rawTour.driverConfig !== undefined ? { driverConfig: rawTour.driverConfig } : {}),
    ...(rawTour.portal !== undefined ? { portal: rawTour.portal } : {}),
    ...(rawTour.version !== undefined ? { version: rawTour.version } : {}),
    ...(rawTour.description !== undefined ? { description: rawTour.description } : {}),
  };
}
