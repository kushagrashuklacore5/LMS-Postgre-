# MY LMS — Security Remediation Plan and Verification Matrix

**Source audit:** `docs/LMS_PRODUCT_AUDIT.md` (5 October 2026)
**Work done:** 12 October 2026, branch `security/critical-remediation` (not committed, not pushed)
**Baseline:** tag `pre-security-remediation-baseline` → commit `8946567` on `main`
**Companion documents:** `docs/security/SECURITY_FIXES_SIMPLE_HINGLISH.md` (plain-language log), `IMPLEMENTATION_WORK_LOG.md` → Work Log Entry 4

**Part 2 at the end of this document (sections 9 to 16) is the latest state**; where it differs from Part 1, Part 2 is current.

This document is the plan that was followed and the record of what was verified. It does not claim that every possible vulnerability is gone. It covers the audit's P0 findings, its P1 security and data-integrity findings, and a few lower-priority items the brief asked for by name. Section 6 lists what is still open.

---

## 1. Starting point

| Item | State before any change |
| --- | --- |
| Repository | `Lms_integration/`, branch `main`, clean working tree, remote `origin` on GitHub |
| Audit report | Found: `docs/LMS_PRODUCT_AUDIT.md`. `LMS_FEATURE_AND_NOTIFICATION_INVENTORY.md` and `LMS_WORKFLOW_GAP_REGISTER.md` do **not** exist in this repository |
| Professional work log | `IMPLEMENTATION_WORK_LOG.md` (three entries); continued as Entry 4 |
| `CLAUDE.md` | None in the repository |
| Local database | `server/data/lms_permanent.db` holds only the built-in demo seed (6 users, 2 fee structures). No real school data is on this machine. A copy was taken before work started |
| Server tests | `server/tests/notificationText.test.js`: 16 of 16 pass |
| Student Onboarding module tests | 343 of 343 pass |
| AI Assessment module tests | 432 pass, **93 cancelled** — the HTTP suites need `server/config/jwt.js` and `server/middleware/requireTenant.js`, which were missing from this copy of the server (already noted in the work log) |
| Client | Production build passes. `npm run lint` cannot run: the client has no ESLint configuration file |

### Baseline reproduction

The untouched baseline was started from a separate git worktree with its own empty database, and the audit's attacks were sent to it. Result at commit `8946567`:

| Finding | Attack | Baseline result |
| --- | --- | --- |
| SEC-001 | Read user 1 with no login | 200, response contains the password hash |
| SEC-003 | List users with no login | 200, users with password hashes |
| SEC-002 | Delete a vendor with no login | 200, record deleted |
| SEC-004 | Hand-written `superadmin-<base64>` token | 200, accepted as superadmin |
| SEC-006 | Log in as `admin@gmail.com` with no password | 200, token issued |
| SEC-007 | Token signed with the secret printed in `.env.example` | 200, accepted |
| SEC-013 | Read the subscription with no login | 200 |
| SEC-016 | `/api/superadmin/internal/debug` | 200, echoes request headers |
| SEC-019 | Request from an unknown website | `Access-Control-Allow-Origin: *` |
| new | `POST /api/password-reset/send-otp`, no login | **The whole server process exits** (missing table, uncaught error) |

Three probes did not reproduce on a fresh database for unrelated reasons (the registration insert fails on a column that a fresh schema lacks; the generic `PUT /api/users/:id` is shadowed by an admin-only route; `test-upgrade` returned 500). They are still fixed and tested.

---

## 2. Design decisions

The audit's root cause is that each route was expected to protect itself, and most did not. Patching 300 routes one by one would leave the same gap for route 301. The approach was to put the protection in a few central places and let tests enumerate every route.

| Decision | Chosen | Alternative considered | Why |
| --- | --- | --- | --- |
| Where authentication is enforced | One gate on `/api`, before every router (`middleware/apiAccessGate.js`) reading one policy table (`config/accessPolicy.js`). A path with no rule is refused | Add `authMiddleware` to each unprotected route | A forgotten route is closed by default instead of open. The policy is one readable list |
| Who the caller is | The token is verified, then role and school are re-read from the database on every request | Trust the role and school inside the token for 7 days | A deleted user, a role change or a school change takes effect at once. It also removes the "default to school 1" fallback (49 places) |
| School isolation | `helpers/schoolScope.js` knows how each record type maps to a school. It checks every id in URL parameters (per router), in the query string and in the JSON body (in the gate) | Add a `WHERE university_id` to each handler by hand | Blocks "change the id in the request" on every route at once, including routes added later. Lists and dashboards were then fixed individually where tests found leaks |
| Relationship inside a school | Same helper: a student reaches only their own records, classrooms and courses; a teacher only the classrooms, courses and students they teach | School-level check only | The brief requires mentors not to reach unrelated classes and students |
| Generic CRUD router | Rewritten as read-only, school-scoped, fixed entity list. Generic create, update, delete, bulk and export removed | Add auth to the generic routes | The client does not use the generic writes (checked). Column and table names from the request cannot be made safe |
| Public registration | Off by default. An operator can enable it for one named school; accounts are student or mentor only and start unapproved | Keep it open with a fixed role | A self-registered account had no school. The audit recommends no public registration (Q4) |
| Whole-table export | Platform owner only, credential columns removed | Scope it per school | Scoping needs a per-table design. Closing it removes the exposure now; see section 6 |
| Legacy data without a school | Additive nullable column; rows without a school are hidden from school accounts; an operator script reports and assigns them after a backup | Assign everything to school 1 at start-up | The brief forbids inventing a school association |
| Tests | `node:test` (already used), real Express app started in-process on a temporary SQLite file | Add Jest and Supertest | No new dependency was needed |
| Dependencies added | None | | |

**Behaviour that changed on purpose** (each is a security decision, listed for whoever tests the UI):

1. A request without a valid session gets 401. There is no guest user.
2. Demo addresses need their real password. Login never creates an account.
3. An account with `isApproved = 0` cannot sign in or use an existing token.
4. `POST /api/auth/register` answers 403 unless `ALLOW_PUBLIC_REGISTRATION=true` and `PUBLIC_REGISTRATION_SCHOOL_ID` are set.
5. The superadmin login page now uses the real login API. The password that was written in the page's source no longer works.
6. `POST /api/subscriptions/test-upgrade` and the debug and test endpoints are gone. The "upgrade" buttons that called `test-upgrade` will show an error.
7. The admin "Database Export" and accountant export pages get 403 for school roles.
8. A paid plan needs a correct Razorpay signature and a captured payment. Without Razorpay keys the payment endpoints answer 503.
9. Password reset codes are valid for 10 minutes (the email said 1 minute but the old check kept them valid much longer), die after 5 wrong guesses, and are no longer returned in the API response or printed in the log.
10. Uploads accept a fixed list of file types and are stored under random names.
11. Attendance accepts `present` or `absent` only (the values the table allows) and only for students of that classroom.
12. Demo accounts and default fee structures are created only when `SEED_DEMO_DATA=true`, never in production.
13. The server will not start without a real `JWT_SECRET`. In production it also needs `JWT_REFRESH_SECRET` and `CORS_ORIGINS`.
14. Realtime (socket) events go only to signed-in sockets of the same school.

---

## 3. Phases

| Phase | Content | Status |
| --- | --- | --- |
| 0 | Discovery, baseline tests, data backup, baseline tag, work branch | Done |
| 1 | Foundations: isolated database path, JWT module, start-up configuration checks, strict session middleware, tenant middleware | Done |
| 2 | Deny-by-default API gate and access policy; route inventory (523 routes at baseline, 369 after removals: 16 public, 353 closed) | Done |
| 3 | Login, registration, demo accounts, password reset, rate limits | Done |
| 4 | Generic router rewrite; debug, bulk and export removal; SQL built from request values | Done |
| 5 | School isolation and ownership: central guard, per-router parameter guards, leaking lists | Done for the LMS core and fees; partly verified for procurement |
| 6 | Payments and subscriptions; secrets in source and tracked files | Done in code; credential rotation is a manual action |
| 7 | Uploads, CORS, sockets, logging, error responses | Done; authenticated file download is still open |
| 8 | Data integrity: start-up seeding, attendance, staged school-ownership migration | Done for the items listed; data-model findings remain open |
| 9 | Regression runs, client build, documentation | Done |

---

## 4. Verification matrix — audit P0 findings

Status values: **FIXED AND VERIFIED**, **FIXED BUT NOT FULLY VERIFIED**, **OPEN**, **BLOCKED**, **NOT APPLICABLE**.
Tests are under `server/tests/`. "Result" is from the run on 12 October 2026 (242 of 242 passed).

