# LMS i18n Live Browser QA Report

Status: **IN PROGRESS.** The announcements security fix, the backend fixes and the Student portal × 20 languages are verified. The other six portals are **NOT TESTED** because no further manual logins were done.
Last updated: 23 October 2026
Tester: Claude Code, driving a **visible (headed) Google Chrome** window through the Chrome DevTools MCP server. All logins were done manually by the user; the tester never saw or typed credentials.
App under test:

- Frontend: `http://localhost:5173` (Vite dev server, PID 14096, hot reload).
- Backend: `http://localhost:5002`. With the user's approval, the old process (PID 5256, started 21 Oct) was stopped on 23 Oct and `node server.js` was started again from `server/` (new PID 13780). Its logs go to the session scratchpad.

Status legend:

- **PASS**: verified working.
- **FAIL**: verified broken.
- **BLOCKED**: could not run because of an external dependency.
- **NOT TESTED**: not exercised in this pass.
- **OUT OF SCOPE**: excluded by the product owner.

## 0. Scope

**The public landing page (`/`) is OUT OF SCOPE**, per the product owner on 23 Oct 2026.

- It has about 95 hard-coded English marketing strings below the hero: role showcase, pricing, features and footer.
- These were not fixed and are not counted as failures.
- The landing hero stays English by design.

## 1. Announcements security (priority 1): FIXED and PASS

**Finding:** without logging in, `GET /api/announcements` returned **200 with 5 announcements**. Four were *Fee Payment Reminder* notices addressed to named students ("Dear <name>, …") with fee amounts. This was confirmed on the old backend before the fix, counting items only.

**Root cause:**

1. `server/middleware/authMiddleware.js` turns a missing, invalid or expired token into `req.user = { userId: null, role: "guest" }` and continues to the route handler instead of rejecting the request.
2. `getAllAnnouncements` (`server/controllers/announcementController.js`) only adds a role filter for `student` and `mentor`. Every other role, including `guest`, fell through to the unfiltered "admin" query for `university_id = 1`.
   - `accountant`, `storekeeper` and `superadmin` users could likewise read every student's fee reminders.
3. `POST /api/announcements` also accepted guests.

**Fix:** targeted, deny-by-default. The shared `authMiddleware` is unchanged because other routes depend on its behaviour.

- `server/routes/announcementRoutes.js`:
  - A new `requireAuthenticatedUser` guard, placed after `authMiddleware`, returns **401** when there is no verified user (guest or null `userId`). It applies to GET, POST, DELETE and PUT `/:id/read`.
  - POST now also requires `roleMiddleware(["admin","mentor"])`, matching the route's documented intent.
  - Fee reminders are created server-side in `classroomRoutes.js`, not through this endpoint, so they are unaffected.
- `server/controllers/announcementController.js`:
  - Any role other than admin, student or mentor now gets only whole-audience broadcasts: `publishFor = 'both' AND targetUserId IS NULL` and not a fee reminder.
  - Admin, student and mentor behaviour is unchanged.

**Verification:**

| Request | Before | After |
|---|---|---|
| Live backend, no token | 200, 5 items, 4 fee reminders | **401** |
| Live backend, forged token `a.b.c` | 200 (guest) | **401** |
| Isolated harness (real router, real DB, read-only GETs): expired token | not tested before | **401** |
| No-token POST | accepted | **401** |
| Accountant POST | accepted | **403** |
| Admin | 5 items | 5 items (unchanged) |
| Student | own announcements | 2 items: 1 broadcast, plus 1 fee reminder that is addressed to **that** student (1 of 4 reminders) |
| Mentor | own audience | unchanged |
| Accountant, storekeeper, superadmin | all 5, including 4 fee reminders | 0 (no broadcasts exist) |
| Student portal in the browser, after the fix | | Bell and announcements page load: 200, 0 items for this student (university 20); no errors |

**Wider check:** all 51 `GET` routes that use the same `authMiddleware` were probed without a token on the live server.

- Only 4 return 200:
  - `/api/subscriptions/current`: default plan metadata, no personal data.
  - `/api/superadmin/internal/test`: a test message.
  - `/api/courses` and `/api/attendance/student`: empty arrays.
