// Waits for a tour target element to exist in the DOM without continuous
// polling: checks immediately, then falls back to a bounded MutationObserver
// + timeout. Never resolves the promise more than once and always tears
// down its own observer/timer, whether it finds the element, times out, or
// is explicitly cancelled.

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * @param {string} selector - CSS selector for the target element.
 * @param {{ timeout?: number, root?: Document | Element, ignoreElement?: Element | null }} [options]
 *   ignoreElement: a node that matches the selector but must not count as
 *   found — used right after a navigation click, when the page being left
 *   may still be in the DOM for a moment and would otherwise be matched.
 * @returns {{ promise: Promise<Element|null>, cancel: () => void }}
 *   promise resolves with the element, or null if it never appeared in time
 *   (or the wait was cancelled) — it never rejects.
 */
export function waitForElement(selector, options = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, root = document, ignoreElement = null } = options;

  let observer = null;
  let timeoutId = null;
  let settled = false;
  let resolvePromise = () => {};

  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const settle = (result) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(result);
  };

  const check = () => {
    const element = root.querySelector(selector);
    if (element && element !== ignoreElement) settle(element);
  };

  check();

  if (!settled) {
    const observedNode = root === document ? document.documentElement : root;
    if (typeof MutationObserver !== 'undefined' && observedNode) {
      observer = new MutationObserver(check);
      observer.observe(observedNode, { childList: true, subtree: true });
    }
    timeoutId = setTimeout(() => settle(null), timeout);
  }

  return { promise, cancel: () => settle(null) };
}
