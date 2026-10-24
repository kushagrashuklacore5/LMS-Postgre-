// School-scoped read routes for LMS entities, plus the term-result routes the mentor
// pages use. Mounted last in server.js, so a path handled by a dedicated router never
// reaches this file.
//
// This router used to offer create/update/delete/bulk/export for any table to anyone,
// with table and column names taken from the request. It is now read-only and closed:
//   - only the entities listed in READABLE exist here;
//   - every query is limited to the caller's school (and to the caller, for students);
//   - password columns are removed before a row leaves the server;
//   - filters are a fixed list, so no request value ever becomes part of the SQL text.
// Who may call each path is decided by config/accessPolicy.js.

const express = require('express');
const router = express.Router();
const db = require('../config/database-switch');
const { retrieveAndTranslateBilingualData } = require('../utils/autoTranslationHelper');
const { guardParams, isPlatformOwner } = require('../helpers/schoolScope');
const { authorizeClassroom } = require('../helpers/teachingScope');
const { isStudentOfClassroom } = require('../helpers/classroomEnrollment');

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const VIA_COURSE = 'JOIN courses parent ON parent.id = t.courseId';
const VIA_CLASSROOM = 'JOIN classrooms parent ON parent.id = t.classroomId';
const VIA_STUDENT = 'JOIN users parent ON parent.id = t.studentId';

/**
 * table       table read as alias "t"
 * join        join to the row that carries the school, when the table has no school column
 * school      column holding the school id
 * hidden      columns never returned
 * studentOwn  column that must equal the caller's id when the caller is a student
 * studentCourse  column holding a course id: a student sees the row only for a course they take
 * studentOnly  extra condition applied when the caller is a student
 * filters     query-string filters allowed for the list, mapped to their columns
 */
const READABLE = {
  users: {
    table: 'users',
    school: 't.university_id',
    hidden: ['password'],
    filters: { role: 't.role' },
  },
  classrooms: { table: 'classrooms', school: 't.university_id', filters: { grade: 't.grade' } },
  courses: { table: 'courses', school: 't.university_id', studentCourse: 't.id', filters: { classroomId: 't.classroomId', mentorId: 't.mentorId' } },
  feeStructures: { table: 'feeStructures', school: 't.university_id', filters: { grade: 't.grade', category: 't.category' } },
  calendar_events: { table: 'calendar_events', school: 't.university_id' },
  weeks: { table: 'weeks', join: VIA_COURSE, school: 'parent.university_id', studentCourse: 't.courseId', filters: { courseId: 't.courseId' } },
  chapters: { table: 'chapters', join: VIA_COURSE, school: 'parent.university_id', studentCourse: 't.courseId', filters: { courseId: 't.courseId' } },
  // a draft is the teacher's until it is published
  assessments: { table: 'assessments', join: VIA_COURSE, school: 'parent.university_id', studentCourse: 't.courseId', studentOnly: 't.isPublished = 1', filters: { courseId: 't.courseId' } },
  attendance: {
    table: 'attendance',
    join: VIA_CLASSROOM,
    school: 'parent.university_id',
    studentOwn: 't.studentId',
    filters: { classroomId: 't.classroomId', studentId: 't.studentId', date: 't.date' },
  },
  results: {
    table: 'results',
    join: VIA_CLASSROOM,
    school: 'parent.university_id',
    studentOwn: 't.studentId',
    filters: { classroomId: 't.classroomId', studentId: 't.studentId', term: 't.term' },
  },
  certificates: {
    table: 'certificates',
    join: VIA_STUDENT,
    school: 'parent.university_id',
    studentOwn: 't.studentId',
    filters: { courseId: 't.courseId', studentId: 't.studentId' },
  },
  progress: {
    table: 'progress',
    join: VIA_STUDENT,
    school: 'parent.university_id',
    studentOwn: 't.studentId',
    filters: { courseId: 't.courseId', studentId: 't.studentId' },
  },
};

