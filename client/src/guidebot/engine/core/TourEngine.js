// Portal-agnostic tour lifecycle owner. Contains no Admin/SuperAdmin logic,
// no route awareness, and no tour content — it only knows how to run
// whatever { id, steps } tour object it is given, one at a time.

import { createDriverAdapter } from './driverAdapter';
import StorageManager from './StorageManager';

export const TOUR_STATES = Object.freeze({
  IDLE: 'idle',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
});

class TourEngine {
  constructor() {
    this._state = TOUR_STATES.IDLE;
    this._tour = null;
    this._adapter = null;
    this._currentStepIndex = 0;
    this._listeners = new Set();
    this._isInternalTeardown = false;
  }

  getState() {
    return this._state;
  }

  getActiveTourId() {
    return this._tour ? this._tour.id : null;
  }

  /**
   * @param {(state: string, tourId: string|null) => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * @param {{ id: string, steps: import('driver.js').DriveStep[], driverConfig?: object }} tour
   * @param {{ resume?: boolean }} [options]
   * @returns {boolean} whether the tour actually started
   */
  start(tour, options = {}) {
    if (!tour || typeof tour.id !== 'string' || !Array.isArray(tour.steps)) {
      throw new Error('TourEngine.start requires a tour object with an id and a steps array.');
    }

    const sameTourAlreadyRunning =
      this._tour &&
      this._tour.id === tour.id &&
      (this._state === TOUR_STATES.ACTIVE || this._state === TOUR_STATES.PAUSED);
    if (sameTourAlreadyRunning) return false;

    if (this._state === TOUR_STATES.ACTIVE || this._state === TOUR_STATES.PAUSED) {
      this.stop();
    }

    const startStepIndex = options.resume ? this._readSavedStepIndex(tour.id) : 0;

    this._tour = tour;
    this._currentStepIndex = startStepIndex;
    this._adapter = this._createAdapterForCurrentTour();
    this._adapter.start(startStepIndex);
    this._persist(TOUR_STATES.ACTIVE);
    this._setState(TOUR_STATES.ACTIVE);
    return true;
  }

  /**
   * Replaces the presented step of the active tour without tearing down the
   * Driver.js instance, so consecutive steps read as one continuous
   * walkthrough (the spotlight moves rather than disappearing and
   * reopening). Returns false — leaving everything untouched — when there
   * is no active tour to transition within; callers then fall back to a
   * normal stop() + start().
   * @param {{ id: string, steps: import('driver.js').DriveStep[] }} tour
   * @returns {boolean}
   */
  transition(tour) {
    if (this._state !== TOUR_STATES.ACTIVE || !this._adapter) return false;
    if (!tour || !Array.isArray(tour.steps) || tour.steps.length === 0) return false;
    this._tour = tour;
    this._currentStepIndex = 0;
    this._adapter.transitionTo(tour.steps[0]);
    return true;
  }

  pause() {
    if (this._state !== TOUR_STATES.ACTIVE || !this._adapter) return false;
    this._syncStepIndexFromAdapter();
    this._teardownAdapter();
    this._persist(TOUR_STATES.PAUSED);
    this._setState(TOUR_STATES.PAUSED);
    return true;
  }

  resume() {
    if (this._state !== TOUR_STATES.PAUSED || !this._tour) return false;
    this._adapter = this._createAdapterForCurrentTour();
    this._adapter.start(this._currentStepIndex);
    this._persist(TOUR_STATES.ACTIVE);
    this._setState(TOUR_STATES.ACTIVE);
    return true;
  }

  /** Marks the active tour finished. Callers decide when "finished" means. */
  complete() {
    if (this._state === TOUR_STATES.IDLE || this._state === TOUR_STATES.COMPLETED) return false;
    const tourId = this.getActiveTourId();
    this._syncStepIndexFromAdapter();
    this._teardownAdapter();
    if (tourId) this._persist(TOUR_STATES.COMPLETED, tourId);
    this._setState(TOUR_STATES.COMPLETED);
    this._tour = null;
    this._currentStepIndex = 0;
    return true;
  }

  /** Cancels the active/paused tour without marking it completed. */
  stop() {
    if (this._state === TOUR_STATES.IDLE) return false;
    this._teardownAdapter();
    this._tour = null;
    this._currentStepIndex = 0;
    this._setState(TOUR_STATES.IDLE);
    return true;
  }

  /** Full teardown for unmount — also clears subscribers. */
  destroy() {
    this._teardownAdapter();
    this._listeners.clear();
    this._tour = null;
    this._currentStepIndex = 0;
    this._state = TOUR_STATES.IDLE;
  }

  // --- internals ---

  _createAdapterForCurrentTour() {
    const tour = this._tour;
    return createDriverAdapter({
      ...tour.driverConfig,
      steps: tour.steps,
      onDestroyed: (...args) => {
        this._handleAdapterDestroyed();
        tour.driverConfig?.onDestroyed?.(...args);
      },
    });
  }

  _teardownAdapter() {
    if (!this._adapter) return;
    this._isInternalTeardown = true;
    this._adapter.destroy();
    this._adapter = null;
    this._isInternalTeardown = false;
  }

  _syncStepIndexFromAdapter() {
    if (!this._adapter) return;
    const index = this._adapter.getActiveIndex();
    if (typeof index === 'number') this._currentStepIndex = index;
  }

  /** Driver.js tore itself down outside our control (Escape key, overlay click, etc). */
  _handleAdapterDestroyed() {
    if (this._isInternalTeardown) return;
    if (this._state === TOUR_STATES.ACTIVE || this._state === TOUR_STATES.PAUSED) {
      this._adapter = null;
      this.stop();
    }
  }

  _persist(status, tourIdOverride) {
    const tourId = tourIdOverride || this.getActiveTourId();
    if (!tourId) return;
    StorageManager.setTourState(tourId, { status, currentStepIndex: this._currentStepIndex });
  }

  _readSavedStepIndex(tourId) {
    const saved = StorageManager.getTourState(tourId);
    return saved && typeof saved.currentStepIndex === 'number' ? saved.currentStepIndex : 0;
  }

  _setState(next) {
    this._state = next;
    const tourId = this.getActiveTourId();
    this._listeners.forEach((listener) => {
      try {
        listener(this._state, tourId);
      } catch (_error) {
        // A misbehaving subscriber must never break the engine.
      }
    });
  }
}

export default TourEngine;
