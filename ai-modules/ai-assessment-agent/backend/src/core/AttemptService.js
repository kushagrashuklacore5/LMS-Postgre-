const { AssessmentError, notFound, forbidden } = require('./errors');
const { assertAssessmentLmsAdapter } = require('../adapters/lms/AssessmentLmsAdapter');
const { normalizeNumber, positionSet, isAnswerCorrect, hasAnswer, studentQuestionView } = require('./questionTypes');
const { mapInOrder, filterInOrder } = require('./inOrder');

/**
 * Step 3: the student attempt lifecycle and deterministic MCQ grading.
 *
 *   start -> (save answers)* -> submit OR server deadline passes -> graded -> result / teacher report
 *
 * Rules:
 *   - The SERVER clock (`now`, injectable for tests) decides everything. Start time and
 *     deadline are computed and stored here; the client never sends times. A test
 *     without durationMinutes is untimed (deadline null).
 *   - Expiry is enforced lazily and on EVERY path: any read, save, submit, list or
 *     teacher report first finalizes an in-progress attempt whose deadline has passed
 *     (finished_at = the deadline), so refreshes, closed browsers, client clock changes
 *     and late requests cannot extend time.
 *   - One attempt per student per assessment (DB UNIQUE). Starting again resumes it.
 *   - Grading is deterministic and per question type (questionTypes.isAnswerCorrect):
 *     single_mcq = the stored correct option; multi_select = exactly the stored correct SET;
 *     numerical = the same canonical number. No LLM, no partial credit. The client never
 *     sends scores, and nothing it sends is used for scoring except its answer per question.
 *   - Finalization is atomic and idempotent: the first finalization wins; later
 *     submits return the same stored result.
 *   - Before finalization, students never receive correct answers or explanations.
 *     After it, they see their answer, the correct option and correct/incorrect,
 *     but still no teacher-only explanations.
 */
class AttemptService {
  constructor({ adapter, now = () => Date.now() }) {
    this.lms = assertAssessmentLmsAdapter(adapter);
    this.now = now;
  }

  // ---- student ----

  /** Adds each test's attempt state for this student to the Step 1 student list. */
  async withAttemptStatus(actor, assessments) {
    requireStudent(actor);
    return await this.lms.transaction(async () => {
      const mine = new Map((await this.lms.listAttemptsForStudent(actor.universityId, actor.userId)).map((a) => [a.assessmentId, a]));
      const nowMs = this.now();
      return await mapInOrder(assessments, async (item) => {
        let attempt = mine.get(item.id);
        if (attempt) attempt = await this.finalizeIfExpired(attempt);
        return {
          ...item,
          availability: availabilityOf(item, nowMs), // Step 5: 'upcoming' | 'open' | 'closed'
          attempt: attempt
            ? { id: attempt.id, status: attempt.status, deadlineAt: attempt.deadlineAt, ...(attempt.status === 'in_progress' ? {} : { score: attempt.score, percentage: attempt.percentage }) }
            : null,
        };
      });
    });
  }

