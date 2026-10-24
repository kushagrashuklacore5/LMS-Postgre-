const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getAllClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getClassroomAnalytics,
} = require("../controllers/classroomController");

/* ================= ADMIN ONLY ================= */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
};

/* ================= ROUTES ================= */

// ADMIN
router.post(
  "/",
  authMiddleware,
  adminOnly,
  createClassroom
);

router.get("/", authMiddleware, adminOnly, getAllClassrooms);

router.get(
  "/analytics",
  authMiddleware,
  adminOnly,
  getClassroomAnalytics
);

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  updateClassroom
);

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteClassroom
);

module.exports = router;
);

// GET BY ID (MOVED TO BOTTOM TO AVOID CONFLICT)
router.get("/:id", authMiddleware, adminOnly, getClassroomById);

module.exports = router;
