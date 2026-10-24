const { INJECTION, MARKUP } = require('./contentGuard');

/**
 * AI Performance Report - STRICT output schema, validator and guard (deterministic).
 * The model's text is never trusted. Everything below must hold, or the whole report is
 * rejected (AI_OUTPUT_REJECTED, codes + locations only; model text is never returned):
 *   - JSON with exactly the fields below (no extras), types, enums, lengths and item counts;
 *   - OBSERVED data, INTERPRETATION and RECOMMENDATION are separate fields;
 *   - every evidence reference exists in the supplied data: A1..An, A2-Q3 (only question samples
 *     that were supplied), subject:X, difficulty:Y, metric:Z ("Subject: X" style is accepted and
 *     normalized). Any "A<n>" / "A<n>-Q<m>" written in text must exist too;
 *   - numbers: every percentage, "a/b" score and plain number in text must match a supplied number
 *     (or be the suggested question count, or a small count 0-3). No invented statistics;
 *   - no claim of improvement/decline unless the supplied trend (or a retake change) shows it;
 *   - no predictions (pass/fail, scores, ranks, probabilities), no certainty language;
 *   - no psychological, personality, family/background or health claims; no hype or chatbot talk;
 *   - no prompt injection, HTML/links or gibberish (shared patterns from contentGuard);
 *   - with limited data: at least one data limitation, and no "strong" evidence rating.
 */
const OVERVIEW_METRICS = Object.freeze(['overall', 'recent', 'completion', 'consistency', 'unanswered', 'timed_out', 'retakes', 'trend']);
const METRIC_REFS = Object.freeze([...OVERVIEW_METRICS, 'timing']);
const ENUMS = Object.freeze({
  overallStatus: ['strong', 'on_track', 'needs_support', 'insufficient_evidence'],
  metric: OVERVIEW_METRICS,
  evidenceStrength: ['strong', 'moderate', 'limited'],
  priority: ['high', 'medium', 'low'],
  questionType: ['single_mcq', 'multi_select', 'numerical', 'mixed'],
  difficulty: ['easy', 'medium', 'hard', 'mixed'],
});
const TOP_FIELDS = ['executiveSummary', 'performanceOverview', 'strengths', 'focusAreas', 'mentorActions', 'nextAssessment', 'dataLimitations'];
const QUESTION_COUNT = Object.freeze({ min: 3, max: 30 });

