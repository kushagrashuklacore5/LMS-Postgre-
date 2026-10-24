const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { classroomId: "classroom" });
const authMiddleware = require("../middleware/authMiddleware");
const {
  markAttendance,
  getAttendance,
  getStudentAttendance,
  downloadAttendanceExcel,
} = require("../controllers/attendanceController");

// Class teacher routes
router.post("/mark", authMiddleware, markAttendance);
router.get("/download", authMiddleware, downloadAttendanceExcel);
router.get("/student", authMiddleware, getStudentAttendance);
router.get("/classroom/:classroomId/date/:date", authMiddleware, (req, res, next) => {
  req.query.classroomId = req.params.classroomId;
  req.query.date = req.params.date;
  getAttendance(req, res, next);
});
router.get("/", authMiddleware, getAttendance);

module.exports = router;
