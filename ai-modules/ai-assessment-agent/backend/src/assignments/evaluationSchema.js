const { INJECTION, MARKUP } = require('../core/ai/contentGuard');
const { BANNED_CLAIMS, PREDICTION, CERTAINTY, HYPE, CHATBOT, FIRST_PERSON } = require('../core/ai/analysisSchema');

/**
 * Descriptive Assignments (Prompt 2) - STRICT schema + validator for an AI evaluation (deterministic).
 * The model's text and numbers are never trusted. All-or-nothing: any problem rejects the evaluation
 * (AI_OUTPUT_REJECTED; codes + locations only; nothing is stored).
 *
 *   { questions: [{ questionId: "Q1", marksAwarded, maxMarks, feedback }], totalMarksAwarded, totalMarks,
 *     overallFeedback, limitations: [string] }
 *
 * - every assignment question exactly once (no unknown, missing or duplicate ids);
 * - 0 <= marksAwarded <= that question's max, in steps of 0.5 (the marking scale teachers use);
 * - maxMarks must equal the SERVER's value; totalMarks must equal the assignment total;
 * - totalMarksAwarded must equal the sum (and the server returns its own sum anyway);
 * - feedback: concise; no psychological/personality/health/family claims, predictions, certainty
 *   claims, hype/chatbot talk, HTML/links, prompt injection, provider/error text, or any of the
 *   student/teacher/school/class names the server redacted.
 */
const LIMITS = Object.freeze({ feedbackMax: 600, overallMax: 1200, limitationMax: 300, limitationsMax: 6 });
const TOP = ['questions', 'totalMarksAwarded', 'totalMarks', 'overallFeedback', 'limitations'];
const ITEM = ['questionId', 'marksAwarded', 'maxMarks', 'feedback'];
const PROVIDER_TEXT = /\b(rate[- ]?limit(ed)?|quota|api[ _-]?key|status code|HTTP \d{3}|internal server error|service unavailable|timed? ?out|token limit|context length)\b/i;

const NUM = { type: 'NUMBER' };
const STR = { type: 'STRING' };
const EVALUATION_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { questionId: STR, marksAwarded: NUM, maxMarks: NUM, feedback: STR }, required: ITEM } },
    totalMarksAwarded: NUM,
    totalMarks: NUM,
    overallFeedback: STR,
    limitations: { type: 'ARRAY', items: STR },
  },
  required: TOP,
});

