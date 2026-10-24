# engine/styles

GuideBot-specific style overrides layered on top of Driver.js's base
popover/overlay CSS (`driver.js/dist/driver.css`), so the tour UI matches
the app's existing Tailwind design tokens (see Phase 1 report, section J).

`guidebotPopover.css` is imported in `engine/core/driverAdapter.js`,
immediately after `driver.js/dist/driver.css` so its rules win the cascade
at equal specificity — the only file allowed to import `driver.js` is also
the only one that wires up its styling. It skins the popover (rounded
corners, shadow, typography, primary-colored Next button) and the
GuideBot-only Skip text-link injected by `GuideBotRuntime`. Driver.js is
used nowhere else in this app, so none of this reaches outside GuideBot.