- No other personal-data leak was found.
- The guest fallback itself remains a design risk (see §8).

## 2. Backend fixes (priority 2): PASS after the approved restart

| Fix | Verification after restart | Result |
|---|---|---|
| CORS: `X-Language` added to `Access-Control-Allow-Headers` (`server/server.js`); no origins widened | Preflight from `http://localhost:5173` lists `X-Language` with that exact origin. A preflight from `https://evil.example` gets **no** `Access-Control-Allow-Origin`. In the browser, `GET /api/user/language-preference` (sent with `x-language`) succeeds. | **PASS** |
| Language preference API (`server/routes/userLanguageRoutes.js`): uses `userId` and the default DB, validates codes | Without a token, GET and POST return 401. Logged in as Student: GET returns 200 `{"language":null}`; selecting Kashmiri POSTs and gets 200; GET then returns `ks-IN`. Direct POST then GET for ur-IN, gu-IN and sat-IN all round-trip. | **PASS** |
| Socket.IO URL (`client/src/auth/auth.jsx`) | Connects to `localhost:5002`; the server log shows "Socket connected". | **PASS** |
| **New:** two more Socket.IO clients also connected to the Vite origin (`localhost:5173/socket.io`, polling every few seconds): `AnnouncementBell.jsx` (computed `socketUrl` but never passed it) and `MentorCourseDetails.jsx` (`io({...})` with no URL) | Both now pass the backend URL. After the fix, the student page polls only `localhost:5002/socket.io`, with no requests to `5173/socket.io`. `MentorCourseDetails` was not exercised in the browser. | **PASS** (bell) / **NOT TESTED** (mentor page) |

## 3. Student portal × 20 languages (priority 3)

**Bugs found:**

- The student portal was mostly hard-coded English in every language. For example, the dashboard showed only 10 of 101 text nodes in the native script.
- The sidebar rendered `item.label` / `item.description` literals even though `nameKey` translation keys existed.

**Fix:** literals were replaced with `t()` keys in the following files. Existing keys were reused where the English matched, and 182 new keys were added and translated for all 19 non-English locales. Each file was validated for tokens, native script and foreign script before writing.

- `components/StudentLayout.jsx`
- `pages/student/Student-Dashboard.jsx`
- `pages/student/Courses.jsx`
- `pages/student/PayFees.jsx`: visible UI and toasts. The generated PDF invoice stays in English.
- `pages/assessment-agent/StudentTests.jsx`
- `pages/assessment-agent/StudentAssignments.jsx`
- `pages/assessment-agent/StudentReportNotifications.jsx`
- `pages/assessment-agent/assignmentUi.jsx`:
  - The status badge translates its known labels.
  - `dueText(iso, t)` returns translated text only when the caller passes `t`.
- `calendar/CalendarPage.jsx`:
  - FullCalendar gets `locale`, `direction` and translated `buttonText`.
- `calendar/CalendarSidebar.jsx`, `calendar/CalendarHeader.jsx`

**Re-test method (visible Chrome):**

- The language was switched with the real selector inside the portal, for all 20 languages.
- The routes `/student/dashboard`, `/student/courses`, `/student/assessment-agent/tests`, `/student/assessment-agent/assignments`, `/student/results`, `/student/attendance`, `/student/calendar` and `/student/pay-fees` were swept without a reload; an in-page marker confirmed no reload happened.

**Results:**

| Check | Result |
|---|---|
| `lang`/`dir` correct for every language (ur and ks are `rtl`) | **PASS**, 20/20 |
| Stored preference = selected language; no page reload on switch | **PASS**, 20/20. The first Gujarati click missed the option once; a re-run passed. |
| Script font applied (Devanagari, Bengali, Telugu, Tamil, Gujarati, Kannada, Malayalam, Gurmukhi, Oriya, Nastaliq, Ol Chiki) | **PASS**, 20/20 |
| Raw translation keys visible | **PASS**: 0 on every route and language |
| Dashboard native-script text | 10/101 before → **80–81/101** after |
| Remaining English on the student routes | **Expected:** user data (student and teacher names, course, test, assignment and classroom titles, subject names, server-generated report text, payment IDs) |
| FullCalendar month and day names | **PASS** where Chrome has locale data. **Limitation:** the "October 2026" title stays English in or, as, sa, ks, mni, brx and sat because Chrome's `Intl` has no month names for those locales. |

