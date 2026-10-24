/**
 * Live lectures: who may start, schedule, join, end and see them, and attendance.
 *
 * A lecture belongs to one class and one course (live_classes). Rules:
 *   start / schedule  a teacher, for a course they mentor (courses.mentorId) that is taught to the
 *                     class (its home class or course_classrooms). Being the class teacher is not
 *                     enough. Admins do not start lectures; they see, cancel and end them.
 *   join              the lecture's teacher (moderator), or a student who is in the class AND
 *                     enrolled in the course (participant), while the lecture is live.
 *   history           teacher: their own lectures; student: lectures of their classes and courses
 *                     (and any they have attendance for); admin: the school's lectures.
 *
 * Statuses: scheduled -> live -> completed, scheduled -> cancelled, and failed when the provider
 * could not be prepared. A lecture is finished by its teacher or an admin ("End class") or by the
 * provider's ROOM_DESTROYED webhook. Closing a browser tab never ends it.
 *
 * Attendance (live_class_attendance) is recomputed from live_class_events:
 *   provider events (JaaS webhooks, signature checked) are used when the lecture has any; otherwise
 *   the in-meeting page's join / leave / heartbeat calls, stamped with the server's clock for the
 *   signed-in student (the browser never sends a student id, a time or a duration).
 *   An interval left open closes at the lecture's end (provider) or 90 s after the last heartbeat
 *   (page). A student is "attended" with at least QUALIFYING_SECONDS, "missed" otherwise, but only
 *   once the lecture is completed; while upcoming or live it is "pending". A completed lecture with
 *   no event from anyone is "unknown" (nothing was measured), never "missed".
 */
const { get, all, run, withTransaction } = require('./dbAsync');
const { HttpError } = require('./teachingScope');
const jaas = require('./jaas');

const QUALIFYING_SECONDS = 60;
const HEARTBEAT_GRACE_MS = 90 * 1000;
const START_EARLY_MS = 30 * 60 * 1000; // a scheduled lecture may be started this early
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
const STUDENT_BEAT_MIN_MS = 20 * 1000;

const nowIso = () => new Date().toISOString();
const ms = (iso) => (iso ? new Date(iso).getTime() : NaN);

const caller = (req) => {
  const role = req.user?.role;
  const kind = role === 'admin' ? 'admin' : role === 'mentor' || role === 'teacher' ? 'teacher' : role === 'student' ? 'student' : null;
  if (!req.user?.userId || !kind) throw new HttpError(403, 'Access denied');
  return { id: Number(req.user.userId), schoolId: Number(req.user.universityId), kind, name: req.user.name, email: req.user.email };
};