  /** Starts (201) or resumes (200) the student's single attempt at a published test for their class. */
  async startAttempt(actor, assessmentId) {
    requireStudent(actor);
    const id = toId(assessmentId);
    return await this.lms.transaction(async () => {
      const assessment = id ? await this.lms.findAssessment(actor.universityId, id) : null;
      if (!assessment || assessment.status !== 'published'
        || !(await this.lms.getStudentClassroomIds(actor.universityId, actor.userId)).includes(assessment.classroomId)
        || !await isRecipient(this.lms, actor.universityId, assessment.id, actor.userId)) { // migration 008: selected students only
        throw notFound();
      }
      const existing = await this.lms.findAttemptFor(actor.universityId, assessment.id, actor.userId);
      if (existing) return { created: false, attempt: await this.view(actor, await this.finalizeIfExpired(existing), assessment) };

      // Step 5: a new attempt only inside the test window (server clock).
      const startedMs = this.now();
      const availability = availabilityOf(assessment, startedMs);
      if (availability === 'upcoming') {
        throw new AssessmentError('TEST_NOT_OPEN', 'This test has not opened yet.', { statusCode: 409 });
      }
      if (availability === 'closed') {
        throw new AssessmentError('TEST_CLOSED', 'This test is closed.', { statusCode: 409 });
      }
      // The deadline is the earlier of start + duration and the window's closing time.
      const byDuration = assessment.durationMinutes ? startedMs + assessment.durationMinutes * 60000 : null;
      const byWindow = assessment.closesAt ? Date.parse(assessment.closesAt) : null;
      const deadlineMs = [byDuration, byWindow].filter((x) => x !== null).reduce((a, b) => Math.min(a, b), Infinity);
      const attemptId = await this.lms.insertAttempt({
        universityId: actor.universityId,
        assessmentId: assessment.id,
        studentId: actor.userId,
        startedAt: iso(startedMs),
        deadlineAt: Number.isFinite(deadlineMs) ? iso(deadlineMs) : null,
      });
      return { created: true, attempt: await this.view(actor, await this.lms.findAttempt(actor.universityId, attemptId), assessment) };
    });
  }

  /** In-progress view (questions, saved answers, deadline) or, once finalized, the result. */
  async getAttempt(actor, attemptId) {
    requireStudent(actor);
    return await this.lms.transaction(async () => {
      const attempt = await this.finalizeIfExpired(await this.findOwn(actor, attemptId));
      return await this.view(actor, attempt);
    });
  }

  /**
   * Body, by question type (null clears; nothing else is accepted):
   *   single_mcq   { optionPosition: 0-3 | null }
   *   multi_select { optionPositions: [distinct 0-3] | [] | null }   ([] also clears)
   *   numerical    { value: "12.5" | null }                          (plain number; checked against the question's format)
   */
  async saveAnswer(actor, attemptId, questionId, body) {
    requireStudent(actor);
    const answer = parseAnswerBody(body);
    const qid = toId(questionId);
    // The transaction commits an expiry finalization even when the save is refused.
    const outcome = await this.lms.transaction(async () => {
      const attempt = await this.finalizeIfExpired(await this.findOwn(actor, attemptId));
      if (attempt.status !== 'in_progress') return { closed: attempt.status };
      const question = qid ? (await this.lms.listQuestions(attempt.assessmentId)).find((q) => q.id === qid) : null;
      if (!question) return { invalid: new AssessmentError('QUESTION_NOT_FOUND', 'This question is not part of this test.', { statusCode: 404 }) };
      const checked = await checkAnswer(question, answer);
      if (checked.invalid) return { invalid: checked.invalid };
      if (question.type === 'single_mcq') await this.lms.saveAnswer(attempt.id, question.id, checked.saved.optionPosition);
      else await this.lms.saveResponse(attempt.id, question.id, checked.response);
      return { saved: { questionId: question.id, ...checked.saved }, deadlineAt: attempt.deadlineAt };
    });
    if (outcome.closed) throw closedError(outcome.closed);
    if (outcome.invalid) throw outcome.invalid;
    return { saved: outcome.saved, deadlineAt: outcome.deadlineAt, serverNow: iso(this.now()) };
  }

  /** Finalizes and grades. Idempotent: an already finalized attempt returns its stored result unchanged. */
  async submit(actor, attemptId) {
    requireStudent(actor);
    return await this.lms.transaction(async () => {
      let attempt = await this.finalizeIfExpired(await this.findOwn(actor, attemptId));
      const alreadyFinalized = attempt.status !== 'in_progress';
      if (!alreadyFinalized) attempt = await this.finalize(attempt, 'submitted', iso(this.now()));
      return { alreadyFinalized, attempt: await this.view(actor, attempt) };
    });
  }

