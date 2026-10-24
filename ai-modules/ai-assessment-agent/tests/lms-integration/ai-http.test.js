// Step 2 end-to-end through the REAL LMS session checks (authMiddleware + requireTenant, signed JWTs),
// with a MOCK LLM provider (no real Gemini) and a TEMP database. The live DB is never opened.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');
const { MockProvider, hangingProvider, providerError, genOutput } = require('../helpers/mockProvider');

const SERVER = path.resolve(__dirname, '../../../../server');
const HOST_PRESENT = fs.existsSync(path.join(SERVER, 'middleware', 'authMiddleware.js')) && fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));
const FAKE_KEY = 'fake-key-MUST-NOT-APPEAR-anywhere-0000';

describe('LMS HTTP integration: AI generation (Step 2)', { skip: !HOST_PRESENT && 'host LMS server not found' }, () => {
  let servers = [], ready, signToken, db;
  let aiBase, noAiBase, slowBase;
  // The mock's behaviour is switched per test.
  let respond = () => genOutput(3);
  const mock = new MockProvider((req) => respond(req));

  before(async () => {
    process.env.JWT_SECRET = 'aia-ai-integration-test-secret-' + 'y'.repeat(40);
    ready = await createLmsTestDb();

    const lmsDb = ready.hostDatabase();
    for (const mod of ['config/database-switch.js']) {
      const file = path.join(SERVER, mod);
      require.cache[file] = { id: file, filename: file, loaded: true, exports: lmsDb };
    }
    const express = require(path.join(SERVER, 'node_modules', 'express'));
    ({ signToken } = require(path.join(SERVER, 'config', 'jwt')));
    const requireAuth = require(path.join(SERVER, 'middleware', 'authMiddleware'));
    const requireTenant = require(path.join(SERVER, 'middleware', 'requireTenant'));
    const { createLmsAssessmentAgentRouter, assessmentErrorHandler } = require('../../backend/src/integration/lmsAssessmentAgent');

    const start = (options) => new Promise((resolve) => {
      const app = express();
      app.use('/api/assessment-agent', requireAuth, requireTenant, createLmsAssessmentAgentRouter({ express, database: ready.sql, schema: ready.schema, ...options }), assessmentErrorHandler);
      const s = app.listen(0, '127.0.0.1', () => { servers.push(s); resolve(`http://127.0.0.1:${s.address().port}/api/assessment-agent`); });
    });
    // AI via mock provider (env deliberately has NO real key).
    aiBase = await start({ env: {}, generationProvider: mock });
    // No AI configuration at all: the real config + provider factory path.
    noAiBase = await start({ env: { SOA_GEMINI_API_KEY: '' } });
    // Provider that never answers + a short timeout.
    slowBase = await start({ env: { AIA_LLM_TIMEOUT_MS: '5000' }, generationProvider: hangingProvider() });

    db = ready; // read-only checks below
  });

  after(async () => {
    for (const s of servers) s.close();
    await ready.close();
  });

  beforeEach(() => { respond = () => genOutput(3); mock.calls.length = 0; });

  const token = (userId, universityId, role) => signToken({ userId, universityId, role, email: 'x@test', name: 'x' }, { expiresIn: '10m' });
  const T1 = () => token(IDS.teacher1, IDS.school1, 'mentor');
  const T3 = () => token(IDS.teacher3, IDS.school2, 'mentor');
  const S1 = () => token(IDS.student1, IDS.school1, 'student');
  const rows = async () => ({
    assessments: (await db.get('SELECT COUNT(*) AS n FROM aia_assessments')).n,
    questions: (await db.get('SELECT COUNT(*) AS n FROM aia_questions')).n,
  });
  const genBody = (over = {}) => ({ topic: 'Planets', subject: 'Science', classroomId: IDS.class10, count: 3, difficulty: 'medium', ...over });

  async function call(base, method, url, { auth, body } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${auth}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  }

  it('AI status for teachers; students are refused', async () => {
    assert.deepEqual((await call(aiBase, 'GET', '/teacher/ai/status', { auth: T1() })).body, { ai: { available: true, reason: null } });
    assert.deepEqual((await call(noAiBase, 'GET', '/teacher/ai/status', { auth: T1() })).body, { ai: { available: false, reason: 'AI_NOT_CONFIGURED' } });
    assert.equal((await call(aiBase, 'GET', '/teacher/ai/status', { auth: S1() })).status, 403);
  });

  it('2/13/16. teacher generates a PROPOSAL: nothing is saved or published', async () => {
    const before = await rows();
    const res = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.equal(res.status, 200);
    assert.equal(res.body.proposal.saved, false);
    assert.equal(res.body.proposal.questions.length, 3);
    assert.equal(res.body.generatedBy, 'mock');
    assert.deepEqual(await rows(), before);
    assert.deepEqual((await call(aiBase, 'GET', '/student/assessments', { auth: S1() })).body.assessments, []);
  });

  it('Step 4: nothing from the LMS user directory (names, emails, ids) reaches the LLM prompt', async () => {
    const res = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.equal(res.status, 200);
    const sent = JSON.stringify(mock.calls[0]);
    const users = await db.all('SELECT id, name, email FROM users');
    for (const u of users) {
      assert.equal(sent.includes(u.name), false, `name of user ${u.id} sent to LLM`);
      assert.equal(sent.includes(u.email), false, `email of user ${u.id} sent to LLM`);
    }
    for (const field of ['classroomId', 'universityId', 'teacherId', 'studentId', 'Grade 10 - A']) assert.equal(sent.includes(field), false, field);
    assert.match(sent, /Planets/); // the teacher's topic is what is sent
  });

  it('14. students cannot invoke generation (provider never called)', async () => {
    const res = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: S1(), body: genBody() });
    assert.equal(res.status, 403);
    assert.equal(mock.calls.length, 0);
  });

  it('15. generation cannot target another school\'s class, and tenant fields are rejected (provider never called)', async () => {
    const cross = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody({ classroomId: IDS.class20 }) });
    assert.equal(cross.status, 400);
    assert.equal(cross.body.error.details[0].code, 'CLASSROOM_NOT_FOUND');
    const forged = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody({ universityId: IDS.school2, teacherId: IDS.teacher3 }) });
    assert.equal(forged.status, 400);
    const wrongSchool = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: token(IDS.teacher1, IDS.school2, 'mentor'), body: genBody() });
    assert.equal(wrongSchool.status, 403);
    assert.equal(mock.calls.length, 0);
  });

  it('17. review -> edit -> explicit save -> draft -> publish through the normal Step 1 path', async () => {
    const gen = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    const questions = gen.body.proposal.questions;
    // Teacher edits: change text, change the correct option, edit explanation, remove one, add a manual one.
    questions[0].text = 'Edited: which planet is largest?';
    questions[0].options = questions[0].options.map((o, i) => ({ ...o, isCorrect: i === 3 }));
    questions[0].explanation = 'Teacher explanation.';
    questions.splice(1, 1);
    questions.push({ ...mcq('Manual question added in review?', 0), explanation: '', difficulty: null });

    const saved = await call(aiBase, 'POST', '/teacher/assessments/from-review', {
      auth: T1(), body: { assessment: { title: 'AI Planets', subject: 'Science', classroomId: IDS.class10 }, questions },
    });
    assert.equal(saved.status, 201);
    const a = saved.body.assessment;
    assert.equal(a.status, 'draft');
    assert.equal(a.questionCount, 3);
    assert.equal(a.questions[0].text, 'Edited: which planet is largest?');
    assert.equal(a.questions[0].options[3].isCorrect, true);
    assert.equal(a.questions[0].explanation, 'Teacher explanation.');
    assert.deepEqual((await call(aiBase, 'GET', '/student/assessments', { auth: S1() })).body.assessments, []);

    const published = await call(aiBase, 'POST', `/teacher/assessments/${a.id}/publish`, { auth: T1() });
    assert.equal(published.body.assessment.status, 'published');
    const view = await call(aiBase, 'GET', `/student/assessments/${a.id}`, { auth: S1() });
    assert.equal(view.status, 200);
    assert.equal(view.text.includes('isCorrect'), false);
    assert.equal(view.text.includes('explanation'), false);
    assert.equal((await call(aiBase, 'GET', `/teacher/assessments/${a.id}`, { auth: T3() })).status, 404); // other school
  });

  it('students cannot save reviewed content; invalid reviewed content is rejected whole', async () => {
    const q = { ...mcq('Q?'), explanation: 'x' };
    assert.equal((await call(aiBase, 'POST', '/teacher/assessments/from-review', { auth: S1(), body: { assessment: { title: 'T', subject: 'S' }, questions: [q] } })).status, 403);
    const before = await rows();
    const bad = { ...mcq('Bad?'), explanation: '' }; bad.options[0].isCorrect = true;
    const res = await call(aiBase, 'POST', '/teacher/assessments/from-review', { auth: T1(), body: { assessment: { title: 'T', subject: 'S' }, questions: [q, bad] } });
    assert.equal(res.status, 400);
    assert.deepEqual(await rows(), before);
  });

  it('3-8 over HTTP: malformed model output -> 422 AI_OUTPUT_REJECTED with codes only', async () => {
    for (const [output, expected] of [
      ['{not json', 'INVALID_JSON'],
      [genOutput(3, (q) => { delete q[0].question; }), 'MISSING_FIELD'],
      [genOutput(3, (q) => { q[0].options.pop(); }), 'WRONG_OPTION_COUNT'],
      [genOutput(3, (q) => { q[0].correctAnswer = [q[0].options[0], q[0].options[1]]; }), 'MULTIPLE_CORRECT_ANSWERS'],
      [genOutput(3, (q) => { q[0].correctAnswer = 'not an option'; }), 'CORRECT_ANSWER_NOT_IN_OPTIONS'],
      [genOutput(3, (q) => { q[1].question = q[0].question; }), 'DUPLICATE_QUESTION'],
      [genOutput(2), 'WRONG_QUESTION_COUNT'],
    ]) {
      respond = () => output;
      const res = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
      assert.equal(res.status, 422, expected);
      assert.equal(res.body.error.code, 'AI_OUTPUT_REJECTED');
      assert.ok(res.body.error.details.some((d) => d.code === expected), expected);
      assert.equal(res.body.proposal, undefined);
    }
  });

  it('10/11. provider 429 and 503 map to safe errors (no key, no provider text)', async () => {
    respond = () => providerError('RATE_LIMITED', 429);
    const limited = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.deepEqual([limited.status, limited.body.error.code], [429, 'AI_RATE_LIMITED']);
    respond = () => providerError('UNAVAILABLE', 503);
    const down = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.deepEqual([down.status, down.body.error.code], [503, 'AI_UNAVAILABLE']);
    respond = () => providerError('AUTH_FAILED', 401);
    const auth = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.deepEqual([auth.status, auth.body.error.code], [502, 'AI_CONFIGURATION_REJECTED']);
    for (const r of [limited, down, auth]) assert.equal(/stack|provider failed|key/i.test(r.text), false);
  });

  it('9. provider timeout -> 504 AI_TIMEOUT', async () => {
    const res = await call(slowBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.deepEqual([res.status, res.body.error.code], [504, 'AI_TIMEOUT']);
  });

  it('a second generation while one is running is refused (429 GENERATION_IN_PROGRESS)', async () => {
    let finish;
    respond = () => new Promise((resolve) => { finish = () => resolve(genOutput(3)); });
    const first = call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    while (!finish) await new Promise((r) => setTimeout(r, 5));
    const second = await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.deepEqual([second.status, second.body.error.code], [429, 'GENERATION_IN_PROGRESS']);
    finish();
    assert.equal((await first).status, 200);
  });

  it('12/18. without AI configuration: generation says 503, manual Step 1 creation still works fully', async () => {
    const gen = await call(noAiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() });
    assert.deepEqual([gen.status, gen.body.error.code], [503, 'AI_NOT_CONFIGURED']);
    assert.equal(gen.text.includes(FAKE_KEY), false);

    const created = await call(noAiBase, 'POST', '/teacher/assessments', { auth: T1(), body: { title: 'Manual', subject: 'Maths', classroomId: IDS.class11 } });
    assert.equal(created.status, 201);
    const withQ = await call(noAiBase, 'POST', `/teacher/assessments/${created.body.assessment.id}/questions`, { auth: T1(), body: mcq() });
    assert.equal(withQ.status, 201);
    const pub = await call(noAiBase, 'POST', `/teacher/assessments/${created.body.assessment.id}/publish`, { auth: T1() });
    assert.equal(pub.body.assessment.status, 'published');
  });

  it('18. manual creation also works while the configured provider is failing', async () => {
    respond = () => providerError('UNAVAILABLE', 503);
    assert.equal((await call(aiBase, 'POST', '/teacher/assessments/generate', { auth: T1(), body: genBody() })).status, 503);
    assert.equal((await call(aiBase, 'POST', '/teacher/assessments', { auth: T1(), body: { title: 'Fallback', subject: 'S' } })).status, 201);
  });

  it('never touched the live LMS database', () => {
    assert.equal(sqliteLoaded(), false, 'a SQLite driver was loaded');
  });
});