/** WHERE clause and parameters that keep a query inside what the caller may see. */
function visibleTo(req, entity) {
  const conditions = [];
  const params = [];
  if (!isPlatformOwner(req)) {
    conditions.push(`${entity.school} = ?`);
    params.push(req.user.universityId);
  }
  if (req.user.role === 'student') {
    if (entity.studentOwn) {
      conditions.push(`${entity.studentOwn} = ?`);
      params.push(req.user.userId);
    }
    if (entity.studentCourse) {
      // enrolled in the course (course_students)
      conditions.push(`EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = ${entity.studentCourse} AND cs.studentId = ?)`);
      params.push(req.user.userId);
    }
    if (entity.studentOnly) conditions.push(entity.studentOnly);
  }
  return { conditions, params };
}

const selectFrom = (entity) => `SELECT t.* FROM ${entity.table} t ${entity.join || ''}`;

const withoutHidden = (entity, row) => {
  if (!entity.hidden) return row;
  const visible = { ...row };
  entity.hidden.forEach((column) => delete visible[column]);
  return visible;
};

async function translated(rows, language) {
  try {
    return await Promise.all(rows.map((row) => retrieveAndTranslateBilingualData(row, language)));
  } catch (translationError) {
    console.warn(`Translation warning: ${translationError.message}`);
    return rows;
  }
}

const fail = (res, entityName, err) => {
  console.error(`Error fetching ${entityName}:`, err.message);
  res.status(500).json({ success: false, message: `Failed to fetch ${entityName}` });
};

for (const [entityName, entity] of Object.entries(READABLE)) {
  // List
  router.get(`/${entityName}`, async (req, res) => {
    try {
      const language = req.query.lang || 'en';
      const { conditions, params } = visibleTo(req, entity);
      for (const [filter, column] of Object.entries(entity.filters || {})) {
        const value = req.query[filter];
        if (typeof value === 'string' && value !== '') {
          conditions.push(`${column} = ?`);
          params.push(value);
        }
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      // Optional paging: ?limit=50&offset=100 (limit at most 500). The total is returned in
      // X-Total-Count so a client can page through a large school instead of loading it all.
      let paging = '';
      if (req.query.limit !== undefined) {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 1), 500);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const total = await dbGet(`SELECT COUNT(*) AS n FROM ${entity.table} t ${entity.join || ''} ${where}`, params);
        res.setHeader('X-Total-Count', String(total.n));
        paging = ` LIMIT ${limit} OFFSET ${offset}`;
      }
      const found = await dbAll(`${selectFrom(entity)} ${where} ORDER BY t.id DESC${paging}`, params);
      const rows = found.map((row) => withoutHidden(entity, row));
      res.status(200).json({ success: true, data: await translated(rows, language), language });
    } catch (err) {
      fail(res, entityName, err);
    }
  });

  // Single record
  router.get(`/${entityName}/:id`, async (req, res) => {
    try {
      const language = req.query.lang || 'en';
      const { conditions, params } = visibleTo(req, entity);
      const row = await dbGet(`${selectFrom(entity)} WHERE ${['t.id = ?', ...conditions].join(' AND ')}`, [
        req.params.id,
        ...params,
      ]);
      if (!row) {
        return res.status(404).json({ success: false, message: `${entityName} not found` });
      }
      const [data] = await translated([withoutHidden(entity, row)], language);
      res.status(200).json({ success: true, data, language });
    } catch (err) {
      fail(res, entityName, err);
    }
  });
}

/* ================= TERM RESULTS (mentor "Add Result" and "Class Results" pages) ================= */
guardParams(router, { resultId: 'result' });

