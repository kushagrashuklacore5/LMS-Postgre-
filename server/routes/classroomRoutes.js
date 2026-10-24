const express = require("express");
const router = express.Router();
const { schoolParam, guardParams, callerMayAccess } = require("../helpers/schoolScope");
const { isRetryableConflict } = require("../helpers/dbErrors");

// Ids in the URL must name a record the caller may work with (helpers/schoolScope.js).
guardParams(router, { classroomId: "classroom", mentorId: "user" });
const feeStructureParam = schoolParam("feeStructure");
const classroomParam = schoolParam("classroom");
router.param("id", (req, res, next, id) =>
  (String(req.route?.path || "").startsWith("/fee-structures") ? feeStructureParam : classroomParam)(req, res, next, id)
);

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { checkClassroomQuota } = require("../middleware/quotaMiddleware");
const { requirePaymentAuth, requireRoles, requireTenant } = require("../middleware/paymentAuth");
const { calculateStudentInstallmentSummary } = require("../services/installmentService");
const { isBusyError } = require("../services/paymentDb");
const { normalizeReminderNote, formatRupees } = require("../services/feeReminderEmail");

const {
  getAllClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getClassroomAnalytics,
  getFeeStructureByGrade,
  saveFeeStructure,
  updateFeeStructure,
  getAllFeeStructures,
  getSingleClassroom,
  getAssignedClassrooms,
  assignStudentToClassroom,
  getClassroomFeeStructure,
  getStudentClassrooms,
  getClassroomStudents,
  getTeachingScopeTree
} = require("../controllers/classroomController");

/* ================= ADMIN ONLY ================= */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
};

/* ================= ROUTES ================= */

// ADMIN
router.post(
  "/",
  authMiddleware,
  adminOnly,
  checkClassroomQuota,
  createClassroom
);

router.get("/", authMiddleware, adminOnly, getAllClassrooms);

/* ================= SPECIFIC ROUTES (before dynamic routes) ================= */
// Classes -> sections -> courses the signed-in admin/teacher may target
router.get(
  "/teaching-scope",
  authMiddleware,
  getTeachingScopeTree
);

router.get(
  "/my-classrooms",
  authMiddleware,
  getAssignedClassrooms
);

router.get(
  "/student-classrooms",
  authMiddleware,
  getStudentClassrooms
);



router.get(
  "/analytics",
  authMiddleware,
  adminOnly,
  getClassroomAnalytics
);

router.post(
  "/assign-student",
  authMiddleware,
  roleMiddleware(["mentor", "admin"]),
  assignStudentToClassroom
);

router.get(
  "/fee-structures",
  authMiddleware,
  getAllFeeStructures
);

router.post(
  "/fee-structures",
  authMiddleware,
  adminOnly,
  saveFeeStructure
);

router.put(
  "/fee-structures/:id",
  authMiddleware,
  adminOnly,
  updateFeeStructure
);

/* ================= MENTOR-SPECIFIC ROUTES ================= */
// The attendance pages ask for "the signed-in teacher's classes" with the word "me".
// It must be declared before /mentor/:mentorId, whose id check answers 404 for a non-number.
router.get(
  "/mentor/me",
  authMiddleware,
  getAssignedClassrooms
);

router.get(
  "/mentor/:mentorId",
  authMiddleware,
  getAssignedClassrooms
);

/* ================= DYNAMIC ROUTES (after specific routes) ================= */
router.get(
  "/:classroomId/students",
  authMiddleware,
  getClassroomStudents
);

router.get(
  "/:id/fee-structure",
  authMiddleware,
  getClassroomFeeStructure
);

router.get(
  "/:id",
  authMiddleware,
  getSingleClassroom
);

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  updateClassroom
);

router.delete(
  "/:id",
  authMiddleware,
  adminOnly,
  deleteClassroom
);

/**
 * Fee position of one student, taken from the same installment summary the student fee page
 * and offline collection use (fee structure of the student's own university, active schedule,
 * successful payments). Nothing is assumed: when no fee can be resolved the amounts are null
 * and the row says so.
 */
