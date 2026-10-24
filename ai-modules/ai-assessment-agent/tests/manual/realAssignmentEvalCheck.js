/**
 * ONE controlled, opt-in REAL AI call for the Descriptive Assignments evaluation (Prompt 2), with
 * SYNTHETIC data only. Manual (not part of `npm test`):
 *
 *   node tests/manual/realAssignmentEvalCheck.js
 *
 * Real: configuration (server/.env via dotenv, never printed), createGenerationProvider, AssessmentGenerator,
 * pdf-parse text extraction of a synthetic PDF, AssignmentEvaluator (redaction, prompt, schema), and the
 * strict evaluation validation - exactly as the evaluate-ai route runs them.
 * Not used: the database (nothing is created or stored anywhere).
 * Safety: fetch is wrapped to (a) REFUSE any second network request (no retries possible) and (b) record
 * only the HTTP status, latency, serving backend and usage token counts - never headers, token or bodies.
 */
const path = require('path');

const MODULE = path.resolve(__dirname, '../..');
const SERVER = path.resolve(MODULE, '../../server');
const { loadGenerationConfig } = require(path.join(MODULE, 'backend/src/llm/generationConfig'));
const { createGenerationProvider } = require(path.join(MODULE, 'backend/src/llm/createGenerationProvider'));
const { AssessmentGenerator } = require(path.join(MODULE, 'backend/src/core/ai/AssessmentGenerator'));
const { AssignmentEvaluator } = require(path.join(MODULE, 'backend/src/assignments/AssignmentEvaluator'));
const { validateAssignmentEvaluation } = require(path.join(MODULE, 'backend/src/assignments/evaluationSchema'));
const { extractPdfText } = require(path.join(MODULE, 'backend/src/assignments/pdfText'));
const { syntheticPdf } = require('../helpers/syntheticPdf');

async function main() {
  const env = {};
  require(path.join(SERVER, 'node_modules', 'dotenv')).config({ path: path.join(SERVER, '.env'), processEnv: env, quiet: true });
  const config = loadGenerationConfig(env);
  console.log(`config: provider=${config.provider} model=${config.model} configured=${config.configured} reason=${config.reason} timeoutMs=${config.timeoutMs}`);
  if (!config.configured || !config.enabled) { console.log('STOP: AI is not configured/enabled; no request made.'); process.exitCode = 3; return; }

  const net = { calls: 0, refused: 0, status: null, ms: null, backend: null, usage: null };
  const guardedFetch = async (url, init) => {
    if (net.calls >= 1) { net.refused += 1; throw new Error('second request refused by the one-call guard'); }
    net.calls += 1;
    const t = Date.now();
    const res = await fetch(url, init);
    net.ms = Date.now() - t;
    net.status = res.status;
    net.backend = res.headers.get('x-inference-provider') || '-';
    try {
      const u = (await res.clone().json()).usage;
      if (u) net.usage = { input: u.prompt_tokens ?? null, output: u.completion_tokens ?? null, total: u.total_tokens ?? null };
    } catch { /* usage unavailable */ }
    return res;
  };
  const real = createGenerationProvider(config, { fetchImpl: guardedFetch });
  const captured = { raw: null };
  const recording = { name: real.name, isConfigured: () => real.isConfigured(), generateJson: async (req) => (captured.raw = await real.generateJson(req)) };
  const generator = new AssessmentGenerator({ provider: recording, timeoutMs: config.timeoutMs, enabled: config.enabled, log: () => {} });
  const evaluator = new AssignmentEvaluator({ generator, log: () => {} });

  // Synthetic assignment (10 marks) + synthetic answer PDF (with a synthetic name that must be redacted).
  const context = {
    instructions: 'Answer each question in one or two sentences.',
    totalMarks: 10,
    questions: [
      { position: 1, text: 'What is the chemical formula of water?', maxMarks: 2 },
      { position: 2, text: 'Which gas do plants absorb for photosynthesis, and which gas do they release?', maxMarks: 3 },
      { position: 3, text: 'Explain why the Moon shows phases.', maxMarks: 5 },
    ],
    redactions: { studentName: 'Synthetic Learner', classNames: ['Synthetic Class 9-Z'], otherNames: ['Synthetic Teacher', 'Synthetic School'] },
  };
  const pdf = syntheticPdf('Name: Synthetic Learner\nQ1: The chemical formula of water is H2O.\nQ2: Plants absorb carbon dioxide and release oxygen.\nQ3: The Moon does not make its own light; it reflects sunlight. As the Moon orbits Earth, we see different amounts of its sunlit half, which causes the phases.');
  const { text } = await extractPdfText(pdf);
  console.log(`pdf: extracted ${text.length} chars (synthetic)`);

  const t0 = Date.now();
  let result = null;
  let error = null;
  try { result = await evaluator.evaluate(context, text); } catch (err) { error = err; }
  const totalMs = Date.now() - t0;

  let jsonOk = null;
  if (captured.raw !== null) { try { JSON.parse(captured.raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/i, '$1')); jsonOk = true; } catch { jsonOk = false; } }
  const recheck = captured.raw !== null
    ? validateAssignmentEvaluation(captured.raw, { questions: context.questions.map((q) => ({ id: `Q${q.position}`, maxMarks: q.maxMarks })), totalMarks: 10, redactions: ['Synthetic Learner', 'Synthetic', 'Learner'] })
    : null;

  console.log('\n===== REAL ASSIGNMENT EVALUATION CHECK =====');
  console.log(`provider/model: ${config.provider} / ${config.model} (backend ${net.backend})`);
  console.log(`network requests: ${net.calls} (refused extra: ${net.refused}); HTTP ${net.status}; provider latency ${net.ms} ms; end-to-end ${totalMs} ms`);
  console.log(`provider returned text: ${captured.raw !== null}; JSON parse: ${jsonOk}`);
  if (result) {
    console.log('schema validation: PASSED (0 problems)');
    console.log(`marks: ${result.questions.map((q) => `${q.questionId} ${q.marksAwarded}/${q.maxMarks}`).join(', ')}; server total ${result.suggestedTotal}/${result.totalMarks}`);
    const rawTotals = JSON.parse(captured.raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/i, '$1'));
    console.log(`model totals: totalMarksAwarded=${rawTotals.totalMarksAwarded} totalMarks=${rawTotals.totalMarks} (match server: ${rawTotals.totalMarksAwarded === result.suggestedTotal && rawTotals.totalMarks === 10})`);
    console.log(`limitations: ${result.limitations.length} accepted`);
    console.log(`feedback lengths: ${result.questions.map((q) => q.feedback.length).join(', ')}; overall ${result.overallFeedback.length}`);
  } else {
    console.log(`result: ${error.code} (${error.statusCode}) problems=${JSON.stringify((error.details || []).map((d) => `${d.field}:${d.code}`))}`);
    if (recheck) console.log(`independent recheck problems: ${JSON.stringify(recheck.problems.map((p) => `${p.field}:${p.code}`))}`);
  }
  console.log(`usage: ${net.usage ? `input ${net.usage.input}, output ${net.usage.output}, total ${net.usage.total}` : 'usage metadata unavailable'}`);
  if (!result) process.exitCode = 2;
}

main().catch((err) => { console.error('check failed before completion:', err.message); process.exitCode = 1; });
