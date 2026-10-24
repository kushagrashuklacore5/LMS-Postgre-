const authMiddleware = require("./authMiddleware");
const { findAccess, PUBLIC, SIGNED_IN } = require("../config/accessPolicy");
const { requestIdsInCallerSchool } = require("../helpers/schoolScope");
const { signUploadLinksInResponses } = require("./uploadPolicy");

// Roles that are not members of one school: the platform owner, and vendors
// (an outside supplier, whose routes are scoped to the vendor's own id).
const ROLES_WITHOUT_SCHOOL = ["superadmin", "vendor"];

/**
 * Deny-by-default gate for everything under /api (mounted in server.js before
 * any route). Order of checks:
 *   1. public rule            -> continue without a session
 *   2. no valid session       -> 401 (from authMiddleware)
 *   3. no rule for this path, or the role is not listed -> 403
 *   4. a school role whose account has no school        -> 403
 *   5. an id in the query or body that belongs to another school -> 404
 * A caller therefore learns whether a path exists only after signing in.
 */
function apiAccessGate(req, res, next) {
  // CORS preflight carries no credentials by design
  if (req.method === "OPTIONS") return next();

  const access = findAccess(req.method, req.path);
  if (access === PUBLIC) return next();

  authMiddleware(req, res, () => {
    const { role, universityId } = req.user;
    // Older accounts carry the role name "teacher"; it is the same role as "mentor".
    const policyRole = role === "teacher" ? "mentor" : role;

    if (!access) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (access !== SIGNED_IN && !access.includes(policyRole)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    // There is no default school: every school role must belong to one.
    if (!ROLES_WITHOUT_SCHOOL.includes(role) && universityId == null) {
      return res.status(403).json({ success: false, message: "Your account is not attached to a school." });
    }
    // File paths in this caller's responses become expiring signed links
    signUploadLinksInResponses(res);
    requestIdsInCallerSchool(req, res, next);
  });
}

module.exports = { apiAccessGate };
