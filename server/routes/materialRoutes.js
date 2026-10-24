const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams, requestIdsInCallerSchool } = require("../helpers/schoolScope");
guardParams(router, { id: "material", courseId: "course", weekId: "week" });
const upload = require("../middleware/upload");
const materialController = require("../controllers/materialController");
const authMiddleware = require("../middleware/authMiddleware");
const { rateLimiters } = require("../middleware/rateLimiter");
const quotaMiddleware = require("../middleware/quotaMiddleware");

// ✅ UPLOAD MATERIAL
router.post(
  "/upload",
  authMiddleware,
  rateLimiters.upload,
  upload.single("file"),
  // multipart fields are parsed only now: check the course/week ids they carry
  requestIdsInCallerSchool,
  quotaMiddleware.checkMaterialsQuota,
  materialController.uploadMaterial
);

// ✅ GET ALL MATERIALS FOR A COURSE
router.get(
  "/course/:courseId",
  authMiddleware,
  materialController.getCourseMaterials
);

router.get(
  "/",
  authMiddleware,
  materialController.getCourseMaterials
);

// ✅ GET MATERIALS FOR A WEEK
router.get(
  "/week/:weekId",
  authMiddleware,
  materialController.getWeekMaterials
);

// ✅ GET MATERIAL BY ID
router.get(
  "/:id",
  authMiddleware,
  materialController.getMaterialById
);

// ✅ DELETE MATERIAL
router.delete(
  "/:id",
  authMiddleware,
  materialController.deleteMaterial
);

module.exports = router;
