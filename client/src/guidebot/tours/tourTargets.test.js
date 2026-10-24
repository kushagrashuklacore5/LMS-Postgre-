// Run: node --test src/guidebot/tours/tourTargets.test.js   (from client/)
//
// A GuideBot step whose target never appears waits forever (GuideBotRuntime._presentStepCore keeps
// re-checking on route changes), so the walkthrough silently stops there. This happened to the admin
// tour after step 8 when the "Database Export" sidebar item was removed but its tour step was not.
// Every sidebar step (target data-tour="nav-...") must point at an item of that portal's sidebar,
// unless the step is explicitly optional (skipIfMissing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');

const PORTALS = {
  admin: 'components/AdminLayout.jsx',
  mentor: 'components/MentorLayout.jsx',
  superadmin: 'components/SuperAdminLayout.jsx',
  student: 'components/StudentLayout.jsx',
};

/** [{ id, optional }] for every step that targets a nav-* item. */
function navSteps(tourSource) {
  const parts = tourSource.split(/(?=target:\s*['"`])/);
  return parts.slice(1).flatMap((part) => {
    const m = part.match(/^target:\s*['"`]\[data-tour="(nav-[^"]+)"\]/);
    if (!m) return [];
    const stepText = part.split(/\n\s*\},\s*\n/)[0];
    return [{ id: m[1], optional: /skipIfMissing/.test(stepText) }];
  });
}

for (const [portal, layoutFile] of Object.entries(PORTALS)) {
  const layout = read(layoutFile);
  const sidebarIds = new Set([
    ...[...layout.matchAll(/tourId:\s*['"](nav-[^'"]+)['"]/g)].map((m) => m[1]),
    ...[...layout.matchAll(/data-tour=["'](nav-[^"']+)["']/g)].map((m) => m[1]),
  ]);
  for (const tourFile of ['overviewTour.js', 'onboardingTour.js']) {
    const file = `guidebot/tours/${portal}/${tourFile}`;
    if (!fs.existsSync(path.join(src, file))) continue;
    test(`${portal} ${tourFile}: every required sidebar step has its sidebar item`, () => {
      const missing = navSteps(read(file)).filter((s) => !s.optional && !sidebarIds.has(s.id)).map((s) => s.id);
      assert.deepEqual(missing, [], `${file} highlights sidebar items that ${layoutFile} does not render`);
    });
  }
}

test('the admin overview tour still reaches Database Export (step 9)', () => {
  const steps = navSteps(read('guidebot/tours/admin/overviewTour.js')).map((s) => s.id);
  assert.ok(steps.includes('nav-database-export'));
  assert.match(read(PORTALS.admin), /tourId:\s*'nav-database-export'/);
});
