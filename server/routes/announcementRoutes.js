const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { id: "announcement" });

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  createAnnouncement,
  getAllAnnouncements,
  deleteAnnouncement,
  markAsRead,
  getAnnouncement,
  suggestNotificationText,
} = require("../controllers/announcementController");

// authMiddleware falls back to a "guest" user (userId null) when the token is
// missing or invalid. Announcements carry personal data (targeted fee
// reminders), so every announcement route requires a real, verified user.
const requireAuthenticatedUser = (req, res, next) => {
  if (!req.user || req.user.userId == null || req.user.role === "guest") {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }
  next();
};

/* ================= ANNOUNCEMENT ROUTES ================= */

// Create announcement (Admin / Mentor) - no quota restrictions
router.post("/", authMiddleware, requireAuthenticatedUser, roleMiddleware(["admin", "mentor"]), createAnnouncement);

// Get announcements (Role based)
router.get("/", authMiddleware, requireAuthenticatedUser, getAllAnnouncements);

// Suggest a short notification message for preview (Admin / Mentor)
router.post("/suggest-text", authMiddleware, suggestNotificationText);

// Get one announcement / notification the user is allowed to see
router.get("/:id", authMiddleware, getAnnouncement);

// Delete announcement (Admin / Creator)
router.delete("/:id", authMiddleware, requireAuthenticatedUser, deleteAnnouncement);

// Mark announcement as read
router.put("/:id/read", authMiddleware, requireAuthenticatedUser, markAsRead);

module.exports = router;