const positiveId = (value, what) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${what}`);
  return id;
};

const text = (value, what, max, required) => {
  const s = String(value ?? '').trim();
  if (required && !s) throw new HttpError(400, `${what} is required`);
  if (s.length > max) throw new HttpError(400, `${what} is too long (at most ${max} characters)`);
  return s;
};

/* ================= RELATIONSHIPS ================= */
// SQL: the course `co` is taught to the class whose id is the parameter
const TAUGHT_TO_CLASS = `(co.classroomId = ? OR EXISTS (SELECT 1 FROM course_classrooms cc WHERE cc.courseId = co.id AND cc.classroomId = ?))`;

/** The teacher's courses taught to this class (what "Start class" offers). */
async function teachableCourses(req, classroomId) {
  const user = caller(req);
  if (user.kind !== 'teacher') throw new HttpError(403, 'Only a teacher starts a class');
  const classId = positiveId(classroomId, 'class');
  return all(
    `SELECT co.id, co.title FROM courses co
     WHERE co.mentorId = ? AND co.university_id = ? AND ${TAUGHT_TO_CLASS}
     ORDER BY LOWER(co.title)`,
    [user.id, user.schoolId, classId, classId]
  );
}

const isEligibleStudent = (studentId, lecture) =>
  get(
    `SELECT 1 AS ok FROM users u
     WHERE u.id = ? AND u.role = 'student' AND u.university_id = ?
       AND EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = ? AND cs.studentId = u.id)
       AND (CAST(? AS BIGINT) IS NULL OR EXISTS (SELECT 1 FROM student_classroom_assignment sca WHERE sca.studentId = u.id AND sca.classroomId = ?))`,
    [studentId, lecture.university_id, lecture.courseId, lecture.classroomId, lecture.classroomId]
  ).then(Boolean);

// The students who should attend: in the class and enrolled in the course (now)
const eligibleStudents = (lecture) =>
  all(
    `SELECT u.id, u.name FROM users u
     WHERE u.role = 'student' AND u.university_id = ?
       AND u.id IN (SELECT cs.studentId FROM course_students cs WHERE cs.courseId = ?)
       AND (CAST(? AS BIGINT) IS NULL OR u.id IN (SELECT sca.studentId FROM student_classroom_assignment sca WHERE sca.classroomId = ?))
     ORDER BY LOWER(u.name)`,
    [lecture.university_id, lecture.courseId, lecture.classroomId, lecture.classroomId]
  );

/** The lecture, if the caller may see it: 404 otherwise (another school, class or course). */
async function lectureFor(req, lectureId) {
  const user = caller(req);
  const lecture = await get(
    `SELECT l.*, COALESCE(l.university_id, co.university_id) AS university_id, co.title AS courseTitle, co.mentorId AS courseMentorId
     FROM live_classes l JOIN courses co ON co.id = l.courseId WHERE l.id = ?`,
    [positiveId(lectureId, 'lecture')]
  );
  if (!lecture || Number(lecture.university_id) !== user.schoolId) throw new HttpError(404, 'Lecture not found');
  const isOwner = Number(lecture.instructorId) === user.id;
  if (user.kind === 'teacher' && !isOwner) throw new HttpError(404, 'Lecture not found');
  if (user.kind === 'student') {
    const mine = (await isEligibleStudent(user.id, lecture))
      || (await get('SELECT 1 AS ok FROM live_class_attendance WHERE liveClassId = ? AND studentId = ?', [lecture.id, user.id]));
    if (!mine) throw new HttpError(404, 'Lecture not found');
  }
  return { lecture, user, isOwner };
}

/* ================= VIEWS ================= */
const STATUS_LABEL = { scheduled: 'upcoming', live: 'live', cancelled: 'cancelled', failed: 'failed' };

function view(row, extra = {}) {
  const start = row.actualStartTime || row.scheduledStartTime;
  const end = row.actualEndTime;
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    classroomId: row.classroomId,
    classLabel: row.classGrade && row.classSection ? `${row.classGrade}-${row.classSection}` : row.className || null,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    teacherId: row.instructorId,
    teacherName: row.teacherName,
    scheduledStartTime: row.scheduledStartTime,
    actualStartTime: row.actualStartTime,
    actualEndTime: row.actualEndTime,
    durationMinutes: start && end ? Math.max(0, Math.round((ms(end) - ms(start)) / 60000)) : row.status === 'scheduled' ? row.duration || null : null,
    cancelledAt: row.cancelledAt,
    failureReason: row.failureReason || null,
    embedded: Boolean(row.providerRoom),
    ...extra,
  };
}

const LIST_SQL = `SELECT l.*, co.title AS courseTitle, t.name AS teacherName, c.name AS className, c.grade AS classGrade, c.section AS classSection
  FROM live_classes l
  JOIN courses co ON co.id = l.courseId
  LEFT JOIN users t ON t.id = l.instructorId
  LEFT JOIN classrooms c ON c.id = l.classroomId`;

const limits = ({ limit, offset } = {}) => [Math.max(1, Math.min(200, Number(limit) || 100)), Math.max(0, Number(offset) || 0)];

// Attendance counts for many lectures in one query
async function summaries(ids) {
  if (ids.length === 0) return new Map();
  const rows = await all(
    `SELECT liveClassId, status, COUNT(*) AS n FROM live_class_attendance WHERE liveClassId IN (${ids.map(() => '?').join(',')}) GROUP BY liveClassId, status`,
    ids
  );
  const map = new Map();
  rows.forEach((r) => {
    const s = map.get(r.liveClassId) || { attended: 0, missed: 0, pending: 0, unknown: 0 };
    s[r.status] = r.n;
    map.set(r.liveClassId, s);
  });
  return map;
}

/** Teacher: their own lectures (optionally one class). Admin: the school's (filters). */
async function listForStaff(req, query = {}) {
  const user = caller(req);
  if (user.kind === 'student') throw new HttpError(403, 'Access denied');
  const where = ['COALESCE(l.university_id, co.university_id) = ?'];
  const params = [user.schoolId];
  if (user.kind === 'teacher') { where.push('l.instructorId = ?'); params.push(user.id); }
  if (query.classroomId) { where.push('l.classroomId = ?'); params.push(positiveId(query.classroomId, 'class')); }
  if (query.courseId) { where.push('l.courseId = ?'); params.push(positiveId(query.courseId, 'course')); }
  if (user.kind === 'admin' && query.teacherId) { where.push('l.instructorId = ?'); params.push(positiveId(query.teacherId, 'teacher')); }
  const [limit, offset] = limits(query);
  const rows = await all(`${LIST_SQL} WHERE ${where.join(' AND ')} ORDER BY COALESCE(l.actualStartTime, l.scheduledStartTime) DESC, l.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const counts = await summaries(rows.map((r) => r.id));
  return rows.map((r) => view(r, { attendance: counts.get(r.id) || { attended: 0, missed: 0, pending: 0, unknown: 0 } }));
}

