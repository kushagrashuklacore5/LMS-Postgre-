const { AssessmentError } = require('../core/errors');
const { parseImageKey } = require('../core/questionImage');

/**
 * Descriptive Assignments - deterministic validation of teacher input. Unknown fields are
 * REJECTED: school, owner/teacher, student, status and ids are always server-derived, so a client
 * sending them (e.g. universityId, teacherId, ownerId, status) gets 400 UNKNOWN_FIELD.
 */
const LIMITS = Object.freeze({
  titleMax: 200, instructionsMax: 5000, questionTextMax: 4000, questionsMax: 50,
  marksMin: 1, marksMax: 1000, feedbackMax: 4000,
});
const ASSIGNMENT_FIELDS = Object.freeze(['title', 'instructions', 'classroomId', 'maxMarks', 'dueAt']);
const QUESTION_FIELDS = Object.freeze(['text', 'maxMarks', 'imageKey']);
const EVALUATION_FIELDS = Object.freeze(['finalMarks', 'teacherFeedback', 'questionMarks']);
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/; // explicit timezone

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (message, details) => new AssessmentError('VALIDATION_FAILED', message, { statusCode: 400, details });
const unknown = (input, allowed, prefix, details) => { for (const k of Object.keys(input)) if (!allowed.includes(k)) details.push({ field: prefix + k, code: 'UNKNOWN_FIELD' }); };

function text(value, field, max, details, required) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) details.push({ field, code: 'REQUIRED' });
    return required ? undefined : '';
  }
  if (typeof value !== 'string') { details.push({ field, code: 'MUST_BE_TEXT' }); return undefined; }
  if (value.trim().length > max) { details.push({ field, code: 'TOO_LONG', max }); return undefined; }
  return value.trim();
}

function marks(value, field, details) {
  if (!Number.isInteger(value) || value < LIMITS.marksMin || value > LIMITS.marksMax) {
    details.push({ field, code: 'OUT_OF_RANGE', min: LIMITS.marksMin, max: LIMITS.marksMax });
    return undefined;
  }
  return value;
}

/** Create (all required except instructions/dueAt) or, with partial: true, a draft edit (at least one field). */
function validateAssignmentInput(input, { partial = false } = {}) {
  if (!isObject(input)) throw fail('Send the assignment as a JSON object.', [{ field: '', code: 'MUST_BE_OBJECT' }]);
  const details = [];
  unknown(input, ASSIGNMENT_FIELDS, '', details);
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const out = {};
  if (!partial || has('title')) out.title = text(input.title, 'title', LIMITS.titleMax, details, true);
  if (has('instructions')) out.instructions = text(input.instructions, 'instructions', LIMITS.instructionsMax, details, false);
  else if (!partial) out.instructions = '';
  if (!partial || has('classroomId')) {
    if (!Number.isInteger(input.classroomId) || input.classroomId < 1) details.push({ field: 'classroomId', code: input.classroomId === undefined || input.classroomId === null ? 'REQUIRED' : 'INVALID_ID' });
    else out.classroomId = input.classroomId;
  }
  if (!partial || has('maxMarks')) out.maxMarks = marks(input.maxMarks, 'maxMarks', details);
  if (has('dueAt')) {
    if (input.dueAt === null || input.dueAt === '') out.dueAt = null;
    else if (typeof input.dueAt !== 'string' || !ISO_DATETIME.test(input.dueAt) || Number.isNaN(Date.parse(input.dueAt))) details.push({ field: 'dueAt', code: 'INVALID_DATETIME' });
    else out.dueAt = new Date(input.dueAt).toISOString();
  } else if (!partial) out.dueAt = null;
  if (partial && Object.keys(input).length === 0) details.push({ field: '', code: 'NOTHING_TO_UPDATE' });
  if (details.length > 0) throw fail('The assignment details are not valid.', details);
  return out;
}

