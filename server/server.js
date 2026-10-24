const path = require("path");
require("module").globalPaths.push(path.join(__dirname, "node_modules"));

// Environment first: every module below reads process.env while loading.
// Automated tests set LMS_SKIP_DOTENV so a developer's real .env (mail, payment
// and AI credentials) can never leak into a test run.
if (process.env.LMS_SKIP_DOTENV !== "true") {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
}

const { assertSecureStartup, getAllowedOrigins } = require("./config/securityConfig");
assertSecureStartup();

require("./middleware/asyncErrors"); // errors thrown in async handlers reach the error handler
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

require("./config/database-switch");
const { securityMiddleware } = require("./middleware/security");
const { rateLimiters } = require("./middleware/rateLimiter");
const authMiddleware = require("./middleware/authMiddleware");
const requireTenant = require("./middleware/requireTenant");
const { apiAccessGate } = require("./middleware/apiAccessGate");
const { verifyToken } = require("./config/jwt");
const { UPLOADS_DIR, requireSignedUploadLink } = require("./middleware/uploadPolicy");

// Background jobs (subscription expiry, plan monitor). Tests switch them off.
const backgroundJobsEnabled = process.env.LMS_DISABLE_BACKGROUND_JOBS !== "true";
if (backgroundJobsEnabled) {
  require("./schedulers/subscription-scheduler");
  require("./schedulers/plan-monitor");
}

const app = express();

// Apply security middleware globally (after app creation, before other middleware)
app.use(securityMiddleware);

// Behind a reverse proxy the client address is in X-Forwarded-For. Trust it only
// when the operator says how many proxies there are; otherwise anyone could spoof
// the address the rate limiters count by.
if (process.env.TRUST_PROXY_HOPS) {
  app.set("trust proxy", parseInt(process.env.TRUST_PROXY_HOPS, 10) || 0);
}

// Every request gets an id (returned as X-Request-Id) and one log line when it ends:
// what was asked, by which account, the result and how long it took. No bodies, query
// strings, tokens or names are logged.
app.use((req, res, next) => {
  req.id = require("crypto").randomUUID();
  res.setHeader("X-Request-Id", req.id);
  if (process.env.LMS_ACCESS_LOG === "off") return next();
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      userId: req.user?.userId ?? null,
      role: req.user?.role ?? null,
      school: req.user?.universityId ?? null,
    }));
  });
  next();
});

// Set timeout configurations for stability
app.use((req, res, next) => {
  res.setTimeout(300000, () => {
    res.status(408).send("Request timeout");
  });
  next();
});

/* ================= CORS ================= */
// One explicit allow-list. A wildcard origin together with credentials would let
// any website call this API with a signed-in user's session.
const allowedCorsOrigins = getAllowedOrigins();
console.log("CORS origins allowed:", allowedCorsOrigins);

app.use(
  cors({
    origin: allowedCorsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-User-ID", "Cache-Control", "Accept", "X-Language"],
    exposedHeaders: ["Content-Length", "Content-Type", "Content-Disposition"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  })
);

// JSON bodies are small in this application (files travel as multipart uploads with their
// own limits), so a modest ceiling keeps one request from exhausting memory.
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || "5mb";
app.use(express.json({
  limit: jsonBodyLimit,
  // the meeting provider's webhook signature is computed over the exact bytes received
  verify: (req, res, buf) => {
    if (req.originalUrl.startsWith("/api/live-classes/webhooks/")) req.rawBody = buf.toString("utf8");
  },
}));
app.use(express.urlencoded({ limit: jsonBodyLimit, extended: true }));

/* ================= APP & SERVER ================= */
const server = http.createServer(app);

// Set server timeout configurations for stability
server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // 66 seconds
server.requestTimeout = 300000; // 5 minutes

/* ================= SOCKET.IO ================= */
const io = new Server(server, {
  cors: {
    origin: allowedCorsOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

// Realtime events carry school data, so a socket only receives them after it has
// proved who it is. It then joins a room for its own account and one for its school.
// A socket without a valid token stays connected but is in no room and hears nothing.
io.on("connection", async (socket) => {
  try {
    const socketToken = socket.handshake?.auth?.token;
    if (!socketToken) return;
    const principal = await authMiddleware.resolvePrincipal(verifyToken(socketToken));
    if (!principal || principal.stale) return;
    if (principal.userId != null) socket.join(`user:${principal.userId}`);
    if (principal.universityId != null) socket.join(`school:${principal.universityId}`);
  } catch (socketAuthErr) {
    // Invalid or expired token: no rooms, no events.
  }
});

const SECRET_FIELDS = new Set(["password", "password_hash", "db_password", "razorpay_signature", "otp"]);

/** Deep copy of a realtime payload without credential fields. */
function withoutSecrets(value) {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_FIELDS.has(key))
        .map(([key, nested]) => [key, withoutSecrets(nested)])
    );
  }
  return value;
}

/* Realtime access for controllers: req.io.emit() reaches only the caller's own school. */
app.use((req, res, next) => {
  req.io = {
    emit: (event, payload) => {
      const universityId = req.user?.universityId;
      if (universityId == null) return false;
      return io.to(`school:${universityId}`).emit(event, withoutSecrets(payload));
    },
    to: (room) => io.to(room),
  };
  next();
});

// Notifications: realtime delivery + time-based reminders (deadlines, attendance, approvals)
require("./services/notificationService").setIo(io);
if (backgroundJobsEnabled) {
  require("./schedulers/notification-scheduler").start();
}

// Plan changes are announced to the school they belong to, not to every connected browser.
global.emitPlanChange = (planChangeData) => {
  const universityId = planChangeData?.universityId ?? planChangeData?.university_id;
  if (universityId == null) return;
  io.to(`school:${universityId}`).emit("planChanged", planChangeData);
};

// Start server-side translator monitor (optional - controlled via MONITOR_* env vars)
if (backgroundJobsEnabled) {
  try {
    const startTranslatorMonitor = require("./monitor/translatorMonitor");
    startTranslatorMonitor(io).catch && startTranslatorMonitor(io);
  } catch (e) {
    console.warn("Could not start translator monitor:", e.message || e);
  }
}

/* ================= MIDDLEWARE ================= */
// Language middleware - extract user's language preference
const languageMiddleware = require("./middleware/languageMiddleware");
app.use(languageMiddleware);

/* ================= STATIC FILES ================= */
// Uploaded files are served as downloads with their sniffing disabled, so an
// uploaded HTML or SVG file cannot run script in the LMS origin.
app.use(
  "/uploads",
  requireSignedUploadLink, // private: only links handed out by the API to an authorised caller
  express.static(UPLOADS_DIR, {
    dotfiles: "deny",
    index: false,
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      if (/\.(html?|svg|xml|xhtml|js|mjs)$/i.test(filePath)) {
        res.setHeader("Content-Disposition", "attachment");
      }
    },
  })
);

