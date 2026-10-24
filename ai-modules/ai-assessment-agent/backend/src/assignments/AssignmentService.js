const { AssessmentError, notFound, forbidden } = require('../core/errors');
const { validateAssignmentInput, validateQuestionsInput, validateEvaluationInput } = require('./assignmentValidation');
const { ASSIGNMENT_METHODS } = require('../adapters/lms/pgAssignmentStore');
const { mapInOrder } = require('../core/inOrder');

/**
 * Descriptive Assignments (Prompt 1: foundation; NO AI). LMS-agnostic rules over the adapter.
 *
 *   draft --publish--> published --close--> closed
 *
 * - Teachers manage only their OWN assignments in their OWN school; anything else is 404
 *   (existence is not revealed). Students/admins get 403 on teacher routes (actor.kind).
 * - An assignment targets exactly ONE class of the teacher's school (checked on create/edit/publish).
 * - Draft: details and questions editable. Publishing needs >= 1 question and question marks that
 *   add up to maxMarks, and a due date (if any) in the future. Published/closed: locked.
 * - Students see published/closed assignments of their own classes only (drafts: 404).
 * - Submissions are accepted while published and before dueAt (server clock). Closed or past due:
 *   no new submissions and no replacements (no late-submission mode). One CURRENT submission per
 *   student: re-uploading before evaluation replaces the file (version + 1, old file deleted);
 *   after evaluation it is refused.
 * - Status per student: not_submitted | submitted | evaluated | missed (no submission and no longer accepting).
 * - The teacher records FINAL marks + feedback (authoritative), optionally per question.
 * - Prompt 2: AI evaluation suggestions are stored ONLY in the ai_* columns (aiEvaluationContext +
 *   storeAiEvaluation; the route does the PDF/LLM work with no DB connection held). They never change
 *   final marks and are never shown to students.
 * File bytes never pass through this class: the route stores/reads them via the SubmissionFileStore.
 */
class AssignmentService {
  constructor({ adapter, now = () => Date.now() }) {
    const missing = ASSIGNMENT_METHODS.filter((m) => !adapter || typeof adapter[m] !== 'function');
    if (missing.length > 0) throw new TypeError(`LMS adapter is missing: ${missing.join(', ')}`);
    if (!adapter.supportsAssignments()) {
      throw new AssessmentError('ASSIGNMENTS_NOT_READY', 'Descriptive assignments are not available yet (a database update is pending).', { statusCode: 503 });
    }
    this.lms = adapter;
    this.now = now;
  }

  // ---- teacher ----

  async listOwn(actor) {
    requireTeacher(actor);
    return await mapInOrder(await this.lms.listAssignmentsByTeacher(actor.universityId, actor.userId), async (a) => {
      const submissions = await this.lms.listSubmissionsForAssignment(actor.universityId, a.id);
      return {
        ...await this.summary(actor, a),
        submittedCount: submissions.length,
        evaluatedCount: submissions.filter((s) => s.status === 'evaluated').length,
        studentsInClass: (await this.lms.listClassroomStudents(actor.universityId, a.classroomId)).length,
      };
    });
  }

  async create(actor, input) {
    requireTeacher(actor);
    const fields = validateAssignmentInput(input);
    return await this.lms.transaction(async () => {
      await this.checkClassroom(actor, fields.classroomId);
      const id = await this.lms.insertAssignment({ ...fields, universityId: actor.universityId, teacherId: actor.userId });
      return await this.detail(actor, await this.lms.findAssignment(actor.universityId, id));
    });
  }

  async getOwn(actor, id) {
    requireTeacher(actor);
    return await this.detail(actor, await this.findOwn(actor, id));
  }

  async update(actor, id, input) {
    requireTeacher(actor);
    const fields = validateAssignmentInput(input, { partial: true });
    return await this.lms.transaction(async () => {
      const a = await this.findOwnDraft(actor, id);
      if (fields.classroomId !== undefined) await this.checkClassroom(actor, fields.classroomId);
      await this.lms.updateAssignment(actor.universityId, a.id, fields);
      return await this.detail(actor, await this.lms.findAssignment(actor.universityId, a.id));
    });
  }

  async replaceQuestions(actor, id, input) {
    requireTeacher(actor);
    const questions = validateQuestionsInput(input);
    return await this.lms.transaction(async () => {
      const a = await this.findOwnDraft(actor, id);
      await this.lms.replaceAssignmentQuestions(a.id, questions);
      return await this.detail(actor, await this.lms.findAssignment(actor.universityId, a.id));
    });
  }

