// Generic, business-agnostic observer for an externally-produced "success"
// signal. ActionGuard knows nothing about students, admins, universities,
// forms, buttons, APIs, HTTP status codes, routes, or portals — it only
// listens for a namespaced window CustomEvent and reports whether it fired
// within a bounded timeout.
//
// GuideBot's principle: it OBSERVES the host application, it never PERFORMS
// its business actions. The application (elsewhere, wired in a later step)
// is expected to dispatch a CustomEvent on window when its own action
// succeeds, e.g.:
//
//   window.dispatchEvent(new CustomEvent('guidebot:action-success', {
//     detail: { actionId: 'some-action' },
//   }));
//
// ActionGuard only ever listens for that event — it never dispatches one,
// never calls an API, and never touches application state.

const DEFAULT_TIMEOUT_MS = 10000;

class ActionGuard {
  constructor() {
    this._activeListener = null;
    this._activeSignal = null;
    this._timeoutId = null;
    this._settled = true; // no wait in progress until waitForSuccess() is called
  }

  /**
   * Waits for a single occurrence of `signal` (a window CustomEvent name),
   * optionally filtered by `matches(detail)`. Starting a new wait first
   * cancels any wait already in progress on this instance — at most one
   * active listener/timer per instance, ever.
   *
   * @param {{
   *   signal: string,
   *   timeout?: number,
   *   matches?: (detail: any) => boolean,
   *   onSuccess?: (detail: any) => void,
   *   onTimeout?: () => void,
   * }} options
   * @returns {() => void} unsubscribe — cancels this wait with no callback
   *   firing; safe to call multiple times.
   */
  waitForSuccess(options = {}) {
    const { signal, matches, onSuccess, onTimeout } = options;
    const timeout =
      typeof options.timeout === 'number' && options.timeout > 0
        ? options.timeout
        : DEFAULT_TIMEOUT_MS;

    this._teardownActive(); // enforce: at most one active wait per instance

    if (!signal || typeof signal !== 'string' || typeof window === 'undefined') {
      return () => {};
    }

    this._settled = false;

    const handleEvent = (event) => {
      if (this._settled) return; // already resolved (or torn down) — ignore
      const detail = event && event.detail;

      if (typeof matches === 'function') {
        let passes = false;
        try {
          passes = !!matches(detail);
        } catch (_error) {
          passes = false;
        }
        if (!passes) return; // not the success we're looking for — keep waiting
      }

      this._settle(() => onSuccess?.(detail));
    };

    window.addEventListener(signal, handleEvent);
    this._activeListener = handleEvent;
    this._activeSignal = signal;

    this._timeoutId = setTimeout(() => {
      this._settle(() => onTimeout?.());
    }, timeout);

    return () => this._teardownActive();
  }

  /** Cancels the current wait entirely — no callback fires. Idempotent. */
  stop() {
    this._settled = true; // belt-and-braces: blocks any in-flight callback too
    this._teardownActive();
  }

  // --- internals ---

  /** Fires exactly once per wait, then tears down before invoking the callback. */
  _settle(invokeCallback) {
    if (this._settled) return;
    this._settled = true;
    this._teardownActive();
    invokeCallback();
  }

  _teardownActive() {
    if (this._activeListener && this._activeSignal && typeof window !== 'undefined') {
      window.removeEventListener(this._activeSignal, this._activeListener);
    }
    if (this._timeoutId !== null) {
      clearTimeout(this._timeoutId);
    }
    this._activeListener = null;
    this._activeSignal = null;
    this._timeoutId = null;
  }
}

export default ActionGuard;
