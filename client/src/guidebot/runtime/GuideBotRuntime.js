// GuideBot runtime — connects a registered tour to the live application,
// one step at a time, route-aware. This is the ONLY module allowed to
// drive TourEngine at runtime; it never imports 'driver.js' itself and
// never reaches past the engine's public boundary (`../engine`).
//
// Why one step at a time: the registered tours (superadmin/admin/student/
// mentor) contain steps whose targets live on different routes, and
// Driver.js has no idea about our app's routing. Handing it the whole
// multi-route steps array at once would make "Next" try to highlight
// elements that don't exist on the current page. Instead, this runtime
// presents exactly one step as its own single-step Driver.js tour, using
// TargetGuard to wait for that one target — including waiting across
// route changes if the user hasn't navigated there yet — before showing
// anything.

import { TourEngine, TOUR_STATES, TargetGuard, ActionGuard } from '../engine';
import { getTour } from '../tours/registry';
// Side-effect import: guarantees all four portal tours are registered
// before start() can ever be called, wherever this runtime module ends up
// being imported from. No registration logic lives here — see tours/index.js.
import '../tours';
import i18n from '../../i18n';

const DEFAULT_TARGET_TIMEOUT_MS = 4000;
// How long to wait, after a navigation click, for the page being left to be
// swapped out before accepting the still-present node as the right one.
const NAVIGATION_SETTLE_MS = 350;
// How long a control's own click gets to reveal the step's target (an
// expandable section opening) before the step is treated as absent.
const OPEN_REVEAL_MS = 800;

export const RUNTIME_STATES = Object.freeze({
  IDLE: 'idle',
  WAITING_FOR_TARGET: 'waiting-for-target',
  PRESENTING: 'presenting',
});

class GuideBotRuntime {
  constructor() {
    this._engine = new TourEngine();
    this._targetGuard = new TargetGuard();
    // Separate instance so a step's removal watch (see completeOnTargetGone)
    // never interferes with the target wait of the step being presented.
    this._removalGuard = new TargetGuard();
    // Watches for the modal a user-clicked button opens (see advanceWhenPresent).
    this._presenceGuard = new TargetGuard();
    // Pathname the current step was presented on (see historyBackOnComplete).
    this._presentedPath = null;
    // "path|selector" of skipIfMissing.openVia controls already used this run,
    // so a toggle-style control (an expandable header) is never clicked twice.
    this._openedVia = new Set();
    // Ids of steps dropped this run (missing data), for dependsOn.
    this._skippedStepIds = new Set();
    // Single shared ActionGuard instance for the whole runtime — mirrors
    // the single shared TourEngine/TargetGuard; at most one action wait is
    // ever active at a time.
    this._actionGuard = new ActionGuard();
    this._tour = null;
    // The subset of this._tour.steps actually being presented — computed
    // once in start() by dropping any `optional` step whose existsHint
    // predicate says it won't apply. Iteration and the progress total both
    // use this list, not this._tour.steps directly, so an optional step
    // that's skipped never shows a popover and never counts.
    this._activeSteps = null;
    this._stepIndex = 0;
    this._runtimeState = RUNTIME_STATES.IDLE;
    // Distinguishes "user clicked Next/Done" from "user closed/escaped" —
    // both end up calling Driver.js's onDestroyed, so we record intent
    // synchronously in the click hook and read it back in onDestroyed.
    // For action steps, Next/Done deliberately does NOT set this — see
    // _showStep.
    this._advanceRequested = false;
    // Set just before programmatically tearing down an action step's
    // popover because its configured success signal fired, so
    // _handleStepDestroyed knows to advance rather than treat the
    // resulting onDestroyed as a click or a close.
    this._actionSuccessAdvance = false;
    // Re-entrancy guard for _handleStepDestroyed — see its own comment.
    this._isHandlingDestroy = false;

    // Listen for language changes to update active tour popover in real time
    if (typeof i18n?.on === 'function') {
      i18n.on('languageChanged', () => {
        if (this._runtimeState === RUNTIME_STATES.PRESENTING && this._activeSteps?.[this._stepIndex]) {
          this._showStep(this._activeSteps[this._stepIndex]);
        }
      });
    }
  }

  getRuntimeState() {
    return this._runtimeState;
  }

  isActive() {
    return this._runtimeState !== RUNTIME_STATES.IDLE;
  }