function stripFence(raw) {
  const t = raw.trim();
  const m = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(t);
  return m ? m[1].trim() : t;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isHalfStep = (x) => typeof x === 'number' && Number.isFinite(x) && Math.round(x * 2) === x * 2;

/**
 * @param raw  model text
 * @param ctx  { questions: [{ id: 'Q1', maxMarks }], totalMarks, redactions: [names that must not appear] }
 * @returns { content, problems } content (server totals) only when problems is empty
 */
function validateAssignmentEvaluation(raw, ctx) {
  const problems = [];
  const add = (field, code) => { if (!problems.some((p) => p.field === field && p.code === code)) problems.push({ field, code }); };
  if (typeof raw !== 'string' || raw.trim() === '') return { content: null, problems: [{ field: '', code: 'EMPTY_OUTPUT' }] };
  let data;
  try { data = JSON.parse(stripFence(raw)); } catch { return { content: null, problems: [{ field: '', code: 'INVALID_JSON' }] }; }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { content: null, problems: [{ field: '', code: 'NOT_AN_OBJECT' }] };
  for (const k of Object.keys(data)) if (!TOP.includes(k)) add(k, 'UNEXPECTED_FIELD');
  for (const k of TOP) if (!(k in data)) add(k, 'MISSING_FIELD');

  const texts = [];
  const text = (field, value, max) => {
    if (typeof value !== 'string') { add(field, 'WRONG_TYPE'); return null; }
    const t = value.trim();
    if (!t) { add(field, 'EMPTY'); return null; }
    if (t.length > max) { add(field, 'TOO_LONG'); return null; }
    texts.push([field, t]);
    return t;
  };

  const expected = new Map(ctx.questions.map((q) => [q.id, q.maxMarks]));
  const seen = new Set();
  const questions = [];
  if (!Array.isArray(data.questions)) { if ('questions' in data) add('questions', 'WRONG_TYPE'); } else {
    data.questions.forEach((q, i) => {
      const at = `questions[${i}]`;
      if (q === null || typeof q !== 'object' || Array.isArray(q)) { add(at, 'NOT_AN_OBJECT'); return; }
      for (const k of Object.keys(q)) if (!ITEM.includes(k)) add(`${at}.${k}`, 'UNEXPECTED_FIELD');
      for (const k of ITEM) if (!(k in q)) add(`${at}.${k}`, 'MISSING_FIELD');
      const id = typeof q.questionId === 'string' ? q.questionId.trim().toUpperCase() : null;
      if (!id || !expected.has(id)) { add(`${at}.questionId`, 'UNKNOWN_QUESTION'); return; }
      if (seen.has(id)) { add(`${at}.questionId`, 'DUPLICATE_QUESTION'); return; }
      seen.add(id);
      const max = expected.get(id);
      if (q.maxMarks !== max) add(`${at}.maxMarks`, 'MAX_MARKS_MISMATCH');
      const m = q.marksAwarded;
      if (typeof m !== 'number' || !Number.isFinite(m)) add(`${at}.marksAwarded`, 'WRONG_TYPE');
      else if (m < 0) add(`${at}.marksAwarded`, 'NEGATIVE_MARKS');
      else if (m > max) add(`${at}.marksAwarded`, 'MARKS_ABOVE_MAXIMUM');
      else if (!isHalfStep(m)) add(`${at}.marksAwarded`, 'INVALID_MARKS_STEP');
      const feedback = text(`${at}.feedback`, q.feedback, LIMITS.feedbackMax);
      questions.push({ questionId: id, marksAwarded: m, maxMarks: max, feedback });
    });
    for (const id of expected.keys()) if (!seen.has(id)) add('questions', 'MISSING_QUESTION');
  }

  const serverTotal = questions.reduce((s, q) => s + (typeof q.marksAwarded === 'number' ? q.marksAwarded : 0), 0);
  if ('totalMarks' in data && data.totalMarks !== ctx.totalMarks) add('totalMarks', 'TOTAL_MARKS_MISMATCH');
  if ('totalMarksAwarded' in data && data.totalMarksAwarded !== serverTotal) add('totalMarksAwarded', 'INCORRECT_TOTAL');
  const overallFeedback = 'overallFeedback' in data ? text('overallFeedback', data.overallFeedback, LIMITS.overallMax) : null;
  let limitations = [];
  if ('limitations' in data) {
    if (!Array.isArray(data.limitations) || data.limitations.length > LIMITS.limitationsMax) add('limitations', Array.isArray(data.limitations) ? 'WRONG_ITEM_COUNT' : 'WRONG_TYPE');
    else limitations = data.limitations.map((l, i) => text(`limitations[${i}]`, l, LIMITS.limitationMax));
  }

  const names = (ctx.redactions || []).map((n) => String(n || '').trim()).filter((n) => n.length >= 3);
  for (const [field, t] of texts) {
    if (INJECTION.some((re) => re.test(t))) add(field, 'PROMPT_INJECTION');
    if (MARKUP.some((re) => re.test(t))) add(field, 'UNSAFE_MARKUP');
    if (BANNED_CLAIMS.some((re) => re.test(t))) add(field, 'BANNED_CLAIM');
    if (PREDICTION.test(t)) add(field, 'UNSUPPORTED_PREDICTION');
    if (CERTAINTY.test(t)) add(field, 'OVERSTATED_CERTAINTY');
    if (HYPE.test(t) || CHATBOT.test(t) || FIRST_PERSON.test(t)) add(field, 'UNPROFESSIONAL_LANGUAGE');
    if (PROVIDER_TEXT.test(t)) add(field, 'PROVIDER_TEXT');
    if (!/\p{L}/u.test(t) || /([^\d\s])\1{7,}/u.test(t)) add(field, 'GIBBERISH');
    if (names.some((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(n)}(?![\\p{L}\\p{N}])`, 'iu').test(t))) add(field, 'IDENTITY_LEAK');
  }
  if (problems.length > 0) return { content: null, problems };
  const order = ctx.questions.map((q) => q.id);
  questions.sort((a, b) => order.indexOf(a.questionId) - order.indexOf(b.questionId));
  return { content: { questions, suggestedTotal: serverTotal, totalMarks: ctx.totalMarks, overallFeedback, limitations }, problems };
}

module.exports = { validateAssignmentEvaluation, EVALUATION_SCHEMA, LIMITS };
