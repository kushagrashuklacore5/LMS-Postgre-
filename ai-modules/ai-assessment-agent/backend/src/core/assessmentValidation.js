const { AssessmentError } = require('./errors');
const { QUESTION_TYPES, NUMERIC_FORMATS, normalizeNumber } = require('./questionTypes');
const { parseImageKey } = require('./questionImage');

/**
 * Deterministic validation of teacher input. Pure functions: no database, no
 * LMS, no LLM. This is the guard every question must pass before it is
 * stored - typed by a teacher now, proposed by an LLM later (the LLM step will
 * feed its proposals through validateQuestionInput, unchanged).
 *
 * Unknown fields are rejected, not ignored: tenant, owner, status, ids and
 * timestamps belong to the server and must never come from the client.
 */
const LIMITS = Object.freeze({
  titleMax: 200,
  descriptionMax: 2000,
  subjectMax: 100,
  durationMin: 1,
  durationMax: 600,
  questionTextMax: 2000,
  optionTextMax: 500,
  explanationMax: 1000,
  optionsPerQuestion: 4,
  questionsPerAssessment: 200,
});

const ASSESSMENT_FIELDS = Object.freeze(['title', 'description', 'subject', 'classroomId', 'courseId', 'durationMinutes', 'opensAt', 'closesAt']);
// Step 5: an explicit timezone is required so the server never guesses local time.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const QUESTION_FIELDS = Object.freeze(['type', 'text', 'options', 'numericAnswer', 'explanation', 'difficulty', 'imageKey']);
const NUMERIC_ANSWER_FIELDS = Object.freeze(['format', 'value']);
const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
const OPTION_FIELDS = Object.freeze(['text', 'isCorrect']);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function fail(message, details) {
  return new AssessmentError('VALIDATION_FAILED', message, { statusCode: 400, details });
}

/** Trimmed text of 1..max chars; pushes a detail and returns undefined when invalid. */
function text(value, field, max, details, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (typeof value !== 'string') {
    details.push({ field, code: 'MUST_BE_TEXT' });
    return undefined;
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (trimmed.length > max) {
    details.push({ field, code: 'TOO_LONG', max });
    return undefined;
  }
  return trimmed;
}

/** null clears the value; otherwise a positive integer. */
function optionalId(value, field, details) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1) {
    details.push({ field, code: 'INVALID_ID' });
    return undefined;
  }
  return value;
}

function optionalDuration(value, details) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < LIMITS.durationMin || value > LIMITS.durationMax) {
    details.push({ field: 'durationMinutes', code: 'OUT_OF_RANGE', min: LIMITS.durationMin, max: LIMITS.durationMax });
    return undefined;
  }
  return value;
}

/** Step 5: null clears; otherwise an ISO-8601 datetime with timezone, normalized to UTC ("...Z"). */
function optionalDateTime(value, field, details) {
  if (value === null) return null;
  if (typeof value !== 'string' || !ISO_DATETIME.test(value) || Number.isNaN(Date.parse(value))) {
    details.push({ field, code: 'INVALID_DATETIME' });
    return undefined;
  }
  return new Date(value).toISOString();
}

function rejectUnknown(input, allowed, prefix, details) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) details.push({ field: prefix + key, code: 'UNKNOWN_FIELD' });
  }
}

/**
 * Assessment details. `partial: true` (edits) validates only the fields sent
 * and requires at least one; otherwise title and subject are required.
 * Returns only the fields present, normalized.
 */
function validateAssessmentInput(input, { partial = false } = {}) {
  if (!isPlainObject(input)) throw fail('Send the assessment as a JSON object.', [{ field: '', code: 'MUST_BE_OBJECT' }]);
  const details = [];
  rejectUnknown(input, ASSESSMENT_FIELDS, '', details);
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const out = {};

  if (!partial || has('title')) out.title = text(input.title, 'title', LIMITS.titleMax, details);
  if (!partial || has('subject')) out.subject = text(input.subject, 'subject', LIMITS.subjectMax, details);
  if (has('description')) {
    const d = text(input.description === null ? '' : input.description, 'description', LIMITS.descriptionMax, details, { required: false });
    if (d !== undefined) out.description = d;
  } else if (!partial) {
    out.description = '';
  }
  if (has('classroomId')) out.classroomId = optionalId(input.classroomId, 'classroomId', details);
  else if (!partial) out.classroomId = null;
  // The course of the class (migration 010). Sent only when chosen; the service decides whether it is required.
  if (has('courseId')) out.courseId = optionalId(input.courseId, 'courseId', details);
  if (has('durationMinutes')) out.durationMinutes = optionalDuration(input.durationMinutes, details);
  else if (!partial) out.durationMinutes = null;
  // Step 5 window fields appear in the output only when sent (absent = no window; stored as NULL).
  if (has('opensAt')) out.opensAt = optionalDateTime(input.opensAt, 'opensAt', details);
  if (has('closesAt')) out.closesAt = optionalDateTime(input.closesAt, 'closesAt', details);
  if (out.opensAt && out.closesAt && Date.parse(out.closesAt) <= Date.parse(out.opensAt)) {
    details.push({ field: 'closesAt', code: 'CLOSES_BEFORE_OPENS' });
  }

  if (partial && Object.keys(input).length === 0) details.push({ field: '', code: 'NOTHING_TO_UPDATE' });
  if (details.length > 0) throw fail('The assessment details are not valid.', details);
  return out;
}

