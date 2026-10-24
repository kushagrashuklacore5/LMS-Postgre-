const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams, requestIdsInCallerSchool } = require("../helpers/schoolScope");
guardParams(router, { chapterId: "chapter", courseId: "course" });
const chapterController = require("../controllers/chapter-controller");
const authMiddleware = require("../middleware/authMiddleware");
const { rateLimiters } = require("../middleware/rateLimiter");
const roleMiddleware = require("../middleware/roleMiddleware");
const uploadChapterMaterial = require("../middleware/uploadChapterMaterial");

// All routes require authentication
router.use(authMiddleware);

// Mentor-only routes
router.post("/create-chapter", roleMiddleware(["mentor"]), rateLimiters.upload, uploadChapterMaterial.single("file"), requestIdsInCallerSchool, chapterController.createChapter);
router.put("/update-chapter/:chapterId", roleMiddleware(["mentor"]), rateLimiters.upload, uploadChapterMaterial.single("file"), requestIdsInCallerSchool, chapterController.updateChapter);
router.delete("/delete-chapter/:chapterId", roleMiddleware(["mentor"]), chapterController.deleteChapter);

// Shared routes (mentors and students)
router.get("/get-chapters", chapterController.getChapters);
router.get("/course/:courseId", chapterController.getChapters);

module.exports = router;
