const { AssessmentError, notFound, forbidden } = require('./errors');
const { LIMITS, validateAssessmentInput, validateQuestionInput } = require('./assessmentValidation');
const { assertAssessmentLmsAdapter } = require('../adapters/lms/AssessmentLmsAdapter');
const { studentQuestionView } = require('./questionTypes');
const { mapInOrder, filterInOrder } = require('./inOrder');

/**
 * Core assessment rules. LMS-agnostic: all data access goes through the
 * AssessmentLmsAdapter, and the actor always comes from adapter.resolveActor
 * (the authenticated session), never from request data.
 *
 * Rules:
 *   - Only teachers create, read (with answers), edit, publish and unpublish,
 *     and only their OWN assessments in their OWN school. Another teacher's or
 *     another school's assessment is "not found" (existence is not revealed).
 *   - Edits are allowed only while an assessment is a draft. A published
 *     assessment must be unpublished first. (Safe in Step 1 because there are no
 *     student attempts yet; revisit when attempts exist.)
 *   - Publishing requires a target classroom in the same school and at least
 *     one question, and re-checks every stored question.
 *   - Students only list/read PUBLISHED assessments targeted at a classroom
 *     they belong to in their school, and never see which option is correct.
 *   - Migration 008: a test may be published to SELECTED students of its class
 *     (publish body { recipientIds }). No recipients stored = the whole class,
 *     exactly as before; a non-recipient sees nothing ("not found").
 *   - Migration 010: a new test belongs to a class AND a course the teacher mentors that is
 *     taught to that class. Its audience is the class's students ENROLLED in the course (all of
 *     them, or selected ones). Tests from before have no course: they are marked legacy and keep
 *     their old audience; no course is guessed for them.
 */
const MAX_RECIPIENTS = 500;
class AssessmentService {
  constructor({ adapter, now = () => Date.now() }) {
    this.lms = assertAssessmentLmsAdapter(adapter);
    this.now = now; // Step 5: server clock for window checks at publish time
  }

  // ---- teacher ----

  /** For teacher-only actions that touch no assessment data (e.g. AI generation). */
  assertTeacher(actor) {
    requireTeacher(actor);
  }

  /**
   * Multiple-select and numerical questions need migration 006. Checked BEFORE an AI request
   * (no LLM call for something that could not be saved) and before every write.
   */
  assertQuestionTypeAvailable(type) {
    if (type !== 'single_mcq' && !this.lms.supportsQuestionTypes()) {
      throw new AssessmentError('QUESTION_TYPES_NOT_READY',
        'Multiple-select and numerical questions are not available yet (a database update is pending). Single-answer MCQs work as usual.', { statusCode: 503 });
    }
  }

  async listClassrooms(actor) {
    requireTeacher(actor);
    return (await this.lms.listTeacherClassrooms(actor.universityId, actor.userId)).map(classroomView); // only classes this teacher is assigned to
  }

  /** "Assign to" picker: the students of one class in the teacher's school (id + name only). */
  async listClassroomStudents(actor, classroomId, courseId) {
    requireTeacher(actor);
    const id = toId(classroomId);
    if (!id || !await this.lms.getTeacherClassroom(actor.universityId, actor.userId, id)) throw notFound();
    if (courseId !== undefined && courseId !== null && courseId !== '' && this.courseLinkAvailable()) {
      const cid = toId(courseId);
      if (!cid || !await this.lms.getTeacherCourseForClassroom(actor.universityId, actor.userId, cid, id)) throw notFound();
      return (await this.lms.listCourseStudentsInClassroom(actor.universityId, cid, id)).map((s) => ({ id: s.id, name: s.name }));
    }
    return (await this.lms.listClassroomStudents(actor.universityId, id)).map((s) => ({ id: s.id, name: s.name }));
  }

