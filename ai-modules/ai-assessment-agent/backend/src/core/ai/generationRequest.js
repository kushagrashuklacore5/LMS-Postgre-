const { AssessmentError } = require('../errors');
const { DIFFICULTIES, LIMITS } = require('../assessmentValidation');
const { QUESTION_TYPES, NUMERIC_FORMATS } = require('../questionTypes');
const { TEMPLATE_IDS } = require('./generationTemplates');
const { INJECTION, MARKUP } = require('./contentGuard');

/**
 * Validates what a teacher asks the AI for. Pure and deterministic.
 * Unknown fields are rejected (tenant, owner and ids never come from the client).
 *
 * { topic, subject, classroomId?, count, difficulty, instructions?, avoidQuestions?,
 *   questionType?, numericFormat?, template? }
 *   difficulty:     easy | medium | hard | mixed (mixed = a progression from easier to harder)
 *   questionType:   single_mcq (default, as before) | multi_select | numerical
 *   numericFormat:  numerical only: integer | decimal (absent = the model picks per question)
 *   template:       an educational intent id (generationTemplates.js) or absent
 *   instructions:   the teacher's refinement (<= 500 chars). Screened BEFORE any LLM call:
 *                   text that tries to steer the AI (prompt-injection patterns), markup or links
 *                   is refused with 400 and nothing is sent.
 *   avoidQuestions: texts of questions already in the teacher's review, so a
 *                   "regenerate" does not repeat them. Teacher-visible text only, never student data.
 * 'teacher_custom' needs instructions (they ARE the intent).
 */
const GENERATION_LIMITS = Object.freeze({
  topicMax: 200,
  instructionsMax: 500,
  countMin: 1,
  countMax: 20,
  avoidMax: 50,
});
const GENERATION_DIFFICULTIES = Object.freeze([...DIFFICULTIES, 'mixed']);

const FIELDS = Object.freeze(['topic', 'subject', 'classroomId', 'count', 'difficulty', 'instructions', 'avoidQuestions', 'questionType', 'numericFormat', 'template']);

// Teacher instructions only (on top of the shared INJECTION/MARKUP patterns): attempts to re-define
// the model's role or its output format. Ordinary teaching wording ("use real-life examples",
// "write as a board-style question") is not affected.
const INSTRUCTION_ONLY = [
  /\byou are (now )?(an?|the)\b[^.\n]{0,40}\b(ai|assistant|model|chatbot|llm|bot)\b/i,
  /\b(return|respond|reply|answer|output|write)\b[^.\n]{0,20}\b(in|as)\s+(plain text|markdown|html|xml|yaml|csv|prose)\b/i,
  /\b(instead of|rather than|without|not in|no)\s+(the\s+)?json\b/i,
  /\b(change|ignore|break|skip)\b[^.\n]{0,20}\b(format|schema|rules?)\b/i,
  /<\/?[a-z][^>]*>/i, // any HTML tag: instructions are plain text
];

/** Teacher free text that tries to steer the model, or carries markup/links (shared with the report focus). */
function unsafeInstructions(text) {
  return [...INJECTION, ...MARKUP, ...INSTRUCTION_ONLY].some((re) => re.test(text));
}

function validateGenerationRequest(input) {
  const details = [];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new AssessmentError('VALIDATION_FAILED', 'Send the generation request as a JSON object.', { details: [{ field: '', code: 'MUST_BE_OBJECT' }] });
  }
  for (const key of Object.keys(input)) if (!FIELDS.includes(key)) details.push({ field: key, code: 'UNKNOWN_FIELD' });

  const text = (field, max, required) => {
    const v = input[field];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
      if (required) details.push({ field, code: 'REQUIRED' });
      return '';
    }
    if (typeof v !== 'string') { details.push({ field, code: 'MUST_BE_TEXT' }); return ''; }
    if (v.trim().length > max) { details.push({ field, code: 'TOO_LONG', max }); return ''; }
    return v.trim();
  };

  const topic = text('topic', GENERATION_LIMITS.topicMax, true);
  const subject = text('subject', LIMITS.subjectMax, true);
  const instructions = text('instructions', GENERATION_LIMITS.instructionsMax, false);
  if (instructions && unsafeInstructions(instructions)) {
    details.push({ field: 'instructions', code: 'UNSAFE_INSTRUCTIONS' });
  }

  // Required: questions are always generated FOR a class, so the academic level is known.
  let classroomId = null;
  if (input.classroomId === undefined || input.classroomId === null || input.classroomId === '') {
    details.push({ field: 'classroomId', code: 'REQUIRED' });
  } else if (Number.isInteger(input.classroomId) && input.classroomId >= 1) {
    classroomId = input.classroomId;
  } else {
    details.push({ field: 'classroomId', code: 'INVALID_ID' });
  }

  const count = input.count;
  if (!Number.isInteger(count) || count < GENERATION_LIMITS.countMin || count > GENERATION_LIMITS.countMax) {
    details.push({ field: 'count', code: 'OUT_OF_RANGE', min: GENERATION_LIMITS.countMin, max: GENERATION_LIMITS.countMax });
  }

  if (!GENERATION_DIFFICULTIES.includes(input.difficulty)) details.push({ field: 'difficulty', code: 'INVALID_DIFFICULTY' });

  const questionType = input.questionType === undefined || input.questionType === null ? 'single_mcq' : input.questionType;
  if (!QUESTION_TYPES.includes(questionType)) details.push({ field: 'questionType', code: 'INVALID_QUESTION_TYPE' });

  let numericFormat = null;
  if (input.numericFormat !== undefined && input.numericFormat !== null) {
    if (questionType !== 'numerical') details.push({ field: 'numericFormat', code: 'NOT_ALLOWED_FOR_TYPE' });
    else if (!NUMERIC_FORMATS.includes(input.numericFormat)) details.push({ field: 'numericFormat', code: 'INVALID_NUMBER_FORMAT' });
    else numericFormat = input.numericFormat;
  }

  let template = null;
  if (input.template !== undefined && input.template !== null && input.template !== '') {
    if (!TEMPLATE_IDS.includes(input.template)) details.push({ field: 'template', code: 'INVALID_TEMPLATE' });
    else template = input.template;
  }
  if (template === 'teacher_custom' && !instructions && !details.some((d) => d.field === 'instructions')) {
    details.push({ field: 'instructions', code: 'REQUIRED' });
  }

  let avoidQuestions = [];
  if (input.avoidQuestions !== undefined && input.avoidQuestions !== null) {
    const list = input.avoidQuestions;
    if (!Array.isArray(list) || list.length > GENERATION_LIMITS.avoidMax
      || !list.every((q) => typeof q === 'string' && q.trim() !== '' && q.length <= LIMITS.questionTextMax)) {
      details.push({ field: 'avoidQuestions', code: 'INVALID_LIST' });
    } else {
      avoidQuestions = list.map((q) => q.trim());
    }
  }

  if (details.length > 0) throw new AssessmentError('VALIDATION_FAILED', 'The generation request is not valid.', { details });
  return Object.freeze({ topic, subject, classroomId, count, difficulty: input.difficulty, instructions, avoidQuestions, questionType, numericFormat, template });
}

module.exports = { validateGenerationRequest, unsafeInstructions, GENERATION_LIMITS, GENERATION_DIFFICULTIES };