  getActiveTourId() {
    return this._tour ? this._tour.id : null;
  }

  /** @param {(state: string) => void} listener @returns {() => void} unsubscribe */
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    if (!this._listeners) this._listeners = new Set();
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Starts presenting a registered tour by id. Fails safely (returns
   * false, no throw) if the id is missing, unregistered, empty, or a
   * tour is already active.
   * @param {string} tourId
   * @returns {boolean}
   */
  start(tourId) {
    if (!tourId || typeof tourId !== 'string') return false;
    if (this.isActive()) return false; // one runtime instance, no duplicates

    let tour;
    try {
      tour = getTour(tourId);
    } catch (_error) {
      return false;
    }
    if (!tour || !Array.isArray(tour.steps) || tour.steps.length === 0) return false;

    this._tour = tour;
    this._activeSteps = this._resolveActiveSteps(tour.steps);
    this._stepIndex = 0;
    this._openedVia = new Set();
    this._skippedStepIds = new Set();
    this._presentCurrentStep();
    return true;
  }

  /** Stops the runtime entirely: tears down the target watch, any action
   * observation, and the engine. Idempotent. */
  stop() {
    this._targetGuard.stop();
    this._removalGuard.stop();
    this._presenceGuard.stop();
    this._actionGuard.stop();
    if (this._engine.getState() !== TOUR_STATES.IDLE) {
      try {
        this._engine.stop();
      } catch (_error) {
        // Fail safe — never let cleanup itself throw.
      }
    }
    this._tour = null;
    this._activeSteps = null;
    this._stepIndex = 0;
    this._advanceRequested = false;
    this._actionSuccessAdvance = false;
    this._setRuntimeState(RUNTIME_STATES.IDLE);
  }

  /** Full teardown, e.g. on app shutdown. Safe to call multiple times. */
  destroy() {
    this.stop();
    this._engine.destroy();
    if (this._listeners) this._listeners.clear();
  }

  // --- internals ---

  /**
   * Drops any `optional` step whose existsHint predicate says it won't
   * apply, evaluated once up front (not re-checked per step) so the
   * progress total stays consistent for the whole walkthrough rather than
   * changing mid-tour. A step without `optional` is always kept.
   */
  _resolveActiveSteps(steps) {
    return steps.filter((step) => !step || !step.optional || this._isOptionalStepApplicable(step));
  }

  _isOptionalStepApplicable(step) {
    const hint = step.existsHint;
    const target = hint?.target || step.element;
    if (!target || typeof document === 'undefined') return true; // can't tell — fail open, keep it

    let el;
    try {
      el = document.querySelector(target);
    } catch (_error) {
      return true; // invalid selector — fail open rather than silently hide a step
    }
    if (!el) return true; // signal element itself absent — fail open

    if (hint && typeof hint.predicate === 'function') {
      try {
        return !!hint.predicate(el);
      } catch (_error) {
        return true; // a broken predicate must not break the runtime
      }
    }
    return true; // signal element present, no predicate to narrow further
  }

  _presentCurrentStep() {
    // Whatever step we were on before (if any) is being left — any action
    // observation tied to it is no longer relevant. Safe/idempotent if none
    // was active.
    this._actionGuard.stop();
    this._removalGuard.stop();
    this._presenceGuard.stop();

    const step = this._activeSteps?.[this._stepIndex];
    if (!step || typeof step.element !== 'string' || !step.element) {
      this.stop();
      return;
    }

    this._setRuntimeState(RUNTIME_STATES.WAITING_FOR_TARGET);

    if (step.skipIfMissing) {
      this._gateSkipIfMissing(step, () => this._presentStepCore(step));
      return;
    }
    this._presentStepCore(step);
  }

