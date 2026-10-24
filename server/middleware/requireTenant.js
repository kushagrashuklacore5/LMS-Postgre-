const db = require("../config/database-switch");

/**
 * Requires the signed-in account to belong to a school that exists.
 * Runs after authMiddleware. The school comes from the account's database row
 * (set by authMiddleware), so there is no default school to fall back to.
 */
module.exports = (req, res, next) => {
  const universityId = req.user?.universityId;
  if (!/^\d+$/.test(String(universityId))) {
    return res.status(403).json({ success: false, message: "Your account is not attached to a school." });
  }

  db.get("SELECT id FROM universities WHERE id = ?", [universityId], (err, school) => {
    if (err) {
      console.error("Tenant check failed:", err.message);
      return res.status(500).json({ success: false, message: "School check failed" });
    }
    if (!school) {
      return res.status(403).json({ success: false, message: "Your account is not attached to a school." });
    }
    next();
  });
};
