const db = require('../config/database-switch');

/**
 * School isolation helpers.
 *
 * Every record belongs to exactly one school, either through its own
 * university_id column or through a parent record (a week belongs to its
 * course's school, a result to its classroom's school, and so on). This file
 * is the one place that knows those links.
 *
 * The caller's school always comes from req.user (set from the database by
 * authMiddleware), never from the request. A record of another school is
 * answered with 404, exactly like a record that does not exist, so ids of
 * other schools cannot be probed.
 */

const dbGet = (sql, params) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

// One query per record type that returns the owning school as "schoolId".
const SCHOOL_QUERY = {
  // The platform owner's account belongs to no school, whatever its university_id column says
  user: "SELECT CASE WHEN role = 'superadmin' THEN NULL ELSE university_id END AS schoolId FROM users WHERE id = ?",
  classroom: 'SELECT university_id AS schoolId FROM classrooms WHERE id = ?',
  course: 'SELECT university_id AS schoolId FROM courses WHERE id = ?',
  announcement: 'SELECT university_id AS schoolId FROM announcements WHERE id = ?',
  feeStructure: 'SELECT university_id AS schoolId FROM feeStructures WHERE id = ?',
  calendarEvent: 'SELECT university_id AS schoolId FROM calendar_events WHERE id = ?',
  week: 'SELECT c.university_id AS schoolId FROM weeks w JOIN courses c ON c.id = w.courseId WHERE w.id = ?',
  chapter: 'SELECT c.university_id AS schoolId FROM chapters ch JOIN courses c ON c.id = ch.courseId WHERE ch.id = ?',
  material: 'SELECT c.university_id AS schoolId FROM course_materials m JOIN courses c ON c.id = m.courseId WHERE m.id = ?',
  assessment: 'SELECT c.university_id AS schoolId FROM assessments a JOIN courses c ON c.id = a.courseId WHERE a.id = ?',
  assessmentQuestion:
    'SELECT c.university_id AS schoolId FROM assessment_questions q JOIN assessments a ON a.id = q.assessmentId JOIN courses c ON c.id = a.courseId WHERE q.id = ?',
  liveClass: 'SELECT c.university_id AS schoolId FROM live_classes l JOIN courses c ON c.id = l.courseId WHERE l.id = ?',
  certificate: 'SELECT u.university_id AS schoolId FROM certificates ce JOIN users u ON u.id = ce.studentId WHERE ce.id = ?',
  result: 'SELECT cl.university_id AS schoolId FROM results r JOIN classrooms cl ON cl.id = r.classroomId WHERE r.id = ?',
  attendance: 'SELECT cl.university_id AS schoolId FROM attendance a JOIN classrooms cl ON cl.id = a.classroomId WHERE a.id = ?',
};

// Request fields that carry the id of a school-owned record, wherever they appear
// (query string, JSON body, or one level down in an array of rows).
const ID_FIELDS = {
  courseId: 'course',
  course_id: 'course',
  classroomId: 'classroom',
  classroom_id: 'classroom',
  classroomIds: 'classroom',
  studentId: 'user',
  student_id: 'user',
  studentIds: 'user',
  mentorId: 'user',
  teacherId: 'user',
  classTeacherId: 'user',
  userId: 'user',
  recipientUserId: 'user',
  weekId: 'week',
  chapterId: 'chapter',
  materialId: 'material',
  assessmentId: 'assessment',
  liveClassId: 'liveClass',
  feeStructureId: 'feeStructure',
};

// Fields through which a student could name someone else.
const STUDENT_SELF_FIELDS = new Set(['studentId', 'student_id', 'userId']);

const isPlatformOwner = (req) => req.user?.role === 'superadmin';
const sameId = (a, b) => String(a) === String(b);
const isBlank = (value) => value === undefined || value === null || value === '';
const TEACHER_ROLES = ['mentor', 'teacher'];

const exists = async (sql, params) => Boolean(await dbGet(sql, params));
const repeat = (value, count) => Array(count).fill(value);

/** True when the record exists and belongs to the caller's school. */
async function belongsToCallerSchool(req, recordType, id) {
  if (isPlatformOwner(req)) return true;
  if (!/^\d+$/.test(String(id))) return false;
  const row = await dbGet(SCHOOL_QUERY[recordType], [id]);
  return Boolean(row) && row.schoolId != null && sameId(row.schoolId, req.user.universityId);
}

/* ---------- Relationship rules inside one school ---------- */