  /**
   * For skipIfMissing steps: decides — without arbitrary delays, using the
   * same TargetGuard waits as everything else — whether the step's target
   * really exists; if it genuinely doesn't, the step is dropped so a missing
   * piece of data (no enrolled course, no results...) can never stall the tour.
   */
  _gateSkipIfMissing(step, proceed) {
    const cfg = step.skipIfMissing || {};
    const isCurrent = () => this._activeSteps?.[this._stepIndex] === step;
    const timeout = typeof cfg.timeout === 'number' ? cfg.timeout : DEFAULT_TARGET_TIMEOUT_MS * 2;

    if (cfg.dependsOn && this._skippedStepIds.has(cfg.dependsOn)) {
      this._skipStep(step); // the step this one builds on had no data
      return;
    }

    if (cfg.route && typeof window !== 'undefined' && !window.location.pathname.startsWith(cfg.route)) {
      this._skipStep(step); // the page this step lives on was never opened
      return;
    }

    const proceedIfCurrent = () => {
      this._targetGuard.stop();
      if (isCurrent()) proceed();
    };

    const decide = () => {
      if (!isCurrent()) return;
      if (this._elementExists(step.element)) {
        proceed();
        return;
      }
      if (cfg.openVia) {
        const key = `${typeof window !== 'undefined' ? window.location.pathname : ''}|${cfg.openVia}`;
        if (!this._openedVia.has(key)) {
          let opener = null;
          try {
            opener = document.querySelector(cfg.openVia);
          } catch (_error) {
            opener = null;
          }
          if (opener) {
            this._openedVia.add(key);
            try {
              opener.click(); // the app's own control, exactly as a user click
            } catch (_error) {
              // fall through to the wait below
            }
            // The app applies the click's state update just after the click
            // returns (and a navigation renders even later), so wait — bounded
            // and event-driven, proceeding the instant the target appears.
            this._targetGuard.watch(step.element, {
              timeout: cfg.ready ? OPEN_REVEAL_MS : timeout,
              onFound: proceedIfCurrent,
              onTimeout: () => {
                this._targetGuard.stop();
                if (isCurrent()) this._skipStep(step);
              },
            });
            return;
          }
        }
      }
      if (cfg.ready) {
        this._skipStep(step); // page is loaded and the target still isn't there
        return;
      }
      // No ready marker: the page may still be loading/navigating — wait
      // (bounded, route-reactive), and only then treat it as missing.
      this._targetGuard.watch(step.element, {
        timeout,
        onFound: proceedIfCurrent,
        onTimeout: () => {
          this._targetGuard.stop();
          if (isCurrent()) this._skipStep(step);
        },
      });
    };

    if (cfg.ready) {
      this._targetGuard.watch(cfg.ready, {
        timeout,
        onFound: () => {
          this._targetGuard.stop();
          decide();
        },
        onTimeout: () => {
          this._targetGuard.stop();
          if (isCurrent()) this._skipStep(step);
        },
      });
      return;
    }
    decide();
  }

  /** Drops `step` from this run (and from the progress total) and moves on. */
  _skipStep(step) {
    if (this._activeSteps?.[this._stepIndex] !== step) return;
    this._targetGuard.stop();
    if (step.data && step.data.guidebotStepId) this._skippedStepIds.add(step.data.guidebotStepId);
    this._activeSteps.splice(this._stepIndex, 1);
    if (this._stepIndex >= this._activeSteps.length) {
      this._completeWalkthrough();
      return;
    }
    this._presentCurrentStep();
  }

  /**
   * The walkthrough reached its end (last step's button, or the remaining
   * steps were all skipped): tear down and persist the COMPLETED state through
   * TourEngine's existing storage.
   */
  _completeWalkthrough() {
    this._advanceRequested = true;
    let done = false;
    try {
      done = this._engine.complete();
    } catch (_error) {
      done = false;
    }
    // Nothing was presented (so nothing to complete) or Driver.js did not
    // report its teardown: make sure the runtime itself is fully reset.
    if (!done || this._tour) this.stop();
  }

  _presentStepCore(step) {
    this._targetGuard.watch(step.element, {
      timeout: DEFAULT_TARGET_TIMEOUT_MS,
      onFound: (el) => {
        // Found — stop reacting to further route changes for this step;
        // a fresh watch is started for whichever step comes next.
        this._targetGuard.stop();
        if (step.autoNavigate) {
          this._autoNavigateThenPresent(step, el);
        } else {
          this._showStep(step);
        }
      },
      onTimeout: () => {
        // Not on this route (yet). TargetGuard keeps re-checking on every
        // subsequent route change — no polling — until found or stop().
      },
    });
  }

