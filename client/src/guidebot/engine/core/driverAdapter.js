// The ONLY module in GuideBot allowed to import 'driver.js' directly.
// TourEngine talks to Driver.js exclusively through createDriverAdapter() so
// the vendor library stays swappable and nothing outside engine/core ever
// touches it.

import { driver as createDriverInstance } from 'driver.js';
import 'driver.js/dist/driver.css';
// GuideBot's own visual skin, layered on top of the line above — see
// engine/styles/guidebotPopover.css for why import order matters here.
import '../styles/guidebotPopover.css';

/**
 * @param {import('driver.js').Config} config - forwarded as-is to Driver.js.
 * @returns {{
 *   start: (stepIndex?: number) => void,
 *   transitionTo: (step: import('driver.js').DriveStep) => void,
 *   destroy: () => void,
 *   getActiveIndex: () => number | undefined,
 *   isActive: () => boolean,
 * }}
 */
export function createDriverAdapter(config) {
  const instance = createDriverInstance(config);

  return {
    start(stepIndex = 0) {
      instance.drive(stepIndex);
    },
    /**
     * Swaps the presented step on the already-active Driver.js instance so
     * the spotlight glides from the previous target to the new one instead
     * of the overlay being torn down and rebuilt. Only valid while active.
     */
    transitionTo(step) {
      instance.setConfig({ ...instance.getConfig(), steps: [step] });
      instance.drive(0);
    },
    destroy() {
      try {
        instance.destroy();
      } catch (_error) {
        // Driver.js may already be torn down (e.g. the user closed it) — ignore.
      }
    },
    getActiveIndex() {
      return typeof instance.getActiveIndex === 'function' ? instance.getActiveIndex() : undefined;
    },
    isActive() {
      return typeof instance.isActive === 'function' ? instance.isActive() : false;
    },
  };
}