| ID | Finding | Root cause | Fix | Main files | Tests | Result | Status | Remaining |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | Generic routes readable with no login, including password hashes | Generic CRUD router with no middleware and `SELECT *` | Router rewritten read-only and school-scoped; password columns removed before a row is sent; everything behind the gate | `routes/universalRoutes.js`, `middleware/apiAccessGate.js` | `routeCoverage` (every non-public route → 401, all methods), `sensitiveData` (all GET routes × 6 roles) | Pass | FIXED AND VERIFIED | |
| SEC-002 | Update, delete, bulk insert with no login; column and table names from the request | Same router | Generic create, update, delete, `/bulk/:entity`, `/:entity/export` removed. The two result routes the client uses were rewritten with fixed SQL | `routes/universalRoutes.js` | `routeCoverage` (removed endpoints for every role; database unchanged), `sensitiveData` (injection strings) | Pass | FIXED AND VERIFIED | |
| SEC-003 | Missing or invalid token became a "guest"; school defaulted to 1 | `authMiddleware` fell through; `universityId \|\| 1` in 49 places | Strict middleware: 401; role and school from the database; all 49 fallbacks removed; a school role without a school gets 403 | `middleware/authMiddleware.js`, `middleware/apiAccessGate.js`, 10 files that carried the fallback | `authentication` (12 invalid-session cases, no default school) | Pass | FIXED AND VERIFIED | |
| SEC-004 | `superadmin-<base64>` token accepted without a signature | Special branch in `authMiddleware`; the client built this token itself | Branch deleted. Superadmin login page uses the real login | `middleware/authMiddleware.js`, `client/src/pages/superadmin/SuperAdminLogin.jsx` | `authentication`, `routeCoverage` (forged token on every route) | Pass | FIXED AND VERIFIED | Server side verified by tests; the changed login page was built but not clicked through in a browser |
| SEC-005 | Any role could be chosen at registration, auto-approved | Role and approval taken from the request | Registration off by default; when enabled: student or mentor, unapproved, one named school | `controllers/auth-controller.js` | `authentication` (6 privileged roles requested) | Pass | FIXED AND VERIFIED | |
| SEC-006 | Demo addresses logged in with no password; missing ones were created | Hard-coded blocks in login | Both blocks removed; password always required; same answer for unknown email and wrong password | `controllers/auth-controller.js`, `config/sqlite-db.js` | `authentication` (8 demo addresses × 4 password variants; no account created) | Pass | FIXED AND VERIFIED | Demo accounts already present in a production database keep their old password — see manual action 5 |
| SEC-007 | Placeholder JWT secret with a code fallback; Razorpay keys in source; mailbox password in tracked files; credential scripts | Fallback literals; credentials committed | No fallback anywhere; server refuses to start on a missing, placeholder or short secret; Razorpay keys from the environment only; mailbox password replaced by a placeholder in 6 tracked files; `.env.example` rewritten | `config/jwt.js`, `config/securityConfig.js`, `config/razorpay-config.js`, `controllers/subscription-controller.js` | `startup` (10 unsafe configurations), `hardening` (no credential literals in server source) | Pass | FIXED BUT NOT FULLY VERIFIED | The old values are in git history and on the remote. **They must be rotated by their owners** (section 7). About 18 one-off credential scripts in `server/` were left in place |
| SEC-008 | Reset code brute-forceable; no real rate limit | Attempts counted only on a correct code; limits of 600,000 per minute | Every guess counts, 5 maximum; code stored as a keyed hash; single use; expiry compared correctly; 10 requests per 15 minutes per address. Also found and fixed: the code was returned in the API response whenever `NODE_ENV` was not `production` | `services/otpService.js`, `controllers/passwordResetController.js`, `middleware/rateLimiter.js`, `services/emailService.js` | `passwordReset` (10 tests, mock mail) | Pass | FIXED AND VERIFIED | `check-cooldown` can still hint that an address recently requested a code (low) |
| SEC-009 | SQL built from URL values | `SELECT ${contentField}`, `SELECT * FROM ${entity}` | Fixed table and column map plus school check; export-by-URL removed | `routes/translationRoutes.js`, `routes/universalRoutes.js` | `sensitiveData` (injection probes), `routeCoverage` | Pass | FIXED AND VERIFIED | |
| SEC-010 | Schools not isolated | Most handlers never checked the school; most tables have no school column | Central guard for ids in URL, query and body; parameter guards on 18 routers; school filters added to the lists that leaked (transactions, fee statistics, student dashboard, accountant students, requirements, expenses, orders) | `helpers/schoolScope.js`, 18 route files, 8 controllers | `schoolIsolation` (53 direct-access URLs × 5 roles; every GET route × 5 roles with markers; 43 write attacks × 3 roles with a before/after snapshot), `dataIntegrity` (expenses, orders) | Pass | FIXED BUT NOT FULLY VERIFIED | Verified for the LMS core, fees, expenses, orders, requirements. **Not verified** for inventory, vendors, stock requests and vendor invoices: those tables are not created on a fresh database, so the tests had no rows to leak. Their routes are role-gated and reference the school column |
| REL-001 | `GET /api/accountant/fees-stats` stopped the server | Error thrown inside a database callback | Handler rewritten (also school-scoped); process-level handlers for uncaught errors; the similar crash in password reset fixed | `routes/accountantRoutes.js`, `server.js`, `services/otpService.js` | `hardening` (fee statistics per school, server still answers) | Pass | FIXED AND VERIFIED | |

---

## 5. Verification matrix — audit P1 security and data findings, and items named in the brief

