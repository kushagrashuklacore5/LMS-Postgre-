const { get, all, run } = require('../helpers/dbAsync');
const { NOTIFICATION_TYPES, generateText, fallbackText, sanitizeMessage, cleanText } = require('./notificationText');

/**
 * Targeted notifications, stored in the EXISTING announcements table and shown by the
 * existing announcement bell. A targeted row has recipientUserId set and is visible to that
 * user only; ordinary announcements (recipientUserId NULL) work exactly as before.
 *
 * Routing is structured: type + entityType + entityId. The frontend maps those to a screen;
 * no URL is ever stored. Recipients are always worked out on the server.
 */

let io = null;
const setIo = (socketServer) => {
  io = socketServer;
};

const dedupeKeyFor = ({ type, entityType, entityId, recipientId, dedupeSuffix }) =>
  [type, entityType, entityId, recipientId, dedupeSuffix].filter((part) => part !== undefined && part !== null && part !== '').join(':');

/**
 * Creates one notification per recipient. The same event for the same recipient is stored
 * once only (unique dedupeKey), so retries, double clicks and repeated sweeps do not duplicate.
 * Returns the number of notifications actually created. Never throws.
 */
const createNotifications = async ({
  universityId,
  recipientIds,
  type,
  entityType,
  entityId,
  title,
  message,
  createdBy,
  createdByRole = 'system',
  dedupeSuffix = '',
}) => {
  try {
    if (!NOTIFICATION_TYPES.includes(type)) throw new Error(`Unknown notification type: ${type}`);
    const recipients = [...new Set((recipientIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (!universityId || !createdBy || recipients.length === 0) return 0;

    let created = 0;
    for (const recipientId of recipients) {
      const dedupeKey = dedupeKeyFor({ type, entityType, entityId, recipientId, dedupeSuffix });
      const result = await run(
        `INSERT INTO announcements
           (university_id, title, content, createdByUser, createdByRole, publishFor, recipientUserId, type, entityType, entityId, dedupeKey)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [universityId, title, message, createdBy, createdByRole, recipientId, type, entityType || null, entityId ?? null, dedupeKey]
      );

      if (result.changes) {
        created++;
        // Realtime hint for the bell; the bell also polls, so a missed event is not a lost notification
        if (io) {
          io.to(`user:${recipientId}`).emit('notification:new', {
            id: result.lastID,
            title,
            content: message,
            type,
            entityType: entityType || null,
            entityId: entityId ?? null,
            recipientUserId: recipientId,
            readBy: '[]',
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
    return created;
  } catch (err) {
    console.error('[notifications] could not create notification:', type, err.message);
    return 0;
  }
};

/**
 * Builds the text (template, or AI when configured) and creates the notifications.
 * customMessage = wording typed/edited by the admin or teacher; used only if it is safe.
 */
const notify = async ({ type, data = {}, customMessage, ...target }) => {
  try {
    let text;
    const custom = customMessage ? sanitizeMessage(String(customMessage)) : null;
    if (custom) {
      text = { title: fallbackText(type, data).title, message: custom };
    } else {
      text = await generateText(type, data);
    }
    return await createNotifications({ ...target, type, title: text.title, message: text.message });
  } catch (err) {
    console.error('[notifications] notify failed:', type, err.message);
    return 0;
  }
};

/* ================= AUDIENCE LOOKUPS (SERVER SIDE ONLY) ================= */
const studentsOfClassroom = async (classroomId, universityId) =>
  (
    await all(
      `SELECT u.id FROM users u
       JOIN student_classroom_assignment sca ON sca.studentId = u.id
       WHERE sca.classroomId = ? AND u.role = 'student' AND u.university_id = ?`,
      [classroomId, universityId]
    )
  ).map((row) => row.id);

const studentsOfCourse = async (courseId, universityId) =>
  (
    await all(
      `SELECT u.id FROM users u
       JOIN course_students cs ON cs.studentId = u.id
       WHERE cs.courseId = ? AND u.role = 'student' AND u.university_id = ?`,
      [courseId, universityId]
    )
  ).map((row) => row.id);

const usersByRole = async (universityId, roles) =>
  (
    await all(
      `SELECT id FROM users WHERE university_id = ? AND role IN (${roles.map(() => '?').join(', ')})`,
      [universityId, ...roles]
    )
  ).map((row) => row.id);

const userName = async (userId) => cleanText((await get('SELECT name FROM users WHERE id = ?', [userId]))?.name, 80);

/** Realtime hint to these users' open pages (their own Socket.IO rooms only). Never throws. */
const emitToUsers = (userIds, event, payload) => {
  if (!io) return;
  for (const id of new Set((userIds || []).map(String))) io.to(`user:${id}`).emit(event, payload);
};

module.exports = {
  setIo,
  emitToUsers,
  notify,
  createNotifications,
  studentsOfClassroom,
  studentsOfCourse,
  usersByRole,
  userName,
};