  async getResult(actor, attemptId) {
    requireStudent(actor);
    return await this.lms.transaction(async () => {
      const attempt = await this.finalizeIfExpired(await this.findOwn(actor, attemptId));
      if (attempt.status === 'in_progress') {
        throw new AssessmentError('ATTEMPT_IN_PROGRESS', 'Submit the test to see your result.', { statusCode: 409 });
      }
      return await this.view(actor, attempt);
    });
  }

  // ---- teacher ----

  /**
   * Step 5: the teacher closes their OWN published test now (server clock). New starts are
   * refused from then on, and every in-progress attempt is finalized and graded immediately
   * (as 'expired', finished at the close time, or at its own earlier deadline). Idempotence:
   * closing an already closed test is a 409, and nothing changes.
   */
  async closeAssessment(actor, assessmentId) {
    requireTeacher(actor);
    const id = toId(assessmentId);
    return await this.lms.transaction(async () => {
      const assessment = id ? await this.lms.findAssessment(actor.universityId, id) : null;
      if (!assessment || assessment.teacherId !== actor.userId) throw notFound();
      if (assessment.status !== 'published') {
        throw new AssessmentError('NOT_PUBLISHED', 'Only a published test can be closed.', { statusCode: 409 });
      }
      if (assessment.closedAt) {
        throw new AssessmentError('ALREADY_CLOSED', 'This test is already closed.', { statusCode: 409 });
      }
      const closedAt = iso(this.now());
      await this.lms.closeAssessment(actor.universityId, assessment.id, closedAt);
      let finalized = 0;
      for (const a of await this.lms.listAttemptsForAssessment(actor.universityId, assessment.id)) {
        const current = await this.finalizeIfExpired(a); // its own deadline may already have passed
        if (current.status === 'in_progress') {
          await this.finalize(current, 'expired', closedAt);
          finalized += 1;
        }
      }
      return { closedAt, attemptsFinalized: finalized };
    });
  }

  /**
   * Step 6: the owning teacher resets one student's FINISHED attempt so the student can take
   * the test again. The finished attempt (result + answers snapshot) moves to the archive in
   * the same transaction and is removed from the current attempts; the next start creates a
   * fresh attempt with a fresh server deadline. Refused (409) when the attempt is still in
   * progress, when the test is closed (a reset never reopens a test), and after
   * MAX_RESETS_PER_STUDENT resets of that student on that test. The test and its questions are
   * never modified.
   */
  async resetAttempt(actor, assessmentId, studentId) {
    requireTeacher(actor);
    const id = toId(assessmentId);
    const sid = toId(studentId);
    return await this.lms.transaction(async () => {
      const assessment = id ? await this.lms.findAssessment(actor.universityId, id) : null;
      if (!assessment || assessment.teacherId !== actor.userId) throw notFound();
      if (availabilityOf(assessment, this.now()) === 'closed') {
        throw new AssessmentError('TEST_CLOSED', 'This test is closed, so attempts can no longer be reset.', { statusCode: 409 });
      }
      let attempt = sid ? await this.lms.findAttemptFor(actor.universityId, assessment.id, sid) : null;
      if (!attempt) throw new AssessmentError('ATTEMPT_NOT_FOUND', 'This student has no attempt to reset.', { statusCode: 404 });
      attempt = await this.finalizeIfExpired(attempt); // an attempt past its deadline counts as finished
      if (attempt.status === 'in_progress') {
        throw new AssessmentError('ATTEMPT_IN_PROGRESS', 'The student is still taking this test. Wait until it is submitted or the time is up.', { statusCode: 409 });
      }
      const used = await this.lms.countArchivedAttemptsFor(actor.universityId, assessment.id, attempt.studentId);
      if (used >= MAX_RESETS_PER_STUDENT) {
        throw new AssessmentError('RESET_LIMIT_REACHED', `This student's attempt has already been reset ${MAX_RESETS_PER_STUDENT} times for this test.`, { statusCode: 409 });
      }
      const resetAt = iso(this.now());
      await this.lms.archiveAttempt(attempt, { answers: await this.lms.listAnswers(attempt.id), resetBy: actor.userId, resetAt });
      return {
        reset: {
          studentId: attempt.studentId,
          archivedAttemptId: attempt.id,
          previousResult: resultOf(attempt),
          resetAt,
          resetsUsed: used + 1,
          resetsRemaining: MAX_RESETS_PER_STUDENT - (used + 1),
        },
      };
    });
  }

