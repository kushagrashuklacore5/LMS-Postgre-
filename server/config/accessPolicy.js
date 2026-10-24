/**
 * Who may call which part of the API.
 *
 * This table is the single list the API gate (middleware/apiAccessGate.js)
 * reads. Rules are checked top to bottom and the first match wins. A request
 * that matches no rule is refused, so a new route is closed until it is
 * listed here on purpose.
 *
 * Paths are relative to /api. A rule's path matches the path itself and
 * everything below it; `exact: true` matches only the path itself.
 *
 * This is the first line of defence (is the caller signed in, and is their
 * role allowed in this area at all). Handlers still check that the record
 * belongs to the caller's school and, where it matters, to the caller.
 */

const PUBLIC = "public";
const SIGNED_IN = "signed-in";

const STUDENT = "student";
const MENTOR = "mentor";
const ADMIN = "admin";
const SUPERADMIN = "superadmin";
const ACCOUNTANT = "accountant";
const STOREKEEPER = "storekeeper";
const VENDOR = "vendor";

const TEACHING_STAFF = [MENTOR, ADMIN];
const LEARNING = [STUDENT, MENTOR, ADMIN];
const SCHOOL_MEMBERS = [STUDENT, MENTOR, ADMIN, ACCOUNTANT, STOREKEEPER];
const SCHOOL_STAFF = [MENTOR, ADMIN, ACCOUNTANT, STOREKEEPER];
const FINANCE = [ACCOUNTANT, ADMIN];
const PROCUREMENT = [STOREKEEPER, ACCOUNTANT, ADMIN];
const READ = ["GET", "HEAD"];

const rule = (path, access, options = {}) => ({ path, access, ...options });