/** { questions: [{ text, maxMarks }] } in display order. An empty list clears a draft's questions. */
function validateQuestionsInput(input) {
  if (!isObject(input)) throw fail('Send { questions: [...] }.', [{ field: '', code: 'MUST_BE_OBJECT' }]);
  const details = [];
  unknown(input, ['questions'], '', details);
  const list = input.questions;
  if (!Array.isArray(list)) throw fail('Send { questions: [...] }.', [...details, { field: 'questions', code: 'MUST_BE_LIST' }]);
  if (list.length > LIMITS.questionsMax) details.push({ field: 'questions', code: 'TOO_MANY_QUESTIONS', max: LIMITS.questionsMax });
  const questions = list.slice(0, LIMITS.questionsMax).map((q, i) => {
    const at = `questions[${i}].`;
    if (!isObject(q)) { details.push({ field: `questions[${i}]`, code: 'MUST_BE_OBJECT' }); return null; }
    unknown(q, QUESTION_FIELDS, at, details);
    return {
      text: text(q.text, `${at}text`, LIMITS.questionTextMax, details, true),
      maxMarks: marks(q.maxMarks, `${at}maxMarks`, details),
      imageKey: parseImageKey(q.imageKey, `${at}imageKey`, details), // optional picture
    };
  });
  if (details.length > 0) throw fail('The questions are not valid.', details);
  return questions;
}

const halfStep = (m, max) => typeof m === 'number' && Number.isFinite(m) && m >= 0 && m <= max && Math.round(m * 2) === m * 2;

/**
 * Teacher's FINAL marks (authoritative): { finalMarks?, questionMarks?, teacherFeedback? }.
 *   questionMarks: [{ questionId: 'Q1', marks }] covering EVERY question exactly once, each 0..its max in
 *   steps of 0.5; the total is then computed by the server (a finalMarks sent alongside must equal it).
 *   Without questionMarks: finalMarks 0..maxMarks in steps of 0.5 (the original manual marking).
 * @param questions [{ position, maxMarks }] of the assignment
 */
function validateEvaluationInput(input, maxMarks, questions = []) {
  if (!isObject(input)) throw fail('Send { finalMarks, teacherFeedback? }.', [{ field: '', code: 'MUST_BE_OBJECT' }]);
  const details = [];
  unknown(input, EVALUATION_FIELDS, '', details);
  let finalMarks = input.finalMarks;
  let questionMarks = null;
  if (input.questionMarks !== undefined && input.questionMarks !== null) {
    const max = new Map(questions.map((q) => [`Q${q.position}`, q.maxMarks]));
    const list = input.questionMarks;
    if (!Array.isArray(list)) details.push({ field: 'questionMarks', code: 'MUST_BE_LIST' });
    else {
      const seen = new Set();
      list.forEach((q, i) => {
        const at = `questionMarks[${i}]`;
        if (!isObject(q)) { details.push({ field: at, code: 'MUST_BE_OBJECT' }); return; }
        unknown(q, ['questionId', 'marks'], `${at}.`, details);
        if (!max.has(q.questionId)) { details.push({ field: `${at}.questionId`, code: 'UNKNOWN_QUESTION' }); return; }
        if (seen.has(q.questionId)) { details.push({ field: `${at}.questionId`, code: 'DUPLICATE_QUESTION' }); return; }
        seen.add(q.questionId);
        if (!halfStep(q.marks, max.get(q.questionId))) details.push({ field: `${at}.marks`, code: 'OUT_OF_RANGE', min: 0, max: max.get(q.questionId), step: 0.5 });
      });
      if (seen.size !== max.size && !details.some((d) => d.field.startsWith('questionMarks'))) details.push({ field: 'questionMarks', code: 'MISSING_QUESTION' });
      if (details.length === 0) {
        const order = [...max.keys()];
        questionMarks = list.map((q) => ({ questionId: q.questionId, marks: q.marks })).sort((a, b) => order.indexOf(a.questionId) - order.indexOf(b.questionId));
        const sum = questionMarks.reduce((s, q) => s + q.marks, 0);
        if (finalMarks !== undefined && finalMarks !== null && finalMarks !== sum) details.push({ field: 'finalMarks', code: 'TOTAL_MISMATCH' });
        finalMarks = sum;
      }
    }
  } else if (!halfStep(finalMarks, maxMarks)) {
    details.push({ field: 'finalMarks', code: 'OUT_OF_RANGE', min: 0, max: maxMarks, step: 0.5 });
  }
  const teacherFeedback = text(input.teacherFeedback, 'teacherFeedback', LIMITS.feedbackMax, details, false);
  if (details.length > 0) throw fail('The marks are not valid.', details);
  return { finalMarks, questionMarks, teacherFeedback: teacherFeedback || null };
}

module.exports = { LIMITS, validateAssignmentInput, validateQuestionsInput, validateEvaluationInput };
