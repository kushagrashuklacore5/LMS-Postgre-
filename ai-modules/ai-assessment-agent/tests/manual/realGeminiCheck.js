/**
 * ONE controlled, opt-in REAL Gemini generation through the full assessment-agent path.
 * Not part of `npm test`. Synthetic content only; no student data; nothing is saved.
 *
 *   node tests/manual/realGeminiCheck.js
 *
 * Path exercised: signed teacher JWT -> LMS authMiddleware -> LMS requireTenant -> assessment-agent
 * router (POST /teacher/assessments/generate) -> AssessmentGenerator -> real GeminiGenerationProvider
 * -> strict JSON parsing -> output validation -> content guard -> question rules -> HTTP response.
 *
 * Configuration: the EXISTING SOA_LLM_PROVIDER / SOA_LLM_MODEL / SOA_GEMINI_API_KEY from server/.env.
 * The key is never printed. At the end, every captured output (HTTP body, logs) is scanned for it.
 * Database: a TEMPORARY synthetic SQLite file (the live DB has no assessment-agent tables yet and is
 * never opened). Row counts are compared before/after to prove nothing was written.
 */
const fs = require('fs');
const path = require('path');
const { createLmsTestDb, IDS } = require('../helpers/lmsTestDb'); // throw-away PostgreSQL database (needs LMS_TEST_DATABASE_ADMIN_URL)

const MODULE = path.resolve(__dirname, '../..');
const SERVER = path.resolve(MODULE, '../../server');
const LIVE_DB = path.join(SERVER, 'data', 'lms_permanent.db');