  async createAssessment(actor, input) {
    requireTeacher(actor);
    const fields = validateAssessmentInput(input);
    return await this.lms.transaction(async () => {
      await this.checkClassroom(actor, fields.classroomId);
      await this.checkCourseForNewTest(actor, fields, 'courseId');
      const id = await this.lms.insertAssessment({ ...fields, universityId: actor.universityId, teacherId: actor.userId });
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, id));
    });
  }

  /**
   * Step 2: saves a teacher-REVIEWED set of questions (e.g. edited AI proposals)
   * as ONE new DRAFT, atomically. Same rules as createAssessment + addQuestion:
   * every question passes validateQuestionInput, the class must be in the
   * teacher's school, and nothing is published. Body: { assessment, questions }.
   */
  async createAssessmentWithQuestions(actor, body) {
    requireTeacher(actor);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new AssessmentError('VALIDATION_FAILED', 'Send { assessment, questions }.', { details: [{ field: '', code: 'MUST_BE_OBJECT' }] });
    }
    const unknown = Object.keys(body).filter((k) => k !== 'assessment' && k !== 'questions');
    if (unknown.length > 0) {
      throw new AssessmentError('VALIDATION_FAILED', 'Send { assessment, questions }.', { details: unknown.map((field) => ({ field, code: 'UNKNOWN_FIELD' })) });
    }
    const fields = validateAssessmentInput(body.assessment);
    if (fields.classroomId === null || fields.classroomId === undefined) {
      throw new AssessmentError('VALIDATION_FAILED', 'Choose the class for this test.', { details: [{ field: 'assessment.classroomId', code: 'REQUIRED' }] });
    }
    const list = body.questions;
    if (!Array.isArray(list) || list.length === 0 || list.length > LIMITS.questionsPerAssessment) {
      throw new AssessmentError('VALIDATION_FAILED', 'The questions are not valid.', {
        details: [{ field: 'questions', code: Array.isArray(list) && list.length > 0 ? 'TOO_MANY_QUESTIONS' : 'REQUIRED' }],
      });
    }
    const questions = [];
    const details = [];
    list.forEach((q, i) => {
      try {
        questions.push(validateQuestionInput(q));
      } catch (err) {
        if (!(err instanceof AssessmentError)) throw err;
        for (const d of err.details) details.push({ ...d, field: `questions[${i}]${d.field ? '.' + d.field : ''}` });
      }
    });
    if (details.length > 0) throw new AssessmentError('VALIDATION_FAILED', 'Some questions are not valid.', { details });
    for (const q of questions) this.assertQuestionTypeAvailable(q.type);

    return await this.lms.transaction(async () => {
      await this.checkClassroom(actor, fields.classroomId);
      await this.checkCourseForNewTest(actor, fields, 'assessment.courseId');
      const id = await this.lms.insertAssessment({ ...fields, universityId: actor.universityId, teacherId: actor.userId });
      for (const q of questions) await this.lms.insertQuestion(id, q);
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, id)); // status: 'draft'
    });
  }

  /**
   * Step 2: the class context for an AI generation request, checked against the
   * teacher's school BEFORE anything is sent to an LLM. Returns null when no
   * class was chosen. Reads only; the LLM never receives ids or student data.
   */
  async resolveGenerationTarget(actor, classroomId) {
    requireTeacher(actor);
    if (classroomId === null || classroomId === undefined) return null;
    const classroom = await this.lms.getTeacherClassroom(actor.universityId, actor.userId, classroomId);
    if (!classroom) {
      throw new AssessmentError('VALIDATION_FAILED', 'The generation request is not valid.', { details: [{ field: 'classroomId', code: 'CLASSROOM_NOT_FOUND' }] });
    }
    return classroomView(classroom);
  }

  async listOwnAssessments(actor) {
    requireTeacher(actor);
    return await mapInOrder(await this.lms.listAssessmentsByTeacher(actor.universityId, actor.userId), async (row) => await this.summary(actor, row));
  }

  async getOwnAssessment(actor, assessmentId) {
    requireTeacher(actor);
    return await this.detail(actor, await this.findOwn(actor, assessmentId));
  }

  async updateAssessment(actor, assessmentId, input) {
    requireTeacher(actor);
    const fields = validateAssessmentInput(input, { partial: true });
    return await this.lms.transaction(async () => {
      const row = await this.findOwnDraft(actor, assessmentId);
      if (fields.classroomId !== undefined) await this.checkClassroom(actor, fields.classroomId);
      if (fields.courseId !== undefined && !this.courseLinkAvailable()) delete fields.courseId; // before migration 010: ignored, as before
      if (this.courseLinkAvailable()) {
        // the course must belong to the (possibly new) class; a legacy test may be given a course
        const classroomId = fields.classroomId !== undefined ? fields.classroomId : row.classroomId;
        const courseId = fields.courseId !== undefined ? fields.courseId : row.courseId;
        if (courseId !== null && courseId !== undefined) await this.checkCourse(actor, classroomId, courseId, 'courseId');
        else if (fields.courseId === null && row.courseId) {
          throw new AssessmentError('VALIDATION_FAILED', 'Choose the course for this test.', { details: [{ field: 'courseId', code: 'REQUIRED' }] });
        }
      }
      // Step 5: the window must stay ordered after merging with the stored values.
      const opensAt = fields.opensAt !== undefined ? fields.opensAt : row.opensAt;
      const closesAt = fields.closesAt !== undefined ? fields.closesAt : row.closesAt;
      if (opensAt && closesAt && Date.parse(closesAt) <= Date.parse(opensAt)) {
        throw new AssessmentError('VALIDATION_FAILED', 'The assessment details are not valid.', { details: [{ field: 'closesAt', code: 'CLOSES_BEFORE_OPENS' }] });
      }
      await this.lms.updateAssessment(actor.universityId, row.id, fields);
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, row.id));
    });
  }

  async addQuestion(actor, assessmentId, input) {
    requireTeacher(actor);
    const question = validateQuestionInput(input);
    this.assertQuestionTypeAvailable(question.type);
    return await this.lms.transaction(async () => {
      const row = await this.findOwnDraft(actor, assessmentId);
      if (row.questionCount >= LIMITS.questionsPerAssessment) {
        throw new AssessmentError('TOO_MANY_QUESTIONS', `An assessment can have at most ${LIMITS.questionsPerAssessment} questions.`, { statusCode: 409 });
      }
      await this.lms.insertQuestion(row.id, question);
      await this.lms.updateAssessment(actor.universityId, row.id, {});
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, row.id));
    });
  }

  async updateQuestion(actor, assessmentId, questionId, input) {
    requireTeacher(actor);
    const question = validateQuestionInput(input);
    this.assertQuestionTypeAvailable(question.type);
    const qid = toId(questionId);
    return await this.lms.transaction(async () => {
      const row = await this.findOwnDraft(actor, assessmentId);
      if (!qid || !await this.lms.replaceQuestion(row.id, qid, question)) throw questionNotFound();
      await this.lms.updateAssessment(actor.universityId, row.id, {});
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, row.id));
    });
  }

  async deleteQuestion(actor, assessmentId, questionId) {
    requireTeacher(actor);
    const qid = toId(questionId);
    return await this.lms.transaction(async () => {
      const row = await this.findOwnDraft(actor, assessmentId);
      if (!qid || !await this.lms.deleteQuestion(row.id, qid)) throw questionNotFound();
      await this.lms.updateAssessment(actor.universityId, row.id, {});
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, row.id));
    });
  }

  /**
   * Publishes to the whole class (no body / no recipientIds), or to SELECTED students of the class
   * ({ recipientIds: [studentId, ...] }, migration 008). Selecting every student of the class is stored as
   * "whole class", so students who join the class later see the test too, as before.
   */
  async publish(actor, assessmentId, body = {}) {
    requireTeacher(actor);
    const recipientIds = validatePublishBody(body);
    if (recipientIds && !this.recipientsAvailable()) {
      throw new AssessmentError('RECIPIENTS_NOT_READY', 'Assigning to selected students is not available yet (a database update is pending). Assign to the whole class instead.', { statusCode: 503 });
    }
    return await this.lms.transaction(async () => {
      const row = await this.findOwn(actor, assessmentId);
      if (row.status === 'published') throw new AssessmentError('ALREADY_PUBLISHED', 'This assessment is already published.', { statusCode: 409 });
      const problems = [];
      if (row.classroomId === null) problems.push({ field: 'classroomId', code: 'REQUIRED' });
      else if (!await this.lms.getTeacherClassroom(actor.universityId, actor.userId, row.classroomId)) problems.push({ field: 'classroomId', code: 'CLASSROOM_NOT_FOUND' });
      else if (row.courseId && !await this.lms.getTeacherCourseForClassroom(actor.universityId, actor.userId, row.courseId, row.classroomId)) problems.push({ field: 'courseId', code: 'COURSE_NOT_FOUND' });
      const questions = await this.lms.listQuestions(row.id);
      if (questions.length === 0) problems.push({ field: 'questions', code: 'NO_QUESTIONS' });
      if (row.closesAt && Date.parse(row.closesAt) <= this.now()) problems.push({ field: 'closesAt', code: 'CLOSES_IN_PAST' }); // Step 5
      for (const q of questions) {
        try {
          validateQuestionInput(q.type === 'numerical'
            ? { type: q.type, text: q.text, numericAnswer: q.numericAnswer }
            : { type: q.type, text: q.text, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) });
        } catch (err) {
          problems.push({ field: `questions[${q.position}]`, code: 'INVALID_QUESTION' });
        }
      }
      if (problems.length > 0) throw new AssessmentError('NOT_PUBLISHABLE', 'This assessment cannot be published yet.', { statusCode: 409, details: problems });
      let stored = [];
      if (recipientIds) {
        const roster = new Set((await this.eligibleStudents(actor, row)).map((st) => st.id));
        const outside = recipientIds.filter((sid) => !roster.has(sid));
        if (outside.length > 0) {
          const code = row.courseId ? 'NOT_IN_COURSE' : 'NOT_IN_CLASS';
          throw new AssessmentError('VALIDATION_FAILED', row.courseId ? 'Some selected students are not enrolled in this course in this class.' : 'Some selected students are not in this class.', { details: outside.map(() => ({ field: 'recipientIds', code })) });
        }
        stored = recipientIds.length === roster.size ? [] : recipientIds; // everyone selected = whole class
      }
      if (this.recipientsAvailable()) await this.lms.replaceRecipients(actor.universityId, row.id, stored);
      await this.lms.setAssessmentStatus(actor.universityId, row.id, 'published');
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, row.id));
    });
  }

  async unpublish(actor, assessmentId) {
    requireTeacher(actor);
    return await this.lms.transaction(async () => {
      const row = await this.findOwn(actor, assessmentId);
      if (row.status !== 'published') throw new AssessmentError('NOT_PUBLISHED', 'This assessment is not published.', { statusCode: 409 });
      // Step 3: once students have attempts, the questions they were graded on must not change.
      if (await this.lms.countAttempts(row.id) > 0) {
        throw new AssessmentError('ASSESSMENT_HAS_ATTEMPTS', 'Students have already started this test, so it can no longer be unpublished or edited.', { statusCode: 409 });
      }
      await this.lms.setAssessmentStatus(actor.universityId, row.id, 'draft');
      return await this.detail(actor, await this.lms.findAssessment(actor.universityId, row.id));
    });
  }

  // ---- student (read-only, no answers) ----

  async listAvailableForStudent(actor) {
    requireStudent(actor);
    const classroomIds = await this.lms.getStudentClassroomIds(actor.universityId, actor.userId);
    return await mapInOrder(
      await filterInOrder(await this.lms.listPublishedForClassrooms(actor.universityId, classroomIds), async (row) => await this.isRecipient(actor, row)),
      async (row) => await this.studentSummary(actor, row)
    );
  }

  async getAvailableForStudent(actor, assessmentId) {
    requireStudent(actor);
    const id = toId(assessmentId);
    const row = id ? await this.lms.findAssessment(actor.universityId, id) : null;
    if (!row || row.status !== 'published' || !(await this.lms.getStudentClassroomIds(actor.universityId, actor.userId)).includes(row.classroomId)
      || !await this.isRecipient(actor, row)) {
      throw notFound();
    }
    return {
      ...await this.studentSummary(actor, row),
      questions: (await this.lms.listQuestions(row.id)).map(studentQuestionView), // no isCorrect / numeric answer, ever
    };
  }

  // ---- internals ----

  recipientsAvailable() {
    return typeof this.lms.supportsRecipientsReports === 'function' && this.lms.supportsRecipientsReports();
  }

  /** Migration 008: whole-class test, or the student is one of its selected recipients. */
  async isRecipient(actor, row) {
    if (row.courseId && this.courseLinkAvailable() && !await this.lms.isStudentInCourse(actor.universityId, actor.userId, row.courseId)) return false;
    return typeof this.lms.isAssessmentRecipient !== 'function' || await this.lms.isAssessmentRecipient(actor.universityId, row.id, actor.userId);
  }

  /** Migration 010 applied and the LMS has enrolments. */
  courseLinkAvailable() {
    return typeof this.lms.supportsCourseLink === 'function' && this.lms.supportsCourseLink();
  }

  /** Who may be given this test: the class, or for a course test the class's students enrolled in the course. */
  async eligibleStudents(actor, row) {
    if (row.courseId && this.courseLinkAvailable()) return await this.lms.listCourseStudentsInClassroom(actor.universityId, row.courseId, row.classroomId);
    return await this.lms.listClassroomStudents(actor.universityId, row.classroomId);
  }

  /** A new test needs its class and a course of that class the teacher mentors (once migration 010 is applied). */
  async checkCourseForNewTest(actor, fields, field) {
    if (!this.courseLinkAvailable()) {
      delete fields.courseId; // before migration 010 a test has no course
      return;
    }
    const prefix = field.startsWith('assessment.') ? 'assessment.' : '';
    if (fields.classroomId === null || fields.classroomId === undefined) {
      throw new AssessmentError('VALIDATION_FAILED', 'Choose the class for this test.', { details: [{ field: `${prefix}classroomId`, code: 'REQUIRED' }] });
    }
    if (fields.courseId === null || fields.courseId === undefined) {
      throw new AssessmentError('VALIDATION_FAILED', 'Choose the course for this test.', { details: [{ field, code: 'REQUIRED' }] });
    }
    await this.checkCourse(actor, fields.classroomId, fields.courseId, field);
  }

  async checkCourse(actor, classroomId, courseId, field = 'courseId') {
    if (!await this.lms.getTeacherCourseForClassroom(actor.universityId, actor.userId, courseId, classroomId)) {
      throw new AssessmentError('VALIDATION_FAILED', 'Choose one of your courses taught to this class.', { details: [{ field, code: 'COURSE_NOT_FOUND' }] });
    }
  }

  /** Teacher view of who the test is assigned to. */
  async recipientsView(actor, row) {
    const ids = typeof this.lms.listRecipientIds === 'function' ? await this.lms.listRecipientIds(actor.universityId, row.id) : [];
    return ids.length === 0 ? { mode: 'class', studentIds: [] } : { mode: 'selected', studentIds: ids };
  }

  async findOwn(actor, assessmentId) {
    const id = toId(assessmentId);
    const row = id ? await this.lms.findAssessment(actor.universityId, id) : null;
    if (!row || row.teacherId !== actor.userId) throw notFound();
    return row;
  }

  async findOwnDraft(actor, assessmentId) {
    const row = await this.findOwn(actor, assessmentId);
    if (row.status !== 'draft') {
      throw new AssessmentError('ASSESSMENT_PUBLISHED', 'A published assessment cannot be edited. Unpublish it first.', { statusCode: 409 });
    }
    return row;
  }

  async checkClassroom(actor, classroomId) {
    if (classroomId === null || classroomId === undefined) return;
    if (!await this.lms.getTeacherClassroom(actor.universityId, actor.userId, classroomId)) {
      throw new AssessmentError('VALIDATION_FAILED', 'The assessment details are not valid.', { details: [{ field: 'classroomId', code: 'CLASSROOM_NOT_FOUND' }] });
    }
  }

  async summary(actor, row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      subject: row.subject,
      classroomId: row.classroomId,
      classroom: row.classroomId === null ? null : classroomView(await this.lms.getClassroom(actor.universityId, row.classroomId)),
      ...await this.courseView(actor, row),
      durationMinutes: row.durationMinutes,
      status: row.status,
      questionCount: row.questionCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      opensAt: row.opensAt ?? null, // Step 5 window
      closesAt: row.closesAt ?? null,
      closedAt: row.closedAt ?? null,
      recipients: await this.recipientsView(actor, row), // migration 008; { mode: 'class' } before it
    };
  }

  /** The picture key of ONE question of a test this student may see (404 otherwise, or when it has no picture). */
  async questionImageForStudent(actor, assessmentId, questionId) {
    const visible = await this.getAvailableForStudent(actor, assessmentId); // school, class, published, recipient
    const qid = toId(questionId);
    const question = qid ? (await this.lms.listQuestions(visible.id)).find((q) => q.id === qid) : null;
    if (!question || !question.imageKey) throw notFound();
    return question.imageKey;
  }

  /** { courseId, course, legacy }: legacy = made before tests belonged to a course. */
  async courseView(actor, row) {
    if (!this.courseLinkAvailable()) return {};
    const courseId = row.courseId ?? null;
    const course = courseId ? await this.lms.getCourse(actor.universityId, courseId) : null;
    return { courseId, course: course ? { id: course.id, title: course.title } : null, legacy: courseId === null };
  }

  async detail(actor, row) {
    return { ...await this.summary(actor, row), questions: await this.lms.listQuestions(row.id) };
  }

  async studentSummary(actor, row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      subject: row.subject,
      classroom: classroomView(await this.lms.getClassroom(actor.universityId, row.classroomId)),
      ...await this.courseView(actor, row),
      durationMinutes: row.durationMinutes,
      questionCount: row.questionCount,
      publishedAt: row.publishedAt,
      opensAt: row.opensAt ?? null, // Step 5 window (the list adds a computed availability)
      closesAt: row.closesAt ?? null,
      closedAt: row.closedAt ?? null,
    };
  }
}