/**
 * One question. `type` (advanced-generation step) is 'single_mcq' (the default, so every
 * pre-existing client keeps working), 'multi_select' or 'numerical'.
 *   single_mcq:   exactly 4 options with non-empty, distinct text and exactly ONE with
 *                 isCorrect === true (a strict boolean; "true", 1 or a missing flag are rejected).
 *   multi_select: the same 4 options, with 2 or more correct.
 *   numerical:    no options; numericAnswer { format: 'integer' | 'decimal', value } where value
 *                 is a plain number (stored as canonical decimal text, see questionTypes.js).
 * Optional: explanation (teacher-only text, default '') and difficulty
 * ('easy' | 'medium' | 'hard' | null, default null).
 * Returns { type, text, options: [{ text, isCorrect }], numericAnswer, explanation, difficulty }
 * (options [] and numericAnswer { format, value } for numerical; numericAnswer null otherwise).
 */
function validateQuestionInput(input) {
  if (!isPlainObject(input)) throw fail('Send the question as a JSON object.', [{ field: '', code: 'MUST_BE_OBJECT' }]);
  const details = [];
  rejectUnknown(input, QUESTION_FIELDS, '', details);
  const type = input.type === undefined || input.type === null ? 'single_mcq' : input.type;
  if (!QUESTION_TYPES.includes(type)) {
    details.push({ field: 'type', code: 'INVALID_QUESTION_TYPE' });
    throw fail('The question is not valid.', details);
  }
  const questionText = text(input.text, 'text', LIMITS.questionTextMax, details);
  const explanation = input.explanation === undefined || input.explanation === null
    ? ''
    : text(input.explanation, 'explanation', LIMITS.explanationMax, details, { required: false });
  const difficulty = input.difficulty === undefined || input.difficulty === null ? null : input.difficulty;
  if (difficulty !== null && !DIFFICULTIES.includes(difficulty)) details.push({ field: 'difficulty', code: 'INVALID_DIFFICULTY' });
  const imageKey = parseImageKey(input.imageKey, 'imageKey', details); // optional picture (core/questionImage.js)

  if (type === 'numerical') {
    const numericAnswer = numericAnswerOf(input, details);
    if (details.length > 0) throw fail('The question is not valid.', details);
    return { type, text: questionText, options: [], numericAnswer, explanation, difficulty, imageKey };
  }
  if (input.numericAnswer !== undefined && input.numericAnswer !== null) details.push({ field: 'numericAnswer', code: 'NOT_ALLOWED_FOR_TYPE' });

  const options = [];
  if (!Array.isArray(input.options)) {
    details.push({ field: 'options', code: input.options === undefined ? 'REQUIRED' : 'MUST_BE_LIST' });
  } else if (input.options.length !== LIMITS.optionsPerQuestion) {
    details.push({ field: 'options', code: 'WRONG_OPTION_COUNT', expected: LIMITS.optionsPerQuestion });
  } else {
    input.options.forEach((opt, i) => {
      const f = `options[${i}].`;
      if (!isPlainObject(opt)) {
        details.push({ field: `options[${i}]`, code: 'MUST_BE_OBJECT' });
        return;
      }
      rejectUnknown(opt, OPTION_FIELDS, f, details);
      const t = text(opt.text, f + 'text', LIMITS.optionTextMax, details);
      if (typeof opt.isCorrect !== 'boolean') details.push({ field: f + 'isCorrect', code: 'MUST_BE_BOOLEAN' });
      options.push({ text: t, isCorrect: opt.isCorrect === true });
    });
    if (details.length === 0) {
      const correct = options.filter((o) => o.isCorrect).length;
      if (type === 'single_mcq' && correct !== 1) details.push({ field: 'options', code: correct === 0 ? 'NO_CORRECT_OPTION' : 'MULTIPLE_CORRECT_OPTIONS' });
      if (type === 'multi_select' && correct < 2) details.push({ field: 'options', code: correct === 0 ? 'NO_CORRECT_OPTION' : 'TOO_FEW_CORRECT_OPTIONS' });
      const seen = new Set(options.map((o) => o.text.toLowerCase()));
      if (seen.size !== options.length) details.push({ field: 'options', code: 'DUPLICATE_OPTIONS' });
    }
  }

  if (details.length > 0) throw fail('The question is not valid.', details);
  return { type, text: questionText, options, numericAnswer: null, explanation, difficulty, imageKey };
}

/** numerical: options must be absent (or empty); numericAnswer { format, value } is required. */
function numericAnswerOf(input, details) {
  if (input.options !== undefined && input.options !== null && !(Array.isArray(input.options) && input.options.length === 0)) {
    details.push({ field: 'options', code: 'NOT_ALLOWED_FOR_TYPE' });
  }
  const na = input.numericAnswer;
  if (na === undefined || na === null) {
    details.push({ field: 'numericAnswer', code: 'REQUIRED' });
    return null;
  }
  if (!isPlainObject(na)) {
    details.push({ field: 'numericAnswer', code: 'MUST_BE_OBJECT' });
    return null;
  }
  rejectUnknown(na, NUMERIC_ANSWER_FIELDS, 'numericAnswer.', details);
  if (!NUMERIC_FORMATS.includes(na.format)) {
    details.push({ field: 'numericAnswer.format', code: 'INVALID_NUMBER_FORMAT' });
    return null;
  }
  const n = normalizeNumber(na.value, na.format);
  if (n.code) {
    details.push({ field: 'numericAnswer.value', code: n.code });
    return null;
  }
  return { format: na.format, value: n.value };
}

module.exports = { LIMITS, DIFFICULTIES, validateAssessmentInput, validateQuestionInput };