async function buildStudentFeeRow(db, student) {
  const base = {
    id: student.id,
    name: student.name || `Student #${student.id}`,
    email: student.email || "",
    phone: null,
    className: student.classNames || null
  };

  let summary;
  try {
    summary = await calculateStudentInstallmentSummary(db, student.id);
  } catch (error) {
    // A busy database is temporary, not a manual-review case: let the caller answer 503 (retry later)
    if (isBusyError(error)) throw error;
    // e.g. MULTIPLE_ACTIVE_SCHEDULES: report it for manual review, never guess an amount
    return {
      ...base, feeConfigured: false, feeStructureId: null, totalFee: null, paidAmount: null,
      remainingBalance: null, dueDate: null, collectionBlocked: null, collectionBlockedReason: null,
      status: "Needs Review", statusCode: error.code || "FEE_STATUS_UNAVAILABLE"
    };
  }

  const totalFeePaise = summary.activeSchedule
    ? summary.activeSchedule.totalFeePaise
    : (summary.feeStructure ? summary.feeStructure.totalFeePaise : null);
  const feeConfigured = Number.isInteger(totalFeePaise) && totalFeePaise > 0;
  const paidPaise = summary.lifetimePaidPaise;
  const remainingPaise = feeConfigured ? Math.max(0, totalFeePaise - paidPaise) : null;

  let status = "Fee Not Configured";
  if (feeConfigured) {
    status = remainingPaise === 0 ? "Paid" : (paidPaise > 0 ? "Partial" : "Pending");
  }

  return {
    ...base,
    feeConfigured,
    feeStructureId: summary.activeSchedule ? summary.activeSchedule.feeStructureId : (summary.feeStructure ? summary.feeStructure.id : null),
    totalFee: feeConfigured ? totalFeePaise / 100 : null,
    paidAmount: paidPaise / 100,
    remainingBalance: feeConfigured ? remainingPaise / 100 : null,
    dueDate: summary.feeStructure ? summary.feeStructure.dueDate || null : null,
    collectionBlocked: summary.collectionBlocked,
    collectionBlockedReason: summary.collectionBlockedReason,
    status,
    statusCode: feeConfigured ? null : "FEE_NOT_CONFIGURED"
  };
}

const FEE_MONITOR_ROLES = ["accountant", "admin", "mentor"];

/**
 * GET /api/classrooms/teacher/students-fees
 * Fee position of the students the caller may monitor: accountants and admins see their whole
 * university; a mentor sees the students of the classrooms they are class teacher of.
 * University comes from the caller's users row (requireRoles); there is no default university.
 */
