const db = require("../config/database-switch");
const { isUndefinedTable } = require("../helpers/dbErrors");
const { verifyToken } = require("../config/jwt");

/**
 * Authentication for every protected API route.
 *
 * A request is authenticated only when it carries a correctly signed, unexpired
 * token AND the account it names still exists with the same role and school.
 * Role and school are then taken from the database row, never from the token,
 * so a deleted account, a role change or a school change takes effect at once
 * instead of when the 7-day token expires.
 *
 * Anything else is answered with 401. There is no "guest" user.
 */

const dbGet = (sql, params) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const sameSchool = (a, b) => String(a) === String(b);

/**
 * Loads the account a verified token refers to.
 * Returns null when the account is gone, { stale } when it no longer matches the token.
 */
async function resolvePrincipal(claims) {
  // Platform owner tokens issued by POST /api/superadmin/login
  if (claims.role === "superadmin" && claims.superadminId != null && claims.userId == null) {
    let owner;
    try {
      owner = await dbGet("SELECT id, email, status FROM superadmins WHERE id = ?", [claims.superadminId]);
    } catch (err) {
      // No superadmins table on this database: such a token cannot be valid here.
      if (isUndefinedTable(err)) return null;
      throw err;
    }
    if (!owner || owner.status !== "active") return null;
    return {
      userId: null,
      superadminId: owner.id,
      role: "superadmin",
      email: owner.email,
      name: "Super Admin",
      universityId: null,
    };
  }

  if (!/^\d+$/.test(String(claims.userId))) return null;

  if (claims.role === "vendor") {
    const vendor = await dbGet("SELECT * FROM vendors WHERE id = ?", [claims.userId]);
    if (!vendor) return null;
    return {
      userId: vendor.id,
      role: "vendor",
      email: vendor.email,
      name: vendor.name || "",
      universityId: vendor.university_id ?? null,
    };
  }

  const account = await dbGet("SELECT * FROM users WHERE id = ?", [claims.userId]);
  // A removed account, or one an admin has not approved (or has un-approved), has no session.
  if (!account || !account.isApproved) return null;

  // Signing out (or resetting the password) ends every session issued before that moment.
  if (account.sessions_valid_from && Number(claims.iat) < Number(account.sessions_valid_from)) return null;

  // A correctly signed token whose role or school no longer matches the account
  // (the account was changed after login) must not act with the old claims.
  const claimedSchool = claims.universityId ?? claims.university_id;
  const schoolChanged =
    claimedSchool != null && account.university_id != null && !sameSchool(claimedSchool, account.university_id);
  if (schoolChanged) return { stale: "TENANT_MISMATCH" };
  if (account.role !== claims.role) return { stale: "FORBIDDEN" };

  return {
    userId: account.id,
    role: account.role,
    email: account.email,
    name: account.name || "",
    universityId: account.university_id ?? null,
    isApproved: Boolean(account.isApproved),
  };
}

const unauthorized = (res, message) => res.status(401).json({ success: false, message });

module.exports = async (req, res, next) => {
  // The API gate in server.js already authenticated this request.
  if (req.authenticated) return next();

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return unauthorized(res, "Authentication required");

  let claims;
  try {
    claims = verifyToken(token);
  } catch (err) {
    if (err.code === "AUTH_NOT_CONFIGURED") {
      console.error("Auth:", err.message);
      return res.status(503).json({ success: false, message: "Authentication is not configured on this server." });
    }
    return unauthorized(res, err.name === "TokenExpiredError" ? "Session expired. Please log in again." : "Invalid authentication token");
  }

  try {
    const principal = await resolvePrincipal(claims || {});
    if (!principal) return unauthorized(res, "Session is no longer valid. Please log in again.");
    if (principal.stale) {
      const message = "This session no longer matches your account. Please log in again.";
      return res.status(403).json({ success: false, message, error: { code: principal.stale, message } });
    }
    req.user = principal;
    req.authenticated = true;
    next();
  } catch (err) {
    console.error("Auth: account lookup failed:", err.message);
    res.status(500).json({ success: false, message: "Authentication check failed" });
  }
};

module.exports.resolvePrincipal = resolvePrincipal;