/** Student: lectures of their classes and enrolled courses, plus any they attended, with their status. */
async function listForStudent(req, query = {}) {
  const user = caller(req);
  if (user.kind !== 'student') throw new HttpError(403, 'Access denied');
  const [limit, offset] = limits(query);
  const rows = await all(
    `${LIST_SQL}
     LEFT JOIN live_class_attendance a ON a.liveClassId = l.id AND a.studentId = ?
     WHERE COALESCE(l.university_id, co.university_id) = ?
       AND (a.id IS NOT NULL OR (
             l.status <> 'completed' AND
             EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = l.courseId AND cs.studentId = ?)
             AND (l.classroomId IS NULL OR EXISTS (SELECT 1 FROM student_classroom_assignment sca WHERE sca.classroomId = l.classroomId AND sca.studentId = ?))))
       ${query.upcoming ? "AND l.status IN ('scheduled', 'live')" : ''}
     ORDER BY COALESCE(l.actualStartTime, l.scheduledStartTime) DESC, l.id DESC LIMIT ? OFFSET ?`,
    [user.id, user.schoolId, user.id, user.id, limit, offset]
  );
  const mine = rows.length
    ? new Map((await all(`SELECT liveClassId, status, attendedSeconds FROM live_class_attendance WHERE studentId = ? AND liveClassId IN (${rows.map(() => '?').join(',')})`, [user.id, ...rows.map((r) => r.id)])).map((a) => [a.liveClassId, a]))
    : new Map();
  return rows.map((r) => {
    const a = mine.get(r.id);
    // completed lectures show the student's own result; a missing row after completion = missed
    const myStatus = r.status === 'completed'
      ? (a ? a.status : (r.attendanceState === 'unknown' ? 'unknown' : 'missed'))
      : STATUS_LABEL[r.status] || r.status;
    return view(r, { myStatus, myAttendedMinutes: a ? Math.round(a.attendedSeconds / 60) : 0, canJoin: r.status === 'live' && Boolean(r.providerRoom) });
  });
}

async function getLecture(req, lectureId) {
  const { lecture, user, isOwner } = await lectureFor(req, lectureId);
  const row = await get(`${LIST_SQL} WHERE l.id = ?`, [lecture.id]);
  return view(row, { isOwner, role: user.kind, canJoin: row.status === 'live' && Boolean(row.providerRoom) && (isOwner || user.kind === 'student') });
}

/** Per student: who should attend (eligible now) and anyone with recorded attendance. */
async function lectureAttendance(req, lectureId) {
  const { lecture, user, isOwner } = await lectureFor(req, lectureId);
  if (!(user.kind === 'admin' || isOwner)) throw new HttpError(403, 'Only the lecture\'s teacher or an admin sees its attendance');
  const recorded = await all(
    `SELECT a.*, u.name FROM live_class_attendance a JOIN users u ON u.id = a.studentId WHERE a.liveClassId = ?`,
    [lecture.id]
  );
  const byId = new Map(recorded.map((r) => [Number(r.studentId), r]));
  const students = lecture.status === 'cancelled' ? [] : await eligibleStudents(lecture);
  const ids = new Set([...students.map((s) => Number(s.id)), ...byId.keys()]);
  const names = new Map([...students.map((s) => [Number(s.id), s.name]), ...recorded.map((r) => [Number(r.studentId), r.name])]);
  return {
    lecture: await getLecture(req, lectureId),
    attendanceState: lecture.attendanceState || (lecture.status === 'completed' ? 'final' : 'pending'),
    students: [...ids].map((id) => {
      const r = byId.get(id);
      const status = r ? r.status : lecture.status === 'completed' ? (lecture.attendanceState === 'unknown' ? 'unknown' : 'missed') : 'pending';
      return {
        studentId: id, name: names.get(id), status,
        attendedMinutes: r ? Math.round(r.attendedSeconds / 60) : 0,
        intervals: r ? r.intervals : 0,
        firstJoinedAt: r ? r.firstJoinedAt : null,
        lastLeftAt: r ? r.lastLeftAt : null,
      };
    }).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  };
}