  /** Per-student results + summary for the teacher's OWN test (other teachers/schools: 404). No ranking. */
  async report(actor, assessmentId) {
    requireTeacher(actor);
    const id = toId(assessmentId);
    return await this.lms.transaction(async () => {
      const assessment = id ? await this.lms.findAssessment(actor.universityId, id) : null;
      if (!assessment || assessment.teacherId !== actor.userId) throw notFound();

      const attempts = await mapInOrder(await this.lms.listAttemptsForAssessment(actor.universityId, assessment.id), async (a) => await this.finalizeIfExpired(a));
      // Migration 008: a test assigned to selected students lists only them (plus anyone with an attempt, below).
      const roster = await filterInOrder(assessment.classroomId ? await this.lms.listClassroomStudents(actor.universityId, assessment.classroomId) : [],
        async (s) => await isRecipient(this.lms, actor.universityId, assessment.id, s.id));
      const testClosed = availabilityOf(assessment, this.now()) === 'closed';
      // Step 6: archived (reset) attempts are history only; every number below is the CURRENT attempt.
      const archive = new Map();
      for (const r of await this.lms.listArchivedAttempts(actor.universityId, assessment.id)) {
        if (!archive.has(r.studentId)) archive.set(r.studentId, []);
        archive.get(r.studentId).push(r);
      }
      const previousOf = (sid) => (archive.get(sid) || []).map((r, i) => ({
        attemptNumber: i + 1, status: r.status, score: r.score, percentage: r.percentage, totalQuestions: r.totalQuestions,
        finishedAt: r.finishedAt, resetAt: r.resetAt,
      }));
      const names = await this.lms.getUserNames(actor.universityId, [...attempts.map((a) => a.studentId), ...archive.keys()]);
      const byStudent = new Map(attempts.map((a) => [a.studentId, a]));

      const extra = [...attempts.map((a) => a.studentId), ...archive.keys()].filter((sid, i, all) => !roster.some((s) => s.id === sid) && all.indexOf(sid) === i);
      const studentIds = [...roster.map((s) => s.id), ...extra];
      const nameOf = (sid) => (roster.find((s) => s.id === sid) || {}).name || names.get(sid) || `Student #${sid}`;
      const students = studentIds.map((sid) => {
        const a = byStudent.get(sid);
        const previousAttempts = previousOf(sid);
        // Step 5: once the window is over, a student who never started has missed the test.
        if (!a) return { studentId: sid, studentName: nameOf(sid), status: testClosed ? 'missed' : 'not_started', attemptNumber: null, previousAttempts };
        const finalized = a.status !== 'in_progress';
        return {
          studentId: sid,
          studentName: nameOf(sid),
          attemptNumber: previousAttempts.length + 1, // Step 6: which attempt the row's numbers belong to
          previousAttempts,
          status: a.status,
          startedAt: a.startedAt,
          submittedAt: a.finishedAt,
          timeTakenSeconds: finalized ? Math.max(0, Math.round((Date.parse(a.finishedAt) - Date.parse(a.startedAt)) / 1000)) : null,
          ...(finalized ? resultOf(a) : {}),
        };
      }).sort((x, y) => x.studentName.localeCompare(y.studentName) || x.studentId - y.studentId);

      const done = attempts.filter((a) => a.status !== 'in_progress');
      const scores = done.map((a) => a.score);
      const percentages = done.map((a) => a.percentage);
      const sum = (xs) => xs.reduce((s, x) => s + x, 0);
      const avg = (xs) => (xs.length ? round2(sum(xs) / xs.length) : null);
      // From raw counts, not from already-rounded percentages (avoids 66.66 for 3/3 and 1/3).
      const totalAsked = sum(done.map((a) => a.totalQuestions));
      return {
        assessment: {
          id: assessment.id, title: assessment.title, subject: assessment.subject, status: assessment.status, questionCount: assessment.questionCount, durationMinutes: assessment.durationMinutes,
          opensAt: assessment.opensAt ?? null, closesAt: assessment.closesAt ?? null, closedAt: assessment.closedAt ?? null, availability: availabilityOf(assessment, this.now()),
        },
        summary: {
          studentsInClass: roster.length,
          studentsAttempted: attempts.length,
          totalSubmissions: done.length,
          inProgress: attempts.length - done.length,
          averageScore: avg(scores),
          averagePercentage: totalAsked ? round2((sum(done.map((a) => a.correct)) / totalAsked) * 100) : null,
          highestScore: scores.length ? Math.max(...scores) : null,
          lowestScore: scores.length ? Math.min(...scores) : null,
          highestPercentage: percentages.length ? Math.max(...percentages) : null,
          lowestPercentage: percentages.length ? Math.min(...percentages) : null,
        },
        students,
      };
    });
  }