  /**
   * For `autoNavigate` steps only: clicks the step's own target for real
   * (the app's existing navigation, e.g. a sidebar <Link>, handles the
   * actual route/tab change itself — this never implements a second
   * routing system), then waits again for that same target before
   * presenting it. A fresh wait is required rather than presenting
   * immediately because the click may swap the active page entirely
   * (destroying and recreating the DOM node) or may just switch an
   * internal tab (same node) — both are handled uniformly this way.
   */
  _autoNavigateThenPresent(step, el) {
    try {
      if (el && typeof el.click === 'function') el.click();
    } catch (_error) {
      // A misbehaving click handler must not break the runtime — fall
      // through to the re-wait below regardless.
    }

    // The click starts a route change that React commits a moment later,
    // replacing the whole page — including a sidebar that lives inside each
    // page's own layout. Matching the node that is still in the DOM right
    // now would anchor the highlight and popover to a node about to be
    // detached (its rect collapses to 0,0 and the popover points at
    // nothing). So the clicked node itself is ignored until it has been
    // replaced; only if it is still the same node after the settle window
    // (an in-place tab switch, where nothing is swapped) is it accepted.
    this._targetGuard.watch(step.element, {
      timeout: NAVIGATION_SETTLE_MS,
      ignoreElement: el,
      onFound: () => {
        this._targetGuard.stop();
        this._showStep(step);
      },
      onTimeout: () => {
        this._targetGuard.stop();
        let stillThere = null;
        try {
          stillThere = document.querySelector(step.element);
        } catch (_error) {
          stillThere = null;
        }
        if (stillThere) {
          this._showStep(step);
          return;
        }
        // Not there at all yet (slow route) — wait normally for it.
        this._targetGuard.watch(step.element, {
          timeout: DEFAULT_TARGET_TIMEOUT_MS,
          onFound: () => {
            this._targetGuard.stop();
            this._showStep(step);
          },
          onTimeout: () => {
            // The target never reappeared after the click — fail safe rather
            // than presenting a popover for something that may not be there.
            this.stop();
          },
        });
      },
    });
  }

