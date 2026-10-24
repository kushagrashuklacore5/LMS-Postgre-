const { DIFFICULTIES, LIMITS } = require('../assessmentValidation');
const { NUMERIC_FORMATS, normalizeNumber } = require('../questionTypes');

/**
 * STRICT structural validation of the model's raw text. Deterministic; the
 * model's JSON is never trusted.
 *
 * Expected, and nothing else (per requested question type):
 *   single_mcq:   { "questions": [ { "question", "options": [4 strings], "correctAnswer": string, "explanation", "difficulty" } ] }
 *   multi_select: { "questions": [ { "question", "options": [4 strings], "correctAnswers": [2-4 strings], "explanation", "difficulty" } ] }
 *   numerical:    { "questions": [ { "question", "answer": "42" | "-3.5", "answerFormat": "integer"|"decimal", "explanation", "difficulty" } ] }
 * A field of another type (e.g. "options" on a numerical question) is an UNEXPECTED_FIELD.
 *
 * The only normalization is safe normalization: surrounding whitespace is
 * trimmed, and ONE wrapping ```json fence around the whole text is removed.
 * Nothing is repaired, guessed or filled in. A question whose correctAnswer
 * does not exactly match (ignoring case and spacing) one of its options is
 * rejected, never "fixed".
 *
 * Returns { questions, problems }: questions in the teacher-input shape
 * ({ type, text, options, numericAnswer, explanation, difficulty }); problems = [{ field, code }]
 * with codes and locations only, never model text. The caller rejects the WHOLE response
 * when any problem exists.
 */
const TOP_FIELDS = Object.freeze(['questions']);
const QUESTION_FIELDS = Object.freeze({
  single_mcq: ['question', 'options', 'correctAnswer', 'explanation', 'difficulty'],
  multi_select: ['question', 'options', 'correctAnswers', 'explanation', 'difficulty'],
  numerical: ['question', 'answer', 'answerFormat', 'explanation', 'difficulty'],
});

/** Case/spacing-insensitive form used for matching and duplicate checks. */
const norm = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
/** Looser form for duplicate QUESTIONS: punctuation is ignored too. */
const questionKey = (s) => norm(s).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

function stripFence(raw) {
  const t = raw.trim();
  const m = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(t);
  return m ? m[1].trim() : t;
}

