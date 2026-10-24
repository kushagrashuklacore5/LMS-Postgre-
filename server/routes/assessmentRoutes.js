const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { assessmentId: "assessment", questionId: "assessmentQuestion", courseId: "course" });

const controller = require("../controllers/assessmentController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { checkAssessmentsQuota } = require("../middleware/quotaMiddleware");

/**
 * ============================
 * MENTOR ROUTES
 * ============================
 */

// Create assessment (title + start/end time)
router.post(
  "/create",
  authMiddleware,
  checkAssessmentsQuota,
  controller.createAssessment
);

// Also support POST / for compatibility
router.post(
  "/",
  authMiddleware,
  checkAssessmentsQuota,
  controller.createAssessment
);

// Add question to assessment (supports both /questions and /add-question)
router.post(
  "/questions",
  authMiddleware,
  controller.addQuestion
);
router.post(
  "/add-question",
  authMiddleware,
  controller.addQuestion
);

// Get questions for an assessment (supports both /:assessmentId/questions and /questions/:assessmentId)
router.get(
  "/:assessmentId/questions",
  authMiddleware,
  controller.getAssessmentQuestions
);
router.get(
  "/questions/:assessmentId",
  authMiddleware,
  controller.getAssessmentQuestions
);

// Picture of one question (private file; access checked in the controller)
router.get(
  "/questions/:questionId/image",
  authMiddleware,
  controller.getQuestionImage
);
// Publish assessment
router.put(
  "/:assessmentId/publish",
  authMiddleware,
  controller.publishAssessment
);

// Get ALL assessments for course (Mentor)
router.get(
  "/course/:courseId/all",
  authMiddleware,
  roleMiddleware(["mentor"]),
  controller.getAllCourseAssessments
);

// Get assessment attempts for teacher
router.get(
  "/:assessmentId/attempts",
  authMiddleware,
  roleMiddleware(["mentor"]),
  controller.getAssessmentAttempts
);

// Get all assessment attempts in course for teacher
router.get(
  "/course/:courseId/attempts",
  authMiddleware,
  roleMiddleware(["mentor"]),
  controller.getCourseAssessmentAttempts
);

/**
 * ============================
 * STUDENT ROUTES
 * ============================
 */

// Get all published assessments for a course (lock/unlock handled)
router.get(
  "/course/:courseId",
  authMiddleware,
  controller.getCourseAssessments
);

// Submit assessment (student)
router.post(
  "/submit",
  authMiddleware,
  controller.submitAssessment
);

module.exports = router;
