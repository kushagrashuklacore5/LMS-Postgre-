// Waits for a tour-step target element, built on top of DOMGuard. Adds one
// capability DOMGuard doesn't have on its own: an optional "watch" mode that
// re-runs the bounded wait whenever the route changes (via RouteGuard),
// guaranteeing at most one active MutationObserver/timeout at a time and
// leaking neither across repeated route changes nor after stop().

import { waitForElement } from './DOMGuard';
import { subscribeToRoute } from './RouteGuard';

class TargetGuard {
  constructor() {
    this._pending = null; // the { promise, cancel } currently in flight, if any
    this._unsubscribeRoute = null;
    this._stopped = true;
    this._removalObserver = null;
    this._presenceObserver = null;
  }

  /**
   * One-shot wait for `selector`. Cancels any wait already in flight on this
   * instance first. Does not react to route changes — use watch() for that.
   * @returns {{ promise: Promise<Element|null>, cancel: () => void }}
   */
  waitFor(selector, options = {}) {
    this._cancelPending();
    const guard = waitForElement(selector, options);
    this._pending = guard;
    guard.promise.finally(() => {
      if (this._pending === guard) this._pending = null;
    });
    return guard;
  }

  /**
   * Waits for `selector`, automatically starting a fresh bounded wait every
   * time the route changes, until it's found or stop() is called.
   *
   * @param {string} selector
   * @param {{
   *   timeout?: number,
   *   root?: Document | Element,
   *   ignoreElement?: Element | null,
   *   onFound?: (element: Element) => void,
   *   onTimeout?: () => void,
   * }} [options]
   * @returns {() => void} stop — idempotent, safe to call multiple times
   */
  watch(selector, options = {}) {
    this.stop();
    this._stopped = false;
    const { timeout, root, ignoreElement, onFound, onTimeout } = options;

    const runOnce = () => {
      if (this._stopped) return;
      const guard = this.waitFor(selector, { timeout, root, ignoreElement });
      guard.promise.then((element) => {
        if (this._stopped) return;
        // A newer wait (triggered by another route change) has already
        // superseded this one — ignore this stale result.
        if (this._pending !== null && this._pending !== guard) return;
        if (element) {
          onFound?.(element);
        } else {
          onTimeout?.();
        }
      });
    };

    runOnce();
    this._unsubscribeRoute = subscribeToRoute(() => {
      if (this._stopped) return;
      runOnce();
    });

    return () => this.stop();
  }

  /**
   * Calls onRemoved once when `element` leaves the document (a modal being
   * dismissed, say) — or, when `selector` is given, stops matching it (React
   * may reuse the same DOM node for the next view and merely change its
   * data-tour). Event-driven (one MutationObserver, no polling); at most one
   * removal watch per instance; torn down by stop() or stopRemovalWatch().
   * @returns {() => void} cancel — idempotent
   */
  watchRemoval(element, onRemoved, options = {}) {
    const { selector } = options;
    this.stopRemovalWatch();
    if (!element || typeof MutationObserver === 'undefined' || typeof document === 'undefined') {
      return () => {};
    }
    const isGone = () => {
      if (!element.isConnected) return true;
      if (!selector) return false;
      try {
        return !element.matches(selector);
      } catch (_error) {
        return false;
      }
    };
    const observer = new MutationObserver(() => {
      if (!isGone()) return;
      this.stopRemovalWatch();
      onRemoved?.();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      ...(selector ? { attributes: true, attributeFilter: ['data-tour'] } : {}),
    });
    this._removalObserver = observer;
    return () => this.stopRemovalWatch();
  }

  /**
   * Calls onPresent once when `selector` starts matching an element (a modal
   * the user opened, say). Unlike waitFor/watch there is no timeout — the user
   * decides when — but it is still event-driven (one MutationObserver, no
   * polling) and is torn down by stop() or stopPresenceWatch().
   * @returns {() => void} cancel — idempotent
   */
  watchPresence(selector, onPresent) {
    this.stopPresenceWatch();
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
    const found = () => {
      try {
        return document.querySelector(selector);
      } catch (_error) {
        return null;
      }
    };
    const observer = new MutationObserver(() => {
      const el = found();
      if (!el) return;
      this.stopPresenceWatch();
      onPresent?.(el);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tour'],
    });
    this._presenceObserver = observer;
    return () => this.stopPresenceWatch();
  }

  stopPresenceWatch() {
    if (this._presenceObserver) {
      this._presenceObserver.disconnect();
      this._presenceObserver = null;
    }
  }

  stopRemovalWatch() {
    if (this._removalObserver) {
      this._removalObserver.disconnect();
      this._removalObserver = null;
    }
  }

  /** Cancels any in-flight wait and any route subscription. Idempotent. */
  stop() {
    this._stopped = true;
    this.stopRemovalWatch();
    this.stopPresenceWatch();
    this._cancelPending();
    if (this._unsubscribeRoute) {
      this._unsubscribeRoute();
      this._unsubscribeRoute = null;
    }
  }

  _cancelPending() {
    if (this._pending) {
      this._pending.cancel();
      this._pending = null;
    }
  }
}

export default TargetGuard;
