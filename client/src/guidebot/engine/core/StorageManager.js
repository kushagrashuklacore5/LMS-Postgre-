// Namespaced localStorage access for GuideBot tour progress only.
//
// Never store tokens, passwords, credentials, form values, API responses, or
// any other business/application data here — GuideBot metadata only
// (tour status + current step index).

const STORAGE_PREFIX = 'core5_guidebot';

const ALLOWED_STATUSES = new Set(['idle', 'active', 'paused', 'completed']);

function buildKey(tourId) {
  return `${STORAGE_PREFIX}:${tourId}`;
}

function isLocalStorageAvailable() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const probeKey = `${STORAGE_PREFIX}:__probe__`;
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return true;
  } catch (_error) {
    // Private browsing quota, disabled storage, etc. — treat as unavailable.
    return false;
  }
}

function isValidState(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    ALLOWED_STATUSES.has(value.status) &&
    (value.currentStepIndex === undefined || typeof value.currentStepIndex === 'number')
  );
}

const StorageManager = {
  isAvailable: isLocalStorageAvailable,

  /**
   * Returns { status, currentStepIndex, updatedAt } for a tour, or null if
   * unavailable, missing, or malformed.
   */
  getTourState(tourId) {
    if (!tourId || !isLocalStorageAvailable()) return null;
    try {
      const raw = window.localStorage.getItem(buildKey(tourId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return isValidState(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  },

  /**
   * Persists { status, currentStepIndex } for a tour. Returns true on
   * success, false if storage is unavailable or the state shape is invalid.
   */
  setTourState(tourId, state) {
    if (!tourId || !isLocalStorageAvailable() || !isValidState(state)) return false;
    try {
      const payload = {
        status: state.status,
        currentStepIndex: typeof state.currentStepIndex === 'number' ? state.currentStepIndex : 0,
        updatedAt: Date.now(),
      };
      window.localStorage.setItem(buildKey(tourId), JSON.stringify(payload));
      return true;
    } catch (_error) {
      return false;
    }
  },

  clearTourState(tourId) {
    if (!tourId || !isLocalStorageAvailable()) return false;
    try {
      window.localStorage.removeItem(buildKey(tourId));
      return true;
    } catch (_error) {
      return false;
    }
  },
};

export default StorageManager;
