/**
 * Step 2 (advanced generation): question types. Pure and deterministic; no database, no LLM.
 *
 *   single_mcq    4 options, exactly 1 correct              (the original MCQ; the default)
 *   multi_select  4 options, 2 or more correct              correct only if the chosen SET equals the correct set
 *   numerical     no options; a numeric answer key          correct only if the canonical numbers are equal
 *
 * Numbers are handled as canonical DECIMAL TEXT, never as floats, so "2.50", "+2.5" and "02.5"
 * all become "2.5" and no binary rounding can make a right answer wrong. Formats:
 *   integer   whole numbers only ("3.0" is refused, not rounded)
 *   decimal   any plain decimal (a whole number is also a valid decimal)
 * Plain digits only: no units, thousands separators, fractions or scientific notation.
 * Exact comparison for now; a tolerance/range belongs in numericAnswer later (e.g. a
 * `tolerance` field) and only changes numbersMatch().
 */
const QUESTION_TYPES = Object.freeze(['single_mcq', 'multi_select', 'numerical']);
const MCQ_TYPES = Object.freeze(['single_mcq', 'multi_select']);
const NUMERIC_FORMATS = Object.freeze(['integer', 'decimal']);
const NUMERIC_LIMITS = Object.freeze({ maxInputLength: 40, maxDigits: 15, maxDecimals: 6 });

const NUMBER = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/**
 * Normalizes a number typed by a teacher/student or proposed by the model.
 * Returns { value } (canonical text) or { code } (INVALID_NUMBER | NOT_AN_INTEGER | TOO_MANY_DIGITS | TOO_MANY_DECIMALS).
 */
function normalizeNumber(raw, format) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { code: 'INVALID_NUMBER' };
    raw = String(raw); // exponent forms such as 1e21 are refused below
  }
  if (typeof raw !== 'string') return { code: 'INVALID_NUMBER' };
  const t = raw.trim();
  if (t.length === 0 || t.length > NUMERIC_LIMITS.maxInputLength) return { code: 'INVALID_NUMBER' };
  const m = NUMBER.exec(t);
  if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return { code: 'INVALID_NUMBER' };
  const [, sign, intRaw, fracRaw] = m;
  if (format === 'integer' && fracRaw !== undefined) return { code: 'NOT_AN_INTEGER' };
  const int = intRaw.replace(/^0+(?=\d)/, '') || '0';
  const frac = (fracRaw || '').replace(/0+$/, '');
  if (frac.length > NUMERIC_LIMITS.maxDecimals) return { code: 'TOO_MANY_DECIMALS' };
  if (int.replace(/^0$/, '').length + frac.length > NUMERIC_LIMITS.maxDigits) return { code: 'TOO_MANY_DIGITS' };
  const body = frac ? `${int}.${frac}` : int;
  return { value: body === '0' || sign !== '-' ? body : `-${body}` };
}

/** Exact comparison of canonical numbers (the single place a future tolerance would go). */
function numbersMatch(expected, given) {
  return typeof expected === 'string' && typeof given === 'string' && expected === given;
}

/** Sorted, de-duplicated option positions. */
const positionSet = (positions) => [...new Set(positions)].sort((a, b) => a - b);

/**
 * Server-side grading of ONE answered question. `answer` is what listAnswers returns
 * ({ optionPosition, optionPositions, value }); unanswered questions are not graded here.
 * No partial credit.
 */
function isAnswerCorrect(question, answer) {
  if (question.type === 'numerical') {
    return !!question.numericAnswer && numbersMatch(question.numericAnswer.value, answer.value);
  }
  const correct = question.options.filter((o) => o.isCorrect).map((o) => o.position);
  if (question.type === 'multi_select') {
    if (!Array.isArray(answer.optionPositions) || correct.length < 2) return false;
    const chosen = positionSet(answer.optionPositions);
    return chosen.length === correct.length && chosen.every((p, i) => p === correct[i]);
  }
  return correct.length === 1 && answer.optionPosition === correct[0];
}

/** Whether a stored answer row actually holds an answer for this question's type. */
function hasAnswer(question, answer) {
  if (!answer) return false;
  if (question.type === 'numerical') return typeof answer.value === 'string';
  if (question.type === 'multi_select') return Array.isArray(answer.optionPositions) && answer.optionPositions.length > 0;
  return Number.isInteger(answer.optionPosition);
}

/** What a STUDENT may see of a question: never isCorrect, never the numeric answer, never the explanation. */
function studentQuestionView(q) {
  const base = { id: q.id, position: q.position, type: q.type, text: q.text, hasImage: !!q.imageKey }; // the key itself is teacher-only
  if (q.type === 'numerical') return { ...base, options: [], numericFormat: q.numericAnswer ? q.numericAnswer.format : null };
  return { ...base, options: q.options.map((o) => ({ position: o.position, text: o.text })) };
}

module.exports = {
  QUESTION_TYPES, MCQ_TYPES, NUMERIC_FORMATS, NUMERIC_LIMITS,
  normalizeNumber, numbersMatch, positionSet, isAnswerCorrect, hasAnswer, studentQuestionView,
};