  // ---- internals ----

  async findOwn(actor, attemptId) {
    const id = toId(attemptId);
    const attempt = id ? await this.lms.findAttempt(actor.universityId, id) : null;
    if (!attempt || attempt.studentId !== actor.userId) {
      throw new AssessmentError('ATTEMPT_NOT_FOUND', 'Attempt not found.', { statusCode: 404 });
    }
    return attempt;
  }

  /** Server-side timer: an in-progress attempt past its deadline is finalized as 'expired' right now. */
  async finalizeIfExpired(attempt) {
    if (attempt.status !== 'in_progress' || !attempt.deadlineAt) return attempt;
    if (this.now() < Date.parse(attempt.deadlineAt)) return attempt;
    return await this.finalize(attempt, 'expired', attempt.deadlineAt);
  }

  /** Grades from the stored answer keys (per question type) and stores the result. First finalization wins. */
  async finalize(attempt, status, finishedAt) {
    const questions = await this.lms.listQuestions(attempt.assessmentId);
    const answers = new Map((await this.lms.listAnswers(attempt.id)).map((a) => [a.questionId, a]));
    const gradedAnswers = [];
    let correct = 0;
    for (const q of questions) {
      const a = answers.get(q.id);
      if (!hasAnswer(q, a)) continue;
      const isCorrect = isAnswerCorrect(q, a);
      if (isCorrect) correct += 1;
      gradedAnswers.push({ questionId: q.id, isCorrect });
    }
    const totalQuestions = questions.length;
    const attempted = gradedAnswers.length;
    const result = {
      totalQuestions,
      attempted,
      correct,
      incorrect: attempted - correct,
      unattempted: totalQuestions - attempted,
      score: correct,
      percentage: totalQuestions ? round2((correct / totalQuestions) * 100) : 0,
    };
    await this.lms.finalizeAttempt(attempt.id, { status, finishedAt, result, gradedAnswers });
    return await this.lms.findAttempt(attempt.universityId, attempt.id);
  }

