/**
 * Migration 008 - PostgreSQL methods merged into the LMS adapter: student-level test recipients and
 * stored/shared AI Performance Reports. Every query is scoped by university_id (the verified
 * session's school). Writes touch only aia_assessment_recipients / aia_performance_reports.
 *
 * Without migration 008 the module behaves exactly as before: every published test targets its whole
 * class (isAssessmentRecipient is always true), and storing/sharing reports is unavailable (503).
 * `sql` and `schema` are those of PostgresAssessmentLmsAdapter.
 */
const TABLES = Object.freeze(['aia_assessment_recipients', 'aia_performance_reports']);
const REPORT_COLUMNS = `
  id, university_id AS universityId, teacher_id AS teacherId, student_id AS studentId, focus_label AS focusLabel,
  content_json AS contentJson, preview_json AS previewJson, scope_json AS scopeJson, generated_at AS generatedAt,
  shared_at AS sharedAt, shared_by AS sharedBy, read_at AS readAt`;

function recipientsReportsMethods(sql, schema) {
  const supports = () => TABLES.every((t) => schema.tables.has(t));

  return {
    /** Migration 008 applied. */
    supportsRecipientsReports: supports,

    // ---- recipients ----

    /** Student ids a test is restricted to; [] = the whole class (also before 008). */
    async listRecipientIds(universityId, assessmentId) {
      if (!supports()) return [];
      const rows = await sql.all('SELECT student_id AS id FROM aia_assessment_recipients WHERE university_id = ? AND assessment_id = ? ORDER BY student_id',
        [universityId, assessmentId]);
      return rows.map((r) => r.id);
    },

    /** Replaces the recipients ([] = whole class). The caller has validated them and runs this in a transaction. */
    async replaceRecipients(universityId, assessmentId, studentIds) {
      if (!supports()) {
        if (studentIds.length === 0) return;
        throw new Error('replaceRecipients requires migration 008');
      }
      await sql.run('DELETE FROM aia_assessment_recipients WHERE university_id = ? AND assessment_id = ?', [universityId, assessmentId]);
      for (const sid of studentIds) {
        await sql.run('INSERT INTO aia_assessment_recipients (assessment_id, university_id, student_id) VALUES (?, ?, ?)', [assessmentId, universityId, sid]);
      }
    },

    /** True when the test targets the whole class (no rows) or this student is one of its recipients. */
    async isAssessmentRecipient(universityId, assessmentId, studentId) {
      if (!supports()) return true;
      const { total, mine } = await sql.get(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN student_id = ? THEN 1 ELSE 0 END), 0) AS mine
                                             FROM aia_assessment_recipients WHERE university_id = ? AND assessment_id = ?`,
      [studentId, universityId, assessmentId]);
      return total === 0 || mine > 0;
    },

    // ---- AI Performance Reports ----

    async insertPerformanceReport(row) {
      return (await sql.run(`INSERT INTO aia_performance_reports (university_id, teacher_id, student_id, focus_label, content_json, preview_json, scope_json, generated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.universityId, row.teacherId, row.studentId, row.focusLabel, row.contentJson, row.previewJson ?? null, row.scopeJson, row.generatedAt])).lastID;
    },

    async findPerformanceReport(universityId, id) {
      return (await sql.get(`SELECT ${REPORT_COLUMNS} FROM aia_performance_reports WHERE id = ? AND university_id = ?`, [id, universityId])) || null;
    },

    /** Sets shared_at once (the first share wins). Returns false if it was already shared. */
    async markReportShared(universityId, id, sharedAt, sharedBy) {
      return (await sql.run('UPDATE aia_performance_reports SET shared_at = ?, shared_by = ? WHERE id = ? AND university_id = ? AND shared_at IS NULL',
        [sharedAt, sharedBy, id, universityId])).changes === 1;
    },

    /** The reports shared with ONE student (newest first). */
    listSharedReportsForStudent(universityId, studentId) {
      return sql.all(`SELECT ${REPORT_COLUMNS} FROM aia_performance_reports
                      WHERE university_id = ? AND student_id = ? AND shared_at IS NOT NULL ORDER BY shared_at DESC, id DESC`, [universityId, studentId]);
    },

    /** First open by the student (idempotent). */
    async markReportRead(universityId, id, studentId, readAt) {
      await sql.run('UPDATE aia_performance_reports SET read_at = ? WHERE id = ? AND university_id = ? AND student_id = ? AND shared_at IS NOT NULL AND read_at IS NULL',
        [readAt, id, universityId, studentId]);
    },
  };
}

module.exports = { recipientsReportsMethods, RECIPIENTS_REPORTS_TABLES: TABLES };
