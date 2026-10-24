const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { id: "week" });
const authMiddleware = require("../middleware/authMiddleware");
const quotaMiddleware = require("../middleware/quotaMiddleware");
const {
  createWeek,
  getWeeks,
  updateWeek,
  deleteWeek,
} = require("../controllers/weekController");

// Match both POST / and POST /create for compatibility
router.post("/", authMiddleware, quotaMiddleware.checkWeeksQuota, createWeek);
router.post("/create", authMiddleware, quotaMiddleware.checkWeeksQuota, createWeek);
router.get("/", authMiddleware, getWeeks);
router.put("/:id", authMiddleware, updateWeek);
router.delete("/:id", authMiddleware, deleteWeek);

module.exports = router;
