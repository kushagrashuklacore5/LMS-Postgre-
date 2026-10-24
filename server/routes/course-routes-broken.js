const express = require("express");
const {
  createCourse,
  getAllCourses,
  getCoursesByMentor,
  getCourseById,
  updateCourse,
  deleteCourse,
} = require("../controllers/course-controller");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

/* ================= CREATE COURSE ================= */
router.post(
  "/create-course",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  createCourse
);

/* ================= GET ALL COURSES ================= */
router.get("/", authMiddleware, getAllCourses);

/* ================= GET MENTOR COURSES ================= */
router.get(
  "/mentor",
  authMiddleware,
  roleMiddleware(["mentor"]),
  getCoursesByMentor
);

/* ================= GET COURSE BY ID ================= */
router.get("/:id", authMiddleware, getCourseById);

/* ================= UPDATE COURSE ================= */
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  updateCourse
);

/* ================= DELETE COURSE ================= */
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  deleteCourse
);

module.exports = router;

/* ================= GET STUDENT COURSES ================= */
router.get(
  "/student-courses",
  authMiddleware,
  roleMiddleware(["student"]),
  getStudentCourses
);

/* ================= GET COURSE BY ID ================= */
router.get(
  "/:id",
  authMiddleware,
  getCourseById
);

/* ================= UPDATE COURSE ================= */
router.put(
  "/update-course/:id",
  authMiddleware,
  roleMiddleware(["mentor"]),
  updateCourse
);

/* ================= DELETE COURSE ================= */
router.delete(
  "/delete-course/:id",
  authMiddleware,
  roleMiddleware(["mentor"]),
  deleteCourse
);

module.exports = router;