/* ================= HEALTH ================= */
// Liveness: the process is up and answering.
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Readiness: the process can also reach its database, and is not shutting down.
// A load balancer or supervisor should send traffic only while this answers 200.
let shuttingDown = false;
app.get("/health/ready", (req, res) => {
  if (shuttingDown) return res.status(503).json({ status: "shutting_down" });
  require("./config/database-switch").get("SELECT 1 AS ok", [], (err, row) => {
    if (err || !row) return res.status(503).json({ status: "database_unavailable" });
    res.json({ status: "ready" });
  });
});

/* ================= API ACCESS GATE ================= */
// Deny by default: every /api request must match an entry in config/accessPolicy.js.
// Public entries pass; everything else needs a valid session and an allowed role.
app.use("/api", rateLimiters.general, apiAccessGate);

/* ================= ROUTES ================= */

/* Auth & Users */
app.use("/api/auth", require("./routes/auth-routes"));
app.use("/api/password-reset", require("./routes/passwordResetRoutes"));
app.use("/api/users", require("./routes/user-routes"));
app.use("/api/student", require("./routes/student-routes"));

/* Language Preferences */
app.use("/api/language", require("./routes/languageRoutes"));

/* Admin (ADD STUDENT / TEACHER / CLASSROOM later) */
app.use("/api/admin", require("./routes/adminRoutes"));

/* Student Onboarding Agent */
const onboarding = require("./routes/onboardingRoutes");
app.use("/api/onboarding", authMiddleware, requireTenant, onboarding.router, onboarding.errorHandler);
app.use("/api/student-setup", onboarding.setupRateLimit, onboarding.setupRouter, onboarding.errorHandler);

/* AI Assessment Agent */
const assessmentAgent = require("./routes/assessmentAgentRoutes");
app.use("/api/assessment-agent", authMiddleware, requireTenant, assessmentAgent.router, assessmentAgent.errorHandler);

/* ✅ CLASSROOMS (NEW – NO LOGIC CHANGE) */
app.use("/api/classrooms", require("./routes/classroomRoutes"));

/* LMS Core */
app.use("/api/chapters", require("./routes/chapter-routes"));
app.use("/api/courses", require("./routes/course-routes"));
app.use("/api/progress", require("./routes/progress-routes"));
app.use("/api/certificates", require("./routes/certificate-routes"));
app.use("/api/materials", require("./routes/materialRoutes"));
app.use("/api/assessments", require("./routes/assessmentRoutes"));
app.use("/api/weeks", require("./routes/weekRoutes"));
app.use("/api/attendance", require("./routes/attendanceRoutes"));
app.use("/api/results", require("./routes/resultRoutes"));

/* Calendar */
app.use("/api/calendar", require("./routes/calendarRoutes"));

/* Live Classes */
app.use("/api/live-classes", require("./routes/liveClassRoutes"));

// Help assistant (forwards to universalChatbot with the verified role)
app.use("/api/assistant", require("./routes/assistantRoutes"));

/* Announcements */
app.use("/api/announcements", require("./routes/announcementRoutes"));

