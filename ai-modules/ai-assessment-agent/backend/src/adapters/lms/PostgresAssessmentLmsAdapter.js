const { AssessmentError, forbidden } = require('../../core/errors');
const { assignmentMethods } = require('./pgAssignmentStore'); // Descriptive Assignments (migration 007)
const { recipientsReportsMethods } = require('./pgRecipientsReportsStore'); // recipients + shared reports (migration 008)

/**
 * AssessmentLmsAdapter for THIS LMS: its PostgreSQL database, through the host's database
 * interface `sql` (see openPostgresAssessmentLmsAdapter). Every method that reads or writes
 * returns a promise; the capability checks (isReady, supports*, hasLmsTable) are synchronous and
 * read a snapshot of the schema taken once (the schema only changes through `npm run db:migrate`).
 *
 * LMS facts this adapter encodes (checked against the schema, read-only):
 *   - users(id, role, university_id): teachers have role 'mentor' (the client
 *     also treats 'teacher' as a teacher); students have role 'student'.
 *   - classrooms(id, university_id, name, grade, section) is the "class".
 *   - student_classroom_assignment(studentId, classroomId) is the membership
 *     the LMS reads (users.classroom_id is unused).
 * It only READS those tables. It writes only the module's aia_* tables.
 */
const TEACHER_ROLES = Object.freeze(['mentor', 'teacher']);
// The LMS rule for which classes a teacher may use: class teacher of it, or mentor of a course
// taught to it (its home class, or a class it is assigned to in the LMS table course_classrooms,
// when that table exists). Binds the teacher id four times. classTeacher is a text column holding
// a user id: only all-digit values are read as one.
const teachesClassroom = (withCourseClasses) => `(
  (CASE WHEN c.classTeacher ~ '^ *[0-9]+ *$' THEN CAST(TRIM(c.classTeacher) AS BIGINT) END) = ? OR c.classTeacherId = ?
  OR EXISTS (SELECT 1 FROM classroomAssignments ca WHERE ca.classroomId = c.id AND ca.teacherId = ? AND ca.role = 'class_teacher')
  OR EXISTS (SELECT 1 FROM courses co WHERE co.mentorId = ? AND (co.classroomId = c.id${withCourseClasses
    ? ' OR EXISTS (SELECT 1 FROM course_classrooms cc WHERE cc.courseId = co.id AND cc.classroomId = c.id)' : ''}))
)`;
const STUDENT_ROLES = Object.freeze(['student']);
// 001 + 003 (attempts). The module is "ready" only when every migration is applied.
const MODULE_TABLES = Object.freeze(['aia_assessments', 'aia_questions', 'aia_options', 'aia_attempts', 'aia_attempt_answers', 'aia_attempt_archive']);

const ATTEMPT_COLUMNS = `
  id, university_id AS universityId, assessment_id AS assessmentId, student_id AS studentId, status,
  started_at AS startedAt, deadline_at AS deadlineAt, finished_at AS finishedAt,
  total_questions AS totalQuestions, attempted, correct, incorrect, unattempted, score, percentage`;
const STEP2_QUESTION_COLUMNS = Object.freeze(['explanation', 'difficulty']); // migration 002
const STEP5_ASSESSMENT_COLUMNS = Object.freeze(['opens_at', 'closes_at', 'closed_at']); // migration 004
// Migration 006 (question types) is OPTIONAL for readiness: without it the module runs exactly as
// before (single-answer MCQ only) and refuses the new types (see supportsQuestionTypes).
const TYPES_NOT_READY = () => new AssessmentError('QUESTION_TYPES_NOT_READY',
  'Multiple-select and numerical questions are not available yet (a database update is pending). Single-answer MCQs work as usual.', { statusCode: 503 });

const ASSESSMENT_COLUMNS = `
  a.id, a.university_id AS universityId, a.teacher_id AS teacherId, a.title, a.description, a.subject,
  a.classroom_id AS classroomId, a.duration_minutes AS durationMinutes, a.status,
  a.created_at AS createdAt, a.updated_at AS updatedAt, a.published_at AS publishedAt,
  a.opens_at AS opensAt, a.closes_at AS closesAt, a.closed_at AS closedAt,
  (SELECT COUNT(*) FROM aia_questions q WHERE q.assessment_id = a.id) AS questionCount`;

