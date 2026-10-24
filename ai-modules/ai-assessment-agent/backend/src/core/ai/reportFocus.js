const { AssessmentError } = require('../errors');
const { unsafeInstructions } = require('./generationRequest');

/**
 * AI Performance Report - teacher-controlled report focus (professional report step).
 *
 * The focus steers WHAT the report emphasises; it never changes the safety rules, the output
 * schema, the privacy rules or the data. Guidance text lives here on the server: the client sends
 * only an id (+ optional instructions). No focus = 'overall_progress'.
 *
 * Prompt hierarchy: system safety/schema -> report focus -> teacher instructions -> student data.
 */
const REPORT_FOCUSES = Object.freeze([
  {
    id: 'overall_progress',
    label: 'Overall Academic Progress',
    description: 'A balanced view of results, completion, consistency and trend across all assessments.',
    guidance: 'Give a balanced overview of the student\'s results across all supplied assessments: scores, completion, consistency, recent results and trend.',
  },
  {
    id: 'weak_concepts',
    label: 'Identify Weak Concepts',
    description: 'Where accuracy is lowest: subjects, difficulty levels and missed question samples.',
    guidance: 'Concentrate on where accuracy is lowest: subjects, difficulty levels and the supplied incorrect or unanswered question samples. Name the concepts those samples point to, citing question references.',
  },
  {
    id: 'exam_readiness',
    label: 'Exam Readiness',
    description: 'How secure the assessed material looks before a further test; no exam-result predictions.',
    guidance: 'Assess how secure the student\'s performance on the ASSESSED material looks before a further assessment: accuracy on harder questions, unanswered questions, timing and consistency. Do not predict any examination result, grade, rank or probability.',
  },
  {
    id: 'fundamentals_gaps',
    label: 'Fundamentals & Concept Gaps',
    description: 'Whether the basics and prerequisite concepts are secure (easy questions first).',
    guidance: 'Check whether foundational knowledge is secure: accuracy on easy questions, and incorrect answers that point to missing prerequisite concepts. Recommend prerequisite practice where the evidence supports it.',
  },
  {
    id: 'higher_order_thinking',
    label: 'Higher-Order Thinking',
    description: 'Performance on harder, multi-step questions compared with easier ones.',
    guidance: 'Compare performance on hard, multi-step questions with easier ones, and describe what the evidence shows about analysis and multi-step reasoning.',
  },
  {
    id: 'difficulty_progression',
    label: 'Difficulty Progression',
    description: 'How accuracy changes from easy to medium to hard, and what level to practise next.',
    guidance: 'Describe how accuracy changes across difficulty levels and recommend the difficulty level for the next practice, increasing gradually where the evidence supports it.',
  },
  {
    id: 'intervention_planning',
    label: 'Intervention Planning',
    description: 'Prioritised, practical mentor actions with a short follow-up plan.',
    guidance: 'Prioritise practical mentor interventions: what to address first, how, and how to check the effect with a short follow-up assessment.',
  },
  {
    id: 'custom',
    label: 'Custom Focus',
    description: 'You describe the focus yourself in the instructions box.',
    guidance: 'The teacher\'s own instructions describe the focus of this report.',
  },
]);

const DEFAULT_FOCUS = 'overall_progress';
const INSTRUCTIONS_MAX = 500;
const findFocus = (id) => REPORT_FOCUSES.find((f) => f.id === id) || null;
const publicFocuses = () => REPORT_FOCUSES.map(({ id, label, description }) => ({ id, label, description }));

/**
 * Validates the OPTIONAL body of POST .../performance/analysis: { focus?, instructions? }.
 * Nothing else is accepted (the student data always comes from the server). Instructions that try
 * to steer the model (injection), or contain markup/links, are refused BEFORE any LLM call.
 */
function validateReportRequest(body) {
  if (body === undefined || body === null) return Object.freeze({ focus: DEFAULT_FOCUS, instructions: '' });
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new AssessmentError('INVALID_REQUEST', 'Send the report options as a JSON object: { focus?, instructions? }.');
  }
  const details = [];
  for (const key of Object.keys(body)) if (key !== 'focus' && key !== 'instructions') details.push({ field: key, code: 'UNKNOWN_FIELD' });

  let focus = DEFAULT_FOCUS;
  if (body.focus !== undefined && body.focus !== null && body.focus !== '') {
    if (!findFocus(body.focus)) details.push({ field: 'focus', code: 'INVALID_REPORT_FOCUS' });
    else focus = body.focus;
  }

  let instructions = '';
  const raw = body.instructions;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== 'string') details.push({ field: 'instructions', code: 'MUST_BE_TEXT' });
    else if (raw.trim().length > INSTRUCTIONS_MAX) details.push({ field: 'instructions', code: 'TOO_LONG', max: INSTRUCTIONS_MAX });
    else if (unsafeInstructions(raw.trim())) details.push({ field: 'instructions', code: 'UNSAFE_INSTRUCTIONS' });
    else instructions = raw.trim();
  }
  if (focus === 'custom' && !instructions && !details.some((d) => d.field === 'instructions')) details.push({ field: 'instructions', code: 'REQUIRED' });

  if (details.length > 0) throw new AssessmentError('VALIDATION_FAILED', 'The report options are not valid.', { details });
  return Object.freeze({ focus, instructions });
}

module.exports = { REPORT_FOCUSES, DEFAULT_FOCUS, findFocus, publicFocuses, validateReportRequest };