function parseGeneratedOutput(raw, { count, avoidQuestions = [], questionType = 'single_mcq', numericFormat = null }) {
  const fields = QUESTION_FIELDS[questionType];
  const problems = [];
  if (typeof raw !== 'string' || raw.trim() === '') return { questions: [], problems: [{ field: '', code: 'EMPTY_OUTPUT' }] };

  let data;
  try {
    data = JSON.parse(stripFence(raw));
  } catch {
    return { questions: [], problems: [{ field: '', code: 'INVALID_JSON' }] };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { questions: [], problems: [{ field: '', code: 'NOT_AN_OBJECT' }] };
  for (const k of Object.keys(data)) if (!TOP_FIELDS.includes(k)) problems.push({ field: k, code: 'UNEXPECTED_FIELD' });
  if (!Array.isArray(data.questions)) {
    problems.push({ field: 'questions', code: 'MISSING_QUESTIONS' });
    return { questions: [], problems };
  }
  if (data.questions.length !== count) problems.push({ field: 'questions', code: 'WRONG_QUESTION_COUNT', expected: count, received: data.questions.length });

  const questions = [];
  data.questions.forEach((q, i) => {
    const at = (f) => `questions[${i}]${f ? '.' + f : ''}`;
    if (q === null || typeof q !== 'object' || Array.isArray(q)) { problems.push({ field: at(''), code: 'NOT_AN_OBJECT' }); return; }
    const before = problems.length;
    for (const k of Object.keys(q)) if (!fields.includes(k)) problems.push({ field: at(k), code: 'UNEXPECTED_FIELD' });

    const str = (field, max) => {
      const v = q[field];
      if (v === undefined || v === null) { problems.push({ field: at(field), code: 'MISSING_FIELD' }); return null; }
      if (typeof v !== 'string') { problems.push({ field: at(field), code: 'WRONG_TYPE' }); return null; }
      const t = v.trim();
      if (t === '') { problems.push({ field: at(field), code: 'EMPTY' }); return null; }
      if (t.length > max) { problems.push({ field: at(field), code: 'TOO_LONG' }); return null; }
      return t;
    };

    const text = str('question', LIMITS.questionTextMax);
    const explanation = str('explanation', LIMITS.explanationMax);

    const difficulty = q.difficulty;
    if (difficulty === undefined || difficulty === null) problems.push({ field: at('difficulty'), code: 'MISSING_FIELD' });
    else if (!DIFFICULTIES.includes(difficulty)) problems.push({ field: at('difficulty'), code: 'INVALID_DIFFICULTY' });

    if (questionType === 'numerical') {
      const numericAnswer = numericAnswerOf(q, at, problems, numericFormat);
      if (problems.length === before && text && explanation && numericAnswer) {
        questions.push({ type: 'numerical', text, options: [], numericAnswer, explanation, difficulty });
      }
      return;
    }

    let options = null;
    if (q.options === undefined || q.options === null) problems.push({ field: at('options'), code: 'MISSING_FIELD' });
    else if (!Array.isArray(q.options)) problems.push({ field: at('options'), code: 'WRONG_TYPE' });
    else if (q.options.length !== LIMITS.optionsPerQuestion) problems.push({ field: at('options'), code: 'WRONG_OPTION_COUNT' });
    else {
      options = q.options.map((o, j) => {
        if (typeof o !== 'string') { problems.push({ field: at(`options[${j}]`), code: 'WRONG_TYPE' }); return null; }
        const t = o.trim();
        if (t === '') { problems.push({ field: at(`options[${j}]`), code: 'EMPTY' }); return null; }
        if (t.length > LIMITS.optionTextMax) { problems.push({ field: at(`options[${j}]`), code: 'TOO_LONG' }); return null; }
        return t;
      });
      if (options.every((o) => o !== null) && new Set(options.map(norm)).size !== options.length) {
        problems.push({ field: at('options'), code: 'DUPLICATE_OPTIONS' });
      }
    }

    if (questionType === 'multi_select') {
      const correct = correctSetOf(q, at, problems, options);
      if (problems.length === before && text && explanation && options && correct) {
        questions.push({ type: 'multi_select', text, options: options.map((t, j) => ({ text: t, isCorrect: correct.has(j) })), numericAnswer: null, explanation, difficulty });
      }
      return;
    }

    let correctIndex = -1;
    const ca = q.correctAnswer;
    if (ca === undefined || ca === null || (typeof ca === 'string' && ca.trim() === '')) {
      problems.push({ field: at('correctAnswer'), code: 'MISSING_CORRECT_ANSWER' });
    } else if (Array.isArray(ca)) {
      problems.push({ field: at('correctAnswer'), code: ca.length > 1 ? 'MULTIPLE_CORRECT_ANSWERS' : 'WRONG_TYPE' });
    } else if (typeof ca !== 'string') {
      problems.push({ field: at('correctAnswer'), code: 'WRONG_TYPE' });
    } else if (options && options.every((o) => o !== null)) {
      const matches = options.map((o, j) => (norm(o) === norm(ca) ? j : -1)).filter((j) => j >= 0);
      if (matches.length === 0) problems.push({ field: at('correctAnswer'), code: 'CORRECT_ANSWER_NOT_IN_OPTIONS' });
      else if (matches.length > 1) problems.push({ field: at('correctAnswer'), code: 'MULTIPLE_CORRECT_ANSWERS' });
      else correctIndex = matches[0];
    }

    if (problems.length === before && text && explanation && options && correctIndex >= 0) {
      questions.push({
        type: 'single_mcq',
        text,
        options: options.map((t, j) => ({ text: t, isCorrect: j === correctIndex })),
        numericAnswer: null,
        explanation,
        difficulty,
      });
    }
  });

  // Duplicate questions, within the response and against the ones the teacher already has.
  const seen = new Map();
  const existing = new Set(avoidQuestions.map(questionKey));
  data.questions.forEach((q, i) => {
    if (!q || typeof q.question !== 'string' || q.question.trim() === '') return;
    const key = questionKey(q.question);
    if (seen.has(key)) problems.push({ field: `questions[${i}].question`, code: 'DUPLICATE_QUESTION' });
    else seen.set(key, i);
    if (existing.has(key)) problems.push({ field: `questions[${i}].question`, code: 'DUPLICATE_OF_EXISTING_QUESTION' });
  });

  return { questions, problems };
}

/** multi_select: "correctAnswers" = 2-4 distinct option texts. Returns a Set of option indexes or null. */
function correctSetOf(q, at, problems, options) {
  const ca = q.correctAnswers;
  if (ca === undefined || ca === null) { problems.push({ field: at('correctAnswers'), code: 'MISSING_CORRECT_ANSWER' }); return null; }
  if (!Array.isArray(ca) || !ca.every((c) => typeof c === 'string')) { problems.push({ field: at('correctAnswers'), code: 'WRONG_TYPE' }); return null; }
  if (ca.length < 2) { problems.push({ field: at('correctAnswers'), code: 'TOO_FEW_CORRECT_ANSWERS' }); return null; }
  if (new Set(ca.map(norm)).size !== ca.length) { problems.push({ field: at('correctAnswers'), code: 'DUPLICATE_CORRECT_ANSWERS' }); return null; }
  if (!options || !options.every((o) => o !== null)) return null;
  const set = new Set();
  for (const c of ca) {
    const matches = options.map((o, j) => (norm(o) === norm(c) ? j : -1)).filter((j) => j >= 0);
    if (matches.length !== 1) { problems.push({ field: at('correctAnswers'), code: 'CORRECT_ANSWER_NOT_IN_OPTIONS' }); return null; }
    set.add(matches[0]);
  }
  return set;
}

/** numerical: "answer" is plain number TEXT valid for "answerFormat" (and for the requested format, if any). */
function numericAnswerOf(q, at, problems, requestedFormat) {
  const format = q.answerFormat;
  if (format === undefined || format === null) { problems.push({ field: at('answerFormat'), code: 'MISSING_FIELD' }); return null; }
  if (!NUMERIC_FORMATS.includes(format)) { problems.push({ field: at('answerFormat'), code: 'INVALID_ANSWER_FORMAT' }); return null; }
  if (requestedFormat && format !== requestedFormat) { problems.push({ field: at('answerFormat'), code: 'ANSWER_FORMAT_MISMATCH' }); return null; }
  const a = q.answer;
  if (a === undefined || a === null || (typeof a === 'string' && a.trim() === '')) { problems.push({ field: at('answer'), code: 'MISSING_CORRECT_ANSWER' }); return null; }
  if (typeof a !== 'string') { problems.push({ field: at('answer'), code: 'WRONG_TYPE' }); return null; }
  const n = normalizeNumber(a, format);
  if (n.code) { problems.push({ field: at('answer'), code: n.code === 'NOT_AN_INTEGER' ? 'ANSWER_FORMAT_MISMATCH' : 'INVALID_NUMERIC_ANSWER' }); return null; }
  return { format, value: n.value };
}

module.exports = { parseGeneratedOutput, questionKey };