// Record types that live inside a course, and how to find that course.
const COURSE_OF = {
  week: 'SELECT courseId FROM weeks WHERE id = ?',
  chapter: 'SELECT courseId FROM chapters WHERE id = ?',
  material: 'SELECT courseId FROM course_materials WHERE id = ?',
  assessment: 'SELECT courseId FROM assessments WHERE id = ?',
  assessmentQuestion: 'SELECT a.courseId FROM assessment_questions q JOIN assessments a ON a.id = q.assessmentId WHERE q.id = ?',
  liveClass: 'SELECT courseId FROM live_classes WHERE id = ?',
};

// A student takes a course when enrolled in it (course_students). Being in a class the course
// is taught to is not enough: the admin may have enrolled only some of the class.
const studentTakesCourse = (studentId, courseId) =>
  exists(
    `SELECT 1 FROM courses c WHERE c.id = ? AND (
       EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = c.id AND cs.studentId = ?)
     )`,
    [courseId, studentId]
  );

const studentInClassroom = (studentId, classroomId) =>
  exists('SELECT 1 FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?', [studentId, classroomId]);

// The teacher runs this classroom: its class teacher (three ways of recording it). Takes 3 ids.
const RUNS_CLASSROOM = `(
  (CASE WHEN c.classTeacher ~ '^ *[0-9]+ *$' THEN CAST(TRIM(c.classTeacher) AS BIGINT) END) = ? OR c.classTeacherId = ?
  OR EXISTS (SELECT 1 FROM classroomAssignments ca WHERE ca.classroomId = c.id AND ca.teacherId = ? AND ca.role = 'class_teacher')
)`;

// The teacher runs this classroom or teaches a course in it (may open the class). Takes 4 ids.
const TEACHES_IN_CLASSROOM = `(
  (CASE WHEN c.classTeacher ~ '^ *[0-9]+ *$' THEN CAST(TRIM(c.classTeacher) AS BIGINT) END) = ? OR c.classTeacherId = ?
  OR EXISTS (SELECT 1 FROM classroomAssignments ca WHERE ca.classroomId = c.id AND ca.teacherId = ? AND ca.role = 'class_teacher')
  OR EXISTS (SELECT 1 FROM courses co WHERE co.mentorId = ? AND (co.classroomId = c.id OR EXISTS (SELECT 1 FROM course_classrooms cocc WHERE cocc.courseId = co.id AND cocc.classroomId = c.id)))
)`;

const teacherHasClassroom = (teacherId, classroomId) =>
  exists(`SELECT 1 FROM classrooms c WHERE c.id = ? AND ${TEACHES_IN_CLASSROOM}`, [classroomId, ...repeat(teacherId, 4)]);

const teacherHasCourse = (teacherId, courseId) =>
  exists(
    // only the courses the teacher mentors
    'SELECT 1 FROM courses course WHERE course.id = ? AND course.mentorId = ?',
    [courseId, teacherId]
  );

// A teacher's students: in a classroom the teacher runs (class teacher), or enrolled in a course
// the teacher teaches. Teaching a course to a class does not open the class's other students.
const teacherHasStudent = (teacherId, studentId) =>
  exists(
    `SELECT 1 WHERE
       EXISTS (SELECT 1 FROM student_classroom_assignment sca JOIN classrooms c ON c.id = sca.classroomId
               WHERE sca.studentId = ? AND ${RUNS_CLASSROOM})
       OR EXISTS (SELECT 1 FROM course_students cs JOIN courses co ON co.id = cs.courseId
                  WHERE cs.studentId = ? AND co.mentorId = ?)`,
    [studentId, ...repeat(teacherId, 3), studentId, teacherId]
  );

const teacherRunsClassroom = (teacherId, classroomId) =>
  exists(`SELECT 1 FROM classrooms c WHERE c.id = ? AND ${RUNS_CLASSROOM}`, [classroomId, ...repeat(teacherId, 3)]);

async function studentMayAccess(studentId, recordType, id) {
  if (recordType === 'user') return sameId(id, studentId);
  if (recordType === 'classroom') return studentInClassroom(studentId, id);
  if (recordType === 'course') return studentTakesCourse(studentId, id);
  if (COURSE_OF[recordType]) {
    const parent = await dbGet(COURSE_OF[recordType], [id]);
    return Boolean(parent) && studentTakesCourse(studentId, parent.courseId);
  }
  if (recordType === 'certificate') return exists('SELECT 1 FROM certificates WHERE id = ? AND studentId = ?', [id, studentId]);
  if (recordType === 'result') return exists('SELECT 1 FROM results WHERE id = ? AND studentId = ?', [id, studentId]);
  if (recordType === 'attendance') return exists('SELECT 1 FROM attendance WHERE id = ? AND studentId = ?', [id, studentId]);
  return true; // announcements, calendar events, fee structures: school-wide, filtered by their handlers
}

