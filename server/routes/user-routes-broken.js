const express = require("express");
const {
  getAllUsers,
  approveMentor,
  rejectMentor,
  deleteUser,
  getMentors,
  getStudents,
  updateUser,
  getAdminDashboard,
} = require("../controllers/user-controller");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

/* ================= ADMIN ROUTES ================= */
router.get(
  "/all",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAllUsers
);

router.put(
  "/approve-mentor/:userId",
  authMiddleware,
  roleMiddleware(["admin"]),
  approveMentor
);

router.delete(
  "/reject-mentor/:userId",
  authMiddleware,
  roleMiddleware(["admin"]),
  rejectMentor
);

router.delete(
  "/:userId",
  authMiddleware,
  roleMiddleware(["admin"]),
  deleteUser
);

router.get(
  "/mentors",
  authMiddleware,
  roleMiddleware(["admin"]),
  getMentors
);

router.get(
  "/students",
  authMiddleware,
  roleMiddleware(["admin"]),
  getStudents
);

router.put(
  "/:userId",
  authMiddleware,
  roleMiddleware(["admin"]),
  updateUser
);

router.get(
  "/dashboard",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAdminDashboard
);

module.exports = router;
  roleMiddleware(["admin"]),
  registerMentor
);

/* ================= MENTOR ROUTES ================= */
router.get(
  "/students",
  authMiddleware,
  roleMiddleware(["mentor"]),
  getStudents
);

router.get(
  "/mentor/dashboard-stats",
  authMiddleware,
  roleMiddleware(["mentor"]),
  getMentorDashboardStats
);

/* ================= COURSE / MENTOR HELPERS ================= */
router.get(
  "/mentors-for-course",
  authMiddleware,
  getMentorsForCourse
);

router.get(
  "/mentors-simple",
  getAllMentorsSimple
);

/* ================= STUDENT ROUTES ================= */
router.get(
  "/student/classroom",
  authMiddleware,
  roleMiddleware(["student"]),
  getStudentClassroom
);

module.exports = router;
