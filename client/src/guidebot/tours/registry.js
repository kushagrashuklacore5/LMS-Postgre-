// Portal-agnostic in-memory registry for tour configs. Register / get /
// list / remove only — no Admin- or Super Admin-specific behavior. Portal
// filtering (listTours({ portal })) works off the generic `portal` metadata
// field from schema.js, it does not hardcode any portal name.

import { normalizeTour } from './schema';

const tours = new Map();

/**
 * Validates, normalizes, and registers a tour.
 * Throws TourValidationError (from schema.js) if the config is invalid, or
 * a plain Error if a tour with the same id is already registered.
 * @returns {object} the normalized tour that was registered
 */
export function registerTour(rawTour) {
  const normalized = normalizeTour(rawTour);
  if (tours.has(normalized.id)) {
    throw new Error(`GuideBot tour "${normalized.id}" is already registered.`);
  }
  tours.set(normalized.id, normalized);
  return normalized;
}

/** @returns {object|undefined} the normalized tour, or undefined if not found */
export function getTour(id) {
  return tours.get(id);
}

/**
 * @param {{ portal?: string }} [filter]
 * @returns {object[]} normalized tours, optionally filtered by portal
 */
export function listTours(filter = {}) {
  const all = Array.from(tours.values());
  if (!filter.portal) return all;
  return all.filter((tour) => tour.portal === filter.portal);
}

export function hasTour(id) {
  return tours.has(id);
}

/** Removes a tour from the registry. @returns {boolean} whether it existed */
export function unregisterTour(id) {
  return tours.delete(id);
}

/** Dev/testing utility — clears every registered tour. */
export function clearRegistry() {
  tours.clear();
}