async function teacherMayAccess(teacherId, recordType, id) {
  if (recordType === 'user') {
    if (sameId(id, teacherId)) return true;
    const target = await dbGet('SELECT role FROM users WHERE id = ?', [id]);
    return Boolean(target) && target.role === 'student' && teacherHasStudent(teacherId, id);
  }
  if (recordType === 'classroom') return teacherHasClassroom(teacherId, id);
  if (recordType === 'course') return teacherHasCourse(teacherId, id);
  if (COURSE_OF[recordType]) {
    const parent = await dbGet(COURSE_OF[recordType], [id]);
    return Boolean(parent) && teacherHasCourse(teacherId, parent.courseId);
  }
  if (recordType === 'result' || recordType === 'attendance') {
    const table = recordType === 'result' ? 'results' : 'attendance';
    const row = await dbGet(`SELECT classroomId FROM ${table} WHERE id = ?`, [id]);
    return Boolean(row) && teacherHasClassroom(teacherId, row.classroomId);
  }
  if (recordType === 'certificate') {
    const row = await dbGet('SELECT studentId FROM certificates WHERE id = ?', [id]);
    return Boolean(row) && teacherHasStudent(teacherId, row.studentId);
  }
  return true;
}

/**
 * May the caller work with this record at all?
 * Same school for everyone; in addition a student reaches only their own
 * records, classrooms and courses, and a teacher only the classrooms, courses
 * and students they teach. Admins and finance staff act on their whole school.
 */
async function callerMayAccess(req, recordType, id) {
  if (!(await belongsToCallerSchool(req, recordType, id))) return false;
  const { role, userId } = req.user;
  if (role === 'student') return studentMayAccess(userId, recordType, id);
  if (TEACHER_ROLES.includes(role)) return teacherMayAccess(userId, recordType, id);
  return true;
}

const notFound = (res) => res.status(404).json({ success: false, message: 'Not found' });
const forbidden = (res, message) => res.status(403).json({ success: false, message });

/**
 * router.param() handler: the caller must be allowed to work with the record a
 * URL parameter names (see callerMayAccess).
 *   router.param('courseId', schoolParam('course'))
 */
const schoolParam = (recordType) => async (req, res, next, id) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!(await callerMayAccess(req, recordType, id))) return notFound(res);
    next();
  } catch (err) {
    next(err);
  }
};

/** Registers schoolParam for several parameters of one router. */
function guardParams(router, params) {
  for (const [name, recordType] of Object.entries(params)) {
    router.param(name, schoolParam(recordType));
  }
}

// Collects { field, value } for every known id field in an object and in arrays of row objects inside it.
function collectIds(source, found = [], depth = 0) {
  if (!source || typeof source !== 'object' || depth > 2) return found;
  for (const [field, value] of Object.entries(source)) {
    if (ID_FIELDS[field]) {
      const values = Array.isArray(value) ? value : [value];
      values.filter((item) => !isBlank(item) && typeof item !== 'object').forEach((item) => found.push({ field, value: item }));
    } else if (Array.isArray(value)) {
      value.forEach((item) => collectIds(item, found, depth + 1));
    }
  }
  return found;
}

/**
 * Global guard (mounted by the API gate after authentication): every id of a
 * school-owned record found in the query string or JSON body is checked. This
 * stops "change the id in the request" attacks on every route at once,
 * including routes added later.
 *
 * - Ids get the full relationship rule (callerMayAccess): a teacher cannot read or
 *   change another class by editing ?classroomId= or a body field.
 * - A student can never name another person, anywhere.
 */
async function requestIdsInCallerSchool(req, res, next) {
  try {
    if (!req.user || isPlatformOwner(req) || req.user.role === 'vendor') return next();

    const isTeacher = TEACHER_ROLES.includes(req.user.role);
    const sources = [
      { ids: collectIds(req.query), inBody: false },
      { ids: collectIds(req.body), inBody: true },
    ];
    const checked = new Set();
    for (const { ids, inBody } of sources) {
      for (const { field, value } of ids) {
        const recordType = ID_FIELDS[field];
        if (req.user.role === 'student' && STUDENT_SELF_FIELDS.has(field) && !sameId(value, req.user.userId)) {
          return forbidden(res, 'You can only access your own records.');
        }
        // A teacher may name any student of the school in a request body (for example to
        // enrol them); the handler decides whether that action is allowed.
        const schoolRuleOnly = inBody && isTeacher && recordType === 'user';
        const key = `${schoolRuleOnly}:${recordType}:${value}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const allowed = schoolRuleOnly
          ? await belongsToCallerSchool(req, recordType, value)
          : await callerMayAccess(req, recordType, value);
        if (!allowed) return notFound(res);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  belongsToCallerSchool,
  callerMayAccess,
  schoolParam,
  guardParams,
  requestIdsInCallerSchool,
  isPlatformOwner,
  teacherRunsClassroom,
};