const EDITABLE = Object.freeze({
  title: 'title',
  description: 'description',
  subject: 'subject',
  classroomId: 'classroom_id',
  courseId: 'course_id', // migration 010; only sent when supportsCourseLink()
  durationMinutes: 'duration_minutes',
  opensAt: 'opens_at',
  closesAt: 'closes_at',
});

function positiveInt(v) {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * The tables and columns that exist, as { tables: Set<name>, columns: Map<table, Set<column>> }
 * (lower case, as PostgreSQL stores unquoted names).
 */
async function readSchema(sql) {
  const rows = await sql.all(
    'SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = current_schema()'
  );
  const columns = new Map();
  for (const { t, c } of rows) {
    if (!columns.has(t)) columns.set(t, new Set());
    columns.get(t).add(c);
  }
  return { tables: new Set(columns.keys()), columns };
}

/**
 * Wraps the host's database interface (see openPostgresAssessmentLmsAdapter) and a schema
 * snapshot from readSchema().
 */
function createPostgresAssessmentLmsAdapter(sql, schema) {
  const hasTable = (name) => schema.tables.has(name.toLowerCase());
  const hasColumn = (table, column) => Boolean(schema.columns.get(table.toLowerCase())?.has(column.toLowerCase()));
  const one = async (text, params) => (await sql.get(text, params)) || null;

  /** Stores (or clears) the question's picture key when migration 009 is applied. */
  const setQuestionImage = async (questionId, question) => {
    if (!adapter.supportsQuestionImages()) return;
    await sql.run('UPDATE aia_questions SET image_key = ? WHERE id = ?', [question.imageKey ?? null, questionId]);
  };

  const adapter = {
    // ---- LMS directory ----

    async resolveActor(sessionUser) {
      const userId = positiveInt(sessionUser && sessionUser.userId);
      const universityId = positiveInt(sessionUser && sessionUser.universityId);
      if (!userId || !universityId) throw forbidden();
      const user = await one('SELECT id, role, university_id FROM users WHERE id = ?', [userId]);
      if (!user || positiveInt(user.university_id) !== universityId || !(await one('SELECT id FROM universities WHERE id = ?', [universityId]))) {
        throw new AssessmentError('TENANT_MISMATCH', 'Your account does not match this school.', { statusCode: 403 });
      }
      // The LMS database decides the role, not the token (a demoted teacher loses access at once).
      const kind = TEACHER_ROLES.includes(user.role) ? 'teacher' : STUDENT_ROLES.includes(user.role) ? 'student' : null;
      if (!kind) throw forbidden();
      return Object.freeze({ userId, universityId, kind });
    },

    getClassroom(universityId, classroomId) {
      return one('SELECT id, name, grade, section FROM classrooms WHERE id = ? AND university_id = ?', [classroomId, universityId]);
    },

    listClassrooms(universityId) {
      return sql.all('SELECT id, name, grade, section FROM classrooms WHERE university_id = ? ORDER BY grade, section, name, id', [universityId]);
    },

    /**
     * The classrooms of the school that THIS teacher may use: class teacher, listed in
     * classroomAssignments, or teaching a course there (the LMS's own teaching relationships).
     */
    listTeacherClassrooms(universityId, teacherId) {
      return sql.all(`SELECT c.id, c.name, c.grade, c.section FROM classrooms c
                      WHERE c.university_id = ? AND ${teachesClassroom(adapter.hasLmsTable('course_classrooms'))}
                      ORDER BY c.grade, c.section, c.name, c.id`, [universityId, teacherId, teacherId, teacherId, teacherId]);
    },

    /** One classroom, only if this teacher may use it (same rule as listTeacherClassrooms); else null. */
    getTeacherClassroom(universityId, teacherId, classroomId) {
      return one(`SELECT c.id, c.name, c.grade, c.section FROM classrooms c
                  WHERE c.id = ? AND c.university_id = ? AND ${teachesClassroom(adapter.hasLmsTable('course_classrooms'))}`,
      [classroomId, universityId, teacherId, teacherId, teacherId, teacherId]);
    },

    async getStudentClassroomIds(universityId, userId) {
      const rows = await sql.all(`SELECT DISTINCT c.id FROM student_classroom_assignment sca
                                  JOIN classrooms c ON c.id = sca.classroomId
                                  WHERE sca.studentId = ? AND c.university_id = ?`, [userId, universityId]);
      return rows.map((r) => r.id);
    },

    /** Step 3: students of one class in the school (for the teacher report roster). */
    listClassroomStudents(universityId, classroomId) {
      return sql.all(`SELECT DISTINCT u.id, u.name FROM student_classroom_assignment sca
                      JOIN classrooms c ON c.id = sca.classroomId
                      JOIN users u ON u.id = sca.studentId
                      WHERE sca.classroomId = ? AND c.university_id = ? AND u.university_id = ? AND u.role = 'student'
                      ORDER BY u.name, u.id`, [classroomId, universityId, universityId]);
    },

    /** Performance Analyst (read-only): a STUDENT of this school, or null (other school / not a student). */
    getSchoolStudent(universityId, studentId) {
      return one("SELECT id, name FROM users WHERE id = ? AND university_id = ? AND role = 'student'", [studentId, universityId]);
    },

    /** Performance Analyst (read-only): the student's classes in this school, with the date they were added. */
    listStudentMemberships(universityId, studentId) {
      return sql.all(`SELECT c.id AS classroomId, c.name, c.grade, c.section, sca.createdAt AS joinedAt
                      FROM student_classroom_assignment sca JOIN classrooms c ON c.id = sca.classroomId
                      WHERE sca.studentId = ? AND c.university_id = ? ORDER BY c.id`, [studentId, universityId]);
    },

    /** Step 3: display names of users in the school (id -> name); other schools' users are omitted. */
    async getUserNames(universityId, userIds) {
      if (userIds.length === 0) return new Map();
      const rows = await sql.all(`SELECT id, name FROM users WHERE university_id = ? AND id IN (${userIds.map(() => '?').join(', ')})`, [universityId, ...userIds]);
      return new Map(rows.map((r) => [r.id, r.name]));
    },

    // ---- assessment store ----

    isReady() {
      return MODULE_TABLES.every(hasTable)
        && STEP2_QUESTION_COLUMNS.every((c) => hasColumn('aia_questions', c))
        && STEP5_ASSESSMENT_COLUMNS.every((c) => hasColumn('aia_assessments', c));
    },

    /** A table of the LMS itself (read-only use). */
    hasLmsTable(name) {
      return hasTable(name);
    },

    /** Migration 010 applied: a test belongs to a course of its class. */
    supportsCourseLink() {
      return hasColumn('aia_assessments', 'course_id') && hasTable('course_students');
    },

    /** id + title of a course of the school, or null. */
    getCourse(universityId, courseId) {
      return one('SELECT id, title FROM courses WHERE id = ? AND university_id = ?', [courseId, universityId]);
    },

    /**
     * A course this teacher mentors that is taught to this class (its home class, or a class it
     * is assigned to); null otherwise.
     */
    getTeacherCourseForClassroom(universityId, teacherId, courseId, classroomId) {
      const linked = adapter.hasLmsTable('course_classrooms')
        ? 'OR EXISTS (SELECT 1 FROM course_classrooms cc WHERE cc.courseId = co.id AND cc.classroomId = ?)'
        : 'OR 0 = ?';
      return one(`SELECT co.id, co.title FROM courses co
                  WHERE co.id = ? AND co.university_id = ? AND co.mentorId = ? AND (co.classroomId = ? ${linked})`,
      [courseId, universityId, teacherId, classroomId, classroomId]);
    },

    /** Students of the class who are enrolled in the course (id + name). */
    listCourseStudentsInClassroom(universityId, courseId, classroomId) {
      return sql.all(`SELECT id, name FROM (
                        SELECT DISTINCT u.id, u.name FROM student_classroom_assignment sca
                        JOIN classrooms c ON c.id = sca.classroomId
                        JOIN users u ON u.id = sca.studentId
                        JOIN course_students cs ON cs.studentId = u.id AND cs.courseId = ?
                        WHERE sca.classroomId = ? AND c.university_id = ? AND u.university_id = ? AND u.role = 'student'
                      ) enrolled ORDER BY LOWER(name), id`, [courseId, classroomId, universityId, universityId]);
    },

    /** The student is enrolled in the course (LMS table course_students). */
    async isStudentInCourse(universityId, studentId, courseId) {
      return Boolean(await one(`SELECT 1 AS found FROM course_students cs JOIN courses co ON co.id = cs.courseId
                                WHERE cs.studentId = ? AND cs.courseId = ? AND co.university_id = ?`, [studentId, courseId, universityId]));
    },

    /** Migration 009 applied: optional picture per question. Without it questions simply have no picture. */
    supportsQuestionImages() {
      return hasColumn('aia_questions', 'image_key');
    },

    /** Migration 006 applied: question types + aia_attempt_responses. */
    supportsQuestionTypes() {
      return hasColumn('aia_questions', 'question_type') && hasTable('aia_attempt_responses');
    },

    /** Runs fn() in one transaction (every statement inside uses it); rolls back if fn throws. */
    transaction(fn) {
      return sql.transaction(fn);
    },

    async insertAssessment(row) {
      if (adapter.supportsCourseLink()) {
        return (await sql.run(`INSERT INTO aia_assessments (university_id, teacher_id, title, description, subject, classroom_id, course_id, duration_minutes, opens_at, closes_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.universityId, row.teacherId, row.title, row.description, row.subject, row.classroomId, row.courseId ?? null, row.durationMinutes, row.opensAt ?? null, row.closesAt ?? null])).lastID;
      }
      return (await sql.run(`INSERT INTO aia_assessments (university_id, teacher_id, title, description, subject, classroom_id, duration_minutes, opens_at, closes_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.universityId, row.teacherId, row.title, row.description, row.subject, row.classroomId, row.durationMinutes, row.opensAt ?? null, row.closesAt ?? null])).lastID;
    },

    async updateAssessment(universityId, id, fields) {
      const keys = Object.keys(fields).filter((k) => EDITABLE[k]);
      const sets = keys.map((k) => `${EDITABLE[k]} = ?`).concat('updated_at = utc_now_text()');
      await sql.run(`UPDATE aia_assessments SET ${sets.join(', ')} WHERE id = ? AND university_id = ?`, [...keys.map((k) => fields[k]), id, universityId]);
    },

    async setAssessmentStatus(universityId, id, status) {
      // Back to draft also clears a manual close (Step 5): a draft is never "closed".
      await sql.run(`UPDATE aia_assessments
                     SET status = ?, published_at = CASE WHEN CAST(? AS TEXT) = 'published' THEN utc_now_text() ELSE NULL END,
                         closed_at = CASE WHEN CAST(? AS TEXT) = 'draft' THEN NULL ELSE closed_at END, updated_at = utc_now_text()
                     WHERE id = ? AND university_id = ?`, [status, status, status, id, universityId]);
    },

    /** Step 5: marks a published test closed (server time). Returns false if already closed / not found. */
    async closeAssessment(universityId, id, closedAt) {
      return (await sql.run(`UPDATE aia_assessments SET closed_at = ?, updated_at = utc_now_text()
                             WHERE id = ? AND university_id = ? AND status = 'published' AND closed_at IS NULL`, [closedAt, id, universityId])).changes === 1;
    },

    findAssessment(universityId, id) {
      return one(`SELECT ${ASSESSMENT_COLUMNS}${adapter.supportsCourseLink() ? ', a.course_id AS courseId' : ''} FROM aia_assessments a WHERE a.id = ? AND a.university_id = ?`, [id, universityId]);
    },

    listAssessmentsByTeacher(universityId, teacherId) {
      return sql.all(`SELECT ${ASSESSMENT_COLUMNS}${adapter.supportsCourseLink() ? ', a.course_id AS courseId' : ''} FROM aia_assessments a
                      WHERE a.university_id = ? AND a.teacher_id = ? ORDER BY a.updated_at DESC, a.id DESC`, [universityId, teacherId]);
    },

    async listPublishedForClassrooms(universityId, classroomIds) {
      if (classroomIds.length === 0) return [];
      return sql.all(`SELECT ${ASSESSMENT_COLUMNS}${adapter.supportsCourseLink() ? ', a.course_id AS courseId' : ''} FROM aia_assessments a
                      WHERE a.university_id = ? AND a.status = 'published' AND a.classroom_id IN (${classroomIds.map(() => '?').join(', ')})
                      ORDER BY a.published_at DESC, a.id DESC`, [universityId, ...classroomIds]);
    },

    /**
     * [{ id, position, type, text, explanation, difficulty, options: [{ position, text, isCorrect }],
     *    numericAnswer: { format, value } | null }]. Before migration 006 every question is single_mcq.
     */
    async listQuestions(assessmentId) {
      const typed = adapter.supportsQuestionTypes();
      const questions = await sql.all(`SELECT id, position, text, explanation, difficulty${typed ? ', question_type, numeric_answer, numeric_format' : ''}${adapter.supportsQuestionImages() ? ', image_key' : ''}
                                       FROM aia_questions WHERE assessment_id = ? ORDER BY position, id`, [assessmentId]);
      const options = questions.length
        ? await sql.all(`SELECT question_id, position, text, is_correct FROM aia_options
                         WHERE question_id IN (${questions.map(() => '?').join(', ')}) ORDER BY question_id, position`, questions.map((q) => q.id))
        : [];
      return questions.map((q) => ({
        id: q.id,
        position: q.position,
        type: typed ? q.question_type : 'single_mcq',
        text: q.text,
        explanation: q.explanation,
        difficulty: q.difficulty ?? null,
        options: options.filter((o) => o.question_id === q.id).map((o) => ({ position: o.position, text: o.text, isCorrect: o.is_correct === 1 })),
        numericAnswer: typed && q.question_type === 'numerical' && q.numeric_answer !== null ? { format: q.numeric_format, value: q.numeric_answer } : null,
        imageKey: q.image_key ?? null,
      }));
    },

    async insertQuestion(assessmentId, question) {
      const type = typeOf(question);
      const { next } = await sql.get('SELECT COALESCE(MAX(position), 0) + 1 AS next FROM aia_questions WHERE assessment_id = ?', [assessmentId]);
      const id = adapter.supportsQuestionTypes()
        ? (await sql.run('INSERT INTO aia_questions (assessment_id, position, text, explanation, difficulty, question_type, numeric_answer, numeric_format) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [assessmentId, next, question.text, question.explanation ?? '', question.difficulty ?? null, type, ...numericOf(question)])).lastID
        : (await sql.run('INSERT INTO aia_questions (assessment_id, position, text, explanation, difficulty) VALUES (?, ?, ?, ?, ?)',
          [assessmentId, next, question.text, question.explanation ?? '', question.difficulty ?? null])).lastID;
      await insertOptions(id, type === 'numerical' ? [] : question.options);
      await setQuestionImage(id, question);
      return id;
    },

    async replaceQuestion(assessmentId, questionId, question) {
      const type = typeOf(question);
      const changed = adapter.supportsQuestionTypes()
        ? (await sql.run(`UPDATE aia_questions SET text = ?, explanation = ?, difficulty = ?, question_type = ?, numeric_answer = ?, numeric_format = ?,
                            updated_at = utc_now_text() WHERE id = ? AND assessment_id = ?`,
        [question.text, question.explanation ?? '', question.difficulty ?? null, type, ...numericOf(question), questionId, assessmentId])).changes
        : (await sql.run('UPDATE aia_questions SET text = ?, explanation = ?, difficulty = ?, updated_at = utc_now_text() WHERE id = ? AND assessment_id = ?',
          [question.text, question.explanation ?? '', question.difficulty ?? null, questionId, assessmentId])).changes;
      if (changed === 0) return false;
      await sql.run('DELETE FROM aia_options WHERE question_id = ?', [questionId]);
      await insertOptions(questionId, type === 'numerical' ? [] : question.options);
      await setQuestionImage(questionId, question);
      return true;
    },

    async deleteQuestion(assessmentId, questionId) {
      const row = await one('SELECT position FROM aia_questions WHERE id = ? AND assessment_id = ?', [questionId, assessmentId]);
      if (!row) return false;
      await sql.run('DELETE FROM aia_options WHERE question_id = ?', [questionId]); // explicit: no foreign keys are relied on
      await sql.run('DELETE FROM aia_questions WHERE id = ?', [questionId]);
      await sql.run('UPDATE aia_questions SET position = position - 1 WHERE assessment_id = ? AND position > ?', [assessmentId, row.position]);
      return true;
    },

    // ---- attempts (Step 3, migration 003) ----

    async insertAttempt({ universityId, assessmentId, studentId, startedAt, deadlineAt }) {
      return (await sql.run('INSERT INTO aia_attempts (university_id, assessment_id, student_id, started_at, deadline_at) VALUES (?, ?, ?, ?, ?)',
        [universityId, assessmentId, studentId, startedAt, deadlineAt])).lastID;
    },

    findAttempt(universityId, attemptId) {
      return one(`SELECT ${ATTEMPT_COLUMNS} FROM aia_attempts WHERE id = ? AND university_id = ?`, [attemptId, universityId]);
    },

    findAttemptFor(universityId, assessmentId, studentId) {
      return one(`SELECT ${ATTEMPT_COLUMNS} FROM aia_attempts WHERE university_id = ? AND assessment_id = ? AND student_id = ?`, [universityId, assessmentId, studentId]);
    },

    listAttemptsForAssessment(universityId, assessmentId) {
      return sql.all(`SELECT ${ATTEMPT_COLUMNS} FROM aia_attempts WHERE university_id = ? AND assessment_id = ? ORDER BY id`, [universityId, assessmentId]);
    },

    listAttemptsForStudent(universityId, studentId) {
      return sql.all(`SELECT ${ATTEMPT_COLUMNS} FROM aia_attempts WHERE university_id = ? AND student_id = ? ORDER BY id`, [universityId, studentId]);
    },

    /** Current AND archived (reset) attempts: any attempt ever keeps the test locked (Step 3 + Step 6). */
    async countAttempts(assessmentId) {
      const current = (await sql.get('SELECT COUNT(*) AS n FROM aia_attempts WHERE assessment_id = ?', [assessmentId])).n;
      const archived = (await sql.get('SELECT COUNT(*) AS n FROM aia_attempt_archive WHERE assessment_id = ?', [assessmentId])).n;
      return current + archived;
    },

    // ---- attempt archive (Step 6, migration 005) ----

    /**
     * Moves a FINISHED current attempt into the archive and removes it (and its answers)
     * from aia_attempts, so the student can start fresh. Caller runs this in a transaction.
     */
    async archiveAttempt(attempt, { answers, resetBy, resetAt }) {
      await sql.run(`INSERT INTO aia_attempt_archive (original_attempt_id, university_id, assessment_id, student_id, status, started_at,
                       deadline_at, finished_at, total_questions, attempted, correct, incorrect, unattempted, score, percentage,
                       answers_json, reset_by, reset_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [attempt.id, attempt.universityId, attempt.assessmentId, attempt.studentId, attempt.status, attempt.startedAt,
        attempt.deadlineAt, attempt.finishedAt, attempt.totalQuestions, attempt.attempted, attempt.correct, attempt.incorrect,
        attempt.unattempted, attempt.score, attempt.percentage, JSON.stringify(answers), resetBy, resetAt]);
      await sql.run('DELETE FROM aia_attempt_answers WHERE attempt_id = ?', [attempt.id]); // explicit: no foreign keys are relied on
      if (adapter.supportsQuestionTypes()) await sql.run('DELETE FROM aia_attempt_responses WHERE attempt_id = ?', [attempt.id]);
      await sql.run('DELETE FROM aia_attempts WHERE id = ? AND university_id = ?', [attempt.id, attempt.universityId]);
    },

    /** Archived attempts of one test (oldest first), same school only. */
    listArchivedAttempts(universityId, assessmentId) {
      return sql.all(`SELECT id, original_attempt_id AS originalAttemptId, student_id AS studentId, status, started_at AS startedAt,
                        finished_at AS finishedAt, total_questions AS totalQuestions, attempted, correct, incorrect, unattempted,
                        score, percentage, reset_by AS resetBy, reset_at AS resetAt
                      FROM aia_attempt_archive WHERE university_id = ? AND assessment_id = ? ORDER BY id`, [universityId, assessmentId]);
    },

    async countArchivedAttemptsFor(universityId, assessmentId, studentId) {
      return (await sql.get('SELECT COUNT(*) AS n FROM aia_attempt_archive WHERE university_id = ? AND assessment_id = ? AND student_id = ?',
        [universityId, assessmentId, studentId])).n;
    },

    /** Saves (position 0-3) or clears (null) one answer. The caller has checked ownership/state/validity. */
    async saveAnswer(attemptId, questionId, optionPosition) {
      if (optionPosition === null) {
        await sql.run('DELETE FROM aia_attempt_answers WHERE attempt_id = ? AND question_id = ?', [attemptId, questionId]);
        return;
      }
      await sql.run(`INSERT INTO aia_attempt_answers (attempt_id, question_id, option_position) VALUES (?, ?, ?)
                     ON CONFLICT (attempt_id, question_id) DO UPDATE SET option_position = excluded.option_position, updated_at = utc_now_text()`,
      [attemptId, questionId, optionPosition]);
    },

    /**
     * Migration 006: saves ({ selectedPositions: [sorted positions] } | { numericValue: canonical text })
     * or clears (null) one answer to a multiple-select / numerical question. The caller has checked
     * ownership, state and validity.
     */
    async saveResponse(attemptId, questionId, response) {
      if (!adapter.supportsQuestionTypes()) throw TYPES_NOT_READY();
      if (response === null) {
        await sql.run('DELETE FROM aia_attempt_responses WHERE attempt_id = ? AND question_id = ?', [attemptId, questionId]);
        return;
      }
      const selected = response.selectedPositions ? JSON.stringify(response.selectedPositions) : null;
      const numeric = selected === null ? response.numericValue : null;
      await sql.run(`INSERT INTO aia_attempt_responses (attempt_id, question_id, selected_positions, numeric_value) VALUES (?, ?, ?, ?)
                     ON CONFLICT (attempt_id, question_id) DO UPDATE SET selected_positions = excluded.selected_positions,
                       numeric_value = excluded.numeric_value, updated_at = utc_now_text()`,
      [attemptId, questionId, selected, numeric]);
    },

    /**
     * Single-answer MCQ rows (aia_attempt_answers): { questionId, optionPosition, isCorrect } - exactly the
     * pre-006 shape (it is also the reset-archive snapshot format). Migration-006 rows:
     * { questionId, optionPositions, isCorrect } (multiple-select) or { questionId, value, isCorrect } (numerical).
     * isCorrect is null until graded.
     */
    async listAnswers(attemptId) {
      const bit = (v) => (v === null ? null : v === 1);
      const single = (await sql.all('SELECT question_id AS questionId, option_position AS optionPosition, is_correct AS isCorrect FROM aia_attempt_answers WHERE attempt_id = ?', [attemptId]))
        .map((r) => ({ questionId: r.questionId, optionPosition: r.optionPosition, isCorrect: bit(r.isCorrect) }));
      if (!adapter.supportsQuestionTypes()) return single;
      const typed = (await sql.all('SELECT question_id AS questionId, selected_positions AS selected, numeric_value AS value, is_correct AS isCorrect FROM aia_attempt_responses WHERE attempt_id = ?', [attemptId]))
        .map((r) => (r.selected !== null
          ? { questionId: r.questionId, optionPositions: JSON.parse(r.selected), isCorrect: bit(r.isCorrect) }
          : { questionId: r.questionId, value: r.value, isCorrect: bit(r.isCorrect) }));
      return [...single, ...typed];
    },

    /**
     * Finalizes ONLY an in-progress attempt (returns false if it was already
     * finalized: the first finalization wins). Grades are written per answer.
     */
    async finalizeAttempt(attemptId, { status, finishedAt, result, gradedAnswers }) {
      const changed = (await sql.run(`UPDATE aia_attempts SET status = ?, finished_at = ?, total_questions = ?, attempted = ?, correct = ?, incorrect = ?,
                                        unattempted = ?, score = ?, percentage = ?, updated_at = utc_now_text()
                                      WHERE id = ? AND status = 'in_progress'`,
      [status, finishedAt, result.totalQuestions, result.attempted, result.correct, result.incorrect,
        result.unattempted, result.score, result.percentage, attemptId])).changes;
      if (changed === 0) return false;
      const typed = adapter.supportsQuestionTypes();
      for (const a of gradedAnswers) {
        await sql.run('UPDATE aia_attempt_answers SET is_correct = ? WHERE attempt_id = ? AND question_id = ?', [a.isCorrect ? 1 : 0, attemptId, a.questionId]);
        if (typed) await sql.run('UPDATE aia_attempt_responses SET is_correct = ? WHERE attempt_id = ? AND question_id = ?', [a.isCorrect ? 1 : 0, attemptId, a.questionId]);
      }
      return true;
    },
  };

  /** New types need migration 006; before it, only single_mcq can be written. */
  function typeOf(question) {
    const type = question.type || 'single_mcq';
    if (type !== 'single_mcq' && !adapter.supportsQuestionTypes()) throw TYPES_NOT_READY();
    return type;
  }

  const numericOf = (question) => (question.numericAnswer ? [question.numericAnswer.value, question.numericAnswer.format] : [null, null]);

  async function insertOptions(questionId, options) {
    for (let i = 0; i < options.length; i++) {
      await sql.run('INSERT INTO aia_options (question_id, position, text, is_correct) VALUES (?, ?, ?, ?)', [questionId, i, options[i].text, options[i].isCorrect ? 1 : 0]);
    }
  }

  Object.assign(adapter, assignmentMethods(sql, schema)); // Descriptive Assignments: remove this line to remove the feature
  Object.assign(adapter, recipientsReportsMethods(sql, schema)); // migration 008: student recipients + shared AI reports
  return adapter;
}

/**
 * Returns openAdapter() for the router: each call resolves to { adapter, close } for one request.
 *
 * `sql` is the host's database interface:
 *   get(text, params)  -> row | undefined        all(text, params) -> rows
 *   run(text, params)  -> { lastID, changes }    transaction(fn)   -> fn's result, in one transaction
 * with `?` placeholders. Every call made while transaction(fn) runs must use that transaction.
 * The schema is read once (first request) and kept; it changes only through migrations.
 * `schemaOverride` (tests only) replaces that reading with a given snapshot.
 */
function openPostgresAssessmentLmsAdapter(sql, schemaOverride = null) {
  let schema = schemaOverride;
  return async () => {
    if (!schema) {
      try {
        schema = await readSchema(sql);
      } catch (err) {
        throw new AssessmentError('NOT_READY', 'Assessments are not available yet.', { statusCode: 503 });
      }
    }
    return { adapter: createPostgresAssessmentLmsAdapter(sql, schema), close: () => {} };
  };
}

module.exports = { createPostgresAssessmentLmsAdapter, openPostgresAssessmentLmsAdapter, readSchema, TEACHER_ROLES, STUDENT_ROLES, MODULE_TABLES };
