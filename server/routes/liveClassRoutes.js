const express = require("express");
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
// helpers/lectures.js then applies the lecture rules (class + course, owner, enrolment).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { liveClassId: "liveClass", courseId: "course", classroomId: "classroom" });

const authMiddleware = require("../middleware/authMiddleware");
const { checkLiveClassQuota } = require("../middleware/quotaMiddleware");
const lectures = require("../helpers/lectures");
const jaas = require("../helpers/jaas");
const { HttpError } = require("../helpers/teachingScope");

const respond = (work, status = 200) => async (req, res) => {
  try {
    res.status(status).json({ success: true, data: await work(req) });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Live class error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= PROVIDER WEBHOOK (public, signature checked) ================= */
// JaaS console -> Webhooks: https://<api host>/api/live-classes/webhooks/jaas
router.post("/webhooks/jaas", async (req, res) => {
  if (!jaas.verifyWebhook(req.rawBody, req.get("X-Jaas-Signature"))) {
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }
  try {
    const outcome = await lectures.handleProviderEvent(jaas.parseWebhook(req.body));
    res.json({ success: true, outcome });
  } catch (err) {
    console.error("JaaS webhook error:", err.message);
    res.status(500).json({ success: false });
  }
});

/* ================= READING ================= */
// Is the meeting provider set up? (the pages show a notice instead of a broken meeting)
router.get("/config", authMiddleware, (req, res) => res.json({ success: true, data: { configured: jaas.isConfigured(), provider: "jaas" } }));

// The signed-in teacher's courses taught to this class (the "Start class" choices)
router.get("/teaching/:classroomId/courses", authMiddleware, respond((req) => lectures.teachableCourses(req, req.params.classroomId)));

// Teacher: own lectures; admin: the school's (?classroomId=&courseId=&teacherId=&limit=&offset=)
router.get("/mine", authMiddleware, respond((req) => lectures.listForStaff(req, req.query)));
router.get("/school", authMiddleware, respond((req) => lectures.listForStaff(req, req.query)));

// Student: lectures of their classes and enrolled courses, with their attendance
router.get("/student", authMiddleware, respond((req) => lectures.listForStudent(req, req.query)));
router.get("/student/upcoming", authMiddleware, respond((req) => lectures.listForStudent(req, { ...req.query, upcoming: true })));

// Lectures of one course (older course pages)
router.get("/course/:courseId", authMiddleware, respond((req) =>
  req.user.role === "student"
    ? lectures.listForStudent(req, req.query).then((list) => list.filter((l) => Number(l.courseId) === Number(req.params.courseId)))
    : lectures.listForStaff(req, { ...req.query, courseId: req.params.courseId })
));

/* ================= CREATING AND RUNNING ================= */
// { classroomId, courseId, title, description?, mode: "now" | "schedule", scheduledStartTime?, durationMinutes?, requestKey? }
router.post("/", authMiddleware, checkLiveClassQuota, async (req, res) => {
  try {
    const { duplicate, lecture } = await lectures.createLecture(req, req.body || {});
    res.status(duplicate ? 200 : 201).json({ success: true, duplicate, data: lecture });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Live class error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:liveClassId", authMiddleware, respond((req) => lectures.getLecture(req, req.params.liveClassId)));
router.get("/:liveClassId/attendance", authMiddleware, respond((req) => lectures.lectureAttendance(req, req.params.liveClassId)));
router.put("/:liveClassId/start", authMiddleware, respond((req) => lectures.startLecture(req, req.params.liveClassId)));
router.post("/:liveClassId/start", authMiddleware, respond((req) => lectures.startLecture(req, req.params.liveClassId)));
router.post("/:liveClassId/end", authMiddleware, respond((req) => lectures.endLecture(req, req.params.liveClassId)));
router.post("/:liveClassId/cancel", authMiddleware, respond((req) => lectures.cancelLecture(req, req.params.liveClassId)));
// a lecture is never deleted: "delete" cancels it and keeps the history
router.delete("/:liveClassId", authMiddleware, respond((req) => lectures.cancelLecture(req, req.params.liveClassId)));

// The meeting's join details (short-lived token for this room; moderator only for the teacher)
router.post("/:liveClassId/join", authMiddleware, respond((req) => lectures.joinLecture(req, req.params.liveClassId)));
// The in-meeting page: the signed-in student's own join / leave / heartbeat
router.post("/:liveClassId/presence", authMiddleware, respond((req) => lectures.recordPresence(req, req.params.liveClassId, req.body?.kind)));
router.post("/:liveClassId/leave", authMiddleware, respond((req) => lectures.recordPresence(req, req.params.liveClassId, "leave")));

module.exports = router;
