/**
 * Descriptive Assignments (migration 007) - PostgreSQL methods merged into the LMS adapter.
 * Every query is scoped by university_id (the verified session's school). Writes touch only the
 * aia_assignment* tables. Kept in its own file so the feature can be removed in one place.
 * `sql` and `schema` are those of PostgresAssessmentLmsAdapter.
 */
const ASSIGNMENT_COLUMNS = `
  a.id, a.university_id AS universityId, a.teacher_id AS teacherId, a.classroom_id AS classroomId, a.title, a.instructions,
  a.max_marks AS maxMarks, a.due_at AS dueAt, a.status, a.published_at AS publishedAt, a.closed_at AS closedAt,
  a.created_at AS createdAt, a.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM aia_assignment_questions q WHERE q.assignment_id = a.id) AS questionCount,
  (SELECT COALESCE(SUM(q.max_marks), 0) FROM aia_assignment_questions q WHERE q.assignment_id = a.id) AS questionMarksTotal`;
const SUBMISSION_COLUMNS = `
  id, university_id AS universityId, assignment_id AS assignmentId, student_id AS studentId, status, storage_key AS storageKey,
  original_filename AS originalFilename, file_size AS fileSize, content_type AS contentType, sha256, version, submitted_at AS submittedAt,
  ai_marks AS aiMarks, ai_grade AS aiGrade, ai_feedback AS aiFeedback, ai_question_marks_json AS aiQuestionMarksJson, ai_limitations_json AS aiLimitationsJson, ai_evaluated_at AS aiEvaluatedAt,
  final_marks AS finalMarks, final_grade AS finalGrade, teacher_feedback AS teacherFeedback, final_question_marks_json AS finalQuestionMarksJson,
  evaluated_at AS evaluatedAt, evaluated_by AS evaluatedBy, created_at AS createdAt, updated_at AS updatedAt`;
const EDITABLE = Object.freeze({ title: 'title', instructions: 'instructions', classroomId: 'classroom_id', maxMarks: 'max_marks', dueAt: 'due_at' });
const ASSIGNMENT_TABLES = Object.freeze(['aia_assignments', 'aia_assignment_questions', 'aia_assignment_submissions']);

