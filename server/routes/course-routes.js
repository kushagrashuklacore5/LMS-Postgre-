const express = require("express");
const {
  createCourse,
  getAllCourses,
  getCoursesByMentor,
  getCoursesByStudent,
  getCourseById,
  updateCourse,
  deleteCourse,
  getCoursesByClassroom,
  assignStudentsToCourse,
  getAssignedStudents,
  getStudentDebugData
} = require("../controllers/course-controller");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { checkCoursesQuota } = require("../middleware/quotaMiddleware");

const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { id: "course", courseId: "course", classroomId: "classroom" });

/* ================= CREATE COURSE ================= */
router.post(
  "/create-course",
  authMiddleware,
  roleMiddleware(["mentor", "admin", "teacher"]),
  checkCoursesQuota,
  createCourse
);

/* ================= GET ALL COURSES ================= */
router.get("/", authMiddleware, getAllCourses);

/* ================= GET COURSES BY CLASSROOM ================= */
router.get(
  "/classroom/:classroomId",
  authMiddleware,
  getCoursesByClassroom
);
router.get(
  "/classroom",
  authMiddleware,
  getCoursesByClassroom
);

/* ================= GET MENTOR COURSES ================= */
router.get(
  "/mentor",
  authMiddleware,
  roleMiddleware(["mentor"]),
  getCoursesByMentor
);

/* ================= GET STUDENT COURSES ================= */
router.get(
  "/student",
  authMiddleware,
  roleMiddleware(["student"]),
  getCoursesByStudent
);

/* ================= COURSES TAUGHT TO WHOLE CLASSES ================= */
// helpers/courseClasses.js decides who may do what: admins assign classes; a teacher sees
// the students of the courses they teach. A student never gets here (403).
const courseClasses = require("../helpers/courseClasses");
const { HttpError } = require("../helpers/teachingScope");
const respond = (work) => async (req, res) => {
  try {
    res.json({ success: true, data: await work(req) });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Course classes error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Both teacher views: my courses with their classes, and my classes with their courses
router.get("/teaching/overview", authMiddleware, respond((req) => courseClasses.teachingOverview(req)));

// Students of one course, grouped by class (?inClass= for one class, ?q= to search). The filter
// is not called classroomId on purpose: that name makes the gate check that the caller works in
// the class, but a teacher may filter by the class of any student enrolled in their course, and
// the answer never holds anyone who is not enrolled in it.
router.get("/:courseId/roster", authMiddleware, respond((req) => courseClasses.courseRoster(req, req.params.courseId, req.query)));

router.get("/:courseId/classrooms", authMiddleware, respond((req) => courseClasses.listCourseClasses(req, req.params.courseId)));
router.post(
  "/:courseId/classrooms",
  authMiddleware,
  roleMiddleware(["admin"]),
  respond((req) => courseClasses.assignCourseToClasses(req, req.params.courseId, req.body?.classroomIds, { scope: req.body?.scope, studentIds: req.body?.studentIds }))
);
router.delete(
  "/:courseId/classrooms/:classroomId",
  authMiddleware,
  roleMiddleware(["admin"]),
  respond((req) => courseClasses.removeCourseClass(req, req.params.courseId, req.params.classroomId))
);
// One class of the course: its whole roster with who is enrolled, and setting who is (admin only)
router.get(
  "/:courseId/classrooms/:classroomId/students",
  authMiddleware,
  roleMiddleware(["admin"]),
  respond((req) => courseClasses.courseClassRoster(req, req.params.courseId, req.params.classroomId))
);
router.put(
  "/:courseId/classrooms/:classroomId/students",
  authMiddleware,
  roleMiddleware(["admin"]),
  respond((req) => courseClasses.setClassEnrolment(req, req.params.courseId, req.params.classroomId, { studentIds: req.body?.studentIds, scope: req.body?.scope }))
);

/* ================= ASSIGN STUDENTS TO COURSE ================= */
router.post(
  "/:id/assign-students",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  assignStudentsToCourse
);

/* ================= GET ASSIGNED STUDENTS ================= */
router.get(
  "/:courseId/students",
  authMiddleware,
  getAssignedStudents
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

module.exports = router;