/* ================= NOTIFYING THE STUDENTS ================= */
/**
 * Tells the lecture's students (in the class AND enrolled in the course) that it started or was
 * scheduled. The notification opens the LMS lecture page (/live/<id>), the one link everyone
 * shares; each person is checked again there and gets their own meeting token. Stored once per
 * student per event (the notification service deduplicates), so a retried start sends nothing twice.
 */
async function notifyStudents(lectureId, type) {
  try {
    const { notify } = require('../services/notificationService');
    const lecture = await get('SELECT l.*, COALESCE(l.university_id, co.university_id) AS university_id, t.name AS teacherName FROM live_classes l JOIN courses co ON co.id = l.courseId LEFT JOIN users t ON t.id = l.instructorId WHERE l.id = ?', [lectureId]);
    if (!lecture) return 0;
    const recipientIds = (await eligibleStudents(lecture)).map((s) => s.id);
    return await notify({
      type,
      data: { title: lecture.title, teacherName: lecture.teacherName, date: lecture.scheduledStartTime },
      universityId: lecture.university_id,
      recipientIds,
      entityType: 'live_class',
      entityId: lecture.id,
      createdBy: lecture.instructorId,
      createdByRole: 'mentor',
    });
  } catch (err) {
    console.error('[lectures] notification failed:', err.message);
    return 0;
  }
}

/* ================= CREATE, START, CANCEL, END ================= */
async function createLecture(req, body = {}) {
  const user = caller(req);
  if (user.kind !== 'teacher') throw new HttpError(403, 'Only a teacher starts or schedules a class');
  const classroomId = positiveId(body.classroomId, 'class');
  const courseId = positiveId(body.courseId, 'course');
  const title = text(body.title, 'Topic', 200, true);
  const description = text(body.description, 'Description', 2000, false);
  const mode = body.mode === 'schedule' ? 'schedule' : body.mode === 'now' ? 'now' : null;
  if (!mode) throw new HttpError(400, 'mode must be "now" or "schedule"');
  const duration = body.durationMinutes === undefined || body.durationMinutes === '' ? 60 : Number(body.durationMinutes);
  if (!Number.isInteger(duration) || duration < 10 || duration > 480) throw new HttpError(400, 'Duration must be 10 to 480 minutes');
  const requestKey = body.requestKey === undefined || body.requestKey === null || body.requestKey === '' ? null : text(body.requestKey, 'requestKey', 100, true);

  const classroom = await get('SELECT id FROM classrooms WHERE id = ? AND university_id = ?', [classroomId, user.schoolId]);
  if (!classroom) throw new HttpError(404, 'Class not found');
  const course = await get(`SELECT co.id FROM courses co WHERE co.id = ? AND co.university_id = ? AND co.mentorId = ? AND ${TAUGHT_TO_CLASS}`,
    [courseId, user.schoolId, user.id, classroomId, classroomId]);
  if (!course) throw new HttpError(403, 'You can start a class only for a course you teach to this class');

  let start;
  if (mode === 'schedule') {
    start = new Date(body.scheduledStartTime);
    if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Choose a valid date and time');
    if (start.getTime() < Date.now() + 60 * 1000) throw new HttpError(400, 'The scheduled time must be in the future');
    if (start.getTime() > Date.now() + MAX_AHEAD_MS) throw new HttpError(400, 'Schedule at most a year ahead');
  } else {
    start = new Date();
    if (!jaas.isConfigured()) throw new HttpError(503, 'Live classes are not set up yet (JaaS credentials missing). Ask the administrator.');
  }

  // A repeated request (double click, network retry) returns the lecture it already created
  if (requestKey) {
    const earlier = await get('SELECT id FROM live_classes WHERE instructorId = ? AND requestKey = ?', [user.id, requestKey]);
    if (earlier) return { duplicate: true, lecture: await getLecture(req, earlier.id) };
  }
  if (mode === 'now') {
    const running = await get("SELECT id FROM live_classes WHERE instructorId = ? AND classroomId = ? AND courseId = ? AND status = 'live'", [user.id, classroomId, courseId]);
    if (running) return { duplicate: true, lecture: await getLecture(req, running.id) };
  }

  const startIso = start.toISOString();
  const endIso = new Date(start.getTime() + duration * 60000).toISOString();
  let id;
  try {
    id = await withTransaction(async () => {
      const inserted = await run(
        `INSERT INTO live_classes (courseId, instructorId, title, description, scheduledStartTime, scheduledEndTime, actualStartTime, duration,
           platform, status, classroomId, university_id, provider, providerRoom, requestKey, attendanceState, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'jaas', ?, ?, ?, 'jaas', ?, ?, 'pending', ?, ?)`,
        [courseId, user.id, title, description, startIso, endIso, mode === 'now' ? startIso : null, duration,
          mode === 'now' ? 'live' : 'scheduled', classroomId, user.schoolId, jaas.createRoom(), requestKey, nowIso(), nowIso()]
      );
      return inserted.lastID;
    });
  } catch (err) {
    // the same requestKey raced in from a second request: hand back the first lecture
    if (requestKey && /UNIQUE/.test(err.message)) {
      const earlier = await get('SELECT id FROM live_classes WHERE instructorId = ? AND requestKey = ?', [user.id, requestKey]);
      if (earlier) return { duplicate: true, lecture: await getLecture(req, earlier.id) };
    }
    throw err;
  }
  await notifyStudents(id, mode === 'now' ? 'LIVE_CLASS_STARTED' : 'LIVE_CLASS_SCHEDULED');
  return { duplicate: false, lecture: await getLecture(req, id) };
}

