const { AssessmentError, forbidden } = require('../errors');
const { assertAssessmentLmsAdapter } = require('../../adapters/lms/AssessmentLmsAdapter');
const { AttemptService, availabilityOf } = require('../AttemptService');
const { hasAnswer } = require('../questionTypes');
const { mapInOrder } = require('../inOrder');
const { computeMetrics, dataSufficiency } = require('./performanceMetrics');

/**
 * Student Performance Analyst - factual layer (no LLM, no migration).
 *
 * Scope and access (server-side, from the verified session):
 *   - caller must be a teacher (students/admins: 403);
 *   - the student must be a STUDENT of the teacher's school (else 404);
 *   - only the REQUESTING TEACHER's published assessments are in scope; a test counts when it
 *     targets a class the student belongs to, or the student has a current/archived attempt on it;
 *     no such test -> 404 (no link = not visible). Other teachers' tests are never included.
 *
 * Per test (server clock):
 *   finished     current attempt submitted/expired (expired ones are finalized first, as everywhere)
 *   in_progress  current attempt still running
 *   pending      open, not started          upcoming  not open yet
 *   missed       closed without a current attempt, IF the student was in the class before it closed
 *                (joined after it closed = not applicable, excluded). Archived attempts never count
 *                as current performance; they are history (retakes).
 */
class StudentPerformanceService {
  constructor({ adapter, now = () => Date.now() }) {
    this.lms = assertAssessmentLmsAdapter(adapter);
    this.now = now;
    this.attempts = new AttemptService({ adapter, now });
  }

  /** Teacher-facing facts. */
  async getPerformance(actor, studentId) {
    return (await this.collect(actor, studentId)).response;
  }

  /**
   * Facts + the internal evidence the AI analyst needs (question texts, names to scrub).
   * The evidence part is NEVER returned by the facts endpoint.
   */
  async collect(actor, studentId) {
    if (!actor || actor.kind !== 'teacher') throw forbidden('Only teachers can view student performance.');
    const sid = toId(studentId);
    if (!sid) throw notFound();
    return await this.lms.transaction(async () => {
      const student = await this.lms.getSchoolStudent(actor.universityId, sid);
      if (!student) throw notFound();
      const memberships = await this.lms.listStudentMemberships(actor.universityId, sid);
      const joined = new Map(memberships.map((m) => [m.classroomId, sqlMs(m.joinedAt)]));
      const nowMs = this.now();
      const tests = (await this.lms.listAssessmentsByTeacher(actor.universityId, actor.userId)).filter((t) => t.status === 'published');

      const records = [];
      for (const t of tests) {
        let current = await this.lms.findAttemptFor(actor.universityId, t.id, sid);
        if (current) current = await this.attempts.finalizeIfExpired(current);
        const previous = (await this.lms.listArchivedAttempts(actor.universityId, t.id)).filter((r) => r.studentId === sid);
        // Migration 008: a test assigned to SELECTED students only applies to them.
        const member = joined.has(t.classroomId)
          && (typeof this.lms.isAssessmentRecipient !== 'function' || await this.lms.isAssessmentRecipient(actor.universityId, t.id, sid));
        if (!current && previous.length === 0 && !member) continue; // no link to this student

        let state;
        if (current) state = current.status === 'in_progress' ? 'in_progress' : 'finished';
        else {
          const availability = availabilityOf(t, nowMs);
          if (availability === 'upcoming') state = 'upcoming';
          else if (availability === 'open') state = 'pending';
          else {
            const closedMs = closeTimeMs(t, nowMs);
            const joinedMs = joined.get(t.classroomId);
            if (previous.length > 0 || (member && joinedMs < closedMs)) state = 'missed';
            else continue; // joined after the test closed: not applicable to this student
          }
        }

        let questions = [];
        if (state === 'finished') {
          const answers = new Map((await this.lms.listAnswers(current.id)).map((a) => [a.questionId, a]));
          questions = (await this.lms.listQuestions(t.id)).map((q) => {
            const a = answers.get(q.id);
            // hasAnswer: a cleared multiple-select/numerical row is not an answer (all question types).
            const outcome = !hasAnswer(q, a) ? 'unattempted' : a.isCorrect ? 'correct' : 'incorrect';
            return { position: q.position, type: q.type || 'single_mcq', difficulty: q.difficulty || 'unspecified', outcome, text: q.text };
          });
        }
        const classFinished = (await mapInOrder(await this.lms.listAttemptsForAssessment(actor.universityId, t.id), async (a) => await this.attempts.finalizeIfExpired(a)))
          .filter((a) => a.status !== 'in_progress');

        records.push({
          assessmentId: t.id,
          title: t.title,
          subject: t.subject,
          publishedAt: sqlIso(t.publishedAt),
          durationMinutes: t.durationMinutes,
          state,
          attempt: current ? {
            status: current.status, startedAt: current.startedAt, finishedAt: current.finishedAt, totalQuestions: current.totalQuestions,
            attempted: current.attempted, correct: current.correct, incorrect: current.incorrect, unattempted: current.unattempted,
            score: current.score, percentage: current.percentage,
          } : null,
          attemptNumber: current ? previous.length + 1 : null,
          previousAttempts: previous.map((p) => ({ status: p.status, score: p.score, totalQuestions: p.totalQuestions, percentage: p.percentage, finishedAt: p.finishedAt })),
          questions,
          classAverage: {
            percentage: classFinished.length ? Math.round((classFinished.reduce((s, a) => s + a.percentage, 0) / classFinished.length) * 100) / 100 : null,
            finishedCount: classFinished.length,
          },
        });
      }
      if (records.length === 0) throw notFound();

      records.sort((a, b) => (Date.parse(a.publishedAt) || 0) - (Date.parse(b.publishedAt) || 0) || a.assessmentId - b.assessmentId);
      records.forEach((r, i) => { r.label = `A${i + 1}`; });
      const metrics = computeMetrics(records);
      const sufficiency = dataSufficiency(metrics.counts.attempted);
      const response = {
        student: { id: student.id, name: student.name, classes: memberships.map((m) => ({ id: m.classroomId, name: m.name, grade: m.grade, section: m.section ?? null })) },
        scope: { owner: 'requesting_teacher', assessments: records.length, subjects: [...new Set(records.map((r) => r.subject))].sort(), generatedAt: new Date(nowMs).toISOString() },
        metrics,
        dataSufficiency: sufficiency,
      };
      return {
        response,
        evidence: { records, studentName: student.name, classNames: memberships.map((m) => m.name), titles: records.map((r) => r.title) },
      };
    });
  }
}

/** The moment a closed test stopped accepting starts: the manual close or the closes_at already passed. */
function closeTimeMs(t, nowMs) {
  const candidates = [];
  if (t.closedAt) candidates.push(Date.parse(t.closedAt));
  if (t.closesAt && Date.parse(t.closesAt) <= nowMs) candidates.push(Date.parse(t.closesAt));
  return candidates.length ? Math.min(...candidates) : nowMs;
}

/** Database timestamp text ('YYYY-MM-DD HH:MM:SS', UTC, from utc_now_text()) or ISO -> ms. */
function sqlMs(v) {
  if (!v) return NaN;
  return /Z|[+-]\d\d:\d\d$/.test(v) ? Date.parse(v) : Date.parse(String(v).replace(' ', 'T') + 'Z');
}
const sqlIso = (v) => (v ? new Date(sqlMs(v)).toISOString() : null);

function toId(v) {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function notFound() {
  return new AssessmentError('STUDENT_NOT_FOUND', 'Student not found.', { statusCode: 404 });
}

module.exports = { StudentPerformanceService };
