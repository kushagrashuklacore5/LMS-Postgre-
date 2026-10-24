/**
 * ============================================================================================
 * TEMPORARY DEVELOPMENT / PREVIEW MODE - AI Performance Report ONLY. Remove when the production
 * model is finalized (delete this file + the marked lines in PerformanceAnalyst.js,
 * integration/lmsAssessmentAgent.js and AiPerformanceReport.jsx).
 * ============================================================================================
 *
 * Enabled only by AIA_REPORT_PREVIEW_MODE=true (exactly "true"); default OFF = the strict behaviour.
 * The strict validator still runs on every report. In preview mode ONLY what happens after it fails
 * changes: a report that is still STRUCTURALLY readable is returned, marked NOT VALIDATED, together
 * with plain-language warnings. It is still refused when:
 *   - the output is not JSON / not an object (no draft);
 *   - a required top-level section is missing or has the wrong type;
 *   - there is no usable executive summary;
 *   - the prompt-injection guard fired.
 * Question generation and assignment AI evaluation never use this.
 */
const { ENUMS, OVERVIEW_METRICS, QUESTION_COUNT } = require('./analysisSchema');

const isReportPreviewEnabled = (env = process.env) => String(env.AIA_REPORT_PREVIEW_MODE || '').trim().toLowerCase() === 'true';

// Codes that still block in preview mode: structure at the top level, and prompt injection.
const TOP_LEVEL_STRUCTURE = new Set(['MISSING_FIELD', 'WRONG_TYPE', 'NOT_AN_OBJECT']);
const blocksPreview = (p) => p.code === 'PROMPT_INJECTION' || (TOP_LEVEL_STRUCTURE.has(p.code) && !/[.[]/.test(String(p.field || '')));

/**
 * A report that is safe to display: expected types everywhere, neutral defaults for invalid enums, items
 * without their key text left out, only evidence references that exist in the data (the validator already
 * dropped the others), and "strong" evidence downgraded when data is limited. null = nothing usable.
 */
function toRenderable(d, sufficiency) {
  if (!d || typeof d !== 'object') return null;
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
  const refs = (v) => (Array.isArray(v) ? v.filter((r) => typeof r === 'string') : []);
  const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
  const strength = (v) => { const x = pick(v, ENUMS.evidenceStrength, 'limited'); return sufficiency !== 'adequate' && x === 'strong' ? 'moderate' : x; };
  const list = (arr, fn) => (Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object').map(fn).filter(Boolean) : []);
  const es = d.executiveSummary;
  if (!es || !(str(es.observed) || str(es.interpretation))) return null;
  const seen = new Set();
  const na = d.nextAssessment && str(d.nextAssessment.objective) ? d.nextAssessment : null;
  return {
    executiveSummary: { overallStatus: pick(es.overallStatus, ENUMS.overallStatus, 'insufficient_evidence'), observed: str(es.observed), interpretation: str(es.interpretation) },
    performanceOverview: list(d.performanceOverview, (o) => {
      if (!OVERVIEW_METRICS.includes(o.metric) || seen.has(o.metric) || !(str(o.observed) || str(o.interpretation))) return null;
      seen.add(o.metric);
      return { metric: o.metric, observed: str(o.observed), interpretation: str(o.interpretation), evidence: refs(o.evidence) };
    }),
    strengths: list(d.strengths, (x) => (str(x.area) ? { area: str(x.area), observed: str(x.observed), evidenceStrength: strength(x.evidenceStrength), evidence: refs(x.evidence) } : null)),
    focusAreas: list(d.focusAreas, (x) => (str(x.area) ? {
      area: str(x.area), observed: str(x.observed), interpretation: str(x.interpretation), investigate: str(x.investigate),
      evidenceStrength: strength(x.evidenceStrength), priority: pick(x.priority, ENUMS.priority, 'medium'), evidence: refs(x.evidence),
    } : null)),
    mentorActions: list(d.mentorActions, (x) => (str(x.action) ? { action: str(x.action), rationale: str(x.rationale), priority: pick(x.priority, ENUMS.priority, 'medium'), evidence: refs(x.evidence) } : null)),
    nextAssessment: na ? {
      objective: str(na.objective),
      questionType: pick(na.questionType, ENUMS.questionType, null),
      difficulty: pick(na.difficulty, ENUMS.difficulty, null),
      questionCount: Number.isInteger(na.questionCount) && na.questionCount >= QUESTION_COUNT.min && na.questionCount <= QUESTION_COUNT.max ? na.questionCount : null,
      rationale: str(na.rationale),
      evidence: refs(na.evidence),
    } : null,
    dataLimitations: Array.isArray(d.dataLimitations) ? d.dataLimitations.map(str).filter(Boolean) : [],
  };
}

const WARNING_TEXT = {
  INVENTED_NUMBER: 'Some numbers in the text could not be matched to the metrics above. Check them before relying on them.',
  INVENTED_PERCENTAGE: 'Some percentages could not be matched to the metrics above. Check them before relying on them.',
  INVENTED_SCORE: 'Some scores could not be matched to the metrics above. Check them before relying on them.',
  UNSUPPORTED_EVIDENCE: 'Some evidence references did not match this student\'s data and were removed.',
  EVIDENCE_REQUIRED: 'Some statements have no evidence reference.',
  UNSUPPORTED_TREND_CLAIM: 'A claim of improvement or decline is not supported by the computed trend.',
  UNSUPPORTED_PREDICTION: 'The text predicts future results; treat that as opinion, not evidence.',
  OVERSTATED_CERTAINTY: 'Some statements sound more certain than the data allows.',
  OVERSTATED_EVIDENCE: 'Evidence was rated "strong" although the data is limited; it is shown as "moderate".',
  BANNED_CLAIM: 'The text comments on the student personally (for example personality, motivation, health or background). Disregard those parts.',
  UNPROFESSIONAL_LANGUAGE: 'Some wording is informal.',
  UNSAFE_MARKUP: 'Some text contains markup or links; it is shown as plain text only (nothing is executed, links are not clickable).',
  GIBBERISH: 'Some text looks garbled.',
  LIMITATIONS_REQUIRED: 'The AI did not state data limitations although the data is limited.',
  TOO_LONG: 'Some text was too long and has been shortened.',
  DUPLICATE_METRIC: 'A repeated overview item was left out.',
};
const STRUCTURE_TEXT = 'Some parts of the report were incomplete or malformed and were left out or shown with defaults.';

/** Plain-language warnings (no model text), grouped, with the report sections involved. */
function previewWarnings(problems) {
  const byMessage = new Map();
  for (const p of problems) {
    const message = WARNING_TEXT[p.code] || STRUCTURE_TEXT;
    const section = String(p.field || '').split(/[.[]/)[0] || 'report';
    if (!byMessage.has(message)) byMessage.set(message, { code: WARNING_TEXT[p.code] ? p.code : 'STRUCTURE', message, sections: [] });
    const w = byMessage.get(message);
    if (!w.sections.includes(section)) w.sections.push(section);
  }
  return [...byMessage.values()];
}

/** After a FAILED validation: { content, warnings } to show in preview mode, or null (still rejected). */
function previewOutcome(problems, draft, sufficiency) {
  if (problems.some(blocksPreview)) return null;
  const content = toRenderable(draft, sufficiency);
  return content ? { content, warnings: previewWarnings(problems) } : null;
}

module.exports = { isReportPreviewEnabled, previewOutcome, toRenderable, previewWarnings };