async function main() {
  const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB).mtimeMs : null;

  // Real configuration from the LMS environment (dotenv from the LMS server's own node_modules).
  const env = {};
  require(path.join(SERVER, 'node_modules', 'dotenv')).config({ path: path.join(SERVER, '.env'), processEnv: env, quiet: true });
  const secret = env.SOA_GEMINI_API_KEY || '';
  const { loadGenerationConfig } = require(path.join(MODULE, 'backend/src/llm/generationConfig'));
  const config = loadGenerationConfig(env);
  console.log(`config: provider=${config.provider} model=${config.model} configured=${config.configured} reason=${config.reason} timeoutMs=${config.timeoutMs}`);
  if (!config.configured) throw new Error(`AI not configured (${config.reason}); nothing was called.`);

  // Real provider class; fetch is wrapped ONLY to record Gemini's HTTP status (no headers, no body).
  const gemini = { calls: 0, statuses: [] };
  const recordingFetch = async (url, init) => {
    if (gemini.calls >= 1) throw new Error('second request refused by the one-call guard'); // hard guard: max ONE real request
    gemini.calls += 1;
    const res = await fetch(url, init);
    gemini.statuses.push(res.status);
    return res;
  };
  const { GeminiGenerationProvider } = require(path.join(MODULE, 'backend/src/llm/providers/gemini/GeminiGenerationProvider'));
  const provider = new GeminiGenerationProvider({ apiKey: config.apiKey, model: config.model, fetchImpl: recordingFetch });

  // Temp synthetic DB + real LMS session middleware.
  process.env.JWT_SECRET = 'aia-real-gemini-check-secret-' + 'k'.repeat(40);
  const tmp = await createLmsTestDb();
  const counts = async () => {
    const out = {};
    for (const t of ['aia_assessments', 'aia_questions', 'aia_options', 'aia_attempts', 'aia_attempt_answers']) out[t] = (await tmp.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;
    return out;
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

  // Capture server-side log lines from the agent (they must not contain the key either).
  const logs = [];
  const origWarn = console.warn;
  console.warn = (...a) => { logs.push(a.join(' ')); origWarn(...a); };

  const app = express();
  app.use('/api/assessment-agent', requireAuth, requireTenant,
    createLmsAssessmentAgentRouter({ express, database: tmp.sql, schema: tmp.schema, env, generationProvider: provider }), assessmentErrorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/assessment-agent`;
  const token = signToken({ userId: IDS.teacher1, universityId: IDS.school1, role: 'mentor', email: 'synthetic@teacher.test', name: 'Synthetic Teacher' }, { expiresIn: '5m' });

  const body = { topic: 'Basic Computer Networks', subject: 'Computer Science', classroomId: IDS.class10, count: 3, difficulty: 'easy', instructions: 'Keep questions short and suitable for school students.' };
  console.log('request: POST /teacher/assessments/generate', JSON.stringify(body));
  const started = Date.now();
  const res = await fetch(`${base}/teacher/assessments/generate`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  const ms = Date.now() - started;
  server.close();
  console.warn = origWarn;

  let json = null;
  try { json = JSON.parse(text); } catch { /* reported below */ }
  const rowsAfter = await counts();
  const liveAfter = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB).mtimeMs : null;
  const keyExposed = secret.length > 0 && [text, ...logs].some((s) => s.includes(secret));
  const ok = res.status === 200 && json && json.proposal;

  console.log('\n===== REAL GEMINI CHECK =====');
  const outcome = gemini.calls === 0 ? 'NOT MADE'
    : gemini.statuses.length === 0 ? 'FAILED (no HTTP response received before the timeout)'
      : gemini.statuses.every((s) => s === 200) ? 'SUCCEEDED' : 'FAILED';
  console.log(`1. Gemini request: ${outcome} (${gemini.calls} call(s), ${ms} ms)`);
  console.log(`2. HTTP status: Gemini ${gemini.statuses.join(', ') || '-'} | assessment-agent API ${res.status}`);
  console.log(`3. Model used: ${config.model} (provider ${config.provider})`);
  if (ok) {
    console.log('4. JSON parsing: passed (strict)');
    console.log('5. Output validation: passed (structure, 4 options, exactly one correct, count, no duplicates)');
    console.log('6. Content guard: passed (no injection/meta/leak/markup/gibberish)');
    console.log(`7. Valid questions returned: ${json.proposal.questions.length} of ${body.count} (saved: ${json.proposal.saved})`);
  } else {
    const e = json && json.error ? json.error : { code: 'UNREADABLE_RESPONSE' };
    const stage = e.code === 'AI_OUTPUT_REJECTED'
      ? (e.details || []).some((d) => d.code === 'INVALID_JSON' || d.code === 'EMPTY_OUTPUT') ? 'JSON parsing' : 'validation/guard'
      : 'provider';
    console.log(`4-6. Stopped at: ${stage} -> safe error ${e.code}${e.details && e.details.length ? ' ' + JSON.stringify(e.details.map((d) => `${d.field}:${d.code}`)) : ''}`);
    console.log('   teacher-facing message:', e.message);
    console.log('7. Valid questions returned: 0');
  }
  console.log(`8. Database rows created: ${JSON.stringify(rowsBefore) === JSON.stringify(rowsAfter) ? 'none (temp DB counts unchanged)' : 'YES ' + JSON.stringify(rowsAfter)}; live LMS DB ${liveAfter === liveBefore ? 'untouched' : 'CHANGED'}`);
  console.log('9. Student/email data involved: none (synthetic topic; the prompt carries topic, subject, grade, count, difficulty and instructions only)');
  console.log(`10. API key exposed in response or logs: ${keyExposed ? 'YES' : 'no'} (the key is sent only in the x-goog-api-key header)`);
  if (ok) {
    console.log('\n--- questions returned to the teacher (unsaved proposal) ---');
    json.proposal.questions.forEach((q, i) => {
      console.log(`Q${i + 1} [${q.difficulty}] ${q.text}`);
      q.options.forEach((o, j) => console.log(`   ${'ABCD'[j]}. ${o.text}${o.isCorrect ? '   <- correct' : ''}`));
      console.log(`   explanation: ${q.explanation}`);
    });
  }
  await tmp.close();
  if (!ok) process.exitCode = 2;
}

main().catch((err) => { console.error('check failed before completion:', err.message); process.exitCode = 1; });
