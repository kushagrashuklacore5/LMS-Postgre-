# Analysis notes and checklist

Working notes for the knowledge base in this folder: how the analysis was done, what was covered, and what was not.
Readers who want the documentation itself should start at [00_INDEX.md](00_INDEX.md).

- **Analysis date:** 16 October 2026
- **Working tree:** branch `security/critical-remediation`, base commit `8946567`, with many uncommitted changes. The documents describe the working tree as it was on that date, not any commit.
- **Method:** static reading of entry points, route registration, middleware, controllers, helpers and schema, plus the existing automated tests. One read-only dump of the local SQLite schema (table and column names only, no rows) was made to confirm the data model.
- **Nothing was changed:** no application code, configuration, dependencies or database contents were modified for this task. No secrets or personal data were copied into these documents.

## How evidence was gathered

| Source | How it was used |
|---|---|
| `server/server.js` | Middleware order, routers mounted under `/api`, background jobs |
| `server/config/accessPolicy.js` | Role gate per API area (first matching rule wins) |
| A read-only route extractor (not committed) | Lists every `router.<method>(...)` of the mounted routers: 297 routes in 42 routers. It records method, path, inline `roleMiddleware` roles and file:line. |
| `PRAGMA table_info` on `server/data/lms_permanent.db`, read only | 60 tables, their columns and declared foreign keys |
| `client/src/App.jsx` | 83 frontend routes and their `requiredRole` |
| `server/tests/**` | Behaviour that the tests already prove (368 server tests passed on 16 October 2026) |

## Checklist

| Area | Status | Notes |
|---|---|---|
| Repository inventory | Done | [02](02_SYSTEM_ARCHITECTURE.md) |
| Entry points, middleware order | Done | `server/server.js` |
| Authentication: login, logout, token, password reset | Done | [04a](04a_WORKFLOWS_ACCOUNTS_AND_ACCESS.md) |
| Role gate and object-level checks | Done | [03](03_ROLES_PERMISSIONS.md) |
| Classes, courses, enrolment | Done (traced in depth) | [04b](04b_WORKFLOWS_TEACHING_AND_LEARNING.md) |
| Chapters, weeks, materials, progress, certificates | Done (main paths) | [04b](04b_WORKFLOWS_TEACHING_AND_LEARNING.md) |
| Legacy assessments (`/api/assessments`) | Partly | Main rules only; question-editor details not traced |
| AI Assessment module (`/api/assessment-agent`) | Partly | Route list, scoping and course link verified; LLM prompts not reviewed |
| Attendance, results | Done (main paths) | Result subject-configuration endpoints listed but not traced |
| Live lectures (JaaS) | Done (traced in depth) | [04c](04c_WORKFLOWS_LIVE_CLASSES_AND_NOTIFICATIONS.md) |
| Notifications and announcements | Done | [04c](04c_WORKFLOWS_LIVE_CLASSES_AND_NOTIFICATIONS.md) |
| Fees, payments, subscriptions | Partly | Gateway behaviour and access verified; installment maths not traced |
| Procurement (storekeeper, vendor, orders, expenses) | Listed only | Routes and roles listed; workflows not traced |
| Translation and bilingual content | Listed only | |
| Student Onboarding Agent (Excel import) | Partly | Integration boundary verified; mapping/LLM internals not reviewed |
| Superadmin (platform owner) | Partly | Contradictions recorded in [12](12_GAPS_AND_OPEN_QUESTIONS.md) |
| Frontend error handling per page | Sampled | Not every page was read |

## Areas not analysed, and why

- **The roughly 200 one-off scripts** at the repository root and in `server/` (for example `check-*.js`, `add_sample_data.js`, `*_FIXED.js`). They are not loaded by `server/server.js` and they are not part of the running application. Several of them write to the database, so they must not be run casually.
- **Backup or broken copies:** `*-backup.js` and `*-broken.js` files, `server/models/*.js` (Mongoose models that the SQLite application does not use), and `server/config/multi-tenant-db-isolated.js` and `tenant-connection-manager.js` (a PostgreSQL multi-tenant layer that the core does not use; see [12](12_GAPS_AND_OPEN_QUESTIONS.md)).
- **`client/dist`, `node_modules` and `temp/`:** build output, installed dependencies and test evidence.
