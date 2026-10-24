# Integrations and configuration

- **Configuration source:** environment variables, loaded from `server/.env` (template: `server/.env.example`).
- **What this page contains:** only names and placeholder examples. Real values must never be written into documents, logs or prompts.
- **Test safety:** tests refuse to run when real service secrets are present (`server/tests/helpers/testApp.js`, `REAL_SERVICE_VARIABLES`).

## External services

| Service | Purpose | Code | Required variables | When not configured |
|---|---|---|---|---|
| Email (nodemailer; Zoho by default) | Password-reset codes, onboarding setup links, notifications by email where used | `server/services/emailService.js` | `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`; `EMAIL_TRANSPORT=mock` keeps mail in memory | Emails are not delivered; the flows that need them cannot complete |
| Razorpay | Online fee payments and plan purchases | `server/controllers/payment-controller.js`, `subscription-routes.js` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PLAN_PRICE_STANDARD_INR`, `PLAN_PRICE_PROFESSIONAL_INR`, `PLAN_PERIOD_DAYS` | **503** "gateway not configured" (the intended state at the moment) |
| Jitsi as a Service (8x8 JaaS) | Embedded live lectures | `server/helpers/jaas.js` | `JAAS_APP_ID`, `JAAS_API_KEY_ID`, `JAAS_PRIVATE_KEY` or `JAAS_PRIVATE_KEY_FILE`, `JAAS_WEBHOOK_SECRET` (optional), `JAAS_TOKEN_TTL_MINUTES` | "Start now" and Join answer **503**; scheduling still works. Without the webhook secret, webhooks get 401 and attendance comes from the meeting page. |
| Hugging Face Inference (open-weight LLM) | AI question generation, assignment evaluation proposals, performance analysis | `ai-modules/ai-assessment-agent/backend/src/llm/` | `AIA_LLM_PROVIDER`, `AIA_LLM_MODEL`, `HF_TOKEN`, `AIA_AI_GENERATION_ENABLED`, `AIA_LLM_TIMEOUT_MS` | AI features report unavailable; manual authoring still works |
| LLM for import column mapping | Mapping Excel columns during student import | `ai-modules/student-onboarding-agent/backend/src/llm/` | Configured in that module's `config/` (not traced) | Manual mapping (Documented) |
| LibreTranslate (optional) | UI and content translation | `server/services/translationService.js` | `LIBRE_TRANSLATE_URL` / `LIBRETRANSLATE_URL` | The built-in or simple translator is used (not traced) |
| socket.io | Realtime notifications and school events | `server/server.js` | none | The bell still polls |

## Core server configuration

| Variable | Meaning | Placeholder |
|---|---|---|
| `NODE_ENV` | `development` / `production` | `production` |
| `PORT` | API port | `5002` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets (required) | `<long random string>` |
| `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` | Token lifetimes | `15m`, `7d` |
| `CORS_ORIGINS` (or `FRONTEND_ORIGIN`) | Allowed web origins (`server/config/securityConfig.js`) | `https://lms.example.org` |
| `TRUST_PROXY_HOPS` | Proxy hops for client IPs (rate limits) | `1` |
| `LMS_SQLITE_PATH` | Database file | `/var/lib/lms/lms.db` |
| `LMS_UPLOADS_DIR` | Upload folder (must be on persistent storage and backed up) | `/var/lib/lms/uploads` |
| `UPLOAD_LINK_TTL_MINUTES` | Lifetime of signed file links | `240` |
| `JSON_BODY_LIMIT` | Maximum JSON body | `5mb` |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | General API rate limit | `60000`, `3000` |
| `LMS_ENFORCE_FOREIGN_KEYS` | Turn on SQLite foreign key enforcement | `true` |
| `LMS_DISABLE_BACKGROUND_JOBS` | Turn off schedulers (tests) | `true` |
| `LMS_ACCESS_LOG` | `off` turns off the per-request log | `off` |
| `NOTIFICATION_SWEEP_INTERVAL_MS`, `ATTENDANCE_REMINDER_HOUR`, `NOTIFICATION_AI_TEXT_ENABLED` | Notification sweep | `900000`, `11`, `false` |
| `ALLOW_PUBLIC_REGISTRATION`, `PUBLIC_REGISTRATION_SCHOOL_ID` | Self-registration (off by default) | `false`, `<school id>` |
| `ONBOARDING_EMAIL_ENABLED`, `STUDENT_SETUP_URL` | Student setup emails and their link | `true`, `https://lms.example.org/setup-password` |
| `TRIAL_DURATION_DAYS`, `DEFAULT_SUBSCRIPTION_PLAN` | Plans | `14`, `free` |
| `AIA_SUBMISSIONS_DIR`, `AIA_QUESTION_IMAGES_DIR` | AI module file storage | `/var/lib/lms/aia/...` |
| `FRONTEND_URL`, `API_URL` | Used in the security headers' allowed origins | `https://lms.example.org` |

The following are read by code that the core does not use: `USE_POSTGRES`, `MASTER_DB_*`, `TENANT_DB_*`, `MONGO_URI`, `SEED_DEMO_DATA` (E2E stack only). This is a Gap: a reader could think a second database is in use, but none is.

## Frontend configuration

- **API address:** `client/src/config/api.js` (`API_BASE`). Set `VITE_BACKEND_URL` (ending in `/api`) at build time to point a build at another server.
- **Development server:** the Vite development server runs on port 5174.
- **Content Security Policy:** if the production host of the web client sets one, it must allow `https://8x8.vc` in `script-src` and `frame-src`, otherwise the embedded meeting cannot load. The API's own security headers (`server/middleware/security.js`) apply to API responses only.

## Setup prerequisites (verified from the repository)

- **Node.js.** The server and client need Node. The AI Assessment module declares `node >= 22.5` (it uses `node:sqlite`).
- **Install.** Run `npm install` in `server/` and `client/`. The AI modules have their own `package.json`.
- **Start in development.**
  - Server: `node server.js`, port 5002.
  - Client: `node node_modules/vite/bin/vite.js --port 5174`, or the repository's start script.
- **Database.** It is created and migrated automatically at server start. The AI module's SQL migrations are applied with its own script.
- **Clock.** The server's clock and time zone must be correct. Signed links, JWT `nbf`/`exp`, JaaS tokens and webhook signatures all depend on time.
- **Deployment.** See `docs/DEPLOYMENT_RUNBOOK.md` (existing; not re-verified here).