  _showStep(step) {
    if (!this._tour) return; // stop() may have raced this callback

    // When a Driver.js instance is still up from the previous step (kept
    // alive on purpose by _advanceContinuously / _goBackOneStep), the new
    // step is presented on that same instance so the spotlight glides
    // across instead of the overlay disappearing and reopening. Otherwise
    // (first step, or after a full teardown) start fresh as before.
    const continueOnLiveInstance = this._engine.getState() === TOUR_STATES.ACTIVE;

    this._advanceRequested = false;

    // Whether Driver.js's own Next/Done button should be allowed to count
    // as an advance is decided in _handleStepDestroyed, not here — these
    // hooks just record which button was actually clicked, unchanged from
    // the non-action behavior. (Gating this here would make a Next/Done
    // click and a Close click indistinguishable for action steps, since
    // both would set the same value.)
    const isActionStep = !!(step && step.action);

    // Driver.js computes its own "{{current}} of {{total}}" from the
    // *presented* steps array, which is always length 1 in this one-step-
    // at-a-time architecture — left alone it would always show "1 of 1"
    // regardless of true position in the tour. Overriding progressText with
    // a plain string (no {{current}}/{{total}} placeholders) bypasses that
    // substitution entirely, so this shows the real position instead.
    // Driver.js only enables Previous when its own steps array has an earlier
    // entry — always false here (one step per micro-tour), so left alone the
    // button is permanently disabled. Enable it exactly when the runtime can
    // really go back to the previous step.
    // A tour may declare Driver.js's own nextBtnText / doneBtnText. Every
    // micro-tour is one step (Driver.js would label them all "Done"), so map
    // them onto the real position: doneBtnText on the last step, nextBtnText
    // on the rest. Tours that declare neither are unaffected.
    const tourConfig = this._tour.driverConfig || {};
    const isLastPresented = this._stepIndex >= this._activeSteps.length - 1;
    const forwardLabel = isLastPresented
      ? i18n.t('tours:done_btn', { defaultValue: tourConfig.doneBtnText || 'Done' })
      : i18n.t('tours:next_btn', { defaultValue: tourConfig.nextBtnText || 'Next' });
    const prevLabel = i18n.t('tours:prev_btn', { defaultValue: tourConfig.prevBtnText || 'Previous' });
    const closeLabel = i18n.t('tours:skip_btn', { defaultValue: tourConfig.closeBtnText || 'Skip Tour' });
    const stepId = step.data?.guidebotStepId || step.id;
    const localizedTitle = i18n.t(`tours:${stepId}_title`, {
      defaultValue: step.popover?.title || step.title || '',
    });
    const localizedDesc = i18n.t(`tours:${stepId}_desc`, {
      defaultValue: i18n.t(`tours:${stepId}_description`, {
        defaultValue: step.popover?.description || step.description || '',
      }),
    });
    const progressText = i18n.t('tours:step_progress', {
      current: this._stepIndex + 1,
      total: this._activeSteps.length,
      defaultValue: `Step ${this._stepIndex + 1} of ${this._activeSteps.length}`,
    });

    const presentedStep = {
      ...step,
      popover: {
        ...(step.popover?.disableButtons === undefined
          ? { disableButtons: this._canGoBack() ? [] : ['previous'] }
          : {}),
        ...step.popover,
        title: localizedTitle,
        description: localizedDesc,
        showProgress: true,
        progressText,
        nextBtnText: forwardLabel,
        prevBtnText: prevLabel,
        doneBtnText: forwardLabel,
        closeBtnText: closeLabel,
      },
    };

    const singleStepTour = {
      id: this._tour.id,
      steps: [presentedStep],
      driverConfig: {
        // Purely cosmetic Driver.js config (rounded, padded highlight
        // cutout + smooth scroll-into-view) — layered under the spread
        // below so a tour can still override any of these if it ever
        // needs to.
        stagePadding: 6,
        stageRadius: 8,
        smoothScroll: true,
        // Quick, subtle glide of the spotlight between consecutive steps.
        animate: true,
        duration: 260,
        ...this._tour.driverConfig,
        nextBtnText: forwardLabel,
        prevBtnText: prevLabel,
        doneBtnText: forwardLabel,
        closeBtnText: closeLabel,
        // Driver.js only auto-advances/closes when it owns the button's
        // click handler. The moment a config supplies onNextClick /
        // onDoneClick / onCloseClick, Driver.js calls *only* that handler
        // instead of its own internal navigation (confirmed by reading
        // driver.js.mjs directly: each one is `r ? r(...) : e.emit(...)`,
        // where `r` is our config callback — the internal emit that would
        // trigger its own teardown is skipped whenever `r` exists). So the
        // moment we provide these hooks, WE become responsible for
        // actually tearing the popover down — hence the explicit
        // this._engine.stop() in each one below. Escape and overlay-click
        // are unaffected by this; both call Driver.js's own teardown
        // directly and never go through these hooks.
        // Every micro-tour has exactly one step, so Driver.js treats each
        // one as the last and routes the forward button to onDoneClick —
        // both forward hooks therefore share one handler.
        onNextClick: () => this._handleForwardClick(),
        onDoneClick: () => this._handleForwardClick(),
        onPrevClick: () => {
          // Ignored while the next step's target is still being resolved.
          if (this._runtimeState !== RUNTIME_STATES.PRESENTING) return;
          this._goBackOneStep();
        },
        onCloseClick: () => {
          this._advanceRequested = false;
          this._engine.stop();
        },
        onDestroyed: () => this._handleStepDestroyed(),
        onPopoverRender: (popoverDom) => this._renderSkipButton(popoverDom),
      },
    };

    let started = false;
    try {
      if (continueOnLiveInstance) {
        started = this._engine.transition(singleStepTour);
        if (!started) {
          this._engine.stop(); // fall back to a clean start below
          if (!this._tour) return; // that teardown already stopped the runtime
        }
      }
      if (!started) started = this._engine.start(singleStepTour);
    } catch (_error) {
      started = false;
    }

    if (!started) {
      this.stop();
      return;
    }
    this._setRuntimeState(RUNTIME_STATES.PRESENTING);

    // Only start observing for the success signal once the step is
    // genuinely presenting — not while merely waiting for its target.
    if (isActionStep) {
      this._startActionObservation(step);
    }

    if (step.advanceWhenPresent) {
      // The user opens the workflow themselves (e.g. clicks the highlighted
      // button); the moment its surface appears, hand over to the next step.
      this._presenceGuard.watchPresence(step.advanceWhenPresent, () => {
        if (this._activeSteps?.[this._stepIndex] !== step) return;
        if (this._runtimeState !== RUNTIME_STATES.PRESENTING) return;
        this._completeInteractiveStep(step);
      });
    }

    if (step.completeOnTargetGone) {
      this._presentedPath = typeof window !== 'undefined' ? window.location.pathname : null;
      let targetEl = null;
      try {
        targetEl = document.querySelector(step.element);
      } catch (_error) {
        targetEl = null;
      }
      // The surface (e.g. a modal) was dismissed without the action
      // succeeding — treat it as this step being done, not as a failure.
      this._removalGuard.watchRemoval(
        targetEl,
        () => {
          if (this._activeSteps?.[this._stepIndex] !== step) return;
          if (this._runtimeState !== RUNTIME_STATES.PRESENTING) return;
          this._completeInteractiveStep(step);
        },
        { selector: step.element },
      );
    }
  }