  async publish(actor, id) {
    requireTeacher(actor);
    return await this.lms.transaction(async () => {
      const a = await this.findOwn(actor, id);
      if (a.status !== 'draft') throw new AssessmentError('NOT_A_DRAFT', 'Only a draft assignment can be published.', { statusCode: 409 });
      const problems = [];
      if (!await this.lms.getTeacherClassroom(actor.universityId, actor.userId, a.classroomId)) problems.push({ field: 'classroomId', code: 'CLASSROOM_NOT_FOUND' });
      if (a.questionCount === 0) problems.push({ field: 'questions', code: 'NO_QUESTIONS' });
      else if (a.questionMarksTotal !== a.maxMarks) problems.push({ field: 'questions', code: 'MARKS_MISMATCH', expected: a.maxMarks, received: a.questionMarksTotal });
      if (a.dueAt && Date.parse(a.dueAt) <= this.now()) problems.push({ field: 'dueAt', code: 'DUE_IN_PAST' });
      if (problems.length > 0) throw new AssessmentError('NOT_PUBLISHABLE', 'This assignment cannot be published yet.', { statusCode: 409, details: problems });
      await this.lms.setAssignmentStatus(actor.universityId, a.id, { from: 'draft', to: 'published', at: iso(this.now()) });
      return await this.detail(actor, await this.lms.findAssignment(actor.universityId, a.id));
    });
  }

  async close(actor, id) {
    requireTeacher(actor);
    return await this.lms.transaction(async () => {
      const a = await this.findOwn(actor, id);
      if (a.status !== 'published') throw new AssessmentError('NOT_PUBLISHED', 'Only a published assignment can be closed.', { statusCode: 409 });
      await this.lms.setAssignmentStatus(actor.universityId, a.id, { from: 'published', to: 'closed', at: iso(this.now()) });
      return await this.detail(actor, await this.lms.findAssignment(actor.universityId, a.id));
    });
  }

  /** Class roster + every submission: who has / has not submitted. Never calls an AI. */
  async submissions(actor, id) {
    requireTeacher(actor);
    const a = await this.findOwn(actor, id);
    if (a.status === 'draft') throw new AssessmentError('NOT_PUBLISHED', 'Publish the assignment to receive submissions.', { statusCode: 409 });
    const subs = await this.lms.listSubmissionsForAssignment(actor.universityId, a.id);
    const roster = await this.lms.listClassroomStudents(actor.universityId, a.classroomId);
    const extra = subs.map((s) => s.studentId).filter((sid) => !roster.some((r) => r.id === sid));
    const names = await this.lms.getUserNames(actor.universityId, extra);
    const bySid = new Map(subs.map((s) => [s.studentId, s]));
    const nowMs = this.now();
    const students = [...roster.map((r) => ({ id: r.id, name: r.name })), ...extra.map((sid) => ({ id: sid, name: names.get(sid) || `Student #${sid}` }))]
      .map((st) => {
        const sub = bySid.get(st.id) || null;
        return { studentId: st.id, studentName: st.name, status: statusOf(a, sub, nowMs), submission: sub ? teacherSubmissionView(sub) : null };
      })
      .sort((x, y) => x.studentName.localeCompare(y.studentName) || x.studentId - y.studentId);
    const count = (s) => students.filter((r) => r.status === s).length;
    return {
      assignment: await this.summary(actor, a),
      questions: (await this.lms.listAssignmentQuestions(a.id)).map((q) => ({ questionId: `Q${q.position}`, position: q.position, text: q.text, maxMarks: q.maxMarks })),
      summary: { students: students.length, submitted: count('submitted'), evaluated: count('evaluated'), notSubmitted: count('not_submitted'), missed: count('missed') },
      students,
    };
  }

  /** The submission (and its storage key, for the route to stream) of the teacher's OWN assignment. */
  async submissionFileFor(actor, assignmentId, submissionId) {
    requireTeacher(actor);
    const a = await this.findOwn(actor, assignmentId);
    const sub = await this.findSubmissionOf(actor, a, submissionId);
    return { storageKey: sub.storageKey, originalFilename: sub.originalFilename };
  }