async function startLecture(req, lectureId) {
  const { lecture, user, isOwner } = await lectureFor(req, lectureId);
  if (!isOwner) throw new HttpError(403, 'Only the lecture\'s teacher starts it');
  if (lecture.status === 'live') return getLecture(req, lecture.id);
  if (lecture.status !== 'scheduled') throw new HttpError(409, `This lecture is ${lecture.status}`);
  if (!lecture.providerRoom) throw new HttpError(409, 'This lecture was created before embedded classes; schedule it again');
  if (ms(lecture.scheduledStartTime) - Date.now() > START_EARLY_MS) throw new HttpError(400, 'You can start it 30 minutes before the scheduled time at the earliest');
  if (!jaas.isConfigured()) throw new HttpError(503, 'Live classes are not set up yet (JaaS credentials missing). Ask the administrator.');
  // only one of two simultaneous starts changes the row
  const started = await run("UPDATE live_classes SET status = 'live', actualStartTime = ?, updatedAt = ? WHERE id = ? AND status = 'scheduled'", [nowIso(), nowIso(), lecture.id]);
  if (started.changes > 0) await notifyStudents(lecture.id, 'LIVE_CLASS_STARTED');
  void user;
  return getLecture(req, lecture.id);
}

async function cancelLecture(req, lectureId) {
  const { lecture, user, isOwner } = await lectureFor(req, lectureId);
  if (!(isOwner || user.kind === 'admin')) throw new HttpError(403, 'Only the lecture\'s teacher or an admin cancels it');
  if (lecture.status === 'cancelled') return getLecture(req, lecture.id);
  if (lecture.status !== 'scheduled') throw new HttpError(409, lecture.status === 'live' ? 'The class is live: end it instead' : `This lecture is ${lecture.status}`);
  const cancelled = await run("UPDATE live_classes SET status = 'cancelled', cancelledAt = ?, cancelledBy = ?, updatedAt = ? WHERE id = ? AND status = 'scheduled'", [nowIso(), user.id, nowIso(), lecture.id]);
  // Only the request that actually cancelled it notifies (a retry finds it cancelled above); the
  // notification service also stores one per student per lecture.
  if (cancelled.changes > 0) await notifyStudents(lecture.id, 'LIVE_CLASS_CANCELLED');
  return getLecture(req, lecture.id);
}