// Create or update one student's result for a term
router.post('/results', async (req, res) => {
  try {
    const { classroomId, studentId, subjects, term, comments } = req.body || {};
    if (!classroomId || !studentId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // The teacher must run this classroom, and the student must be in it
    await authorizeClassroom(req, classroomId);
    if (!(await isStudentOfClassroom(studentId, classroomId))) {
      return res.status(400).json({ success: false, message: 'This student is not in the selected classroom' });
    }

    const subjectList = Array.isArray(subjects) ? subjects : [];
    for (const sub of subjectList) {
      const marks = Number(sub?.marks);
      const total = Number(sub?.total);
      const label = sub?.name || 'a subject';
      if (sub?.marks === '' || sub?.marks === null || sub?.marks === undefined || !Number.isFinite(marks) || marks < 0) {
        return res.status(400).json({ success: false, message: `Enter valid marks for ${label}` });
      }
      if (!Number.isFinite(total) || total <= 0) {
        return res.status(400).json({ success: false, message: `Enter the maximum marks for ${label}` });
      }
      if (marks > total) {
        return res.status(400).json({ success: false, message: `Marks for ${label} cannot be more than ${total}` });
      }
    }
    let totalObtained = 0;
    let totalMax = 0;
    let failCount = 0;
    subjectList.forEach((sub) => {
      totalObtained += parseFloat(sub.marks) || 0;
      totalMax += parseFloat(sub.total) || 0;
      if ((sub.status || 'PASS') === 'FAIL') failCount++;
    });
    const overallPercentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(2) : 0;
    const overallStatus = failCount > 0 ? 'FAIL' : 'PASS';
    const termName = term || 'General';
    const subjectsJson = JSON.stringify(subjectList);

    const existing = await dbGet('SELECT id FROM results WHERE studentId = ? AND classroomId = ? AND term = ?', [
      studentId,
      classroomId,
      termName,
    ]);

    if (existing) {
      await dbRun(
        'UPDATE results SET subjects = ?, overallPercentage = ?, overallStatus = ?, comments = ?, updatedAt = utc_now_text() WHERE id = ?',
        [subjectsJson, overallPercentage, overallStatus, comments || '', existing.id]
      );
      const data = await dbGet('SELECT * FROM results WHERE id = ?', [existing.id]);
      return res.status(200).json({ success: true, message: 'Result updated successfully', data });
    }

    const created = await dbRun(
      `INSERT INTO results (studentId, classroomId, term, subjects, overallPercentage, overallStatus, comments, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, utc_now_text(), utc_now_text())`,
      [studentId, classroomId, termName, subjectsJson, overallPercentage, overallStatus, comments || '']
    );
    const data = await dbGet('SELECT * FROM results WHERE id = ?', [created.lastID]);
    res.status(201).json({ success: true, message: 'Result saved successfully', data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Error saving result:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save result' });
  }
});

// Delete a result
router.delete('/results/:resultId', async (req, res) => {
  try {
    const result = await dbGet('SELECT id, classroomId FROM results WHERE id = ?', [req.params.resultId]);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    await authorizeClassroom(req, result.classroomId);
    await dbRun('DELETE FROM results WHERE id = ?', [result.id]);
    res.status(200).json({ success: true, message: 'Result deleted successfully' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error('Error deleting result:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete result' });
  }
});

/* ================= A STUDENT'S OWN CLASSROOMS ================= */
router.get('/student-classrooms', async (req, res) => {
  try {
    const classrooms = await dbAll(
      `SELECT c.*, u.name as classTeacher, u.email as classTeacherEmail
       FROM classrooms c
       LEFT JOIN users u ON c.classTeacherId = u.id
       WHERE c.university_id = ?
         AND c.id IN (SELECT DISTINCT classroomId FROM student_classroom_assignment WHERE studentId = ?)
       ORDER BY c.grade, c.section`,
      [req.user.universityId, req.user.userId]
    );

    res.status(200).json(
      classrooms.map((classroom) => ({
        ...classroom,
        _id: classroom.id,
        classTeacher: classroom.classTeacher
          ? { name: classroom.classTeacher, email: classroom.classTeacherEmail }
          : null,
      }))
    );
  } catch (err) {
    console.error('Error fetching student classrooms:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch student classrooms' });
  }
});

module.exports = router;