  /** FINAL marks + feedback, optionally per question (published or closed assignments). Re-marking updates the values. */
  async evaluate(actor, assignmentId, submissionId, input) {
    requireTeacher(actor);
    return await this.lms.transaction(async () => {
      const a = await this.findOwn(actor, assignmentId);
      if (a.status === 'draft') throw new AssessmentError('NOT_PUBLISHED', 'This assignment is not published.', { statusCode: 409 });
      const sub = await this.findSubmissionOf(actor, a, submissionId);
      const marks = validateEvaluationInput(input, a.maxMarks, await this.lms.listAssignmentQuestions(a.id));
      await this.lms.setSubmissionEvaluation(actor.universityId, sub.id, {
        finalMarks: marks.finalMarks,
        teacherFeedback: marks.teacherFeedback,
        finalQuestionMarksJson: marks.questionMarks ? JSON.stringify(marks.questionMarks) : null,
        evaluatedAt: iso(this.now()),
        evaluatedBy: actor.userId,
      });
      return { submission: teacherSubmissionView(await this.lms.findSubmission(actor.universityId, sub.id)) };
    });
  }

  /**
   * Prompt 2, step 1 (sync, DB): everything the AI evaluation needs, after the same ownership rules as
   * marking. Returns the storage key (for the route to read the PDF) and a context with NO ids.
   */
  async aiEvaluationContext(actor, assignmentId, submissionId) {
    requireTeacher(actor);
    const a = await this.findOwn(actor, assignmentId);
    if (a.status === 'draft') throw new AssessmentError('NOT_PUBLISHED', 'This assignment is not published.', { statusCode: 409 });
    const sub = await this.findSubmissionOf(actor, a, submissionId);
    const names = await this.lms.getRedactionNames(actor.universityId, { studentId: sub.studentId, teacherId: a.teacherId, classroomId: a.classroomId });
    return {
      storageKey: sub.storageKey,
      context: {
        instructions: a.instructions || '',
        totalMarks: a.maxMarks,
        questions: (await this.lms.listAssignmentQuestions(a.id)).map((q) => ({ position: q.position, text: q.text, maxMarks: q.maxMarks })),
        redactions: { studentName: names.studentName || '', classNames: [names.className], otherNames: [names.teacherName, names.schoolName] },
      },
    };
  }

  /** Prompt 2, step 3 (sync, DB): stores the validated AI SUGGESTION (ai_* only) for the file that was evaluated. */
  async storeAiEvaluation(actor, assignmentId, submissionId, storageKey, result) {
    requireTeacher(actor);
    return await this.lms.transaction(async () => {
      const a = await this.findOwn(actor, assignmentId);
      const sub = await this.findSubmissionOf(actor, a, submissionId);
      const stored = await this.lms.setSubmissionAiEvaluation(actor.universityId, sub.id, storageKey, {
        aiMarks: result.suggestedTotal,
        aiFeedback: result.overallFeedback,
        aiQuestionMarksJson: JSON.stringify(result.questions),
        aiLimitationsJson: JSON.stringify(result.limitations),
        aiEvaluatedAt: result.generatedAt,
      });
      if (!stored) throw new AssessmentError('SUBMISSION_CHANGED', 'The student replaced this submission while it was being evaluated. Please evaluate the new file.', { statusCode: 409 });
      return { submission: teacherSubmissionView(await this.lms.findSubmission(actor.universityId, sub.id)) };
    });
  }

  // ---- student ----

  async listForStudent(actor) {
    requireStudent(actor);
    const classIds = await this.lms.getStudentClassroomIds(actor.universityId, actor.userId);
    const mine = new Map((await this.lms.listSubmissionsForStudent(actor.universityId, actor.userId)).map((s) => [s.assignmentId, s]));
    const nowMs = this.now();
    return await mapInOrder(await this.lms.listVisibleAssignmentsForClassrooms(actor.universityId, classIds), async (a) => {
      const sub = mine.get(a.id) || null;
      return { ...await this.studentSummary(actor, a, nowMs), myStatus: statusOf(a, sub, nowMs), submittedAt: sub ? sub.submittedAt : null };
    });
  }

  async getForStudent(actor, id) {
    requireStudent(actor);
    const a = await this.findVisible(actor, id);
    const sub = await this.lms.findSubmissionFor(actor.universityId, a.id, actor.userId);
    const nowMs = this.now();
    return {
      ...await this.studentSummary(actor, a, nowMs),
      questions: (await this.lms.listAssignmentQuestions(a.id)).map((q) => ({ position: q.position, text: q.text, maxMarks: q.maxMarks, hasImage: !!q.imageKey })),
      myStatus: statusOf(a, sub, nowMs),
      submission: sub ? studentSubmissionView(sub) : null,
    };
  }