  /** Next/Done button. Mid-tour, regular steps advance without tearing down
   * the Driver.js instance so the spotlight glides to the next target; the
   * last step and action steps keep the original teardown path. */
  _handleForwardClick() {
    // Ignored while the next step's target is still being resolved — the
    // previous popover stays up briefly during that wait.
    if (this._runtimeState !== RUNTIME_STATES.PRESENTING) return;

    const current = this._activeSteps?.[this._stepIndex];

    // A step that hides its Next button is completed by the user's own
    // action, never by Next — and Driver.js still routes the ArrowRight key
    // here, which must not skip it (e.g. while typing in a highlighted form).
    const buttons = current?.popover?.showButtons;
    if (Array.isArray(buttons) && !buttons.includes('next') && !current.advanceOnClick) return;

    const isLastStep = this._stepIndex >= this._activeSteps.length - 1;
    if (!isLastStep && !(current && current.action)) {
      if (current && current.clickOnNext) {
        // Perform the app's own UI action (nav link / modal-opening button)
        // exactly as a user click would; the next step's target is then
        // awaited through TargetGuard like any other. If it isn't there, do
        // nothing rather than advance to a target that can never appear.
        // clickOnNext may name a different control than the highlighted one
        // (e.g. highlight a row's actions, click its Edit button).
        const clickSelector = typeof current.clickOnNext === 'string' ? current.clickOnNext : current.element;
        let el = null;
        try {
          el = document.querySelector(clickSelector);
        } catch (_error) {
          el = null;
        }
        if (!el) return;
        try {
          el.click();
        } catch (_error) {
          // fall through — the wait for the next target decides what happens
        }
      }
      this._stepIndex += 1;
      this._presentCurrentStep();
      return;
    }

    if (isLastStep && !(current && current.action)) {
      this._completeWalkthrough();
      return;
    }

    this._advanceRequested = true;
    this._engine.stop();
  }

  /**
   * Injects a clearly-labeled "Skip" control into the popover footer so a
   * user can leave the walkthrough from any step, not just via the small
   * corner close (X) button. Reuses Driver.js's own onPopoverRender hook —
   * still reached only through the config object driverAdapter forwards
   * as-is, so driver.js itself stays imported nowhere but driverAdapter.js
   * — styled by the GuideBot-only `guidebot-popover-skip-btn` class (see
   * engine/styles/guidebotPopover.css) as a muted text link, distinct from
   * the boxed Previous/Next buttons. The click handler is intentionally
   * identical to onCloseClick above (set _advanceRequested = false, then
   * this._engine.stop()) rather than a new code path, so Skip behaves
   * exactly like Close/Escape/overlay-click, which is already exercised.
   */
  _renderSkipButton(popoverDom) {
    if (!popoverDom || !popoverDom.footerButtons || typeof document === 'undefined') return;

    const skipButton = document.createElement('button');
    skipButton.type = 'button';
    skipButton.className = 'guidebot-popover-skip-btn';
    skipButton.textContent = i18n.t('tours:skip_btn', { defaultValue: 'Skip' });
    skipButton.setAttribute('aria-label', i18n.t('tours:skip_btn', { defaultValue: 'Skip GuideBot walkthrough' }));
    skipButton.addEventListener('click', () => {
      this._advanceRequested = false;
      this._engine.stop();
    });

    popoverDom.footerButtons.insertBefore(skipButton, popoverDom.footerButtons.firstChild);

    // Optional-action steps have no Next button; they get an explicit control
    // that completes just this step (the mentor may also simply leave the
    // workflow, or finish it for real).
    const stepForRender = this._activeSteps?.[this._stepIndex];
    if (stepForRender && stepForRender.skipStepLabel) {
      const skipStepButton = document.createElement('button');
      skipStepButton.type = 'button';
      skipStepButton.className = 'driver-popover-footer-btn guidebot-popover-skipstep-btn';
      const stepId = stepForRender.data?.guidebotStepId || stepForRender.id;
      skipStepButton.textContent = i18n.t(`tours:${stepId}_skip`, { defaultValue: stepForRender.skipStepLabel });
      skipStepButton.addEventListener('click', () => {
        if (this._activeSteps?.[this._stepIndex] !== stepForRender) return;
        if (this._runtimeState !== RUNTIME_STATES.PRESENTING) return;
        // A user skip counts as "did not happen" for steps that build on it.
        if (stepForRender.data && stepForRender.data.guidebotStepId) {
          this._skippedStepIds.add(stepForRender.data.guidebotStepId);
        }
        this._completeInteractiveStep(stepForRender);
      });
      popoverDom.footerButtons.appendChild(skipStepButton);
    }
  }

