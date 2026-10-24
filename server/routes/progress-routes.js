const express = require('express');
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { courseId: "course" });
const progressController = require('../controllers/progress-controller');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Mentor routes
router.get('/mentor', roleMiddleware(['mentor']), progressController.getMentorProgress);

// Student, Mentor, and Admin routes for viewing progress
router.get('/:courseId', roleMiddleware(['student', 'mentor', 'admin']), progressController.getProgress);

// Student-only routes
router.post(
    '/mark-completed',
    authMiddleware,
    roleMiddleware(['student']),
    progressController.markChapterCompleted
);

// New generic route for marking any content as completed
router.post(
    '/mark-content-completed',
    authMiddleware,
    roleMiddleware(['student']),
    progressController.markContentCompleted
);


module.exports = router;