  /** Pre-check before the file is stored (the upload route calls recordSubmission afterwards). */
  async assertCanSubmit(actor, id) {
    requireStudent(actor);
    const a = await this.findVisible(actor, id);
    this.checkAccepting(a, await this.lms.findSubmissionFor(actor.universityId, a.id, actor.userId));
    return a;
  }

  /**
   * Records an already stored file as the student's current submission, re-checking every rule in
   * the transaction. Returns { created, submission, replacedStorageKey } (the caller deletes the old file).
   */
  async recordSubmission(actor, id, file) {
    requireStudent(actor);
    return await this.lms.transaction(async () => {
      const a = await this.findVisible(actor, id);
      const existing = await this.lms.findSubmissionFor(actor.universityId, a.id, actor.userId);
      this.checkAccepting(a, existing);
      const row = { storageKey: file.storageKey, originalFilename: file.originalFilename, fileSize: file.size, sha256: file.sha256, submittedAt: iso(this.now()) };
      if (existing) {
        if (!await this.lms.replaceSubmissionFile(actor.universityId, existing.id, row)) throw evaluatedError();
        return { created: false, submission: studentSubmissionView(await this.lms.findSubmission(actor.universityId, existing.id)), replacedStorageKey: existing.storageKey };
      }
      const newId = await this.lms.insertSubmission({ ...row, universityId: actor.universityId, assignmentId: a.id, studentId: actor.userId });
      return { created: true, submission: studentSubmissionView(await this.lms.findSubmission(actor.universityId, newId)), replacedStorageKey: null };
    });
  }

  async ownSubmissionFile(actor, id) {
    requireStudent(actor);
    const a = await this.findVisible(actor, id);
    const sub = await this.lms.findSubmissionFor(actor.universityId, a.id, actor.userId);
    if (!sub) throw new AssessmentError('SUBMISSION_NOT_FOUND', 'You have not submitted this assignment yet.', { statusCode: 404 });
    return { storageKey: sub.storageKey, originalFilename: sub.originalFilename };
  }

  // ---- internals ----

  async findOwn(actor, id) {
    const n = toId(id);
    const a = n ? await this.lms.findAssignment(actor.universityId, n) : null;
    if (!a || a.teacherId !== actor.userId) throw notFound();
    return a;
  }

  async findOwnDraft(actor, id) {
    const a = await this.findOwn(actor, id);
    if (a.status !== 'draft') throw new AssessmentError('ASSIGNMENT_LOCKED', 'A published or closed assignment cannot be changed.', { statusCode: 409 });
    return a;
  }

  /** Published/closed assignment of one of the student's classes (drafts and other classes: 404). */
  async findVisible(actor, id) {
    const n = toId(id);
    const a = n ? await this.lms.findAssignment(actor.universityId, n) : null;
    if (!a || a.status === 'draft' || !(await this.lms.getStudentClassroomIds(actor.universityId, actor.userId)).includes(a.classroomId)) throw notFound();
    return a;
  }

  async findSubmissionOf(actor, a, submissionId) {
    const n = toId(submissionId);
    const sub = n ? await this.lms.findSubmission(actor.universityId, n) : null;
    if (!sub || sub.assignmentId !== a.id) throw new AssessmentError('SUBMISSION_NOT_FOUND', 'Submission not found.', { statusCode: 404 });
    return sub;
  }

  checkAccepting(a, existing) {
    if (a.status === 'closed') throw new AssessmentError('ASSIGNMENT_CLOSED', 'This assignment is closed, so submissions are no longer accepted.', { statusCode: 409 });
    if (a.dueAt && this.now() >= Date.parse(a.dueAt)) throw new AssessmentError('ASSIGNMENT_PAST_DUE', 'The due date has passed, so submissions are no longer accepted.', { statusCode: 409 });
    if (existing && existing.status === 'evaluated') throw evaluatedError();
  }

  async checkClassroom(actor, classroomId) {
    if (!await this.lms.getTeacherClassroom(actor.universityId, actor.userId, classroomId)) { // a class this teacher is assigned to
      throw new AssessmentError('VALIDATION_FAILED', 'The assignment details are not valid.', { statusCode: 400, details: [{ field: 'classroomId', code: 'CLASSROOM_NOT_FOUND' }] });
    }
  }