const ACCESS_POLICY = [
  /* ---------- Public: no session required (each one is intentional) ---------- */
  rule("/auth/login", PUBLIC, { methods: ["POST"], exact: true }),
  rule("/auth/register", PUBLIC, { methods: ["POST"], exact: true }),
  rule("/password-reset", PUBLIC), // forgot-password flow; rate limited, codes hashed
  rule("/student-setup", PUBLIC), // one-time setup link emailed to an imported student
  rule("/superadmin/login", PUBLIC, { methods: ["POST"], exact: true }),
  rule("/superadmin/refresh-token", PUBLIC, { methods: ["POST"], exact: true }),
  rule("/demo-requests", PUBLIC, { methods: ["POST"], exact: true }), // "Book a demo" form on the marketing page
  rule("/live-classes/webhooks/jaas", PUBLIC, { methods: ["POST"], exact: true }), // meeting provider; HMAC signature checked in the route
  // UI language switch, also used on the login page. These only translate the text
  // they are sent; they read nothing from the database.
  rule("/translate", PUBLIC, { methods: ["POST"], exact: true }),
  rule("/translation/translate", PUBLIC, { methods: ["POST"], exact: true }),
  rule("/translation/translate-batch", PUBLIC, { methods: ["POST"], exact: true }),
  rule("/translation/languages", PUBLIC, { methods: READ, exact: true }),
  rule("/language/supported", PUBLIC, { methods: READ, exact: true }),

  /* ---------- Any signed-in account ---------- */
  rule("/auth/logout", SIGNED_IN, { methods: ["POST"], exact: true }),
  // Help assistant: role and school are taken from the session, never from the request (routes/assistantRoutes.js)
  rule("/assistant", SIGNED_IN),

  /* ---------- Platform owner ---------- */
  rule("/superadmin", [SUPERADMIN]),
  rule("/demo-requests", [SUPERADMIN]),
  rule("/plan-inheritance", [SUPERADMIN, ADMIN]),
  rule("/plan-monitor", [SUPERADMIN, ADMIN]),

  /* ---------- Subscriptions ---------- */
  rule("/subscriptions/current", SIGNED_IN, { methods: READ }),
  rule("/subscriptions/check-feature-access", SIGNED_IN, { methods: READ }),
  rule("/subscriptions", [SUPERADMIN, ADMIN]),

  /* ---------- School administration ---------- */
  rule("/admin", [ADMIN]),
  rule("/onboarding", [ADMIN]),
  // Whole-table export is not limited to one school yet, so it is closed to school roles.
  rule("/database-export", [SUPERADMIN]),
  rule("/database-translations", [ADMIN, SUPERADMIN]),
  rule("/bilingual", [ADMIN, SUPERADMIN]),
  rule("/users", SCHOOL_STAFF, { methods: READ }),
  rule("/users", [ADMIN]),

  /* ---------- Teaching and learning ---------- */
  rule("/student", [STUDENT]),
  rule("/assessment-agent", LEARNING), // the module re-checks teacher/student and school itself
  rule("/classrooms", SCHOOL_MEMBERS, { methods: READ }),
  rule("/classrooms", TEACHING_STAFF),
  rule("/student-classrooms", [STUDENT], { methods: READ }),
  rule("/courses", LEARNING, { methods: READ }),
  rule("/courses", TEACHING_STAFF),
  rule("/chapters", LEARNING, { methods: READ }),
  rule("/chapters", TEACHING_STAFF),
  rule("/weeks", LEARNING, { methods: READ }),
  rule("/weeks", TEACHING_STAFF),
  rule("/materials", LEARNING, { methods: READ }),
  rule("/materials", TEACHING_STAFF),
  rule("/assessments/submit", [STUDENT], { methods: ["POST"] }),
  rule("/assessments", LEARNING, { methods: READ }),
  rule("/assessments", TEACHING_STAFF),
  rule("/progress", LEARNING),
  rule("/certificates", LEARNING),
  rule("/attendance", LEARNING, { methods: READ }),
  rule("/attendance", TEACHING_STAFF),
  rule("/results", LEARNING, { methods: READ }),
  rule("/results", TEACHING_STAFF),
  rule("/live-classes", LEARNING),
  rule("/calendar", SCHOOL_MEMBERS, { methods: READ }),
  rule("/calendar", TEACHING_STAFF),
  rule("/calendar_events", SCHOOL_MEMBERS, { methods: READ }),
  rule("/announcements", SCHOOL_MEMBERS),

  /* ---------- Language preferences and content translation ---------- */
  rule("/language", SIGNED_IN),
  rule("/user/language-preference", SIGNED_IN),
  rule("/translation", SIGNED_IN, { methods: READ }),
  rule("/translation", TEACHING_STAFF),

  /* ---------- Fees and payments ---------- */
  rule("/payments", [STUDENT, ...FINANCE]),
  rule("/transactions", [STUDENT, ...FINANCE]),
  rule("/accountant/student-installment-status", [STUDENT, ...FINANCE], { methods: READ }),
  rule("/accountant/student-payments-history", [STUDENT, ...FINANCE], { methods: READ }),
  rule("/accountant/invoice", [STUDENT, ...FINANCE], { methods: READ }),
  rule("/accountant", FINANCE),
  rule("/accountant-export", [SUPERADMIN]), // same reason as /database-export
  rule("/feeStructures", SCHOOL_MEMBERS, { methods: READ }),

  /* ---------- Procurement ---------- */
  rule("/vendor", [VENDOR]),
  rule("/storekeeper", [STOREKEEPER, ADMIN]),
  rule("/stock-requests", PROCUREMENT),
  rule("/inventory", PROCUREMENT, { methods: READ }),
  rule("/vendors", PROCUREMENT, { methods: READ }),
  rule("/expenses", PROCUREMENT),
  rule("/orders", PROCUREMENT),
  rule("/requirements", [MENTOR, ...PROCUREMENT]),
  rule("/requirement_items", [MENTOR, ...PROCUREMENT], { methods: READ }),
];

const normalize = (path) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

function matches(policyRule, method, path) {
  if (policyRule.methods && !policyRule.methods.includes(method)) return false;
  if (path === policyRule.path) return true;
  return !policyRule.exact && path.startsWith(`${policyRule.path}/`);
}

/** Returns "public", "signed-in", a list of roles, or null when nothing allows the request. */
function findAccess(method, path) {
  const normalized = normalize(path);
  const match = ACCESS_POLICY.find((policyRule) => matches(policyRule, method, normalized));
  return match ? match.access : null;
}

module.exports = { ACCESS_POLICY, PUBLIC, SIGNED_IN, findAccess };
