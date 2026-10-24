const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { studentId: "user", classroomId: "classroom" });
const resultController = require("../controllers/resultController");
const subjectConfigController = require("../controllers/subjectConfigController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Student: Get my results
router.get(
  "/my-results",
  authMiddleware,
  resultController.getMyResults
);

// Student: Get results by student ID
router.get(
  "/student/:studentId",
  authMiddleware,
  resultController.getStudentResults
);

// Teacher: Get classroom results
router.get(
  "/classroom/:classroomId",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  resultController.getClassroomResults
);

// Teacher: Add/Update result
router.post(
  "/add",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  resultController.addResult
);

/* ================= SUBJECT CONFIGURATION (CLASS TEMPLATE + STUDENT OVERRIDES) ================= */
const teacherOnly = [authMiddleware, roleMiddleware(["mentor", "admin"])];

// Classrooms the logged-in mentor/admin is allowed to manage
router.get("/subjects/classrooms", teacherOnly, subjectConfigController.getManageableClassrooms);

// Class/section subject template
router.get("/subjects/classroom/:classroomId", teacherOnly, subjectConfigController.getClassroomSubjects);
router.put("/subjects/classroom/:classroomId", teacherOnly, subjectConfigController.saveClassroomSubjects);

// Result entry data: students with their effective subjects and saved result for a term
router.get("/subjects/classroom/:classroomId/students", teacherOnly, subjectConfigController.getClassroomResultEntry);

// Student-specific subjects
router.get(
  "/subjects/classroom/:classroomId/student/:studentId",
  teacherOnly,
  subjectConfigController.getStudentSubjects
);
router.post(
  "/subjects/classroom/:classroomId/student/:studentId/subjects",
  teacherOnly,
  subjectConfigController.addStudentSubject
);
router.delete(
  "/subjects/classroom/:classroomId/student/:studentId/subjects",
  teacherOnly,
  subjectConfigController.removeStudentSubject
);
router.put(
  "/subjects/classroom/:classroomId/student/:studentId/max-marks",
  teacherOnly,
  subjectConfigController.setStudentMaxMarks
);
router.put(
  "/subjects/classroom/:classroomId/student/:studentId/replace-all",
  teacherOnly,
  subjectConfigController.replaceAllStudentSubjects
);
router.post(
  "/subjects/classroom/:classroomId/student/:studentId/restore-defaults",
  teacherOnly,
  subjectConfigController.restoreStudentDefaults
);

// Get all results (compat)
router.get(
  "/",
  authMiddleware,
  resultController.getResults
);

module.exports = router;