  /** Fires whenever Driver.js tears down the current step's popover, for
   * any reason: Next/Done click, Close click, Escape, or overlay click. */
  _handleStepDestroyed() {
    // Re-entrancy guard: stop() destroying the active Driver.js instance
    // can cause Driver.js to invoke onDestroyed synchronously again before
    // TourEngine.stop() has fully unwound, re-entering this method from
    // inside itself. Without this guard that nested call would re-enter
    // stop() -> engine.stop() -> a second, unsafe destroy() call on an
    // instance that's still mid-teardown.
    if (this._isHandlingDestroy) return;
    this._isHandlingDestroy = true;
    try {
      if (!this._tour) return; // already stopped

      const currentStep = this._activeSteps[this._stepIndex];
      const isActionStep = !!(currentStep && currentStep.action);

      const shouldAdvanceClick = this._advanceRequested;
      this._advanceRequested = false;

      // Whatever action observation belonged to the step we're leaving is
      // no longer relevant, regardless of why it's being torn down.
      this._actionGuard.stop();

      if (this._actionSuccessAdvance) {
        // Torn down programmatically because the configured success signal
        // fired (see _handleActionSuccess) — advance exactly like a normal
        // click-driven advance would.
        this._actionSuccessAdvance = false;
        this._advanceToNextStepOrFinish();
        return;
      }

      if (isActionStep) {
        if (shouldAdvanceClick) {
          // The popover's own Next/Done was clicked, but action steps only
          // ever advance on their success signal. Driver.js has already
          // destroyed the popover (unavoidable on its side) — re-present
          // the same step rather than advancing or aborting.
          this._presentCurrentStep();
          return;
        }
        // Genuine close: X button, Escape, or overlay click.
        this.stop();
        return;
      }

      // Non-action step: unchanged existing behavior.
      if (!shouldAdvanceClick) {
        this.stop();
        return;
      }
      this._advanceToNextStepOrFinish();
    } finally {
      this._isHandlingDestroy = false;
    }
  }

  /** Advances to the next step, or finishes the walkthrough if this was the last one. */
  _advanceToNextStepOrFinish() {
    const nextIndex = this._stepIndex + 1;
    if (nextIndex >= this._activeSteps.length) {
      // Walkthrough finished. TourEngine has already returned to idle as
      // part of Driver.js's own destroy sequence — nothing left to tear
      // down, just reset our own bookkeeping.
      this._tour = null;
      this._activeSteps = null;
      this._stepIndex = 0;
      this._setRuntimeState(RUNTIME_STATES.IDLE);
      return;
    }

    this._stepIndex = nextIndex;
    this._presentCurrentStep();
  }

  _elementExists(selector) {
    if (typeof selector !== 'string' || !selector || typeof document === 'undefined') return false;
    try {
      return !!document.querySelector(selector);
    } catch (_error) {
      return false;
    }
  }

