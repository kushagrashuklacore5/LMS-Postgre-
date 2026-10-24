/**
 * ONE controlled, opt-in REAL generation call with whichever provider is configured
 * (AIA_LLM_* override, else SOA_LLM_*), through the full assessment-agent path.
 * Not part of `npm test`. Synthetic content only; no student data; nothing is saved.
 *
 *   npm run llm:manual
 *
 * Request (synthetic): Photosynthesis / Biology / Class 8 / easy / 1 question.
 * Path: signed teacher JWT -> LMS authMiddleware -> LMS requireTenant -> POST /teacher/assessments/generate
 * -> AssessmentGenerator -> configured provider -> strict JSON parsing -> validation -> content guard -> response.
 * If the configuration is not usable (e.g. HF_TOKEN is still a placeholder) NO call is made.
 * Secrets are never printed; the response and logs are scanned for the credential afterwards.
 */
const fs = require('fs');
const path = require('path');
const { createLmsTestDb, IDS } = require('../helpers/lmsTestDb'); // throw-away PostgreSQL database (needs LMS_TEST_DATABASE_ADMIN_URL)

const MODULE = path.resolve(__dirname, '../..');
const SERVER = path.resolve(MODULE, '../../server');
const LIVE_DB = path.join(SERVER, 'data', 'lms_permanent.db');
const CLASS_8 = 30; // synthetic classroom added to the TEMP database only