  /** Student-facing attempt view. Never includes explanations; answers only after finalization. */
  async view(actor, attempt, assessment) {
    if (assessment === undefined) assessment = await this.lms.findAssessment(actor.universityId, attempt.assessmentId);
    const questions = await this.lms.listQuestions(attempt.assessmentId);
    const answers = new Map((await this.lms.listAnswers(attempt.id)).map((a) => [a.questionId, a]));
    const classroom = assessment && assessment.classroomId ? await this.lms.getClassroom(actor.universityId, assessment.classroomId) : null;
    const base = {
      id: attempt.id,
      assessmentId: attempt.assessmentId,
      assessment: assessment ? { title: assessment.title, subject: assessment.subject, classroom: classroom ? { name: classroom.name, grade: classroom.grade, section: classroom.section ?? null } : null } : null,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      durationMinutes: assessment ? assessment.durationMinutes : null,
      serverNow: iso(this.now()), // lets the browser show a countdown without trusting its own clock
    };
    if (attempt.status === 'in_progress') {
      return {
        ...base,
        questions: questions.map(studentQuestionView), // no answer key of any type
        answers: questions.filter((q) => hasAnswer(q, answers.get(q.id))).map((q) => savedAnswerView(q, answers.get(q.id))),
      };
    }
    return {
      ...base,
      finishedAt: attempt.finishedAt,
      result: resultOf(attempt),
      questions: questions.map((q) => {
        const a = answers.get(q.id);
        const answered = hasAnswer(q, a);
        const outcome = !answered ? 'unattempted' : a.isCorrect ? 'correct' : 'incorrect';
        const view = { ...studentQuestionView(q), outcome };
        if (q.type === 'numerical') {
          return { ...view, submittedValue: answered ? a.value : null, correctValue: q.numericAnswer ? q.numericAnswer.value : null };
        }
        const correct = q.options.filter((o) => o.isCorrect).map((o) => o.position);
        if (q.type === 'multi_select') {
          return { ...view, selectedPositions: answered ? a.optionPositions : [], correctPositions: correct };
        }
        return { ...view, selectedPosition: answered ? a.optionPosition : null, correctPosition: correct.length ? correct[0] : null };
      }),
    };
  }
}

function resultOf(a) {
  return { totalQuestions: a.totalQuestions, attempted: a.attempted, correct: a.correct, incorrect: a.incorrect, unattempted: a.unattempted, score: a.score, percentage: a.percentage };
}

const ANSWER_KINDS = Object.freeze(['optionPosition', 'optionPositions', 'value']);
const KIND_OF_TYPE = Object.freeze({ single_mcq: 'optionPosition', multi_select: 'optionPositions', numerical: 'value' });
const invalidOption = (field) => new AssessmentError('INVALID_OPTION', 'That option does not belong to this question.', { details: [{ field, code: 'INVALID_OPTION' }] });
const isPosition = (p) => Number.isInteger(p) && p >= 0 && p <= 3;

/** Shape checks that need no question: exactly one known answer field, of the right JS type. */
function parseAnswerBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AssessmentError('INVALID_REQUEST', 'Send your answer as a JSON object, e.g. { "optionPosition": 0-3 or null }.');
  }
  const extra = Object.keys(body).filter((k) => !ANSWER_KINDS.includes(k));
  if (extra.length > 0) {
    throw new AssessmentError('VALIDATION_FAILED', 'Only the answer can be sent.', { details: extra.map((field) => ({ field, code: 'UNKNOWN_FIELD' })) });
  }
  const kinds = ANSWER_KINDS.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
  if (kinds.length === 0) throw invalidOption('optionPosition');
  if (kinds.length > 1) {
    throw new AssessmentError('VALIDATION_FAILED', 'Send one answer only.', { details: kinds.map((field) => ({ field, code: 'MULTIPLE_ANSWER_FIELDS' })) });
  }
  const [kind] = kinds;
  const raw = body[kind];
  if (raw === null) return { kind, raw: null };
  if (kind === 'optionPosition' && !isPosition(raw)) throw invalidOption(kind);
  if (kind === 'optionPositions' && (!Array.isArray(raw) || raw.length > 4 || !raw.every(isPosition) || new Set(raw).size !== raw.length)) throw invalidOption(kind);
  if (kind === 'value' && typeof raw !== 'string' && typeof raw !== 'number') {
    throw new AssessmentError('INVALID_NUMBER', 'Enter a number.', { details: [{ field: 'value', code: 'INVALID_NUMBER' }] });
  }
  return { kind, raw };
}