## 4. RTL (Urdu, Kashmiri)

| Issue found in the portal | Fix | Result |
|---|---|---|
| Sidebar stayed pinned left in RTL and the content did not mirror | `StudentLayout.jsx`: `rtl:right-0` on the sidebar; `rtl:` margin variants on the main column; collapsed tooltip mirrored | **PASS**: sidebar at x = 1447–1703 of 1702, main at 0–1447. Evidence: `retest_student_dashboard_ur-IN.png` |
| Nastaliq headings collided with neighbouring lines because of Latin `leading-tight` | `index.css`: line-height 1.8 for headings and `.leading-*-tight` classes under `:lang(ur)` / `:lang(ks)` | **PASS** (visual) |
| Quote-card decoration covered right-aligned text | `rtl:` flip on the decorative SVG | **PASS** (visual) |
| Chatbot launcher (fixed bottom-right) covered the RTL sidebar's collapse and logout buttons | `LMSChatbot.jsx`: `rtl:left-6`, window anchored left | Code change applied; **NOT re-screenshotted** |
| Other portals' layouts (Mentor, Admin, Accountant, SuperAdmin, Vendor) use the same `fixed left-0` sidebar pattern | not changed | **NOT TESTED** |

## 5. Other LMS functionality (Student portal)

| Area | Result |
|---|---|
| Language persistence: select (POST) → reload → same language | **PASS**: Urdu kept after reload |
| Login restore: clear local storage → reload → language restored from server | **PASS**: ks-IN restored, RTL applied |
| Language persistence anomaly | Once, after a reload that timed out during file edits, the UI came back in Bengali, which the server had stored. It was **not reproduced** in three later attempts; every switch sent exactly one POST that saved correctly. Recorded as unexplained and unconfirmed. |
| Expired session: an unsigned test token with a past `exp` was placed in storage and the page reloaded | **PASS**: session cleared and redirected to `/login`; language kept. The user's real session was restored afterwards and the token was never printed. |
| Announcements page and bell | **PASS**: 200, correct empty state for this student. `/announcements` renders without the portal layout (this predates the fixes). |
| Console errors on Student routes after the fixes | **PASS**: none |
| Failed network requests (≥400) on Student routes after the fixes | **PASS**: none |
| Forms | Only the read-only search box and pay-fees modal were exercised. **No payment was made.** |

## 6. Automated checks (23 Oct 2026, final run)

| Command | Result |
|---|---|
| `npm run verify:i18n` (client) | **PASS**: 140/140 files, key parity, 0 unresolved code keys, registry checks |
| `node scripts/check_i18n_quality.js` (new) | **FAIL**: 144 problems (see below). 0 foreign-script values. All 182 keys added in this pass are translated in every locale. |
| `node --test src/components/Chatbot/ src/utils/` | **PASS**: 56/56, including 5 `jwtExpiry` tests |
| `npx vite build --outDir <scratchpad>/dist` | **PASS**: 3471 modules in 51 s. The existing >500 kB chunk warning remains. Built to a temp folder so the tracked `client/dist` was not overwritten. |
| Announcements authorization harness (`scratchpad/ann_authz_test.js`, real router and DB, read-only) | **PASS**: see §1 |

**Quality-gate failures: concurrent work.**

- During this pass, `pages/mentor/CreateAssessment.jsx` (10:24) and `pages/mentor/ClassResults.jsx` (10:25) were edited outside this session, and all `common.json` files were rewritten at 11:14 to add `term`. That outside write kept this session's changes.
- Those edits now reference 11 keys that are still English in the 13 Tier-2 locales, which gives 143 of the 144 problems:
  - `common:subjects`
  - `forms:create_assessment_title`, `assessment_title`, `start_date_time`, `end_date_time`, `assessment_created`, `failed_to_create_assessment`, `add_subject`, `subject_name`, `comments`, `optional_comments`
- They were left alone to avoid overwriting in-progress work.

## 7. Coverage matrix

