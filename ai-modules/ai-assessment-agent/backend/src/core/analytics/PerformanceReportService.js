const { AssessmentError, notFound, forbidden } = require('../errors');

/**
 * Stored + shared AI Performance Reports (migration 008). NEVER calls an AI: it stores the report the
 * teacher was just shown, shares it on the teacher's explicit click, and hands the SAME stored data back
 * to the one student it was shared with (the browser rebuilds the PDF from it; no PDF is stored).
 *
 * What is stored / shown to the student: the validated, renderable report sections, the focus label,
 * the scope (assessment count + subjects) and - in preview mode - the plain-language warnings. Never the
 * provider/model, prompts, raw model output, validation codes or teacher ids.
 *
 * Student access (every other case is a 404, like the rest of the module): the report's school is the
 * session's school, its student_id is the session's user, and a teacher has shared it.
 */
class PerformanceReportService {
  constructor({ adapter, now = () => Date.now() }) {
    this.lms = adapter;
    this.now = now;
  }

  available() {
    return typeof this.lms.supportsRecipientsReports === 'function' && this.lms.supportsRecipientsReports();
  }

  requireAvailable() {
    if (!this.available()) {
      throw new AssessmentError('REPORTS_NOT_READY', 'Sending reports to students is not available yet (a database update is pending).', { statusCode: 503 });
    }
  }

  /**
   * Stores a successfully generated report (teacher-only until shared). Returns its id, or null when
   * migration 008 is not applied. `collected` is StudentPerformanceService.collect()'s response.
   */
  async saveGenerated(actor, response, analysis) {
    requireTeacher(actor);
    if (!this.available() || !analysis || analysis.status !== 'ok' || !analysis.content) return null;
    const preview = analysis.preview && analysis.preview.validated === false
      ? { validated: false, warnings: (analysis.preview.warnings || []).map((w) => ({ message: String(w.message || '') })).filter((w) => w.message) }
      : null;
    return await this.lms.transaction(async () => await this.lms.insertPerformanceReport({
      universityId: actor.universityId,
      teacherId: actor.userId,
      studentId: response.student.id,
      focusLabel: String((analysis.focus && analysis.focus.label) || 'Overall progress'),
      contentJson: JSON.stringify(analysis.content),
      previewJson: preview ? JSON.stringify(preview) : null,
      scopeJson: JSON.stringify({ assessments: response.scope.assessments, subjects: response.scope.subjects }),
      generatedAt: analysis.generatedAt || new Date(this.now()).toISOString(),
    }));
  }

  /**
   * "Send to Student": the teacher who generated the report shares it with the student it is about.
   * Idempotent: a second click (or a double-click) returns the first share's time; nothing is duplicated.
   */
  async share(actor, reportId) {
    requireTeacher(actor);
    this.requireAvailable();
    const id = toId(reportId);
    return await this.lms.transaction(async () => {
      const row = id ? await this.lms.findPerformanceReport(actor.universityId, id) : null;
      if (!row || row.teacherId !== actor.userId) throw notFound();
      if (!await this.lms.getSchoolStudent(actor.universityId, row.studentId)) throw notFound(); // student left the school
      const newlyShared = row.sharedAt === null && await this.lms.markReportShared(actor.universityId, row.id, new Date(this.now()).toISOString(), actor.userId);
      const after = await this.lms.findPerformanceReport(actor.universityId, row.id);
      return { report: { id: after.id, studentId: after.studentId, sharedAt: after.sharedAt }, alreadyShared: !newlyShared };
    });
  }

  /** The student's report notifications (newest first). Metadata only: no report content. */
  async listForStudent(actor) {
    requireStudent(actor);
    if (!this.available()) return [];
    const rows = await this.lms.listSharedReportsForStudent(actor.universityId, actor.userId);
    const names = await this.lms.getUserNames(actor.universityId, [...new Set(rows.map((r) => r.sharedBy).filter(Boolean))]);
    return rows.map((r) => ({
      id: r.id,
      title: 'New Performance Report',
      message: 'Your teacher has shared an AI Performance Report with you.',
      teacherName: names.get(r.sharedBy) || null,
      focusLabel: r.focusLabel,
      sharedAt: r.sharedAt,
      read: r.readAt !== null,
    }));
  }

  /** ONE shared report, for the student it belongs to only; marks it read. Everything else is 404. */
  async getForStudent(actor, reportId) {
    requireStudent(actor);
    this.requireAvailable();
    const id = toId(reportId);
    return await this.lms.transaction(async () => {
      const row = id ? await this.lms.findPerformanceReport(actor.universityId, id) : null;
      if (!row || row.studentId !== actor.userId || row.sharedAt === null) throw notFound();
      const student = await this.lms.getSchoolStudent(actor.universityId, actor.userId);
      if (!student) throw notFound();
      await this.lms.markReportRead(actor.universityId, row.id, actor.userId, new Date(this.now()).toISOString());
      const classes = (await this.lms.listStudentMemberships(actor.universityId, actor.userId)).map((m) => ({ name: m.name }));
      const preview = row.previewJson ? JSON.parse(row.previewJson) : null;
      const scope = JSON.parse(row.scopeJson);
      return {
        id: row.id,
        student: { name: student.name, classes },
        scope: { assessments: scope.assessments, subjects: scope.subjects },
        ai: {
          generatedAt: row.generatedAt,
          focus: { label: row.focusLabel },
          content: JSON.parse(row.contentJson),
          ...(preview ? { preview } : {}),
        },
        sharedAt: row.sharedAt,
      };
    });
  }
}

function requireTeacher(actor) {
  if (!actor || actor.kind !== 'teacher') throw forbidden('Only teachers can send performance reports.');
}

function requireStudent(actor) {
  if (!actor || actor.kind !== 'student') throw forbidden('Only students can open their performance reports.');
}

function toId(v) {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

module.exports = { PerformanceReportService };