const NUMBER_MESSAGES = Object.freeze({
  NOT_AN_INTEGER: 'Enter a whole number (no decimal point).',
  TOO_MANY_DECIMALS: 'Use at most 6 decimal places.',
  TOO_MANY_DIGITS: 'That number is too long.',
  INVALID_NUMBER: 'Enter a plain number, e.g. 42 or -3.5 (no units, commas or fractions).',
});

/** Checks the parsed answer against THIS question. Returns { saved, response } or { invalid }. */
async function checkAnswer(question, { kind, raw }) {
  if (KIND_OF_TYPE[question.type] !== kind) {
    return { invalid: new AssessmentError('WRONG_ANSWER_TYPE', 'This answer does not fit this type of question.', { details: [{ field: kind, code: 'WRONG_ANSWER_TYPE' }] }) };
  }
  const exists = (p) => question.options.some((o) => o.position === p);
  if (question.type === 'single_mcq') {
    if (raw !== null && !await exists(raw)) return { invalid: invalidOption(kind) };
    return { saved: { optionPosition: raw } };
  }
  if (question.type === 'multi_select') {
    if (raw === null || raw.length === 0) return { saved: { optionPositions: [] }, response: null };
    if (!raw.every(exists)) return { invalid: invalidOption(kind) };
    const selected = positionSet(raw);
    return { saved: { optionPositions: selected }, response: { selectedPositions: selected } };
  }
  if (raw === null) return { saved: { value: null }, response: null };
  const n = normalizeNumber(raw, question.numericAnswer ? question.numericAnswer.format : 'decimal');
  if (n.code) return { invalid: new AssessmentError('INVALID_NUMBER', NUMBER_MESSAGES[n.code], { details: [{ field: 'value', code: n.code }] }) };
  return { saved: { value: n.value }, response: { numericValue: n.value } };
}

/** The student's own saved answer, in the shape of its question type. */
function savedAnswerView(q, a) {
  if (q.type === 'numerical') return { questionId: q.id, value: a.value };
  if (q.type === 'multi_select') return { questionId: q.id, optionPositions: a.optionPositions };
  return { questionId: q.id, optionPosition: a.optionPosition };
}

function closedError(status) {
  return status === 'expired'
    ? new AssessmentError('ATTEMPT_EXPIRED', 'Time is up. Your answers were submitted automatically.', { statusCode: 409 })
    : new AssessmentError('ATTEMPT_SUBMITTED', 'This test has already been submitted.', { statusCode: 409 });
}

function requireTeacher(actor) {
  if (!actor || actor.kind !== 'teacher') throw forbidden('Only teachers can view reports.');
}

function requireStudent(actor) {
  if (!actor || actor.kind !== 'student') throw forbidden('Only students can take tests.');
}

/**
 * Step 5: where a test stands for students right now (server clock).
 * closed: closed manually, or closes_at reached. upcoming: opens_at not reached. Otherwise open.
 */
function availabilityOf(assessment, nowMs) {
  if (assessment.closedAt || (assessment.closesAt && nowMs >= Date.parse(assessment.closesAt))) return 'closed';
  if (assessment.opensAt && nowMs < Date.parse(assessment.opensAt)) return 'upcoming';
  return 'open';
}

function toId(v) {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

const iso = (ms) => new Date(ms).toISOString();
// Step 6: resets allowed per student per test (no unlimited retakes).
const MAX_RESETS_PER_STUDENT = 3;
const round2 = (x) => Math.round(x * 100) / 100;

/** Migration 008: whole-class test (no recipients stored), or this student is a selected recipient. */
async function isRecipient(lms, universityId, assessmentId, studentId) {
  return typeof lms.isAssessmentRecipient !== 'function' || await lms.isAssessmentRecipient(universityId, assessmentId, studentId);
}

module.exports = { AttemptService, MAX_RESETS_PER_STUDENT, availabilityOf };