/* Database Export */
app.use("/api/database-export", require("./routes/databaseExportRoutes"));

/* Database Translations */
app.use("/api/database-translations", require("./routes/translations"));

/* Accountant Export */
app.use("/api/accountant-export", require("./routes/accountantExportRoutes"));

/* Translation */
app.use("/api/translation", require("./routes/translationRoutes"));

/* User Language */
app.use("/api/user", require("./routes/userLanguageRoutes"));

/* Translations */
app.use("/api", require("./routes/translate"));

/* Bilingual Database Operations */
app.use("/api/bilingual", require("./routes/bilingual"));

/* Payments */
app.use("/api/payments", require("./routes/payment-routes"));

/* Subscriptions */
app.use("/api/subscriptions", require("./routes/subscription-routes"));

/* Book a Demo Requests */
app.use("/api/demo-requests", require("./routes/demoRoutes"));

/* Plan Inheritance System */
app.use("/api/plan-inheritance", require("./routes/plan-inheritance-routes"));

/* Plan Monitor System */
app.use("/api/plan-monitor", require("./routes/plan-monitor-routes"));

/* Transactions */
app.use("/api/transactions", require("./routes/transaction-routes"));

/* Requirements - MUST come BEFORE Universal Routes */
app.use("/api/requirements", require("./routes/requirement-routes"));

/* Orders */
app.use("/api/orders", require("./routes/orders-routes"));

/* Expenses */
app.use("/api/expenses", require("./routes/expenses-routes"));

/* Accountant Portal */
app.use("/api/accountant", require("./routes/accountantRoutes"));

/* Storekeeper Portal */
app.use("/api/storekeeper", require("./routes/storekeeperRoutes"));

/* Enhanced Stock Requests System */
app.use("/api/stock-requests", require("./routes/stockRequestsRoutes"));
app.use("/api/stock-requests/templates", require("./routes/requestTemplatesRoutes"));

/* Vendor Portal */
app.use("/api/vendor", require("./routes/vendorRoutes"));

/* Superadmin Portal */
app.use("/api/superadmin", require("./routes/superadminRoutes"));

/* School-scoped entity routes - MUST be last */
app.use("/api", require("./routes/universalRoutes"));

/* Unknown API paths get JSON, not the HTML default */
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

/* Global Error Handler */
const { globalErrorHandler } = require("./middleware/global-error-handler");
app.use(globalErrorHandler);

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.json({ message: "🚀 Unstop LMS API running" });
});

/* ================= PROCESS SAFETY NET ================= */
// One failing request must not take the whole service down. Errors that escape a
// request (for example thrown inside a database callback) are logged, and the
// process keeps serving other schools.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason instanceof Error ? reason.stack : reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error.stack || error.message);
  // Under a process supervisor (LMS_EXIT_ON_FATAL=true) the safest reaction is a clean
  // restart. Without one, exiting would turn a single failed request into an outage.
  if (process.env.LMS_EXIT_ON_FATAL === "true") shutdown("uncaughtException", 1);
});

// Graceful shutdown: stop taking new requests, let running ones finish, close sockets and
// the database, then exit. A hard exit follows if that takes longer than 10 seconds.
function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down (${reason})...`);
  const hardStop = setTimeout(() => process.exit(exitCode || 1), 10000);
  hardStop.unref();
  io.close(() => {
    server.close(() => {
      require("./config/database-switch").close(() => process.exit(exitCode));
    });
  });
}

/* ================= START SERVER ================= */
// The database comes first: no requests are accepted until PostgreSQL is reachable and its
// schema is current. Anything else is a configuration problem, reported once, and the process exits.
async function start(port = process.env.PORT || 5002) {
  server.on("error", (err) => {
    console.error("❌ Server socket error:", err.message, err.code);
    process.exit(1);
  });

  const db = require("./config/database-switch");
  try {
    await db.connect();
    const demo = require("./config/demoSeed");
    await demo.seedDemoData(db);
    // Accounts that still use a published (demo) password are open doors: production refuses to start.
    const exposed = await demo.findAccountsWithPublishedPasswords(db);
    if (exposed.length) {
      const list = exposed.map((a) => `${a.email} (${a.role})`).join(", ");
      if (process.env.NODE_ENV === "production") {
        throw new Error(`${exposed.length} account(s) still use a published demo password: ${list}. Change or remove them before starting in production.`);
      }
      console.warn(`⚠️  ${exposed.length} account(s) use a published demo password (refused in production): ${list}`);
    }
  } catch (err) {
    console.error(`❌ Database start-up failed: ${err.message}`);
    process.exit(1);
  }

  return server.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${server.address().port}`);
  });
}

if (require.main === module) {
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  // Windows has no SIGTERM: a supervisor there asks for a clean stop with a message
  // (PM2 does this with `shutdown_with_message: true`).
  process.on("message", (message) => {
    if (message === "shutdown") shutdown("shutdown message");
  });
  start();
}

module.exports = { app, server, io, start };