  async classroomOf(actor, a) {
    const c = await this.lms.getClassroom(actor.universityId, a.classroomId);
    return c ? { id: c.id, name: c.name, grade: c.grade, section: c.section ?? null } : null;
  }

  async summary(actor, a) {
    return {
      id: a.id, title: a.title, instructions: a.instructions, classroomId: a.classroomId, classroom: await this.classroomOf(actor, a),
      maxMarks: a.maxMarks, dueAt: a.dueAt, status: a.status, questionCount: a.questionCount, questionMarksTotal: a.questionMarksTotal,
      publishedAt: a.publishedAt, closedAt: a.closedAt, createdAt: a.createdAt, updatedAt: a.updatedAt,
      acceptingSubmissions: accepting(a, this.now()),
    };
  }

  /** The picture key of ONE question of an assignment this student may see (404 otherwise). */
  async questionImageForStudent(actor, id, position) {
    requireStudent(actor);
    const a = await this.findVisible(actor, id);
    const question = (await this.lms.listAssignmentQuestions(a.id)).find((q) => String(q.position) === String(position));
    if (!question || !question.imageKey) throw notFound();
    return question.imageKey;
  }

  async detail(actor, a) {
    return { ...await this.summary(actor, a), questions: await this.lms.listAssignmentQuestions(a.id) };
  }

  async studentSummary(actor, a, nowMs) {
    const c = await this.classroomOf(actor, a);
    return {
      id: a.id, title: a.title, instructions: a.instructions, maxMarks: a.maxMarks, dueAt: a.dueAt, status: a.status,
      classroom: c ? { name: c.name } : null,
      teacherName: (await this.lms.getUserNames(actor.universityId, [a.teacherId])).get(a.teacherId) || null,
      questionCount: a.questionCount, acceptingSubmissions: accepting(a, nowMs),
    };
  }
}

/** Accepting new/replacement uploads: published and before the due date (server clock). */
function accepting(a, nowMs) {
  return a.status === 'published' && !(a.dueAt && nowMs >= Date.parse(a.dueAt));
}

function statusOf(a, sub, nowMs) {
  if (sub) return sub.status === 'evaluated' ? 'evaluated' : 'submitted';
  return accepting(a, nowMs) ? 'not_submitted' : 'missed';
}

const parseJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/**
 * Never includes storage keys, hashes or paths, and NEVER any ai_* data (AI suggestions are teacher-only).
 * Final (teacher-approved) marks/feedback only once evaluated.
 */
function studentSubmissionView(s) {
  return {
    id: s.id, status: s.status, originalFilename: s.originalFilename, fileSize: s.fileSize, submittedAt: s.submittedAt, version: s.version,
    ...(s.status === 'evaluated' ? { finalMarks: s.finalMarks, teacherFeedback: s.teacherFeedback, questionMarks: parseJson(s.finalQuestionMarksJson), evaluatedAt: s.evaluatedAt } : {}),
  };
}

/** Teacher view: final marks AND (separately) the latest AI suggestion, if any. */
function teacherSubmissionView(s) {
  return {
    id: s.id, status: s.status, originalFilename: s.originalFilename, fileSize: s.fileSize, submittedAt: s.submittedAt, version: s.version,
    finalMarks: s.finalMarks, teacherFeedback: s.teacherFeedback, questionMarks: parseJson(s.finalQuestionMarksJson), evaluatedAt: s.evaluatedAt,
    aiEvaluation: s.aiEvaluatedAt ? {
      questions: parseJson(s.aiQuestionMarksJson) || [],
      suggestedTotal: s.aiMarks,
      overallFeedback: s.aiFeedback,
      limitations: parseJson(s.aiLimitationsJson) || [],
      generatedAt: s.aiEvaluatedAt,
    } : null,
  };
}

const evaluatedError = () => new AssessmentError('SUBMISSION_EVALUATED', 'Your submission has already been marked, so it can no longer be replaced.', { statusCode: 409 });

function requireTeacher(actor) {
  if (!actor || actor.kind !== 'teacher') throw forbidden('Only teachers can manage assignments.');
}

function requireStudent(actor) {
  if (!actor || actor.kind !== 'student') throw forbidden('Only students can view and submit assignments.');
}

function toId(v) {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const iso = (ms) => new Date(ms).toISOString();

module.exports = { AssignmentService, statusOf };