  /** Nearest autoNavigate (sidebar-nav) step before `index` whose own link is
   * currently in the page — the way back to the page an earlier step lives on. */
  _findNavStepBefore(index) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = this._activeSteps[i];
      if (candidate && candidate.autoNavigate && this._elementExists(candidate.element)) {
        return candidate;
      }
    }
    return null;
  }

  /** Whether the previous step can actually be reached from here: its target
   * is already on the page, it is itself a nav step, or an earlier nav step's
   * link can be used to get back to the page it lives on. */
  _canGoBack() {
    const prevIndex = this._stepIndex - 1;
    const prevStep = prevIndex >= 0 ? this._activeSteps?.[prevIndex] : null;
    if (!prevStep || typeof prevStep.element !== 'string') return false;
    // An interactive, self-dismissing surface (a modal the user just closed)
    // can't be re-entered by going back.
    if (prevStep.completeOnTargetGone) return false;
    // Data-dependent steps can only be re-entered while their target is there.
    if (prevStep.skipIfMissing && !this._elementExists(prevStep.element)) return false;
    return (
      !!prevStep.autoNavigate ||
      this._elementExists(prevStep.element) ||
      this._findNavStepBefore(prevIndex) !== null
    );
  }

  /** Previous button: return to the previous step, first re-clicking GuideBot's
   * own sidebar nav link (never a business/action button) when that step
   * lives on a different tab/page than the one currently open. */
  _goBackOneStep() {
    const prevIndex = this._stepIndex - 1;
    const prevStep = prevIndex >= 0 ? this._activeSteps[prevIndex] : null;
    if (!prevStep) {
      this._presentCurrentStep(); // nothing earlier — re-present this step
      return;
    }

    this._stepIndex = prevIndex;

    if (!prevStep.autoNavigate && !this._elementExists(prevStep.element)) {
      const navStep = this._findNavStepBefore(prevIndex);
      if (navStep) {
        try {
          document.querySelector(navStep.element)?.click();
        } catch (_error) {
          // fall through — _presentCurrentStep waits for the target regardless
        }
      }
    }
    this._presentCurrentStep();
  }

  /** Starts observing for an action step's configured success signal. Only
   * called once the step is genuinely presenting (see _showStep). */
  _startActionObservation(step) {
    const { signal, timeout, matches } = step.action;
    this._actionGuard.waitForSuccess({
      signal,
      timeout,
      matches,
      onSuccess: () => this._handleActionSuccess(),
      onTimeout: () => this._handleActionTimeout(),
    });
  }

  /**
   * An interactive step (see completeOnTargetGone) is done — its success
   * signal fired, or its surface was dismissed. Moves on without tearing the
   * Driver.js instance down, so the spotlight glides to the next target.
   */
  _completeInteractiveStep(step) {
    this._removalGuard.stop();
    this._presenceGuard.stop();
    this._actionGuard.stop();

    if (
      step.historyBackOnComplete &&
      typeof window !== 'undefined' &&
      window.location.pathname === this._presentedPath
    ) {
      // The router treats this exactly like the browser Back button.
      window.history.back();
    }

    const isLastStep = this._stepIndex >= this._activeSteps.length - 1;
    if (isLastStep) {
      this._completeWalkthrough();
      return;
    }
    this._stepIndex += 1;
    this._presentCurrentStep();
  }

  /** The configured success signal fired for the current action step. */
  _handleActionSuccess() {
    if (!this._tour) return; // already stopped

    const current = this._activeSteps?.[this._stepIndex];
    if (current && current.completeOnTargetGone) {
      this._completeInteractiveStep(current);
      return;
    }

    if (this._engine.getState() !== TOUR_STATES.IDLE) {
      this._actionSuccessAdvance = true;
      try {
        // Tears down the popover; onDestroyed fires synchronously and
        // _handleStepDestroyed reads _actionSuccessAdvance to advance.
        this._engine.stop();
      } catch (_error) {
        this._actionSuccessAdvance = false;
        this.stop(); // fail safe — abort rather than leave state inconsistent
      }
    } else {
      // Defensive: nothing to tear down, advance directly.
      this._advanceToNextStepOrFinish();
    }
  }

  /** The current action step's bounded wait elapsed with no matching signal. */
  _handleActionTimeout() {
    // Per design: stay on the current step, do not advance, do not retry.
    // ActionGuard has already torn itself down internally (see its own
    // _settle) — nothing further to clean up here.
  }

  _setRuntimeState(next) {
    this._runtimeState = next;
    if (!this._listeners) return;
    this._listeners.forEach((listener) => {
      try {
        listener(this._runtimeState);
      } catch (_error) {
        // A misbehaving subscriber must never break the runtime.
      }
    });
  }
}

// Single shared instance — the whole app has exactly one GuideBot runtime,
// mirroring the single global Driver.js overlay. This is what structurally
// prevents duplicate concurrent presentations across portals.
const guideBotRuntime = new GuideBotRuntime();

export default guideBotRuntime;