function requireTeacher(actor) {
  if (!actor || actor.kind !== 'teacher') throw forbidden('Only teachers can manage assessments.');
}

function requireStudent(actor) {
  if (!actor || actor.kind !== 'student') throw forbidden('Only students can view assigned assessments.');
}

/** Publish body: {} (whole class) or { recipientIds: [distinct student ids] }. Returns the ids or null. */
function validatePublishBody(body) {
  if (body === undefined || body === null) return null;
  if (typeof body !== 'object' || Array.isArray(body)) throw new AssessmentError('INVALID_REQUEST', 'Request body must be a JSON object.');
  const unknown = Object.keys(body).filter((k) => k !== 'recipientIds');
  if (unknown.length > 0) {
    throw new AssessmentError('VALIDATION_FAILED', 'The assignment is not valid.', { details: unknown.map((field) => ({ field, code: 'UNKNOWN_FIELD' })) });
  }
  if (body.recipientIds === undefined) return null;
  const list = body.recipientIds;
  const bad = (code) => new AssessmentError('VALIDATION_FAILED', 'The assignment is not valid.', { details: [{ field: 'recipientIds', code }] });
  if (!Array.isArray(list) || list.length === 0) throw bad('SELECT_AT_LEAST_ONE');
  if (list.length > MAX_RECIPIENTS) throw bad('TOO_MANY');
  if (!list.every((v) => Number.isInteger(v) && v >= 1)) throw bad('INVALID_ID');
  if (new Set(list).size !== list.length) throw bad('DUPLICATE');
  return [...list].sort((a, b) => a - b);
}

function toId(v) {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function classroomView(c) {
  return c ? { id: c.id, name: c.name, grade: c.grade, section: c.section ?? null } : null;
}

function questionNotFound() {
  return new AssessmentError('QUESTION_NOT_FOUND', 'Question not found.', { statusCode: 404 });
}

module.exports = { AssessmentService };