/** Completes a live lecture once; later calls change nothing. `at` = the end time to record. */
async function completeLecture(lectureId, at, endedBy) {
  const changed = await run(
    "UPDATE live_classes SET status = 'completed', actualEndTime = ?, endedBy = ?, updatedAt = ? WHERE id = ? AND status = 'live'",
    [at, endedBy, nowIso(), lectureId]
  );
  if (changed.changes > 0) await recomputeAttendance(lectureId);
  return changed.changes > 0;
}

async function endLecture(req, lectureId) {
  const { lecture, user, isOwner } = await lectureFor(req, lectureId);
  if (!(isOwner || user.kind === 'admin')) throw new HttpError(403, 'Only the lecture\'s teacher or an admin ends it');
  if (lecture.status === 'completed') return getLecture(req, lecture.id);
  if (lecture.status !== 'live') throw new HttpError(409, `This lecture is ${lecture.status}`);
  await completeLecture(lecture.id, nowIso(), user.kind === 'admin' ? 'admin' : 'teacher');
  return getLecture(req, lecture.id);
}

/* ================= JOINING ================= */
async function joinLecture(req, lectureId) {
  const { lecture, user, isOwner } = await lectureFor(req, lectureId);
  if (user.kind === 'admin' || (user.kind === 'teacher' && !isOwner)) throw new HttpError(403, 'Only the lecture\'s teacher and its students join');
  if (user.kind === 'student' && !(await isEligibleStudent(user.id, lecture))) throw new HttpError(403, 'You are not enrolled in this lecture\'s course and class');
  if (lecture.status !== 'live') throw new HttpError(409, lecture.status === 'scheduled' ? 'The class has not started yet' : `This lecture is ${lecture.status}`);
  if (!lecture.providerRoom) throw new HttpError(409, 'This lecture was created before embedded classes and cannot be opened here');
  if (!jaas.isConfigured()) throw new HttpError(503, 'Live classes are not set up yet (JaaS credentials missing). Ask the administrator.');
  const person = await get('SELECT id, name, email FROM users WHERE id = ?', [user.id]);
  return { lecture: await getLecture(req, lecture.id), meeting: jaas.joinDetails(lecture.providerRoom, person, { moderator: isOwner }) };
}

/* ================= ATTENDANCE ================= */
/**
 * The in-meeting page reports the signed-in student's own presence: 'join' | 'leave' | 'beat'.
 * The server stamps the time; nothing else from the browser is used.
 */
async function recordPresence(req, lectureId, kind) {
  if (!['join', 'leave', 'beat'].includes(kind)) throw new HttpError(400, 'kind must be join, leave or beat');
  const { lecture, user } = await lectureFor(req, lectureId);
  if (user.kind !== 'student') return { recorded: false }; // the teacher's presence is not attendance
  if (!(await isEligibleStudent(user.id, lecture))) throw new HttpError(403, 'You are not enrolled in this lecture\'s course and class');
  if (lecture.status !== 'live') return { recorded: false, status: lecture.status };
  if (kind === 'beat') {
    const last = await get("SELECT at FROM live_class_events WHERE liveClassId = ? AND userId = ? AND source = 'client' ORDER BY at DESC LIMIT 1", [lecture.id, user.id]);
    if (last && Date.now() - ms(last.at) < STUDENT_BEAT_MIN_MS) return { recorded: false };
  }
  const at = nowIso();
  await run('INSERT INTO live_class_events (liveClassId, userId, kind, source, at, dedupKey) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    [lecture.id, user.id, kind, 'client', at, `client:${lecture.id}:${user.id}:${kind}:${at}`]);
  await recomputeAttendance(lecture.id);
  return { recorded: true };
}

/** A verified provider webhook. Returns what was done (for the log), never throws for unknown rooms. */
async function handleProviderEvent(event) {
  if (!event) return 'ignored';
  const lecture = await get('SELECT l.*, COALESCE(l.university_id, co.university_id) AS university_id FROM live_classes l JOIN courses co ON co.id = l.courseId WHERE l.providerRoom = ?', [event.room]);
  if (!lecture) return 'unknown room';
  if (event.kind === 'ended') return (await completeLecture(lecture.id, event.at, 'provider')) ? 'completed' : 'already finished';
  if (event.kind === 'started') return 'noted';
  if (!event.userId || !(await isEligibleStudent(event.userId, lecture))) return 'not a student of the lecture';
  const inserted = await run('INSERT INTO live_class_events (liveClassId, userId, kind, source, at, dedupKey) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    [lecture.id, event.userId, event.kind, 'provider', event.at, `provider:${event.key}`]);
  if (inserted.changes === 0) return 'duplicate';
  await recomputeAttendance(lecture.id);
  return 'recorded';
}

/**
 * Join/leave/heartbeat events of one student -> attended intervals. Events may arrive twice or out
 * of order: they are sorted by time, a join while already present and a leave while absent change
 * nothing. An interval still open closes at `openEnd`.
 */
function intervalsFrom(events, { lectureStart, openEndFor }) {
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at) || (a.kind === 'join' ? -1 : 1));
  const spans = [];
  let open = null;
  let lastSeen = null;
  for (const e of sorted) {
    const t = ms(e.at);
    if (e.kind === 'join' || e.kind === 'beat') {
      if (open === null) open = t;
      lastSeen = t;
    } else if (e.kind === 'leave' && open !== null) {
      spans.push([open, t]);
      open = null;
    }
  }
  if (open !== null) spans.push([open, openEndFor(lastSeen)]);
  return spans
    .map(([a, b]) => [Math.max(a, lectureStart), b])
    .filter(([a, b]) => b > a);
}