function assignmentMethods(sql, schema) {
  const one = async (text, params) => (await sql.get(text, params)) || null;
  /** Migration 009 applied to the assignment questions. */
  const hasImages = () => Boolean(schema.columns.get('aia_assignment_questions')?.has('image_key'));

  return {
    /** Migration 007 applied. Without it only the assignment routes are unavailable (503). */
    supportsAssignments() {
      return ASSIGNMENT_TABLES.every((t) => schema.tables.has(t));
    },

    async insertAssignment(row) {
      return (await sql.run(`INSERT INTO aia_assignments (university_id, teacher_id, classroom_id, title, instructions, max_marks, due_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [row.universityId, row.teacherId, row.classroomId, row.title, row.instructions, row.maxMarks, row.dueAt ?? null])).lastID;
    },

    async updateAssignment(universityId, id, fields) {
      const keys = Object.keys(fields).filter((k) => EDITABLE[k]);
      const sets = keys.map((k) => `${EDITABLE[k]} = ?`).concat('updated_at = utc_now_text()');
      await sql.run(`UPDATE aia_assignments SET ${sets.join(', ')} WHERE id = ? AND university_id = ?`, [...keys.map((k) => fields[k]), id, universityId]);
    },

    /** draft -> published (published_at) or published -> closed (closed_at). Returns false when the state did not match. */
    async setAssignmentStatus(universityId, id, { from, to, at }) {
      const col = to === 'published' ? 'published_at' : 'closed_at';
      return (await sql.run(`UPDATE aia_assignments SET status = ?, ${col} = ?, updated_at = utc_now_text() WHERE id = ? AND university_id = ? AND status = ?`,
        [to, at, id, universityId, from])).changes === 1;
    },

    findAssignment(universityId, id) {
      return one(`SELECT ${ASSIGNMENT_COLUMNS} FROM aia_assignments a WHERE a.id = ? AND a.university_id = ?`, [id, universityId]);
    },

    listAssignmentsByTeacher(universityId, teacherId) {
      return sql.all(`SELECT ${ASSIGNMENT_COLUMNS} FROM aia_assignments a WHERE a.university_id = ? AND a.teacher_id = ? ORDER BY a.updated_at DESC, a.id DESC`,
        [universityId, teacherId]);
    },

    /** Published or closed assignments of these classes (drafts are never visible to students). */
    async listVisibleAssignmentsForClassrooms(universityId, classroomIds) {
      if (classroomIds.length === 0) return [];
      return sql.all(`SELECT ${ASSIGNMENT_COLUMNS} FROM aia_assignments a
                      WHERE a.university_id = ? AND a.status IN ('published', 'closed') AND a.classroom_id IN (${classroomIds.map(() => '?').join(', ')})
                      ORDER BY COALESCE(a.due_at, '9999') ASC, a.id DESC`, [universityId, ...classroomIds]);
    },

    async listAssignmentQuestions(assignmentId) {
      const rows = await sql.all(`SELECT id, position, text, max_marks AS maxMarks${hasImages() ? ', image_key AS imageKey' : ''}
                                  FROM aia_assignment_questions WHERE assignment_id = ? ORDER BY position`, [assignmentId]);
      return rows.map((q) => ({ ...q, imageKey: q.imageKey ?? null }));
    },

    /** Replaces ALL questions (add/edit/remove/reorder in one step). Caller runs this in a transaction. */
    async replaceAssignmentQuestions(assignmentId, questions) {
      await sql.run('DELETE FROM aia_assignment_questions WHERE assignment_id = ?', [assignmentId]);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (hasImages()) {
          await sql.run('INSERT INTO aia_assignment_questions (assignment_id, position, text, max_marks, image_key) VALUES (?, ?, ?, ?, ?)',
            [assignmentId, i + 1, q.text, q.maxMarks, q.imageKey ?? null]);
        } else {
          await sql.run('INSERT INTO aia_assignment_questions (assignment_id, position, text, max_marks) VALUES (?, ?, ?, ?)', [assignmentId, i + 1, q.text, q.maxMarks]);
        }
      }
      await sql.run('UPDATE aia_assignments SET updated_at = utc_now_text() WHERE id = ?', [assignmentId]);
    },

    findSubmission(universityId, id) {
      return one(`SELECT ${SUBMISSION_COLUMNS} FROM aia_assignment_submissions WHERE id = ? AND university_id = ?`, [id, universityId]);
    },

    findSubmissionFor(universityId, assignmentId, studentId) {
      return one(`SELECT ${SUBMISSION_COLUMNS} FROM aia_assignment_submissions WHERE university_id = ? AND assignment_id = ? AND student_id = ?`,
        [universityId, assignmentId, studentId]);
    },

    listSubmissionsForAssignment(universityId, assignmentId) {
      return sql.all(`SELECT ${SUBMISSION_COLUMNS} FROM aia_assignment_submissions WHERE university_id = ? AND assignment_id = ? ORDER BY id`, [universityId, assignmentId]);
    },

    listSubmissionsForStudent(universityId, studentId) {
      return sql.all(`SELECT ${SUBMISSION_COLUMNS} FROM aia_assignment_submissions WHERE university_id = ? AND student_id = ?`, [universityId, studentId]);
    },

    async insertSubmission(row) {
      return (await sql.run(`INSERT INTO aia_assignment_submissions (university_id, assignment_id, student_id, storage_key, original_filename, file_size, sha256, submitted_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.universityId, row.assignmentId, row.studentId, row.storageKey, row.originalFilename, row.fileSize, row.sha256, row.submittedAt])).lastID;
    },

    /** Replaces the file of a NOT yet evaluated submission (version + 1). Returns false if it was evaluated meanwhile. */
    async replaceSubmissionFile(universityId, id, row) {
      return (await sql.run(`UPDATE aia_assignment_submissions SET storage_key = ?, original_filename = ?, file_size = ?, sha256 = ?, submitted_at = ?,
                               version = version + 1,
                               ai_marks = NULL, ai_grade = NULL, ai_feedback = NULL, ai_question_marks_json = NULL, ai_limitations_json = NULL, ai_evaluated_at = NULL,
                               updated_at = utc_now_text()
                             WHERE id = ? AND university_id = ? AND status = 'submitted'`,
      [row.storageKey, row.originalFilename, row.fileSize, row.sha256, row.submittedAt, id, universityId])).changes === 1;
    },

    /** Teacher's FINAL marks (authoritative). Never written by the AI path. */
    async setSubmissionEvaluation(universityId, id, { finalMarks, teacherFeedback, finalQuestionMarksJson = null, evaluatedAt, evaluatedBy }) {
      await sql.run(`UPDATE aia_assignment_submissions SET status = 'evaluated', final_marks = ?, teacher_feedback = ?, final_question_marks_json = ?,
                       evaluated_at = ?, evaluated_by = ?, updated_at = utc_now_text() WHERE id = ? AND university_id = ?`,
      [finalMarks, teacherFeedback, finalQuestionMarksJson, evaluatedAt, evaluatedBy, id, universityId]);
    },

    /**
     * Prompt 2: stores an AI SUGGESTION in the ai_* columns only (final_* are never touched). Replaces a
     * previous suggestion. Only if the submission still holds the file that was evaluated (storageKey);
     * returns false when the student replaced it meanwhile.
     */
    async setSubmissionAiEvaluation(universityId, id, storageKey, { aiMarks, aiFeedback, aiQuestionMarksJson, aiLimitationsJson, aiEvaluatedAt }) {
      return (await sql.run(`UPDATE aia_assignment_submissions SET ai_marks = ?, ai_feedback = ?, ai_question_marks_json = ?, ai_limitations_json = ?, ai_evaluated_at = ?,
                               updated_at = utc_now_text() WHERE id = ? AND university_id = ? AND storage_key = ?`,
      [aiMarks, aiFeedback, aiQuestionMarksJson, aiLimitationsJson, aiEvaluatedAt, id, universityId, storageKey])).changes === 1;
    },

    /** Prompt 2 (privacy): names that must be blanked from extracted PDF text (read-only). */
    async getRedactionNames(universityId, { studentId, teacherId, classroomId }) {
      const name = async (text, params) => ((await sql.get(text, params)) || {}).name || null;
      return {
        studentName: await name('SELECT name FROM users WHERE id = ? AND university_id = ?', [studentId, universityId]),
        teacherName: await name('SELECT name FROM users WHERE id = ? AND university_id = ?', [teacherId, universityId]),
        className: await name('SELECT name FROM classrooms WHERE id = ? AND university_id = ?', [classroomId, universityId]),
        schoolName: await name('SELECT name FROM universities WHERE id = ?', [universityId]),
      };
    },
  };
}

const ASSIGNMENT_METHODS = Object.freeze([
  'supportsAssignments', 'insertAssignment', 'updateAssignment', 'setAssignmentStatus', 'findAssignment', 'listAssignmentsByTeacher',
  'listVisibleAssignmentsForClassrooms', 'listAssignmentQuestions', 'replaceAssignmentQuestions', 'findSubmission', 'findSubmissionFor',
  'listSubmissionsForAssignment', 'listSubmissionsForStudent', 'insertSubmission', 'replaceSubmissionFile', 'setSubmissionEvaluation',
  'setSubmissionAiEvaluation', 'getRedactionNames',
]);

module.exports = { assignmentMethods, ASSIGNMENT_METHODS, ASSIGNMENT_TABLES };