async function main() {
  const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB).mtimeMs : null;
  const env = {};
  require(path.join(SERVER, 'node_modules', 'dotenv')).config({ path: path.join(SERVER, '.env'), processEnv: env, quiet: true });
  const { loadGenerationConfig } = require(path.join(MODULE, 'backend/src/llm/generationConfig'));
  const { createGenerationProvider } = require(path.join(MODULE, 'backend/src/llm/createGenerationProvider'));
  const config = loadGenerationConfig(env);
  const secret = config.apiKey || '';
  console.log(`config: provider=${config.provider} model=${config.model} source=${config.source} configured=${config.configured} reason=${config.reason} timeoutMs=${config.timeoutMs}`);
  if (!config.configured) {
    console.log(`\nNO REQUEST MADE: configuration is not usable (${config.reason}).`);
    if (config.reason === 'API_KEY_INVALID_FORMAT') console.log('HF_TOKEN in server/.env is not a Hugging Face token (expected "hf_..."); it is probably still the placeholder.');
    process.exitCode = 3;
    return;
  }

  // The provider is built exactly as the LMS builds it; fetch is wrapped ONLY to record the HTTP status
  // and the serving backend header (no request headers, no bodies).
  const net = { calls: 0, statuses: [], backends: [], ms: null };
  const recordingFetch = async (url, init) => {
    if (net.calls >= 1) throw new Error('second request refused by the one-call guard'); // hard guard: max ONE real request
    net.calls += 1;
    const t = Date.now();
    const res = await fetch(url, init);
    net.ms = Date.now() - t;
    net.statuses.push(res.status);
    net.backends.push(res.headers.get('x-inference-provider') || '-');
    return res;
  };
  const provider = createGenerationProvider(config, { fetchImpl: recordingFetch });

  process.env.JWT_SECRET = 'aia-real-llm-check-secret-' + 'k'.repeat(40);
  const tmp = await createLmsTestDb();
  await tmp.run('INSERT INTO classrooms (id, university_id, name, grade, section) VALUES (?, ?, ?, ?, ?)', [CLASS_8, IDS.school1, 'Class 8 - A (synthetic)', '8', 'A']);
  const counts = async () => {
    const out = [];
    for (const t of ['aia_assessments', 'aia_questions', 'aia_options', 'aia_attempts']) out.push((await tmp.get(`SELECT COUNT(*) AS n FROM ${t}`)).n);
    return out.join(',');
  };
  const rowsBefore = await counts();
  const lmsDb = tmp.hostDatabase(); // the host's database module, pointed at the throw-away database
  for (const mod of ['config/database-switch.js']) {
    const file = path.join(SERVER, mod);
    require.cache[file] = { id: file, filename: file, loaded: true, exports: lmsDb };
  }
  const express = require(path.join(SERVER, 'node_modules', 'express'));
  const { signToken } = require(path.join(SERVER, 'config', 'jwt'));
  const requireAuth = require(path.join(SERVER, 'middleware', 'authMiddleware'));
  const requireTenant = require(path.join(SERVER, 'middleware', 'requireTenant'));
  const { createLmsAssessmentAgentRouter, assessmentErrorHandler } = require(path.join(MODULE, 'backend/src/integration/lmsAssessmentAgent'));

  const logs = [];
  const origWarn = console.warn;
  console.warn = (...a) => { logs.push(a.join(' ')); origWarn(...a); };
  const app = express();
  app.use('/api/assessment-agent', requireAuth, requireTenant,
    createLmsAssessmentAgentRouter({ express, database: tmp.sql, schema: tmp.schema, env, generationProvider: provider }), assessmentErrorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const token = signToken({ userId: IDS.teacher1, universityId: IDS.school1, role: 'mentor', email: 'synthetic@teacher.test', name: 'Synthetic Teacher' }, { expiresIn: '5m' });

  const body = { topic: 'Photosynthesis', subject: 'Biology', classroomId: CLASS_8, count: 1, difficulty: 'easy' };
  console.log('request: POST /teacher/assessments/generate', JSON.stringify(body));
  const started = Date.now();
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/assessment-agent/teacher/assessments/generate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  const totalMs = Date.now() - started;
  server.close();
  console.warn = origWarn;

  let json = null;
  try { json = JSON.parse(text); } catch { /* reported below */ }
  const ok = res.status === 200 && json && json.proposal;
  const err = json && json.error ? json.error : null;
  const codes = err && Array.isArray(err.details) ? err.details.map((d) => d.code) : [];
  const parseFailed = codes.some((c) => c === 'INVALID_JSON' || c === 'EMPTY_OUTPUT' || c === 'NOT_AN_OBJECT');
  const guardCodes = ['INSTRUCTION_NOT_QUESTION', 'PROMPT_INJECTION', 'UNSAFE_MARKUP', 'PLACEHOLDER_OR_GIBBERISH', 'ANSWER_LEAK'];
  const guardFailed = codes.some((c) => guardCodes.includes(c));
  const reachedModelOutput = ok || (err && err.code === 'AI_OUTPUT_REJECTED');
  const keyExposed = secret.length > 0 && [text, ...logs].some((s) => s.includes(secret));
  const q = ok ? json.proposal.questions : [];

  console.log('\n===== REAL LLM CHECK =====');
  console.log(`1. Model: ${config.model}`);
  console.log(`2. Inference provider/backend: ${config.provider}${net.backends.length ? ` -> served by "${net.backends.join(',')}"` : ''}`);
  console.log(`3. HTTP status: provider ${net.statuses.join(', ') || 'none received'} | assessment-agent API ${res.status}`);
  console.log(`4. Response time: provider ${net.ms === null ? '-' : net.ms + ' ms'} | end-to-end ${totalMs} ms`);
  console.log(`5. Response received: ${net.statuses.length ? 'yes' : 'no'}`);
  console.log(`6. JSON parsing: ${!reachedModelOutput ? 'not reached' : parseFailed ? 'FAILED' : 'passed'}`);
  console.log(`7. MCQ validation: ${!reachedModelOutput || parseFailed ? 'not reached' : ok || guardFailed ? 'passed' : 'FAILED ' + JSON.stringify(err.details)}`);
  console.log(`8. Content guard: ${ok ? 'passed' : guardFailed ? 'FAILED ' + JSON.stringify(err.details) : 'not reached'}`);
  if (ok) {
    const one = q.length === 1 && q[0].options.length === 4 && q[0].options.filter((o) => o.isCorrect).length === 1 && q[0].explanation.trim() !== '' && ['easy', 'medium', 'hard'].includes(q[0].difficulty);
    console.log(`9. Final result: ${one ? 'SUCCESS' : 'UNEXPECTED SHAPE'}: ${q.length} valid MCQ, ${q[0] ? q[0].options.length : 0} options, ${q[0] ? q[0].options.filter((o) => o.isCorrect).length : 0} correct, difficulty ${q[0] ? q[0].difficulty : '-'} (saved: ${json.proposal.saved})`);
  } else {
    console.log(`9. Final result: FAILED: ${err ? `${err.code} "${err.message}"` : 'unreadable API response'}`);
  }
  console.log(`database: temp DB rows ${rowsBefore === await counts() ? 'unchanged (nothing saved)' : 'CHANGED'}; live LMS DB ${(fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB).mtimeMs : null) === liveBefore ? 'untouched' : 'CHANGED'}`);
  console.log(`secret exposed in response or logs: ${keyExposed ? 'YES' : 'no'}`);
  if (ok) {
    console.log('\n--- generated question (unsaved proposal) ---');
    console.log(`[${q[0].difficulty}] ${q[0].text}`);
    q[0].options.forEach((o, j) => console.log(`   ${'ABCD'[j]}. ${o.text}${o.isCorrect ? '   <- correct' : ''}`));
    console.log(`   explanation: ${q[0].explanation}`);
  }
  await tmp.close();
  if (!ok) process.exitCode = 2;
}

main().catch((e) => { console.error('check failed before completion:', e.message); process.exitCode = 1; });