async function recomputeAttendance(lectureId) {
  const lecture = await get('SELECT l.*, COALESCE(l.university_id, co.university_id) AS university_id FROM live_classes l JOIN courses co ON co.id = l.courseId WHERE l.id = ?', [lectureId]);
  if (!lecture || lecture.status === 'cancelled' || !lecture.actualStartTime) return;
  const events = await all('SELECT userId, kind, source, at FROM live_class_events WHERE liveClassId = ?', [lectureId]);
  const useProvider = events.some((e) => e.source === 'provider');
  const source = useProvider ? 'provider' : 'client';
  const chosen = events.filter((e) => e.source === source);
  const completed = lecture.status === 'completed';
  const lectureStart = ms(lecture.actualStartTime);
  const lectureEnd = completed ? ms(lecture.actualEndTime) : Date.now();
  const openEndFor = (lastSeen) => (useProvider ? lectureEnd : Math.min(lectureEnd, (lastSeen ?? lectureStart) + HEARTBEAT_GRACE_MS));
  const nothingMeasured = completed && events.length === 0;

  const byStudent = new Map();
  chosen.forEach((e) => byStudent.set(Number(e.userId), [...(byStudent.get(Number(e.userId)) || []), e]));
  const everyone = new Set(byStudent.keys());
  if (completed) (await eligibleStudents(lecture)).forEach((s) => everyone.add(Number(s.id)));

  await withTransaction(async () => {
    for (const studentId of everyone) {
      const spans = intervalsFrom(byStudent.get(studentId) || [], { lectureStart, openEndFor }).map(([a, b]) => [a, Math.min(b, lectureEnd)]).filter(([a, b]) => b > a);
      const seconds = Math.round(spans.reduce((sum, [a, b]) => sum + (b - a), 0) / 1000);
      const status = !completed ? 'pending' : nothingMeasured ? 'unknown' : seconds >= QUALIFYING_SECONDS ? 'attended' : 'missed';
      const first = spans.length ? new Date(spans[0][0]).toISOString() : null;
      const last = spans.length ? new Date(spans[spans.length - 1][1]).toISOString() : null;
      await run(
        `INSERT INTO live_class_attendance (liveClassId, studentId, firstJoinedAt, lastLeftAt, attendedSeconds, intervals, status, source, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(liveClassId, studentId) DO UPDATE SET firstJoinedAt = excluded.firstJoinedAt, lastLeftAt = excluded.lastLeftAt,
           attendedSeconds = excluded.attendedSeconds, intervals = excluded.intervals, status = excluded.status, source = excluded.source, updatedAt = excluded.updatedAt`,
        [lectureId, studentId, first, last, seconds, spans.length, status, byStudent.has(studentId) ? source : null, nowIso()]
      );
    }
    if (completed) await run('UPDATE live_classes SET attendanceState = ? WHERE id = ?', [nothingMeasured ? 'unknown' : 'final', lectureId]);
  });
}

module.exports = {
  QUALIFYING_SECONDS,
  teachableCourses,
  createLecture,
  startLecture,
  cancelLecture,
  endLecture,
  joinLecture,
  getLecture,
  lectureAttendance,
  listForStaff,
  listForStudent,
  recordPresence,
  handleProviderEvent,
  recomputeAttendance,
  intervalsFrom,
};