| Area | en | hi | 17 other Indic | ur / ks (RTL) |
|---|---|---|---|---|
| Public `/` landing below the hero | OUT OF SCOPE | OUT OF SCOPE | OUT OF SCOPE | OUT OF SCOPE |
| Public `/login`, `/register` | PASS | PASS | PASS | PASS |
| Announcements authorization | PASS (role-independent) | | | |
| CORS `X-Language` / language API / socket | PASS (language-independent) | | | |
| Student: navigation, dashboard, courses, tests, assignments, results, attendance, pay-fees | PASS | PASS | PASS (user data stays as entered) | PASS |
| Student: calendar | PASS | PASS | PASS / limitation for or, as, sa, mni, brx, sat month names | PASS (ur) / limitation (ks) |
| Student: persistence, restore, expired session | PASS | PASS | PASS (sampled: bn, gu, sat, mr) | PASS |
| Mentor portal | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Admin portal | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| SuperAdmin portal | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Accountant portal | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Storekeeper portal | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Vendor portal | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

Expected issues in the untested portals, based on a static scan:

- About 2,500 hard-coded UI literals across the portal pages, mostly in mentor, assessment-agent, accountant, admin and superadmin. Expect the same English-in-every-language problem the Student portal had.
- The same left-pinned sidebar in RTL.

## 8. Remaining risks and limitations

- **Guest fallback in `authMiddleware`:** a missing or invalid token becomes a `guest` user instead of a 401. Announcements are now guarded, and the probe found no other personal-data leak today, but any new route using this middleware is unauthenticated by default.
  - Recommendation: make 401 the default and opt routes in to guest access explicitly. This was not changed here because it affects every route.
- **The JWT secret falls back to a hard-coded default** in `authMiddleware.js` when `JWT_SECRET` is unset. Not changed.
- **Wildcard CORS:** a manual CORS middleware in `server/server.js` still sends `Access-Control-Allow-Origin: *` alongside credentials headers. The `cors()` middleware answers first, so behaviour is correct, but it should be removed. Not changed.
- **Translation quality:** all translations are AI-generated and unverified by native speakers.
  - Lowest confidence: Santali, Bodo, Manipuri (Bengali script, per the registry), Kashmiri, Konkani and Sanskrit.
  - 574 legacy keys per Tier-2 locale that no source file references are still English; they are not user-visible.

## 9. Files changed in this pass

**Server:**

- `server/routes/announcementRoutes.js`
- `server/controllers/announcementController.js`
- Earlier in this task: `server/server.js` (CORS) and `server/routes/userLanguageRoutes.js`

**Client code:**

- `src/components/AnnouncementBell.jsx`, `src/pages/mentor/MentorCourseDetails.jsx`: socket URL
- `src/components/StudentLayout.jsx`
- `src/pages/student/Student-Dashboard.jsx`, `Courses.jsx`, `PayFees.jsx`
- `src/pages/assessment-agent/StudentTests.jsx`, `StudentAssignments.jsx`, `StudentReportNotifications.jsx`, `assignmentUi.jsx`
- `src/calendar/CalendarPage.jsx`, `CalendarSidebar.jsx`, `CalendarHeader.jsx`
- `src/components/Chatbot/LMSChatbot.jsx`
- `src/index.css`

**Locales:**

- 182 keys in `navigation`, `common` and `dashboard` across all 20 locales.
- `ne-IN/common.json`: `superadmin_dashboard` corruption fixed.

**New tests and tooling:**

- `client/src/utils/jwtExpiry.test.js`
- `client/scripts/check_i18n_quality.js`

Evidence: `docs/qa-evidence/i18n-live/retest_student_dashboard_ur-IN.png`, `retest_public_home_ur-IN.png` and `retest_public_home_sat-IN.png`. The per-language JSON sweep results are in the session scratchpad.

## 10. Next steps

1. Log in manually as Mentor, Admin, SuperAdmin, Accountant, Storekeeper and Vendor. For each portal: sweep its routes × 20 languages, apply the same layout RTL fix, and move each portal's literals to keys.
2. Translate the 11 keys referenced by the in-progress mentor edits, once that work is finished.
3. Decide on making the `authMiddleware` default a 401.