router.get("/teacher/students-fees", requirePaymentAuth, requireRoles(FEE_MONITOR_ROLES), requireTenant, (req, res) => {
  try {
    const db = req.tenant?.database || require("../config/database-switch");
    const universityId = req.user.universityId;
    const isMentor = req.user.role === "mentor";

    // One row per student (GROUP BY), however many classrooms they belong to
    const sql = `
      SELECT u.id, u.name, u.email, string_agg(DISTINCT c.name, ',') AS classNames
      FROM users u
      LEFT JOIN student_classroom_assignment sca ON sca.studentId = u.id
      LEFT JOIN classrooms c ON c.id = sca.classroomId AND c.university_id = u.university_id
      WHERE u.role = 'student' AND u.university_id = ?
        ${isMentor ? `AND EXISTS (
          SELECT 1 FROM student_classroom_assignment msca
          JOIN classrooms mc ON mc.id = msca.classroomId
          WHERE msca.studentId = u.id AND mc.classTeacher = ? AND mc.university_id = ?)` : ""}
      GROUP BY u.id
      ORDER BY u.name ASC`;
    const params = isMentor ? [universityId, req.user.userId, universityId] : [universityId];

    db.all(sql, params, async (err, rows) => {
      // This callback is outside the try/catch above, so every failure must be answered here
      try {
        if (err) {
          console.error("Error fetching students for fee monitoring:", err.message);
          return res.status(500).json({ success: false, message: "Database query error" });
        }

        const students = [];
        for (const row of rows || []) {
          students.push(await buildStudentFeeRow(db, row));
        }
        const feeConfigured = students.filter(s => s.feeConfigured).length;

        res.status(200).json({
          success: true,
          students,
          summary: {
            totalStudents: students.length,
            feeConfigured,
            feeNotConfigured: students.length - feeConfigured
          }
        });
      } catch (error) {
        if (isBusyError(error)) {
          if (!res.headersSent) res.status(503).json({ success: false, code: "BUSY", message: "The system is busy. Please try again." });
          return;
        }
        console.error("Error building fee monitoring rows:", error.message);
        if (!res.headersSent) res.status(500).json({ success: false, message: "Server error" });
      }
    });
  } catch (error) {
    console.error("Error in /teacher/students-fees:", error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Minimum time between two fee reminders for the same student. Enforced on the server by an
 * atomic insert-if-absent on the reminder announcement, so concurrent requests cannot both pass.
 */
const FEE_REMINDER_COOLDOWN_HOURS = 24;
const FEE_REMINDER_TITLE_PREFIX = "⚠️ Fee Payment Reminder";

const dbGet = (db, sql, params) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const dbRun = (db, sql, params) => new Promise((resolve, reject) => db.run(sql, params, function (err) {
  if (err) return reject(err);
  resolve({ changes: this.changes, lastID: this.lastID });
}));

/**
 * POST /api/classrooms/send-fee-reminder
 * Sends one fee reminder (targeted in-app announcement + email) for a student of the caller's university.
 * The client sends only { studentId, message? }. Recipient, name, classes, amount and due date all come
 * from the server: the verified student record and the same fee row the fee-monitoring list shows.
 */
router.post("/send-fee-reminder", requirePaymentAuth, requireRoles(FEE_MONITOR_ROLES), requireTenant, async (req, res) => {
  try {
    const db = req.tenant?.database || require("../config/database-switch");
    const caller = req.user; // signed token; role and university re-read from the users table
    const body = req.body && typeof req.body === "object" ? req.body : {};

    // Only studentId and the optional note are read; every other submitted field is ignored
    const studentId = /^[1-9]\d{0,14}$/.test(String(body.studentId ?? "").trim()) ? Number(body.studentId) : null;
    if (studentId === null) {
      return res.status(400).json({ success: false, code: "INVALID_STUDENT_ID", message: "A valid student ID is required." });
    }
    const noteCheck = normalizeReminderNote(body.message);
    if (!noteCheck.ok) {
      return res.status(400).json({ success: false, code: "INVALID_NOTE", message: noteCheck.message });
    }

    const student = await dbGet(db, "SELECT id, name, email, role, university_id FROM users WHERE id = ?", [studentId]);
    if (!student || student.role !== "student") {
      return res.status(404).json({ success: false, code: "STUDENT_NOT_FOUND", message: "Student not found." });
    }
    if (Number(student.university_id) !== caller.universityId) {
      return res.status(403).json({ success: false, code: "CROSS_TENANT_FORBIDDEN", message: "Access denied: This student does not belong to your university." });
    }

    if (caller.role === "mentor") {
      const teachesStudent = await dbGet(db,
        `SELECT 1 AS ok FROM student_classroom_assignment sca
         JOIN classrooms c ON c.id = sca.classroomId
         WHERE sca.studentId = ? AND c.classTeacher = ? AND c.university_id = ? LIMIT 1`,
        [studentId, caller.userId, caller.universityId]);
      if (!teachesStudent) {
        return res.status(403).json({ success: false, code: "NOT_CLASS_TEACHER", message: "Access denied: You are not the class teacher of this student." });
      }
    }

    const classes = await dbGet(db,
      `SELECT string_agg(DISTINCT c.name, ',') AS classNames
       FROM student_classroom_assignment sca JOIN classrooms c ON c.id = sca.classroomId
       WHERE sca.studentId = ? AND c.university_id = ?`,
      [studentId, caller.universityId]);

    // Same fee row the fee-monitoring list shows (installment summary); no separate balance calculation
    const fee = await buildStudentFeeRow(db, { id: student.id, name: student.name, email: student.email, classNames: classes ? classes.classNames : null });
    if (fee.status === "Needs Review") {
      return res.status(409).json({ success: false, code: fee.statusCode, message: "This student's fee status needs manual review; no reminder was sent." });
    }
    if (!fee.feeConfigured) {
      return res.status(409).json({ success: false, code: "FEE_NOT_CONFIGURED", message: "No fee structure is configured for this student; no reminder was sent." });
    }
    if (fee.collectionBlocked) {
      return res.status(409).json({ success: false, code: "LEGACY_RECONCILIATION_REQUIRED", message: "Earlier payments of this student are awaiting reconciliation; no reminder was sent." });
    }
    if (!(fee.remainingBalance > 0)) {
      return res.status(409).json({ success: false, code: "NO_OUTSTANDING_BALANCE", message: "This student has no outstanding balance; no reminder was sent." });
    }

    // Claim the reminder: one statement inserts the targeted announcement only if none was created for
    // this student within the cooldown window, so two simultaneous requests cannot both succeed
    const title = `${FEE_REMINDER_TITLE_PREFIX}: ${fee.className || "Academic Fees"}`;
    const content = `Dear ${student.name}, your outstanding fee balance is ${formatRupees(fee.remainingBalance)}${fee.dueDate ? `, due on ${fee.dueDate}` : ""}. Please make the payment at your earliest convenience or contact the accounts office.`;
    const claim = await dbRun(db,
      `INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, publishFor, priority, targetUserId, createdAt, updatedAt)
       SELECT ?, ?, ?, ?, ?, 'students', 'high', ?, utc_now_text(), utc_now_text()
       WHERE NOT EXISTS (
         SELECT 1 FROM announcements
         WHERE targetUserId = ? AND university_id = ? AND title ILIKE ? AND createdAt >= utc_now_text(CAST(? AS interval))
       )`,
      [caller.universityId, title, content, caller.userId, caller.role, studentId,
       studentId, caller.universityId, `${FEE_REMINDER_TITLE_PREFIX}%`, `-${FEE_REMINDER_COOLDOWN_HOURS} hours`]);
    if (claim.changes === 0) {
      return res.status(429).json({ success: false, code: "REMINDER_RECENTLY_SENT", message: `A fee reminder was already sent to this student in the last ${FEE_REMINDER_COOLDOWN_HOURS} hours.` });
    }

    const emailService = require("../services/emailService");
    const emailResult = await emailService.sendFeeReminderEmail({
      studentEmail: student.email,
      studentName: student.name,
      classroomName: fee.className,
      amount: fee.remainingBalance,
      dueDate: fee.dueDate,
      customNote: noteCheck.note
    });
    const emailStatus = !emailResult || !emailResult.success ? "failed" : (emailResult.mock ? "not_configured" : "sent");
    console.log(`🔔 Fee reminder for student ${studentId}: announcement ${claim.lastID}, email ${emailStatus}`);

    const messages = {
      sent: "Fee reminder sent by email and in-app notification.",
      not_configured: "In-app reminder created. Email is not configured on this server, so no email was sent.",
      failed: "In-app reminder created, but the email could not be sent."
    };
    res.status(200).json({
      success: true,
      message: messages[emailStatus],
      reminder: {
        studentId,
        amount: fee.remainingBalance,
        dueDate: fee.dueDate,
        announcementId: claim.lastID,
        emailStatus
      }
    });
  } catch (error) {
    if (isRetryableConflict(error)) {
      return res.status(503).json({ success: false, code: "BUSY", message: "The system is busy. Please try again." });
    }
    console.error("Error in /send-fee-reminder:", error && error.message);
    if (!res.headersSent) res.status(500).json({ success: false, message: "Server error sending fee reminder." });
  }
});

module.exports = router;