| ID | Finding | Fix | Tests | Result | Status | Remaining |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-011 | Legacy assessments: answers visible to students; no ownership, window or enrolment checks | Answer key removed from student responses; submit requires published and inside the time window; enrolment and teacher ownership through the central guard; attempts lists staff only | `schoolIsolation` (answer key, other teacher's course), `hardening` (window, single attempt, server-side marking) | Pass | FIXED AND VERIFIED | Editing an assessment after students attempted it is still allowed (WF-010, P2) |
| SEC-012 | Missing ownership checks across the core | Teacher relationship rule in the central guard; attendance and results additionally check class membership; admin cannot assign or touch the platform-owner role | `schoolIsolation` (teacher and student sections), `authorization` (escalation), `dataIntegrity` | Pass | FIXED AND VERIFIED | |
| SEC-013 | Subscription and payment routes without login; "test upgrade" | Session required; role policy; `test-upgrade` and debug routes removed; signature and captured amount verified with the gateway; no mock orders; no hard-coded key | `authorization` (roles, gateway not configured, forged signatures), `routeCoverage` | Pass | FIXED AND VERIFIED | The plan-to-price list is still supplied by the client. The gateway amount must match the amount the client states, and the period is capped at 366 days, but a server-side price list is needed. A successful real payment was not exercised (no gateway calls in tests) |
| SEC-014 | Unsafe uploads; files served without login | One upload policy: allowed extension + declared type + first bytes must agree; random stored name; per-kind size limit; ids in multipart bodies checked; refused uploads removed; files served with `nosniff`, a sandbox policy and no directory listing | `uploads` (19 tests) | Pass | FIXED BUT NOT FULLY VERIFIED | **Open part:** a stored file can still be downloaded by anyone who has its URL (now an unguessable random name). Serving files only to signed-in users needs client changes. The 500 MB material limit was kept |
| SEC-015 | Whole-table export | Restricted to the platform owner; credential columns removed from every export path | `authorization`, `sensitiveData` | Pass | FIXED AND VERIFIED | A per-school export for admins is not built |
| SEC-016 | Debug and test endpoints | Removed (16 debug, test and demo-credential endpoints) | `routeCoverage` (29 removed paths × 6 roles) | Pass | FIXED AND VERIFIED | |
| SEC-017 | Socket accepted anyone and broadcast full rows | Sockets join rooms only after their token is verified; `req.io.emit` reaches the caller's school only; credential fields stripped; client sockets send the token | `hardening` (same school receives; other school, anonymous and forged sockets receive nothing) | Pass | FIXED AND VERIFIED | |
| SEC-018 | Password hashes in list responses | Removed at the generic reader; export stripped; verified across every GET route | `sensitiveData` | Pass | FIXED AND VERIFIED | |
| DATA-001 | Foreign keys not enforced | Opt-in switch `LMS_ENFORCE_FOREIGN_KEYS=true` added, off by default | None | — | OPEN | Turning it on before orphaned rows are reconciled would break writes. Needs a reconciliation pass first |
| DATA-002 | Enforcement differs per connection | Not changed | — | — | OPEN | Depends on DATA-001 |
| DATA-003 | Duplicate sources of truth (membership, class teacher, student count) | Not changed | — | — | OPEN | Data-model work |
| DATA-004 | Multi-step writes not transactional | Attendance marking is now one transaction | `dataIntegrity` (refused submission keeps the existing day; concurrent submissions) | Pass | OPEN (partly fixed) | Create student, assign students to a course and create course with auto-enrolment are still multi-step |
| DATA-005 | Attendance had no uniqueness rule and two writers | One writer; unique index on classroom, student, date (skipped with a warning if an old database has duplicates) | `dataIntegrity` | Pass | FIXED AND VERIFIED | |
| DATA-006 | Mixed student keys (`payments.studentId` vs `students.id`) | Not changed. Observed again while writing the tests | — | — | OPEN | Schema work |
| DATA-012 | "Fee structures deleted at start-up" (audit: P3, unverified) | **Not reproduced** in the current code: start-up only inserted defaults when the table was empty. That seeding (and the demo accounts) now runs only with `SEED_DEMO_DATA=true`, never in production | `startup` (3 restarts with byte-for-byte equal tables, production restart, removed fee structures stay removed, empty database stays empty) | Pass | FIXED AND VERIFIED | |
| SEC-019 | CORS wildcard with credentials | One explicit allow-list; local ports only outside production | `routeCoverage`, `startup` | Pass | FIXED AND VERIFIED | |
| SEC-020 | 7-day tokens, no revocation | Deleted, unapproved, re-roled or moved accounts lose their session on the next request | `authentication` | Pass | OPEN (partly fixed) | Tokens are still in `localStorage`; there is no server-side logout for a single device |
| SEC-021 | Tokens, passwords and request bodies in logs | Password, token, reset-code and whole-user log lines removed; per-request logging removed; raw error text not sent to clients | `hardening` (login leaves no password or token in the log), `sensitiveData` (no internals in responses) | Pass | FIXED AND VERIFIED | Many verbose `console.log` lines remain; they were not all reviewed |
| SEC-022 | Vendor passwords as unsalted SHA-256 | New vendor passwords use bcrypt; a legacy SHA-256 or plain-text value is accepted once and replaced with bcrypt on login (users too) | `hardening` (unit), `authentication` (legacy plain-text user) | Pass | FIXED BUT NOT FULLY VERIFIED | Vendor login was not run end to end: a fresh database has no vendor password column |
| ARCH-001 | Environment loaded after the database module | Environment loaded first; `USE_POSTGRES=true` now prints a clear warning (the core has no PostgreSQL adapter) | `startup` | Pass | FIXED AND VERIFIED | |
| — | Terms-and-conditions consent integrity | Not examined in this pass | — | — | OPEN (not assessed) | |
| — | Backup and recovery | Schema migration backs the file up first (verified); the reconciliation script backs up before changing anything (verified on a copy) | `startup`, `dataIntegrity` | Pass | OPEN (partly) | There is no scheduled backup or restore drill |

### Problems found during this work that the audit did not list

| # | Problem | Status |
| --- | --- | --- |
| N-1 | Password reset code returned in the API response unless `NODE_ENV=production` (and `NODE_ENV` was unset by default): anyone could take over any account by email address | Fixed, tested |
| N-2 | Reset-code expiry compared two different date formats as text, so a code stayed valid far longer than intended | Fixed, tested |
| N-3 | An unauthenticated password-reset request stopped the server on a database without the `otp_reset` table | Fixed (table created on demand), tested |
| N-4 | `/api/superadmin/create-university`, `create-user`, `users`, `universities` accepted **any** valid token, including a student's | Fixed, tested |
| N-5 | Superadmin email and password written in the client source; the page built the unsigned token itself | Fixed in source; rebuilt bundle no longer contains it |
| N-6 | A school admin could give any user the `superadmin` role, or edit and delete the platform owner's account | Fixed, tested |
| N-7 | Fee reminder sent an LMS-branded email to any address supplied in the request | Fixed: recipient is read from the student's record |
| N-8 | Subscription payment verification logged a signature mismatch and continued; mock order ids skipped verification | Fixed, tested |
| N-9 | Real mailbox password committed in 6 tracked files | Replaced by placeholders; rotation required |
| N-10 | Admin "upload material" checked only "is admin", not the school | Fixed, tested |
| N-11 | Schema drift on a fresh database (`users.created_at`, `otp_reset`, six files using an undefined `db`) broke admin user lists, registration, student dashboard, expenses and orders | Fixed (additive columns, missing handle defined) |

---

## 6. Still open

1. **Credential rotation** (SEC-007) — manual, section 7.
2. **Uploaded files are downloadable by URL without login** (SEC-014).
3. **Procurement isolation not verified with data** for inventory, vendors, stock requests, vendor invoices (SEC-010).
4. **Legacy rows without a school** in expenses, orders, inventory, vendors are hidden until an operator runs the reconciliation script.
5. **Data model:** foreign keys (DATA-001/002), duplicate sources of truth (DATA-003), remaining non-transactional writes (DATA-004), student key mismatch (DATA-006).
6. **Sessions:** tokens in `localStorage`, no per-device logout (SEC-020). **Request body limit** of 50 MB (SEC-024). **Client-only route guards** still render empty shells (SEC-023).
7. **Subscription pricing** is not bound to a server-side price list (SEC-013 residual).
8. **Whole-table export** for school admins is closed, not rebuilt (SEC-015).
9. **Process safety net** logs uncaught errors and keeps running; there is still no process supervisor.
10. **Not tested at all:** a real browser walk-through of the four portals; PostgreSQL; the hosted production site; real payment, email or AI calls; load.
11. **Pre-existing failures, unrelated to this work:** one AI Assessment test (`from-review` after numerical generation); certificate and `/api/payments/transactions` endpoints still use unconnected Mongoose models and return 500; stock-request and vendor-stock tables are not created on a fresh database; client lint has no configuration.

---

## 7. Manual actions for the owner

No real credential was rotated, and nothing was pushed. Do these before the code is used with real schools.

1. **Mailbox password.** The password of the support mailbox was committed in `server/.env.clean`, `.env.email`, `.env.postgres`, `.env.postgres-ready`, `temp_env.txt` and `email_config.txt`, and is in git history on GitHub. In the mail provider's admin console: revoke that app password, create a new one, put it only in `server/.env` on the server (`EMAIL_USER`, `EMAIL_PASS`). Check the mailbox's sent items and login history for unknown activity.
2. **Razorpay keys.** A test key pair and a **live** key pair were written in `server/config/razorpay-config.js`, and a key secret in `controllers/subscription-controller.js`; all are in git history. In the Razorpay dashboard (Settings → API Keys) regenerate both the test and the live keys, then set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the server environment. Review recent payments and refunds on the account.
3. **JWT secrets.** Generate two different values with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and set `JWT_SECRET` and `JWT_REFRESH_SECRET` on the server. Every user is signed out once.
4. **Hugging Face token.** The audit reported a live token in the local `server/.env` (not tracked). If that file was ever shared, revoke the token in Hugging Face settings and create a new one.
5. **Demo accounts in any real database.** Accounts such as `admin@gmail.com`, `superadmin@core5.com`, `portal@core5.co.in`, `student@gmail.com` were created with publicly known passwords. On each real database, delete them or reset their passwords from the superadmin screens.
6. **Production environment.** Set `NODE_ENV=production`, `CORS_ORIGINS=<the web app address>`, and `TRUST_PROXY_HOPS` if a proxy sits in front. See `server/.env.example`. Do not set `SEED_DEMO_DATA`.
7. **Legacy records.** On a copy of the production database first:
   `node scripts/security/reconcile-school-ownership.js --db <copy>` (report only), then `--apply-derived`, then, only for a database that has always had one school, `--assign-remaining <schoolId>`.
8. **Unapproved accounts.** Accounts with `isApproved = 0` can no longer sign in. Approve the legitimate ones from the admin screen.
9. **Git history.** Removing the old credentials from history needs a coordinated rewrite of a shared repository. It was not done. Rotation (items 1 to 4) is what makes the leaked values useless.
10. **Clean-up.** Review and delete the one-off credential scripts in `server/` (for example `get-superadmin-creds.js`, `reset_user_passwords.js`, `superadmin-creds.js`, `find-password.js`) and the extra env files once you no longer need them.
11. **Hosted site.** Confirm whether the hosted production site runs the old code. If it does, treat SEC-001 to SEC-010 as present there until this branch is deployed.

---

## 8. How to rerun the checks

```
cd server
npm test                 # everything: 242 tests, about 100 seconds
npm run test:security    # security and integrity suites only

cd ../ai-modules/ai-assessment-agent && npm test
cd ../student-onboarding-agent && npm test
cd ../../client && npm run build
```

The server tests create their own database and upload folder in the system temp directory. They refuse to start if a real mail, payment or AI credential is present in the environment, and they do not read `server/.env`.

| Suite | Tests | Passed |
| --- | --- | --- |
| `tests/security/authentication.test.js` | 42 | 42 |
| `tests/security/authorization.test.js` | 60 | 60 |
| `tests/security/routeCoverage.test.js` | 10 | 10 |
| `tests/security/schoolIsolation.test.js` | 26 | 26 |
| `tests/security/sensitiveData.test.js` | 11 | 11 |
| `tests/security/passwordReset.test.js` | 10 | 10 |
| `tests/security/uploads.test.js` | 19 | 19 |
| `tests/security/hardening.test.js` | 10 | 10 |
| `tests/integrity/startup.test.js` | 21 | 21 |
| `tests/integrity/dataIntegrity.test.js` | 17 | 17 |
| `tests/notificationText.test.js` (existing) | 16 | 16 |
| **Server total** | **242** | **242** |
| AI Assessment module | 525 | 524 (1 pre-existing failure; was 432 passed and 93 cancelled) |
| Student Onboarding module | 343 | 343 |
| Client production build | — | Passes |
| Client lint | — | Cannot run (no ESLint configuration) |

---

# Part 2 — Production readiness pass (12 October 2026, second session)

This part continues the work above on the same branch. Where it changes a status given in Part 1, the table in section 9 is the current truth. Nothing was committed, pushed or deployed.

**Current status: READY FOR STAGING. Production is BLOCKED on the owner actions in section 14.**

## 9. What changed since Part 1

| ID | Part 1 status | Now | What was done | Evidence |
| --- | --- | --- | --- | --- |
| SEC-014 uploads | Fixed but not fully verified (files downloadable by URL) | **FIXED AND VERIFIED** | Stored files are private. The database keeps the plain path; an authorised API response turns it into a link with an expiry time and a signature (`middleware/uploadPolicy.js`), and `/uploads` serves only such a link. Default lifetime 4 hours (`UPLOAD_LINK_TTL_MINUTES`). No client change was needed | `uploads` suite, 24 tests: bare path refused with and without login; changed, extended, re-targeted and expired links refused; users who cannot see the course never receive a link |
| SEC-013 pricing | Verified, with an open note (price supplied by the client) | **FIXED AND VERIFIED** | `config/subscriptionPlans.js` is the single price source (operator-set `PLAN_PRICE_*_INR`). The order is created for the server's price; verification requires the gateway's signature, a captured payment, the order amount and the plan recorded on the order; one payment activates one period once | `subscriptionPayments` suite, 14 tests with a stand-in gateway (no network): underpaid, authorised-only, failed, wrong order, wrong plan, forged signature, gateway down, replay |
| SEC-020 sessions | Open (partly fixed) | **Partly fixed, improved** | `POST /api/auth/logout` ends every session of the account on the server; a password reset does the same. The client calls it on logout | `reliability` suite |
| SEC-024 body size | Open | **FIXED AND VERIFIED** | JSON bodies limited to 5 MB (`JSON_BODY_LIMIT`); oversized requests get 413 | `reliability` suite |
| DATA-004 transactions | Open (attendance only) | **Partly fixed, improved** | Replacing a course roster is now one transaction and accepts only students of the caller's school | `schoolIsolation`, full suite |
| AI Assessment 524/525 | 1 failure, described as pre-existing | **525/525** | Cause found: Work Log Entry 3 made a class mandatory when saving a test; this test could not run then (its suite was cancelled) and still sent no class. The test's request now names a class. No product code changed | `npm test` in the module |
| Certificates (API-002) | Broken, out of scope | **FIXED AND VERIFIED** | The controller was written for MongoDB, which the LMS does not connect to, and its PDF generator was a stub. Rewritten on SQLite with a real PDF (pdfkit, already a dependency), owner-only access | `feesAndCertificates` suite |
| Payment history and fee verification | Broken, out of scope | **FIXED AND VERIFIED** | `GET /api/payments/transactions/:id`, `/all-transactions` and `POST /api/payments/verify-payment` used the same unconnected MongoDB model. They now use the `payments` table, school-scoped; a verified payment is recorded once | `feesAndCertificates` suite (stand-in gateway) |

New in this part:

| Area | Change | Evidence |
| --- | --- | --- |
| Async failures | An `async` route that throws used to hang until timeout. `middleware/asyncErrors.js` routes such errors to the error handler, which answers a safe 500 | `reliability`: async throw, rejected promise, sync throw |
| Health checks | `/health` (process alive) and `/health/ready` (database reachable, not shutting down) | `reliability` |
| Graceful shutdown | On SIGTERM/SIGINT: stop accepting, finish running requests, close sockets and the database, hard stop after 10 s. Optional `LMS_EXIT_ON_FATAL=true` for supervised deployments | Code review only — **not tested** |
| Request tracing | Every response has `X-Request-Id`; one JSON log line per request (method, path without query, status, duration, account id, role, school) | `reliability`; `hardening` confirms no password or token in logs |
| Duplicate writes | Unique index: one assessment attempt per student; one activation per payment; one row per gateway payment id | `reliability`, `subscriptionPayments`, `feesAndCertificates` |
| Paging | Generic lists accept `?limit=&offset=` (limit capped at 500) and return `X-Total-Count`. Without `limit` the old behaviour is unchanged | `reliability` |
| Demo seed | Demo data now also creates the demo school the demo accounts point to | `startup` |

## 10. Performance: measured

Lookup indexes were added for the queries that run on almost every request (school, class membership, enrolment, course content). Measured on a synthetic database with 20 schools, 40,800 users, 80,000 enrolments, 200,000 attendance rows, 80,000 results and 80,000 payments; median of 25 runs per query.

| Query | Before (ms) | After (ms) | Change |
| --- | --- | --- | --- |
| Results of one student | 5.34 | 0.08 | 67x faster |
| Payments of one student | 5.15 | 0.09 | 55x faster |
| Results of a classroom | 5.46 | 0.21 | 27x faster |
| Attendance of one student | 1.05 | 0.08 | 14x faster |
| Fees collected in one school | 14.37 | 1.20 | 12x faster |
| Students of one school | 5.21 | 1.71 | 3x faster |
| Teacher-teaches-student check | 0.26 | 0.12 | 2x faster |
| Courses of a classroom | 0.16 | 0.08 | 2x faster |
| Enrolment check, weeks of a course, course roster | 0.05–0.10 | unchanged | Already served by existing unique indexes |

Not measured: end-to-end request latency under concurrent load, frontend bundle size and render performance. The client bundle and the 5,050-line translation context (audit PERF-006) were not changed.

**SQLite.** The LMS core uses one SQLite file with one writer at a time. That is adequate for a single server process and the write volume of a few schools, and unsuitable for more than one server instance or heavy concurrent writes. The code that claims PostgreSQL support does not exist for the core. Moving to PostgreSQL is a separate project and was not started.

## 11. Execution checklist

| Area | Item | Status |
| --- | --- | --- |
| Security blockers | Deny-by-default gate, strict sessions, school isolation (core, fees, expenses, orders, requirements) | Done, tested |
| | Private file downloads | Done, tested |
| | Server-side plan prices and payment verification | Done, tested with a stand-in gateway |
| | Credential rotation | **BLOCKED — owner** |
| | School isolation for inventory, vendors, stock requests, vendor invoices | **Open — not verified with data** (their tables come from one-off setup scripts, one of which drops tables first; consolidating them into start-up is a separate task) |
| Correctness | Certificates, payment history, fee payment recording | Done, tested |
| | Foreign-key enforcement (DATA-001/002), duplicate sources of truth (DATA-003), student key mismatch (DATA-006) | Open |
| Reliability | Async error handling, readiness, shutdown, request ids, body limit | Done; shutdown not tested |
| | Process supervisor | **Owner — deployment decision** (section 13) |
| Performance | Lookup indexes | Done, measured |
| | Load test, frontend bundle | Not done |
| Maintainability | One price source, one upload policy, one session check, one access policy | Done |
| | Client lint | Not done: the client has no ESLint configuration and no React lint plugin installed; adding one means new dependencies and a first pass over 224 files |
| Testing | Server 279, AI Assessment 525, Onboarding 343, client build | All pass |
| | Browser walk-through of the four portals | **Not done** |
| Deployment | Environment template, checklist, backup, rollback | Documented (sections 12–13) |

## 12. Operations

**Backup.** Three things hold state: the database file (`server/data/lms_permanent.db`, or `LMS_SQLITE_PATH`), the uploads folder (`server/uploads`, or `LMS_UPLOADS_DIR`), and the AI modules' file folders (`ai-modules/ai-assessment-agent/data`). Back up the database with SQLite's online backup so a running server is safe:

```
sqlite3 server/data/lms_permanent.db ".backup '/backups/lms-YYYYMMDD-HHMM.db'"
```

Copy the upload folders with the same timestamp. Keep backups off the server. A plain file copy of the database is safe only while the server is stopped.

**Restore.** Stop the server. Replace the database file with the backup (remove any `-wal` and `-shm` files beside it). Restore the upload folders from the same backup. Start the server and check `/health/ready`.

**Schema changes at start-up** are additive only (new nullable columns, new indexes, new tables). The installment migration copies the database to `data/backups/` before its first change. If start-up logs "could not be enforced yet (duplicate rows exist)", the unique index was skipped; the server still runs, and the duplicates need reconciling.

**When something fails**

| Situation | What the system does | What to do |
| --- | --- | --- |
| Database file missing or unreadable | `/health/ready` answers 503; requests fail with 500 | Restore from backup |
| Disk full | Writes and uploads fail with 500; reads continue | Free space; uploads and backups are the usual cause |
| Mail server down or not configured | Password-reset requests still answer the same neutral message; no code is delivered; an error is logged | Fix `EMAIL_*`; users request a new code |
| Payment gateway down | 502 on order creation and verification; no plan is activated and no payment recorded | Retry later; a captured payment can be verified again safely (it is recorded once) |
| AI provider down or no token | AI features answer with their own safe errors; manual test creation keeps working | Check `HF_TOKEN` |
| Unexpected fatal error | Logged with stack; process keeps serving, or restarts cleanly if `LMS_EXIT_ON_FATAL=true` under a supervisor | Find the request by its `requestId` in the log |

## 13. Deployment checklist

> The step-by-step version with exact commands is now [docs/DEPLOYMENT_RUNBOOK.md](../DEPLOYMENT_RUNBOOK.md), which replaces this list for anyone deploying; the list is kept as the record of Part 2.

Items marked **BLOCKED** need the owner; nothing here was executed.

1. **BLOCKED** — Rotate the mailbox password, both Razorpay key pairs, and the Hugging Face token if it was ever shared (section 7, items 1, 2, 4).
2. **BLOCKED** — Create `server/.env` on the server from `server/.env.example`: `NODE_ENV=production`, two new JWT secrets, `CORS_ORIGINS`, `TRUST_PROXY_HOPS` if behind a proxy, mail and Razorpay values, `PLAN_PRICE_STANDARD_INR`, `PLAN_PRICE_PROFESSIONAL_INR`. The server refuses to start if a required value is missing or a placeholder.
3. Back up the current database and uploads (section 12).
4. **BLOCKED** — On a copy of the production database: start this version once (applies the additive schema changes), run `npm test` separately, then `node scripts/security/reconcile-school-ownership.js --db <copy>` and review the report. Decide on `--apply-derived` and `--assign-remaining`.
5. **BLOCKED** — Remove or reset the demo accounts in the production database (section 7, item 5). Approve legitimate accounts that have `isApproved = 0`.
6. Deploy the server code; install dependencies in `server/` and in both `ai-modules/*` folders (`npm ci`).
7. Run the server under a supervisor that restarts it and sends SIGTERM on stop (PM2, systemd or a container restart policy), with `LMS_EXIT_ON_FATAL=true`. Point its health check at `/health/ready`. Run **one** instance (SQLite, in-memory rate limits and import jobs).
8. Serve the API over HTTPS behind the proxy. Uploads and the database file must be on persistent storage.
9. Build the client with the production API address (`VITE_BACKEND_URL`) and deploy `client/dist`.
10. **BLOCKED** — Staging check in a browser: log in to each of the four portals, open a course material (file link), mark attendance, enter a result, reset a password with real email, make one real test-mode payment.
11. Watch the log for `status` 5xx lines for the first day.

**Rollback.** Stop the server, redeploy the previous code and client build, and start. The schema changes are additive, so the previous code runs on the migrated database. Three things to expect: reset codes issued by the new code are stored hashed, so users request a new code after a rollback; everyone signs in again if the JWT secret is changed back; and rows written with a school id keep it, which the old code ignores. If data must be rolled back, restore the backup from step 3.

## 14. Owner actions still required

Unchanged from section 7, plus:

- Set the two plan prices. Until then paid plans answer 503.
- Decide the supervisor and hosting for the server (item 7 above).
- The backend that has been running on port 5002 on this machine since before this work was not started by this work and still runs the old code. Restart it to pick up the changes.

## 15. Tests after Part 2

| Suite | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| `cd server && npm test` (14 files) | 279 | 279 | 0 | 0 |
| `cd ai-modules/ai-assessment-agent && npm test` | 525 | 525 | 0 | 0 |
| `cd ai-modules/student-onboarding-agent && npm test` | 343 | 343 | 0 | 0 |
| `cd client && npm run build` | — | Passes | | |
| `cd client && npm run lint` | — | Cannot run (no configuration) | | |

New server suites in this part: `security/subscriptionPayments.test.js` (14), `integrity/reliability.test.js` (11), `integrity/feesAndCertificates.test.js` (7); `security/uploads.test.js` grew from 19 to 24.

## 16. Still open after Part 2

1. Credential rotation and the other owner actions (BLOCKED).
2. Procurement isolation not verified with data; legacy rows without a school need the reconciliation script.
3. Data model: DATA-001, DATA-002, DATA-003, DATA-006; create-student and create-course-with-enrolment are still multi-step writes.
4. Tokens are still kept in `localStorage`; logout is per account, not per device.
5. No browser walk-through, no load test, no real email or payment, hosted site not examined.
6. Client-only route guards still render empty shells for public URLs (the API refuses the data).
7. Terms-and-conditions consent integrity was not examined.
8. Graceful shutdown is implemented but not tested.
9. School-scoped export for admins is not built (export stays platform-owner only).

---

# Part 3 — Customer walkthrough, 14-area audit, load test and backup drill (12–13 October 2026)

Part 3 is the latest state. It records a hands-on run of the application as a school would use it, a third audit pass, and the first load and restore measurements. Nothing was committed, pushed or deployed.

**Verdict: NOT READY for production. Ready for a staging deployment.** The code-level blockers found so far are fixed and tested; what remains needs the owner (credential rotation, demo accounts, hosting decisions) or a browser and a staging server (portal walk-through, real mail). Section 22 lists them.

## 17. Customer walkthrough (12 October)

One school was set up through the same API calls the web pages make: platform owner → school and admin → teachers, classes, students, courses, quiz, attendance, results, announcements, calendar, AI-module test, fee collection, certificate. The data was kept in the local database. Screens were not clicked in a browser.

Defects found by using the product, all fixed and covered by the suites:

| # | What a customer would have seen | Cause | Fix |
| --- | --- | --- | --- |
| W-1 | Every answer in a course quiz marked wrong when the options are numbers | The correct answer is stored as the option's text; a numeric text was read as an option position | Match the text first (`controllers/assessmentController.js`) |
| W-2 | Editing a course title erased its description, category and duration | The update wrote every column, including the ones not sent | Unsent fields keep their value (`controllers/course-controller.js`) |
| W-3 | A course could not be attached to a class or another teacher after creation; the page said "updated" | The update ignored those fields | An admin can now set class and teacher, checked against the school |
| W-4 | A student admitted after a course was created did not see the class's courses | The student list used the enrolment snapshot only | The list includes courses taught to the student's class |
| W-5 | Marks of 150 out of 100, and negative marks, were saved | No validation on the result route the page uses | Marks must be between 0 and the subject total |
| W-6 | Attendance could be marked for a future date | No check | Refused |
| W-7 | Adding a chapter failed on a new database | Table created without three columns the code writes | Columns added at start-up |
| W-8 | "Certificate already exists" with no file to download | Completing the last chapter recorded a certificate row without a file | Requesting the certificate now creates the file |
| W-9 | AI tests answered "not available" | The module's migrations had not been applied to this database | Applied locally; for any other database it is a deployment step (section 22) |

Workflow observations that need a product decision, not a code fix, are in section 23.

## 18. Third audit pass: additional findings

| ID | Priority | Finding | Evidence | Action | Verification |
| --- | --- | --- | --- | --- | --- |
| A-1 | P1 | The superadmin login page printed "Default Credentials" with an email and password | `client/src/pages/superadmin/SuperAdminLogin.jsx`; string present in the production bundle | Block removed, client rebuilt | Bundle scan: 0 matches |
| A-2 | P1 | Links typed by a teacher (material link, chapter video and image, live-class meeting link) were stored as typed; a `javascript:` link would run in every student's browser that clicked it | Controllers stored `linkUrl`, `videoUrl`, `imageUrl`, `meetingLink` unchecked | `helpers/safeUrl.js`: http or https only | `hardening` suite: 6 dangerous links × 4 fields refused |
| A-3 | P1 | First passwords for new admins, teachers and students were generated with `Math.random` | `adminController.js`, `superAdminController.js` | Operating-system random source, 12 characters | `hardening` suite |
| A-4 | P2 | Two pages showed invented students ("Rahul Sharma", "Priya Verma") when the server returned nothing or failed | `pages/mentor/ClassFeeStatus.jsx`, `pages/accountant/DatabaseExport.jsx` | Empty list instead | Bundle scan |
| A-5 | P2 | Stock requests answered 500: the tables existed only in a set-up script that drops tables first | `database/stock_requests_schema.sql` | Start-up now runs only that file's `CREATE TABLE` and `CREATE INDEX` statements as `IF NOT EXISTS` | `dataIntegrity` suite |
| A-6 | P1 (was open) | School isolation for inventory, vendors and stock requests had no test with data | Part 2, section 16 | Tested with rows for two schools: lists, single record, update, delete | `dataIntegrity` suite |
| A-7 | P2 | No limit on uploads per user | — | 60 uploads per 15 minutes per signed-in account | Code review; not load-tested |
| A-8 | P2 | The static client had no security headers at the host | `client/vercel.json` had rewrites only | `nosniff`, frame denial, referrer policy, HSTS, permissions policy added | **Not verified**: takes effect only on a Vercel deployment |
| A-9 | P3 | Razorpay key id written in four client files | A key id is public by design, but configuration belongs in the environment | `VITE_RAZORPAY_KEY_ID` | Bundle scan: 0 matches |
| A-10 | P3 | No page description | `client/index.html` | Added | Build |
| A-11 | P2 | Terms acceptance is recorded only in the browser (`localStorage`) | `components/ControlledTermsModal.jsx`; no server code mentions terms | **Not fixed.** There is no server-side proof that a user accepted the terms | Needs a decision on what must be recorded |
| A-12 | P2 | Page text is sent from the browser to third-party translation services (Google Translate endpoint, MyMemory, a public LibreTranslate) and fonts are loaded from Google | `client/src/utils/directTranslator.js`, `client/index.html` | **Not fixed.** No analytics or tracking scripts and no cookies set by the client were found. Whether these requests need consent depends on the school's jurisdiction | Owner and legal decision |
| A-13 | P2 | The whole client is one 2.9 MB JavaScript file | Build output | **Not fixed.** Route-level code splitting is the usual remedy | Measured only |
| A-14 | P2 | Dependency vulnerabilities not scanned | `npm` is not installed on this machine (Node comes bundled with another tool) | CI workflow added with an audit step | **Not verified** |
| A-15 | P2 | Node.js is not properly installed on the development machine | The path of the only `node.exe` changed between sessions | Owner action | — |

## 19. Load test (measured)

`node scripts/ops/load-test.js`: the real server on a temporary database, 2 schools × 2,000 students, 40 classes and 100 courses each; read requests by signed-in students (courses, attendance, results, announcements, classroom), 10 seconds per step. Machine: Intel i5-7300U (4 threads), 8 GB RAM, Windows; the load generator ran on the same machine.

| Concurrent requests | Requests/s | p50 ms | p95 ms | p99 ms | Max ms | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 570 | 15.5 | 27.8 | 34.9 | 103 | 0 |
| 50 | 653 | 68.6 | 121.5 | 138.9 | 215 | 0 |
| 100 | 683 | 130.2 | 232.5 | 253.3 | 296 | 0 |
| 200 | 686 | 258.6 | 464.2 | 487.5 | 516 | 0 |

Admin user list for one school (2,041 rows, no paging): 18.5 ms p50 for one caller; 170 ms p50 and 258 ms p99 with 10 callers at once.

Reading: throughput levels off at about 680 requests per second from roughly 50 concurrent requests; beyond that, extra load only adds waiting time. No request failed and the server was still ready afterwards. Not measured: writes, logins (password hashing is deliberately slow), uploads, AI calls, a soak run, memory growth, or production hardware. These numbers must not be read as "supports N users".

## 20. Backup and restore drill (verified in isolation)

`node scripts/ops/backup-and-verify.js --db <file> --out <folder>` takes an online backup, then opens the backup on its own and checks SQLite integrity and every table's row count. The `dataIntegrity` suite backs up the running test database, reopens the backup and compares users and payments row for row; a damaged file is rejected. Run against a copy of the local database: 51 tables, 96 rows, verified. Not done: a scheduled job, off-server storage, restoring the uploads folder, a drill on production data.

## 21. Scorecard — 14 areas

| Area | Status | Evidence | Main gap |
| --- | --- | --- | --- |
| 1 Security and authorization | Partially complete | 369 routes behind one gate; role, school and relationship checks; 285 tests | Credentials in Git history not rotated; tokens in `localStorage`; dependency scan not run |
| 2 Functional correctness | Partially complete | Walkthrough of one school; nine defects fixed | No browser run of the four portals; vendor-invoice and several procurement pages not exercised |
| 3 Data integrity and concurrency | Partially complete | Transactions for attendance and course roster; unique rules for attendance, attempts, payments | Foreign keys off (DATA-001/002); student-key mismatch (DATA-006); create-student still multi-step |
| 4 Reliability | Partially complete | Async errors answered; readiness check; start-up validation; gateway and mail failures handled | Graceful shutdown untested; no supervisor configured |
| 5 Performance | Partially complete | Indexes measured (12–67×); load test | 2.9 MB client bundle; N+1 in mentor progress (audit PERF-003) untouched |
| 6 Scalability | Partially complete | Measured single-instance ceiling | One process only: SQLite, in-memory rate limits and import jobs |
| 7 Testing and CI | Partially complete | Server 285, AI Assessment 525, Onboarding 343, all passing; CI workflow written | CI never executed; no browser tests; client lint not configured |
| 8 Monitoring | Partially complete | Request ids, one JSON line per request, readiness endpoint | No metrics, alerts or uptime check exist |
| 9 Deployment and recovery | Partially complete | Environment template, checklist, rollback notes | Never executed; hosting for the server undecided |
| 10 Architecture | Partially complete | One gate, one policy, one isolation helper, one upload policy, one price source | Dead "-backup"/"-broken" files, unused Mongoose models and about 250 one-off scripts remain in `server/` |
| 11 Database and backup | Partially complete | Additive migrations; backup-and-verify tool tested | No schedule or retention; no migration history table |
| 12 Capacity | Partially complete | Section 19 | Reads only, one machine, 10-second steps |
| 13 Frontend and accessibility | Not verified | Production build passes | No browser session was available: loading, error and empty states, keyboard use and layouts were not inspected |
| 14 Business value | Documented | Section 23 | Decisions pending |

The twelve hardening checks:

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `.env` files public | Not reproduced; not verified on a deployment | The API serves only signed upload links; the client host serves `client/dist` only. Tracked env-like files hold placeholders now |
| 2 | `.git` public | Not verified on a deployment | Not inside either served folder |
| 3 | Secrets in frontend bundle | Fixed and tested | Bundle scan after rebuild: no key, password or token patterns |
| 4 | Row-level security | Not applicable | SQLite has none; isolation is enforced in the API and tested |
| 5 | Security headers | Partially complete | API: helmet, verified in tests. Client host: headers added, unverified. No content-security policy for the client |
| 6 | Source maps | Verified complete | 0 map files in `client/dist` |
| 7 | Debug and seed routes | Fixed and tested | 29 removed paths tested for six roles; seeding off unless requested |
| 8 | Abuse controls | Partially complete | Login, reset, registration, payments, uploads limited; AI module has its own per-teacher throttle | Limits are in memory (single instance) |
| 9 | Error details | Fixed and tested | `sensitiveData` suite; async failures return a generic 500 |
| 10 | Titles and metadata | Partially complete | Title and description present; no Open Graph tags |
| 11 | Trackers and external resources | Partially complete | No analytics or cookies; Google Fonts and third-party translation calls remain (A-12) |
| 12 | Privacy and legal | Not verified | Terms acceptance is browser-only (A-11); retention and deletion policy undefined |

## 22. Remaining blockers and owner actions (ordered)

1. **Rotate the mailbox password** committed in six files, and **deactivate the Razorpay keys** that were in source (deactivating leaked keys is separate from setting payments up, which the owner has deferred until there is a customer).
2. **Remove or re-password the demo accounts** in every real database. On a database where the first school has id 1, the demo admin, accountant and storekeeper are members of that school.
3. **Install Node.js LTS** on the machines that build and run the project, and run `npm audit` in `server/` and `client/`.
4. **Production environment values** (section 13, item 2). Payment keys and plan prices can stay empty: payment endpoints then answer 503.
5. **Apply the AI modules' migrations** to each database (`ai-modules/ai-assessment-agent/backend/scripts/applyMigration.js`, `ai-modules/student-onboarding-agent/backend/scripts/apply-migration-003.js`); they are not applied at start-up by design.
6. **Staging run in a browser**: the four portals, one real password-reset email, file upload and download.
7. **Choose hosting and a supervisor for the server**, schedule `backup-and-verify.js`, and add an uptime check on `/health/ready`.
8. **Push the branch to see the CI workflow run** (owner's decision; nothing was pushed).
9. **Decide** terms-consent recording, third-party translation and fonts, data retention (A-11, A-12).

## 23. Business-value opportunities (not blockers)

| Opportunity | Benefit | Effort | Risk |
| --- | --- | --- | --- |
| First-login flow for created accounts (emailed link or forced password change) instead of a password shown once to the admin | Removes the most likely support call; admins stop knowing passwords | Medium (the onboarding module already has setup links) | Low |
| Quiz and AI-test scores flow into term results | Removes retyping by teachers | Large | Medium |
| A course cannot be published without a teacher and a class; class selection by one field | Fewer invisible courses and failed forms | Small | Low |
| Fee structure chosen per class rather than inferred from the grade; class creation warns when none applies | Correct fees from day one | Medium | Medium |
| Retake or reset for a course quiz (the AI module already has it) | Teachers can correct a bad attempt | Small | Low |
| Attendance statuses "late" and "leave" | Matches how schools record attendance | Small, needs a table rebuild | Low |
| Client code splitting | Faster first load on slow connections | Medium | Low |
| Paging on the admin user list | Keeps large schools fast | Small | Low |

## 24. Tests after Part 3

| Command | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| `cd server && node --test --test-force-exit "tests/**/*.test.js"` (same as `npm test`; integration tests against the real app on a temporary database, 14 files) | 285 | 285 | 0 | 0 |
| `cd ai-modules/ai-assessment-agent && node --test "tests/**/*.test.js"` | 525 | 525 | 0 | 0 |
| `cd ai-modules/student-onboarding-agent && node --test` | 343 | 343 | 0 | 0 |
| `cd client && vite build` | — | Passes | | |
| `node scripts/ops/load-test.js` | — | Section 19 | | |
| Browser end-to-end tests | — | None exist | | |
| `npm audit`, client lint | — | Could not run (no `npm`; no lint configuration) | | |

---

# Part 4 — Browser run of the four portals, dependency audit, release candidate (13 October 2026)

Part 4 is the latest state; where it differs from Parts 1–3, Part 4 is right. This pass used the application through its pages in a real Chrome window for the first time, ran the first dependency audit, and fixed what those two found. Nothing was committed, pushed or deployed.

**Verdict: READY FOR STAGING VALIDATION.** It must not be deployed for real schools yet: credentials that were committed to Git are not rotated, demo accounts with a published password exist wherever demo data was seeded, foreign-key enforcement cannot be switched on, and real mail, the CI run and a deployment have never been exercised (section 33).

The browser run mattered: most of the defects below were invisible to 1,153 passing API tests, because the pages called addresses or sent request shapes the server does not serve. Several core actions could not be completed through the user interface at all (an admin creating a course, a teacher opening attendance, a student paying or downloading a certificate, the platform owner signing in on the owner page).

## 25. How the browser run was done

- `server/tests/e2e/stack.js` starts the real server on a new database in the temp folder (mock mail, no payment or AI keys, demo accounts seeded) and serves a production build of the client that points at it. Ports 5612 and 5178.
- A visible Chrome window with its own temporary profile was driven with real mouse movement, clicks and typing. The owner's signed-in Chrome could not be used: the Claude-in-Chrome tools were not available to this session and the `chrome-devtools` plugin failed to connect.
- First an exploratory pass (93 screenshots in `temp/e2e-evidence/`, which Git ignores), fixing defects as they appeared; then the whole flow was written down as `server/tests/e2e/portals.e2e.js` and run on a fresh stack with the final code: **28 checks, 28 passed** (`temp/e2e-evidence/run/results.json`).
- One-time passwords shown on screen were read into memory, masked on the page before any screenshot, and never printed. Two early screenshots that showed one were deleted.

## 26. Requirement-to-evidence matrix

Status words: VERIFIED PASS, VERIFIED FAIL, PARTIALLY VERIFIED, NOT TESTED, BLOCKED, NOT APPLICABLE. "Suite" is the server suite (`npm test`, 298 tests); "E2E" is the browser run with its check id.

| Control | Status | Evidence |
| --- | --- | --- |
| Every route refuses a request without a session, for every method | VERIFIED PASS | Suite `routeCoverage` (enumerates the registered routes; 16 public); E2E SA-1 |
| Forged, altered, expired and logged-out tokens are refused | VERIFIED PASS | Suite `authentication`; E2E SA-5, ST-7 |
| Each role is held to its own operations | VERIFIED PASS | Suite `authorization`; E2E AD-8, TE-6, ST-6 |
| A school cannot read or change another school's records (lists, single records, ids in path, query and body, files) | VERIFIED PASS | Suite `schoolIsolation`, `dataIntegrity` (procurement); E2E XS-1 |
| A school's action cannot change another school's data as a side effect | VERIFIED PASS (was VERIFIED FAIL) | E-5 below; suite `feesAndCertificates` "fee structure" |
| Students and teachers are held to their own classes, courses and records | VERIFIED PASS | Suite `schoolIsolation`, `portalWorkflows`; E2E ST-6 |
| Password hashes, tokens, reset codes, payment signatures and the quiz answer key never reach a client that should not have them | VERIFIED PASS | Suite `sensitiveData`, `passwordReset`; E2E ST-3 |
| Registration cannot grant a role or skip approval | VERIFIED PASS | Suite `authentication` |
| Abuse limits: login, reset, registration, payments, uploads | PARTIALLY VERIFIED | Login and reset limits tested; upload and payment limits are in code, not tested under load; limits live in one process's memory |
| CORS, API security headers | VERIFIED PASS | Suite `routeCoverage`; the browser run used two different origins |
| Security headers and content-security policy on the client host | NOT TESTED | `client/vercel.json` sets five headers; no deployment exists; no content-security policy is defined |
| CSRF | NOT APPLICABLE | The session travels in an `Authorization` header, not a cookie |
| SQL built from parameters only | PARTIALLY VERIFIED | Suite covers the routes that took identifiers from requests (export, translation); not every query was read |
| Uploads: type by content, size, random names, private, signed and expiring links | VERIFIED PASS | Suite `uploads` (24 cases); E2E TE-2, ST-2 |
| Payments: amount, plan, order, signature and replay checked on the server | PARTIALLY VERIFIED | Suite `subscriptionPayments`, `feesAndCertificates` against a stand-in gateway; never against Razorpay (deferred by the owner) |
| The pages cannot show a payment as made without the server | VERIFIED PASS (was VERIFIED FAIL) | E-8; E2E ST-5; bundle scan for "Simulated payment" and "test-upgrade": 0 |
| Errors and logs disclose nothing sensitive | VERIFIED PASS | Suite `sensitiveData`, `hardening` (login leaves no password or token in the log) |
| No debug routes, demo bypasses or default secrets | VERIFIED PASS | Suite `routeCoverage`, `startup` |
| Dependencies free of known high or critical advisories in what is shipped | VERIFIED PASS (was VERIFIED FAIL) | Section 29 |
| Browser storage | VERIFIED FAIL (accepted for now) | The session token is in `localStorage`; a script injected into a page could read it. Mitigated by link validation (A-2) and the absence of third-party scripts; not removed |
| Terms consent is recorded | VERIFIED FAIL | Stored in the browser only; the text still contains template placeholders (O-4) |
| Third-party data transfers | VERIFIED FAIL (owner decision) | Page text goes to three translation services from the browser; fonts from Google (A-12) |
| Data integrity: unique rules for attendance, attempts, payments; transactions for multi-row writes | VERIFIED PASS | Suite `dataIntegrity`, `reliability`; E2E TE-4, ST-3 |
| Foreign keys enforced by the database | VERIFIED FAIL | Section 30 |
| Start-up refuses unsafe configuration; restarts keep data | VERIFIED PASS | Suite `startup` (22 cases, real process restarts) |
| Graceful shutdown | VERIFIED PASS (was NOT TESTED) | Suite `startup` "graceful shutdown" |
| One failing request does not stop the service | VERIFIED PASS | Suite `reliability`; E2E REL-1 (no 5xx in the whole run) |
| Backup can be restored | PARTIALLY VERIFIED | Suite `dataIntegrity` backup drill; not scheduled, not off-server, uploads not included |
| Health and readiness | VERIFIED PASS | Suite `reliability` |
| Metrics and alerts | NOT TESTED | None exist; owner tasks in the runbook |
| Real email (password reset, notices) | NOT TESTED | Mock transport only |
| CI | NOT TESTED | Workflow file exists; nothing was pushed, so it has never run |
| Deployment and rollback | NOT TESTED | `docs/DEPLOYMENT_RUNBOOK.md` written; no host exists |
| Multiple API instances | NOT APPLICABLE | Not supported; documented and stated in the runbook |
| AI assessment pages in a browser | BLOCKED | The module's tables are created by a separate migration that was not applied to the E2E database; the module's own 525 tests pass |
| Accountant, storekeeper and vendor portals in a browser | NOT TESTED | Outside the four portals of this pass; their API isolation is covered by the suite |

## 27. Findings of this pass

Severity: P0 data leak or corruption across schools; P1 broken core workflow, financial integrity or serious security defect; P2 important; P3 minor. "Fixed, tested" means a regression test exists and passes. Reproduction for every item marked "browser" is the step named in `portals.e2e.js` or the exploratory screenshot.

| ID | Sev. | Finding and evidence | Component | Fix | Verification |
| --- | --- | --- | --- | --- | --- |
| E-5 | P0 | Saving a fee structure rewrote `totalFees` and `pendingFees` of the students of **every** school in those grades: the `UPDATE students` had no school in its `WHERE` (read in code while testing the fee page) | `controllers/classroomController.js` | The update is limited to the caller's school | Fixed, tested: `feesAndCertificates` "saving it changes what this school's students owe and nobody else's" |
| E-1 | P1 | The platform owner's sign-in page posted to `/auth/login` on the web host and got the HTML page back: nobody could sign in there (browser, screenshot 04) | `client/.../SuperAdminLogin.jsx` | Uses the API address | Fixed; request now reaches `/api/auth/login` (browser). Sign-in itself verified through `/login` (E2E SA-3) |
| E-2 | P1 | 23 client files each chose the server address differently; with a build pointed at any server, 12 of them built `/api/api/...` or called the page's own host (browser: failed requests, socket on the wrong host) | `client/src/**` | One module, `client/src/config/api.js`; every file uses it | Fixed; the browser run uses separate origins for pages and API and completes |
| E-3 | P1 | Pages written before the access gate called the API without the session (teacher list on the course form, demo leads): empty lists, no error shown (browser) | client | `client/src/config/sessionRequests.js` attaches the session to requests for the LMS server | Fixed; E2E AD-5. Demo leads not re-checked in the browser |
| E-4 | P1 | An admin could not create a course: empty teacher list (E-3); the form read `_id`, which the server does not send, so no teacher or student could be chosen; it posted multipart data that the route does not parse ("Course title is required") (browser) | `client/.../CreateCourseAdmin.jsx`, `controllers/user-controller.js` | Reads `id`, sends JSON, teacher list carries the email; the cover-image field, which the server never stored, was removed | Fixed, tested: `portalWorkflows` "admin: create course page" (3 cases); E2E AD-5 |
| E-7 | P1 | The teacher's attendance page asked for `/classrooms/mentor/me`; the id check answered 404, so no class could be chosen and attendance could not be marked from the menu (browser, screenshot 54) | `routes/classroomRoutes.js` | Route added before the id route | Fixed, tested: `portalWorkflows` "teacher: attendance page"; E2E TE-4 |
| E-8 | P1 | Student fee page: "Pay Fees Online" threw `openPayment is not defined`. The payment code opened the gateway with an amount chosen in the browser, showed "payment completed" itself, and on any error showed "Simulated payment … recorded successfully". (The server never counted such a claim: it stores it as pending.) | `client/.../PayFees.jsx`, `controllers/payment-controller.js` | The page asks the server for an order and reports success only after `verify-payment`; no simulated path; order amounts are whole paise within limits | Fixed; E2E ST-5 for the unconfigured path. The paid path against a real gateway: NOT TESTED. Amount check on `create-order`: not separately tested |
| E-9 | P1 | "Choose Standard / Professional" called `/subscriptions/test-upgrade`, a route removed in Part 1 ("Upgrade failed: Not found"); the student subscription page had a "Test Upgrade (Demo)" button (browser, screenshot 17) | client | Goes through `create-order`; 503 gives "online payment is not available yet"; demo button removed | Fixed; bundle scan 0 matches. Not re-checked in the browser after the fix |
| E-10 | P1 | First dependency audit: server 2 critical and 27 high advisories, client 1 critical and 21 high | `package-lock.json` ×2 | Section 29 | Fixed for shipped code: 0 critical, 0 high |
| E-6 | P1 | Fee amounts were stored as sent: negative and non-numeric values, and a total supplied by the browser | `controllers/classroomController.js` | Each part must be a number from 0 upwards; the total is computed on the server; category must be Primary or Secondary | Fixed, tested: `feesAndCertificates`; E2E AD-6 |
| E-11 | P2 | "not-an-email" was accepted as a teacher's email: an account nobody can sign in to or reset (browser) | `controllers/adminController.js`, `superAdminController.js`, `auth-controller.js` | `helpers/validators.js`, applied to every account-creating and email-editing handler | Fixed, tested: `hardening`; E2E SA-4 |
| E-12 | P2 | A quiz whose end is before its start was saved and could never be attempted (browser) | `controllers/assessmentController.js` | Refused; timer must be 1–1440 minutes | Fixed, tested: `hardening`; E2E TE-3 |
| E-13 | P2 | Students were shown unpublished quizzes (title, description, times) in the course list and through the generic read route | `assessmentController.js`, `routes/universalRoutes.js` | Published only, for students | Fixed, tested: `portalWorkflows` |
| E-14 | P2 | The generic read routes let a student list every course, week and chapter of the school, not only their own | `routes/universalRoutes.js` | Limited to courses the student takes | Fixed, tested: `portalWorkflows` |
| E-15 | P2 | The class list sent every classmate's email address to a student | `controllers/classroomController.js` | Email left out for student callers | Fixed, tested: `portalWorkflows`; E2E ST-6 |
| E-16 | P2 | A chapter's uploaded file was never offered to students (the page read `pdfUrl`, the server sends `fileUrl`); file links were resolved against the web host | client | `fileLink()` in `config/api.js`; four pages | Fixed, tested: `portalWorkflows`; E2E ST-2 |
| E-17 | P2 | Certificates page: asked for a route that does not exist, sent `[object Object]` as the course id, and disabled Download for the very certificates that needed generating; a preview link put the session token in the address | `client/.../Certificates.jsx` | Corrected; token sent in a header | Fixed; browser: status "Ready", download 200 `application/pdf` |
| E-18 | P2 | Every export button opened `…?token=<session token>`. The server does not accept a token there, so the downloads failed, and the token was written to history and logs | 5 client files | `client/src/config/download.js` | Fixed; bundle scan 0 matches. Not re-checked in the browser |
| E-19 | P2 | The announcements page read a retired generic route and showed nothing | `client/src/pages/Announcements.jsx` | Reads `/api/announcements` | Fixed; E2E ST-4 |
| E-20 | P2 | When the server no longer accepted a session, pages stayed open showing empty lists | client | A 401 for the stored session clears it and opens the sign-in page | Fixed; E2E ST-7 |
| E-21 | P2 | The production bundle carried 381 debug `console.log` calls, some printing the signed-in user object | `client/vite.config.js` | Production builds drop `console.log/debug/info`; warnings and errors stay | Fixed; 1 call left in the built bundle |
| E-23 | P2 | Graceful shutdown existed but could not be exercised on Windows and was untested | `server.js`, test helper | Also answers the `shutdown` process message | Fixed, tested: `startup` "graceful shutdown" |
| E-22 | P3 | Missing translation keys were shown raw ("chapter_completed", "professional_information") and every translated string was logged | `client/.../TranslationContext.jsx` | Shown as words; logging removed | Fixed; browser |
| E-25 | P3 | `.gitignore` ignored every folder named `public`, including the client's static assets, which are absent: fonts and course banners answer 404 | `.gitignore` | `client/public/` no longer ignored | The files themselves must come from the owner |

Not fixed, with the reason:

| ID | Sev. | Finding | Why it is open |
| --- | --- | --- | --- |
| O-1 | P1 | Mailbox password and Razorpay keys that were committed are still valid; they remain in Git history | Owner only (section 7) |
| O-2 | P1 | Demo accounts with a published password exist wherever demo data was seeded; with a first school of id 1 they belong to it | Owner must delete or re-password them per database |
| O-3 | P1 | Foreign-key enforcement cannot be turned on | Section 30; needs a table rebuild planned with the owner's data |
| O-4 | P2 | The Terms text contains "[YOUR COMPANY NAME]", "[Registered Address…]", "[www.yourwebsite.com]" and the product name "EduMentor LMS"; acceptance is stored only in the browser (screenshot 05) | Legal text and what must be recorded are the owner's decisions |
| O-5 | P2 | The landing page states "Trusted by" Harvard, MIT, Stanford, Oxford and others, "50+ Universities", "100k+ Active Students", "99.9% System Uptime" | Claims the project cannot support; the owner must replace or remove them |
| O-7 | P2 | First passwords are shown to the admin in a notice that stays on screen; nothing forces a change at first sign-in | Product decision (section 23) |
| O-8 | P2 | The admin menu has "Database Export", which always answers 403: export is for the platform owner only | Decide: school-scoped export, or remove the entry |
| O-9 | P2 | The subscription page prints prices of ₹1 per year written in the page; the Free plan says "1 school" while three were created | Prices and limits are the owner's; the server's price configuration is empty by decision |
| O-11 | P2 | The client is one 2.98 MB script | Route-level splitting touches every route; to be done with the E2E run as the safety net |
| O-12 | P3 | A course made by an admin has no class; class names read "Grade 5 - A - Section A"; the student attendance list says "Classroom 1"; course progress shows 67% beside 100%; the quiz clock counts down the window, not the timer; a refused upload says only "Failed to create chapter"; "My Classrooms" shows three made-up initials | Minor; listed for the backlog |
| O-13 | Suspected | After a failed sign-in on `/superadmin/login` the page moved to `/login` within three seconds (seen once; cause not found). The "Sign in with Google" button was not exercised | Needs a look |
| O-15 | P3 | Development-only tools still carry advisories: `nodemon` (server), `vite` 4 and `tailwindcss` 3 (client) | Fix needs major upgrades of build tools; none of it is shipped |
| O-16 | P3 | Dead code: `client/src/accountant/PaymentHistory.tsx` invents a payment every 10 seconds (it is not routed); about 250 one-off scripts in `server/`; unused Mongoose models | Clean-up, not a defect today |

## 28. Browser results by portal

`node tests/e2e/portals.e2e.js`, final code, fresh database, visible Chrome 1366×900. 28 passed, 0 failed.

| Portal | Checks | What was done through the pages | Result |
| --- | --- | --- | --- |
| Platform owner | SA-1…SA-5 | Dashboard closed without a session; wrong password message; sign-in; two schools created with their admins; an invalid email refused; sign-out kills the token on the server | 5 / 5 |
| School admin | AD-1…AD-8 | First sign-in with the one-time password and terms; teacher; class (duplicate refused); two students; course with teacher and students; both fee structures (negative refused); announcement; owner's area and other ids refused | 8 / 8 |
| Teacher | TE-1…TE-6 | Sees the course; chapter with a PDF (disguised file refused); quiz with two questions, one with numeric options, published (backwards window refused); attendance saved twice, one row each; result 82/100 (150/100 refused); admin functions and pages refused | 6 / 6 |
| Student | ST-1…ST-7 | Dashboard shows course, attendance, result; opens the chapter file by signed link (bare address 403); quiz 2/2, no answer key in the paper, second attempt returns the first; announcements, results, attendance; payment says unavailable and records nothing; classmate's records and staff functions refused; a dead session returns to sign-in | 7 / 7 |
| Other school | XS-1 | The second school's admin sees none of the first school's people and gets 404 for seven of its records | 1 / 1 |
| Whole run | REL-1 | No request answered 5xx (AI module and payment 503s are expected and excluded) | 1 / 1 |

Seen in the exploratory pass and not part of the script: owner's institute search, details, staff directory and subscription page; admin users list, calendar and database-export page; teacher classrooms, requirements, calendar and AI page; student certificates, calendar, "My Tests".

Not done in a browser: password reset (needs a mailbox), the paid payment path, AI assessments (BLOCKED, section 26), accountant, storekeeper and vendor portals, layouts on a phone, keyboard-only use.

## 29. Dependencies

`npm audit` had never been run (no `npm` on the machine). The CLI was fetched into a scratch folder (checksum verified against the registry) and used from there.

| Package set | Before (critical / high) | After, all | After, shipped (`--omit=dev`) |
| --- | --- | --- | --- |
| `server` | 2 / 27 | 0 / 3 | 0 / 0 (3 moderate) |
| `client` | 1 / 21 | 0 / 6 | 0 / 0 (2 moderate) |
| `ai-assessment-agent` | 0 / 0 | 0 / 0 | 0 / 0 |
| `student-onboarding-agent` | 0 / 0 | 0 / 0 (2 moderate) | 0 / 0 (2 moderate) |

What changed: in-range updates (`npm audit fix`) in both — among them `proxy-addr`, `axios`, `multer`, `socket.io` parts, `jspdf`, `postcss`, `vite` 4.5.14; and three major upgrades in `server`: `nodemailer` 8 → 10 (send checked through a local JSON transport), `sqlite3` 5 → 6 and `puppeteer` 24 → 25 (their advisories were in install-time download and build chains). All three suites and the browser run pass on the new versions. What remains is development tooling (O-15) and moderate items in `exceljs`/`uuid` and `qs`.

Two things to know when installing: `sqlite3` 6 gets its binary from its install script, which npm 12 blocks until approved (runbook 4.1); and the invoice PDF uses a browser that `puppeteer` 25 has not downloaded on this machine — the code falls back to its PDFKit invoice when the browser is missing.

## 30. Data integrity and reliability

- **Foreign keys.** A database created today and used for the whole browser flow has no row that breaks a declared foreign key (`PRAGMA foreign_key_check`: 0). A copy of the local development database has one, `payments → students`: `payments.studentId` holds a `users.id` while the table declares it against `students(id)` (DATA-006). Experiment: with `LMS_ENFORCE_FOREIGN_KEYS=true` the server suite does not get through (37 of 298 pass; the fixtures and the application's own payment writes are refused). Enforcement therefore stays off, and ownership is enforced in the API and tested there. Turning it on needs `payments` rebuilt to reference `users(id)`, on a backup, with the owner's data — not done.
- **Start-up message.** A new database logs "Could not create index idx_calendar_events_university_id: no such column" once: the index is tried before the column is added, then retried. The index exists afterwards (checked). Harmless; the ordering should still be tidied.
- **Graceful shutdown.** Tested across a real process: a request whose body is still arriving is answered normally, the process exits 0 without needing the 10-second hard stop, the port closes, the database passes its integrity check and starts again.
- **Duplicate submissions.** Attendance saved twice for a day keeps one row per student (browser TE-4 and suite); a quiz submitted twice returns the first result (ST-3 and suite).

## 31. Performance and capacity (measured again)

Same tool and data as section 19 (`scripts/ops/load-test.js`: 2 schools × 2,000 students, read requests by signed-in students). Same laptop (i5-7300U, 4 threads, 8 GB, Windows, antivirus real-time scanning on); the load generator, a second copy of the LMS and Chrome were running on it at the time.

| Concurrent requests | Requests/s | p50 ms | p95 ms | p99 ms | Errors |
| --- | --- | --- | --- | --- | --- |
| 10 | 446 | 19.4 | 38.6 | 51.1 | 0 |
| 50 | 545 | 82.6 | 145.9 | 170.5 | 0 |
| 100 | 563 | 155.7 | 282.8 | 331.1 | 0 |
| 200 | 566 | 311.1 | 564.2 | 617.3 | 0 |

Soak, 120 seconds at 50 concurrent: 68,820 requests, 574 per second, p50 80.7 ms, p95 133.5 ms, p99 151.6 ms, 0 errors. The server's memory rose to about 383 MB in the first 50 seconds and stayed between 381 and 393 MB for the next three minutes; it used one processor core fully (CPU seconds ≈ elapsed seconds), which is the limit: Node runs requests on one thread.

These figures are about 15% below section 19. The dependency upgrades and the other programs running during this measurement both changed between the two runs, and the cause was not separated; treat 550–680 requests per second as the range for this machine. Still not measured: writes, sign-ins, uploads, AI calls, a run of hours, a production host. No statement about a number of users or schools follows from this.

The admin user list (2,041 rows, no paging): 22 ms for one caller, 199 ms p50 with ten.

## 32. Checklist of this pass

- [x] Repository state recorded; existing work untouched; nothing staged, committed or pushed
- [x] Baseline re-run before any change: server 285, AI Assessment 525, Onboarding 343, all passing
- [x] Browser run of the four portals, visible, with fixes verified in the browser
- [x] Scripted browser run in the repository (`npm run e2e:stack`, `npm run e2e:browser`): 28 / 28
- [x] Dependency audit and fixes: no critical or high advisory in shipped code
- [x] Cross-school side effect of fee structures fixed and tested
- [x] Student and plan payment pages use the verified server flow only
- [x] Graceful shutdown tested; foreign-key state measured
- [x] Load test and a short soak repeated
- [x] Deployment and rollback runbook written (`docs/DEPLOYMENT_RUNBOOK.md`)
- [x] Final run: server 298, AI Assessment 525, Onboarding 343, client build, bundle scan
- [ ] Credentials rotated; demo accounts removed (owner)
- [ ] CI run on GitHub (needs a push, the owner's decision)
- [ ] Staging host: runbook executed, real password-reset email, smoke check
- [ ] AI module migrations applied on staging, then the AI pages in a browser
- [ ] Foreign keys: `payments` rebuilt, enforcement on
- [ ] Accountant, storekeeper and vendor portals in a browser
- [ ] Client code splitting; paging on the admin user list
- [ ] Terms text, landing-page claims, consent record, translation and font transfers (owner and legal)

## 33. Why it must not go to real schools yet

1. **Committed credentials are still live** (O-1). Anyone with the repository history can use the mailbox.
2. **Known passwords exist** wherever demo data was seeded (O-2).
3. **Nothing has run outside this laptop**: no deployment, no real email, no CI run, no monitoring or backup schedule. The runbook is untested by definition.
4. **Foreign keys are not enforced** (O-3); integrity depends on application checks alone.
5. **The legal text is a template and the landing page makes claims that are not true of this product** (O-4, O-5).

Staging validation is the right next step because items 3 and part of 4 can only be closed there.

## 34. Tests after Part 4

| Command | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| `cd server && npm test` (`node --test --test-force-exit "tests/**/*.test.js"`) | 298 | 298 | 0 | 0 |
| `cd ai-modules/ai-assessment-agent && npm test` | 525 | 525 | 0 | 0 |
| `cd ai-modules/student-onboarding-agent && npm test` | 343 | 343 | 0 | 0 |
| `cd server && npm run e2e:stack` + `npm run e2e:browser` | 28 | 28 | 0 | 0 |
| `cd client && npm run build` | — | Builds; no source maps; no keys, default credentials, test-upgrade, simulated payment or token-in-address strings | | |
| `npm audit --omit=dev` in all four packages | — | 0 critical, 0 high | | |
| `node scripts/ops/load-test.js` (stepped, and 120 s soak) | — | Section 31 | | |
| Server suite with `LMS_ENFORCE_FOREIGN_KEYS=true` (experiment, section 30) | 298 | 37 | does not complete | — |
| GitHub Actions workflow, client lint (no configuration), real mail, real payment | — | Not run | | |

New in the server suite since Part 3 (13 tests): `integrity/portalWorkflows.test.js` (8), `feesAndCertificates` fee structure (2), `hardening` email addresses and quiz window (2), `startup` graceful shutdown (1).
