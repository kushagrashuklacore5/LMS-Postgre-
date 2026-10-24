const { all } = require('../helpers/dbAsync');
const notifications = require('../services/notificationService');

/**
 * Time-based notifications. Each rule creates at most ONE notification per event per
 * recipient (the notification service de-duplicates), so running the sweep again - or
 * restarting the server - never repeats a reminder.
 *
 *   - assignment due within 24 hours, not yet submitted      -> the student
 *   - assignment deadline passed (last 3 days), no submission -> the student
 *   - attendance not marked today after the reminder hour     -> the class teacher
 *   - teacher account waiting for approval                    -> the admins of that school
 */

const HOUR = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = Math.max(5000, Number(process.env.NOTIFICATION_SWEEP_INTERVAL_MS) || 15 * 60 * 1000);
const ATTENDANCE_REMINDER_HOUR = Number.isInteger(Number(process.env.ATTENDANCE_REMINDER_HOUR))
  ? Number(process.env.ATTENDANCE_REMINDER_HOUR)
  : 11;

const localDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Students of an assignment's class who have not submitted, for assignments due in (from, to]
const pendingAssignmentStudents = (fromIso, toIso) =>
  all(
    `SELECT a.id, a.title, a.due_at, a.university_id, a.teacher_id, sca.studentId
     FROM aia_assignments a
     JOIN student_classroom_assignment sca ON sca.classroomId = a.classroom_id
     JOIN users u ON u.id = sca.studentId AND u.role = 'student' AND u.university_id = a.university_id
     LEFT JOIN aia_assignment_submissions s ON s.assignment_id = a.id AND s.student_id = sca.studentId
     WHERE a.status IN ('published', 'closed')
       AND a.due_at IS NOT NULL AND a.due_at > ? AND a.due_at <= ?
       AND s.id IS NULL`,
    [fromIso, toIso]
  );

const assignmentDueSoon = async (now) => {
  const rows = await pendingAssignmentStudents(now.toISOString(), new Date(now.getTime() + 24 * HOUR).toISOString());
  for (const row of rows) {
    await notifications.notify({
      type: 'ASSIGNMENT_DUE_SOON',
      data: { title: row.title, deadline: row.due_at },
      universityId: row.university_id,
      recipientIds: [row.studentId],
      entityType: 'aia_assignment',
      entityId: row.id,
      createdBy: row.teacher_id,
    });
  }
};

const assignmentMissed = async (now) => {
  const rows = await pendingAssignmentStudents(new Date(now.getTime() - 72 * HOUR).toISOString(), now.toISOString());
  for (const row of rows) {
    await notifications.notify({
      type: 'ASSIGNMENT_MISSED',
      data: { title: row.title },
      universityId: row.university_id,
      recipientIds: [row.studentId],
      entityType: 'aia_assignment',
      entityId: row.id,
      createdBy: row.teacher_id,
    });
  }
};

const attendancePending = async (now) => {
  if (now.getDay() === 0 || now.getHours() < ATTENDANCE_REMINDER_HOUR) return; // not on Sundays, not before the reminder hour
  const today = localDate(now);

  const rows = await all(
    `SELECT c.id, c.name, c.university_id, u.id AS teacherId
     FROM classrooms c
     JOIN users u ON CAST(u.id AS TEXT) = c.classTeacher AND u.role IN ('mentor', 'teacher') AND u.university_id = c.university_id
     WHERE EXISTS (SELECT 1 FROM student_classroom_assignment sca WHERE sca.classroomId = c.id)
       AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.classroomId = c.id AND a.date = ?)`,
    [today]
  );
  for (const row of rows) {
    await notifications.notify({
      type: 'ATTENDANCE_PENDING',
      data: { title: row.name },
      universityId: row.university_id,
      recipientIds: [row.teacherId],
      entityType: 'classroom',
      entityId: row.id,
      createdBy: row.teacherId,
      dedupeSuffix: today, // one reminder per classroom per day
    });
  }
};

const mentorsPendingApproval = async () => {
  const rows = await all(
    `SELECT m.id AS mentorId, m.name, m.university_id, a.id AS adminId
     FROM users m
     JOIN users a ON a.university_id = m.university_id AND a.role = 'admin'
     WHERE m.role = 'mentor' AND m.isApproved = 0`
  );
  for (const row of rows) {
    await notifications.notify({
      type: 'MENTOR_PENDING_APPROVAL',
      data: { title: row.name },
      universityId: row.university_id,
      recipientIds: [row.adminId],
      entityType: 'user',
      entityId: row.mentorId,
      createdBy: row.mentorId,
    });
  }
};

let running = false;

// One rule failing (for example a table that does not exist yet) must not stop the others
const runNotificationSweep = async (now = new Date()) => {
  if (running) return;
  running = true;
  try {
    for (const rule of [assignmentDueSoon, assignmentMissed, attendancePending, mentorsPendingApproval]) {
      try {
        await rule(now);
      } catch (err) {
        console.warn(`[notifications] sweep rule ${rule.name} skipped:`, err.message);
      }
    }
  } finally {
    running = false;
  }
};

let timer = null;
const start = () => {
  if (timer) return;
  // First sweep shortly after start-up, once the tables exist
  setTimeout(() => runNotificationSweep(), Math.min(20000, SWEEP_INTERVAL_MS));
  timer = setInterval(() => runNotificationSweep(), SWEEP_INTERVAL_MS);
  console.log(`🔔 Notification scheduler started (every ${Math.round(SWEEP_INTERVAL_MS / 1000)}s)`);
};

module.exports = { start, runNotificationSweep };