// Claims the report must never make about a student (educational evidence only).
// Kept specific so normal teaching language passes ("stress the difference", "element families", "SMART goals").
const BANNED_CLAIMS = [
  /\b(lazy|laziness|intelligen\w*|unintelligent|clever|stupid|dumb|gifted|talented|genius|IQ|slow learner|natural(ly)? (ability|talent))\b/i,
  /\b(motivat\w*|unmotivated|lack of effort|doesn'?t care|careless\w*|attitude|personality|behaviou?r(al)? (problem|issue)s?|discipline problem|confiden\w*|distract\w*|attention span|concentration)\b/i,
  /\b(anxious|anxiety|depress\w*|stressed|mental(ly)?|emotional\w*|trauma\w*|ADHD|autis\w*|dyslexi\w*|disorder|disabilit\w*|diagnos(e|ed|es|is))\b/i, // "diagnostic test" is a normal teaching action
  /\b(ill|illness|sick\w*|health (issue|problem|condition)s?|medical|fatigue|tired\w*|sleep\w*|nutrition|diet)\b/i,
  /\b(family (situation|background|circumstances|issues|problems|life)|parents?|home (life|situation|environment)|socio-?economic|poverty|divorce|(cultural|economic|social|religious|linguistic) background|religio\w*|caste|ethnic\w*|gender|mother tongue)\b/i,
];
const PREDICTION = /\b(will|would|is (likely|unlikely|expected|certain|sure) to|should easily) (pass|fail|score|achieve|get|secure|clear|crack|top|rank|qualify)\b|\b(predict\w*|probabilit\w*|chances? of (passing|success|selection)|guarantee\w*|board (exam )?(results?|marks)|percentile)\b/i;
const CERTAINTY = /\b(definitely|certainly|conclusively|undoubtedly|without (a )?doubt|proves?|proven)\b/i;
const HYPE = /!|\b(amazing|awesome|incredible|fantastic|phenomenal|superstar|rock ?star|outstanding|brilliant|keep it up|great job|well done|excellent work)\b/i;
const FIRST_PERSON = /\bI('m|'ve|'d)?\b/; // case-sensitive: the pronoun only
const CHATBOT = /\b(let me|hope this helps|as your (assistant|ai)|feel free to)\b/i;
const IMPROVE = /\b(has|have) improved|\bis improving|\bimproving (trend|results|performance|scores)|\bshows? (an? )?(clear |steady )?improvement|\bsteady improvement|\bupward trend|\bgetting better/i;
const DECLINE = /\b(has|have) (declined|dropped|fallen|worsened)|\bis (declining|worsening)|\bdeclining (trend|results|performance|scores)|\bdownward trend|\bgetting worse|\bdeteriorat\w*/i;
const REF_IN_TEXT = /\bA(\d{1,3})(?:-Q(\d{1,3}))?\b/g;

// Gemini-style (uppercase) schema; the HF provider converts it to standard JSON Schema.
const STR = { type: 'STRING' };
const REFS = { type: 'ARRAY', items: STR, minItems: 1, maxItems: 6 };
const en = (k) => ({ type: 'STRING', enum: ENUMS[k] });
const obj = (properties) => ({ type: 'OBJECT', properties, required: Object.keys(properties) });
const ANALYSIS_SCHEMA = Object.freeze(obj({
  executiveSummary: obj({ overallStatus: en('overallStatus'), observed: STR, interpretation: STR }),
  performanceOverview: { type: 'ARRAY', minItems: 1, maxItems: 8, items: obj({ metric: en('metric'), observed: STR, interpretation: STR, evidence: REFS }) },
  strengths: { type: 'ARRAY', maxItems: 5, items: obj({ area: STR, observed: STR, evidenceStrength: en('evidenceStrength'), evidence: REFS }) },
  focusAreas: { type: 'ARRAY', maxItems: 5, items: obj({ area: STR, observed: STR, interpretation: STR, investigate: STR, evidenceStrength: en('evidenceStrength'), priority: en('priority'), evidence: REFS }) },
  mentorActions: { type: 'ARRAY', minItems: 1, maxItems: 5, items: obj({ action: STR, rationale: STR, priority: en('priority'), evidence: REFS }) },
  nextAssessment: obj({ objective: STR, questionType: en('questionType'), difficulty: en('difficulty'), questionCount: { type: 'INTEGER' }, rationale: STR, evidence: REFS }),
  dataLimitations: { type: 'ARRAY', maxItems: 6, items: STR },
}));

// Field shapes: { key: [kind, maxLength | enum name] }
const SHAPES = {
  executiveSummary: { overallStatus: ['enum', 'overallStatus'], observed: ['text', 500], interpretation: ['text', 500] },
  performanceOverview: { metric: ['enum', 'metric'], observed: ['text', 300], interpretation: ['text', 300], evidence: ['refs'] },
  strengths: { area: ['text', 80], observed: ['text', 300], evidenceStrength: ['enum', 'evidenceStrength'], evidence: ['refs'] },
  focusAreas: { area: ['text', 80], observed: ['text', 300], interpretation: ['text', 300], investigate: ['text', 300], evidenceStrength: ['enum', 'evidenceStrength'], priority: ['enum', 'priority'], evidence: ['refs'] },
  mentorActions: { action: ['text', 200], rationale: ['text', 300], priority: ['enum', 'priority'], evidence: ['refs'] },
  nextAssessment: { objective: ['text', 200], questionType: ['enum', 'questionType'], difficulty: ['enum', 'difficulty'], questionCount: ['count'], rationale: ['text', 300], evidence: ['refs'] },
};
const LISTS = { performanceOverview: [1, 8], strengths: [0, 5], focusAreas: [0, 5], mentorActions: [1, 5] };

function stripFence(raw) {
  const t = raw.trim();
  const m = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(t);
  return m ? m[1].trim() : t;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param raw  model text
 * @param ctx  { labels, questionRefs, subjects, difficulties, numbers, sufficiency: 'limited'|'adequate',
 *               trend: 'improving'|'declining'|'stable'|'insufficient_data', retakeChanges: number[] }
 * @returns { content, problems }  content is the normalized report when problems is empty
 */
function validateAnalysis(raw, ctx) {
  const problems = [];
  const add = (field, code) => { if (!problems.some((p) => p.field === field && p.code === code)) problems.push({ field, code }); };
  if (typeof raw !== 'string' || raw.trim() === '') return { content: null, problems: [{ field: '', code: 'EMPTY_OUTPUT' }] };
  let data;
  try { data = JSON.parse(stripFence(raw)); } catch { return { content: null, problems: [{ field: '', code: 'INVALID_JSON' }] }; }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { content: null, problems: [{ field: '', code: 'NOT_AN_OBJECT' }] };

  for (const k of Object.keys(data)) if (!TOP_FIELDS.includes(k)) add(k, 'UNEXPECTED_FIELD');
  for (const k of TOP_FIELDS) if (!(k in data)) add(k, 'MISSING_FIELD');

  const labels = new Set(ctx.labels);
  const questionRefs = new Set(ctx.questionRefs || []);
  const subjectByLower = new Map(ctx.subjects.map((s) => [s.toLowerCase(), s]));
  const difficulties = new Set(ctx.difficulties);
  const texts = []; // [field, string] for the content guard
  const ratings = []; // [field, evidenceStrength]

  const text = (field, value, max) => {
    if (typeof value !== 'string') { add(field, 'WRONG_TYPE'); return null; }
    const t = value.trim();
    if (!t) { add(field, 'EMPTY'); return null; }
    if (t.length > max) { add(field, 'TOO_LONG'); const cut = `${t.slice(0, max - 1)}…`; texts.push([field, cut]); return cut; } // shortened in the draft
    texts.push([field, t]);
    return t;
  };
  /** Normalizes one reference to its canonical form, or null when it is not in the supplied data. */
  const ref = (r) => {
    const v = String(r).trim();
    if (/^A\d{1,3}$/.test(v)) return labels.has(v) ? v : null;
    const q = /^(A\d{1,3})\s*-\s*Q(\d{1,3})$/i.exec(v);
    if (q) { const id = `${q[1].toUpperCase()}-Q${q[2]}`; return questionRefs.has(id) ? id : null; }
    const m = /^(subject|difficulty|metric)\s*:\s*(.+)$/i.exec(v);
    if (!m) return null;
    const [kind, val] = [m[1].toLowerCase(), m[2].trim()];
    if (kind === 'subject') return subjectByLower.has(val.toLowerCase()) ? `subject:${subjectByLower.get(val.toLowerCase())}` : null;
    if (kind === 'difficulty') return difficulties.has(val.toLowerCase()) ? `difficulty:${val.toLowerCase()}` : null;
    const metric = val.toLowerCase().replace(/[\s-]+/g, '_');
    return METRIC_REFS.includes(metric) ? `metric:${metric}` : null;
  };
  const refs = (field, value) => {
    if (!Array.isArray(value) || value.length < 1 || value.length > 6) { add(field, 'EVIDENCE_REQUIRED'); return null; }
    const out = [];
    for (const r of value) {
      const n = typeof r === 'string' ? ref(r) : null;
      if (!n) add(field, 'UNSUPPORTED_EVIDENCE');
      else if (!out.includes(n)) out.push(n);
    }
    return out;
  };
  const object = (at, item, shape) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) { add(at, 'NOT_AN_OBJECT'); return null; }
    for (const k of Object.keys(item)) if (!(k in shape)) add(`${at}.${k}`, 'UNEXPECTED_FIELD');
    const out = {};
    for (const [k, [kind, arg]] of Object.entries(shape)) {
      if (!(k in item)) { add(`${at}.${k}`, 'MISSING_FIELD'); continue; }
      const f = `${at}.${k}`;
      if (kind === 'text') out[k] = text(f, item[k], arg);
      else if (kind === 'enum') {
        if (!ENUMS[arg].includes(item[k])) add(f, 'INVALID_ENUM');
        out[k] = item[k];
        if (k === 'evidenceStrength') ratings.push([f, item[k]]);
      } else if (kind === 'count') {
        if (!Number.isInteger(item[k]) || item[k] < QUESTION_COUNT.min || item[k] > QUESTION_COUNT.max) add(f, 'INVALID_QUESTION_COUNT');
        out[k] = item[k];
      } else out[k] = refs(f, item[k]);
    }
    return out;
  };

  const content = {};
  for (const single of ['executiveSummary', 'nextAssessment']) {
    if (single in data) content[single] = object(single, data[single], SHAPES[single]);
  }
  for (const [list, [min, max]] of Object.entries(LISTS)) {
    if (!(list in data)) continue;
    const arr = data[list];
    if (!Array.isArray(arr)) { add(list, 'WRONG_TYPE'); continue; }
    if (arr.length < min || arr.length > max) add(list, 'WRONG_ITEM_COUNT');
    content[list] = arr.slice(0, max).map((item, i) => object(`${list}[${i}]`, item, SHAPES[list]));
  }
  if (Array.isArray(content.performanceOverview)) {
    const seen = content.performanceOverview.map((o) => o && o.metric);
    if (new Set(seen).size !== seen.length) add('performanceOverview', 'DUPLICATE_METRIC');
  }
  if ('dataLimitations' in data) {
    const arr = data.dataLimitations;
    if (!Array.isArray(arr) || arr.length > 6) add('dataLimitations', Array.isArray(arr) ? 'WRONG_ITEM_COUNT' : 'WRONG_TYPE');
    else content.dataLimitations = arr.map((s, i) => text(`dataLimitations[${i}]`, s, 200));
    if (ctx.sufficiency === 'limited' && (!Array.isArray(arr) || arr.length === 0)) add('dataLimitations', 'LIMITATIONS_REQUIRED');
  }
  // Weak evidence is never presented as certain.
  if (ctx.sufficiency !== 'adequate') for (const [f, v] of ratings) if (v === 'strong') add(f, 'OVERSTATED_EVIDENCE');

  // Content guard over every text field.
  const known = (x) => ctx.numbers.some((n) => Math.abs(n - x) <= 0.5);
  const suggested = content.nextAssessment && Number.isInteger(content.nextAssessment.questionCount) ? content.nextAssessment.questionCount : null;
  const improvementShown = ctx.trend === 'improving' || (ctx.retakeChanges || []).some((c) => c > 0);
  const declineShown = ctx.trend === 'declining' || (ctx.retakeChanges || []).some((c) => c < 0);
  const subjectNames = ctx.subjects.filter(Boolean).sort((a, b) => b.length - a.length);
  for (const [field, t] of texts) {
    if (INJECTION.some((re) => re.test(t))) add(field, 'PROMPT_INJECTION');
    if (MARKUP.some((re) => re.test(t))) add(field, 'UNSAFE_MARKUP');
    if (BANNED_CLAIMS.some((re) => re.test(t))) add(field, 'BANNED_CLAIM');
    if (PREDICTION.test(t)) add(field, 'UNSUPPORTED_PREDICTION');
    if (CERTAINTY.test(t)) add(field, 'OVERSTATED_CERTAINTY');
    if (HYPE.test(t) || CHATBOT.test(t) || FIRST_PERSON.test(t)) add(field, 'UNPROFESSIONAL_LANGUAGE');
    if (!/[\p{L}]/u.test(t) || /([^\d\s])\1{7,}/u.test(t)) add(field, 'GIBBERISH');
    if (IMPROVE.test(t) && !improvementShown) add(field, 'UNSUPPORTED_TREND_CLAIM');
    if (DECLINE.test(t) && !declineShown) add(field, 'UNSUPPORTED_TREND_CLAIM');
    for (const m of t.matchAll(REF_IN_TEXT)) {
      if (!labels.has(`A${m[1]}`) || (m[2] && !questionRefs.has(`A${m[1]}-Q${m[2]}`))) add(field, 'UNSUPPORTED_EVIDENCE');
    }
    // Numbers: strip references and subject names (which may contain digits) first.
    let rest = t.replace(REF_IN_TEXT, ' ');
    for (const s of subjectNames) rest = rest.replace(new RegExp(escapeRegex(s), 'gi'), ' ');
    for (const m of rest.matchAll(/(\d+(?:\.\d+)?)\s*(%|percent\b)/gi)) if (!known(Number(m[1]))) add(field, 'INVENTED_PERCENTAGE');
    for (const m of rest.matchAll(/\b(\d+)\s*(?:\/|out of)\s*(\d+)\b/gi)) if (!known(Number(m[1])) || !known(Number(m[2]))) add(field, 'INVENTED_SCORE');
    // Recommendations may state a PLAN ("a 10-minute review", "over 2 weeks", "assign 5 practice questions"):
    // those quantities are not claims about the data. Only there, and only with a planning unit, they are
    // skipped by the plain-number check below; percentages and "x out of y" scores were checked above.
    if (PLAN_TIME_FIELD.test(field)) rest = rest.replace(PLAN_TIME, ' ');
    if (PLAN_QTY_FIELD.test(field)) rest = rest.replace(PLAN_QTY, ' ');
    for (const m of rest.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?!\d|\.\d)/g)) { // a sentence-ending "." still counts
      const x = Number(m[1]);
      if (!(Number.isInteger(x) && x <= 3) && x !== suggested && !known(x)) add(field, 'INVENTED_NUMBER');
    }
  }
  // content: only when every check passed (strict). draft: the best-effort parsed report, for callers that show
  // a report WITH its problems as warnings (the Performance Report does; see PerformanceAnalyst.toRenderable).
  return { content: problems.length ? null : content, draft: content, problems };
}

