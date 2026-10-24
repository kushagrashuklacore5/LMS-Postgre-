// Observes the browser's current route (pathname/search/hash) using only
// native browser APIs — no react-router dependency, so this stays usable by
// every portal regardless of how its layout is wired.
//
// react-router's BrowserRouter calls the real window.history.pushState /
// replaceState under the hood, but neither of those fire any native event.
// The only non-invasive way to observe them without a router dependency is
// to wrap them with a pass-through hook that preserves the original
// behavior and return value, then restore the originals once nobody is
// listening anymore. popstate/hashchange (back/forward, hash-only edits)
// are covered natively.

let listeners = new Set();
let currentRoute = readLocation();
let patched = false;
let originalPushState = null;
let originalReplaceState = null;

function readLocation() {
  if (typeof window === 'undefined' || !window.location) {
    return { pathname: '', search: '', hash: '' };
  }
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash };
}

function isSameRoute(a, b) {
  return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
}

function notify() {
  const next = readLocation();
  if (isSameRoute(currentRoute, next)) return;
  currentRoute = next;
  listeners.forEach((listener) => {
    try {
      listener(currentRoute);
    } catch (_error) {
      // A misbehaving subscriber must never break the others.
    }
  });
}

function patch() {
  if (patched || typeof window === 'undefined' || !window.history) return;

  originalPushState = window.history.pushState;
  originalReplaceState = window.history.replaceState;

  window.history.pushState = function guidebotPushState(...args) {
    const result = originalPushState.apply(this, args);
    notify();
    return result;
  };
  window.history.replaceState = function guidebotReplaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    notify();
    return result;
  };

  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  patched = true;
}

function unpatchIfUnused() {
  if (!patched || listeners.size > 0) return;

  if (originalPushState) window.history.pushState = originalPushState;
  if (originalReplaceState) window.history.replaceState = originalReplaceState;
  window.removeEventListener('popstate', notify);
  window.removeEventListener('hashchange', notify);

  patched = false;
  originalPushState = null;
  originalReplaceState = null;
}

/** @returns {{ pathname: string, search: string, hash: string }} */
export function getCurrentRoute() {
  return readLocation();
}

/**
 * @param {(route: { pathname: string, search: string, hash: string }) => void} listener
 * @returns {() => void} unsubscribe — restores the native history methods
 *   once the last subscriber is gone.
 */
export function subscribeToRoute(listener) {
  if (typeof listener !== 'function' || typeof window === 'undefined') return () => {};

  patch();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    unpatchIfUnused();
  };
}