/*
 * Planning quantities in RECOMMENDATION text only (never in observed/interpretation fields):
 *   time/frequency ("10 minutes", "2-3 days", "4 sessions", "3 times") - actions, their rationale, what to
 *   investigate, the next assessment; amounts of practice ("5 practice questions", "8 short exercises") -
 *   only in the action/investigate/objective text itself (a rationale's "missed 7 questions" is a claim).
 */
const PLAN_TIME_FIELD = /^(?:mentorActions\[\d+\]\.(?:action|rationale)|focusAreas\[\d+\]\.investigate|nextAssessment\.(?:objective|rationale))$/;
const PLAN_QTY_FIELD = /^(?:mentorActions\[\d+\]\.action|focusAreas\[\d+\]\.investigate|nextAssessment\.objective)$/;
const PLAN_TIME = /(?<![\w.])\d{1,3}(?:\s*(?:-|–|to)\s*\d{1,3})?\s*-?\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?|sessions?|times)\b/gi;
const PLAN_QTY = /(?<![\w.])\d{1,3}(?:\s*(?:-|–|to)\s*\d{1,3})?\s*-?\s*(?:(?:new|short|more|additional|extra|targeted|practice|similar|easy|medium|hard|mixed|single[- ]answer|multiple[- ]select|numerical|mcq|follow-up|revision)\s+){0,3}(?:questions?|problems?|exercises?|items?|worksheets?|quizzes|quiz|examples?|tasks?|mcqs?)\b/gi;

// The content-guard patterns are also reused by the Descriptive Assignments evaluator (assignments/evaluationSchema.js).
module.exports = { validateAnalysis, ANALYSIS_SCHEMA, ENUMS, BANNED_CLAIMS, PREDICTION, CERTAINTY, HYPE, CHATBOT, FIRST_PERSON, METRIC_REFS, OVERVIEW_METRICS, QUESTION_COUNT };
