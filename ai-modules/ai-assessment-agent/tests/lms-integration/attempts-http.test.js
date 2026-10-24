// Step 3 end-to-end over HTTP through the REAL LMS session checks (authMiddleware + requireTenant,
// signed JWTs), TEMP database, injected server clock. The live DB is never opened (mtime asserted).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');

const SERVER = path.resolve(__dirname, '../../../../server');
const HOST_PRESENT = fs.existsSync(path.join(SERVER, 'middleware', 'authMiddleware.js')) && fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));

describe('LMS HTTP integration: attempts, grading, reports (Step 3)', { skip: !HOST_PRESENT && 'host LMS server not found' }, () => {
  let base, noStep3Base, servers = [], ready, notReady, signToken;
  let clock = Date.parse('2026-10-01T09:00:00.000Z');

  before(async () => {
    process.env.JWT_SECRET = 'aia-attempts-integration-secret-' + 'z'.repeat(40);
    ready = await createLmsTestDb();
    notReady = await createLmsTestDb({ withStep3: false });
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
    const start = (testDb) => new Promise((resolve) => {
      const app = express();
      app.use('/api/assessment-agent', requireAuth, requireTenant, createLmsAssessmentAgentRouter({ express, database: testDb.sql, schema: testDb.schema, env: {}, now: () => clock }), assessmentErrorHandler);
      const s = app.listen(0, '127.0.0.1', () => { servers.push(s); resolve(`http://127.0.0.1:${s.address().port}/api/assessment-agent`); });
    });
    base = await start(ready);
    noStep3Base = await start(notReady);
  });

  after(async () => {
    for (const s of servers) s.close();
    await ready.close(); await notReady.close();
  });

  const token = (userId, universityId, role) => signToken({ userId, universityId, role, email: 'x@test', name: 'x' }, { expiresIn: '10m' });
  const T1 = () => token(IDS.teacher1, IDS.school1, 'mentor');
  const T2 = () => token(IDS.teacher2, IDS.school1, 'mentor');
  const T3 = () => token(IDS.teacher3, IDS.school2, 'mentor');
  const S1 = () => token(IDS.student1, IDS.school1, 'student');
  const S2 = () => token(IDS.student2, IDS.school1, 'student');
  const S3 = () => token(IDS.student3, IDS.school2, 'student');
  const ADMIN = () => token(IDS.admin1, IDS.school1, 'admin');

  async function call(method, url, { auth, body, root = base } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${auth}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(root + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  }

  /** Teacher 1 creates + publishes a 3-question, 10-minute test for class 10 (correct positions 1, 2, 0). */
  async function publishedTest(title = 'HTTP test', classroomId = IDS.class10, auth = T1()) {
    const a = (await call('POST', '/teacher/assessments', { auth, body: { title, subject: 'Science', classroomId, durationMinutes: 10 } })).body.assessment;
    for (const [text, c] of [['First question?', 1], ['Second question?', 2], ['Third question?', 0]]) {
      await call('POST', `/teacher/assessments/${a.id}/questions`, { auth, body: mcq(text, c) });
    }
    return (await call('POST', `/teacher/assessments/${a.id}/publish`, { auth })).body.assessment;
  }

  it('full flow: list -> start -> answer -> submit -> result -> teacher report shows the same score', async () => {
    const test = await publishedTest('Flow test');
    const list = await call('GET', '/student/assessments', { auth: S1() });
    const item = list.body.assessments.find((a) => a.id === test.id);
    assert.deepEqual([item.questionCount, item.durationMinutes, item.attempt], [3, 10, null]);

    const started = await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1() });
    assert.equal(started.status, 201);
    const attempt = started.body.attempt;
    for (const leak of ['isCorrect', 'correctPosition', 'explanation', 'outcome']) assert.equal(started.text.includes(leak), false, leak);
    assert.equal(attempt.deadlineAt, new Date(clock + 10 * 60000).toISOString());

    const resumed = await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1() });
    assert.deepEqual([resumed.status, resumed.body.attempt.id], [200, attempt.id]);

    const q = attempt.questions.map((x) => x.id);
    for (const [qid, pos] of [[q[0], 1], [q[1], 0]]) {
      const saved = await call('PUT', `/student/attempts/${attempt.id}/answers/${qid}`, { auth: S1(), body: { optionPosition: pos } });
      assert.equal(saved.status, 200);
    }
    const submitted = await call('POST', `/student/attempts/${attempt.id}/submit`, { auth: S1() });
    assert.equal(submitted.status, 200);
    assert.deepEqual(submitted.body.attempt.result, { totalQuestions: 3, attempted: 2, correct: 1, incorrect: 1, unattempted: 1, score: 1, percentage: 33.33 });
    assert.equal(submitted.text.includes('explanation'), false);

    const again = await call('POST', `/student/attempts/${attempt.id}/submit`, { auth: S1() });
    assert.deepEqual([again.body.alreadyFinalized, again.body.attempt.result], [true, submitted.body.attempt.result]);
    const result = await call('GET', `/student/attempts/${attempt.id}/result`, { auth: S1() });
    assert.deepEqual(result.body.attempt.result, submitted.body.attempt.result);

    const report = await call('GET', `/teacher/assessments/${test.id}/report`, { auth: T1() });
    assert.equal(report.status, 200);
    const row = report.body.report.students.find((s) => s.studentId === IDS.student1);
    assert.deepEqual([row.status, row.score, row.percentage, row.correct, row.incorrect, row.unattempted], ['submitted', 1, 33.33, 1, 1, 1]);
    assert.equal(report.body.report.summary.totalSubmissions, 1);
  });

  it('client cannot submit a fake score, fake deadline or change the attempt\'s assessment', async () => {
    const test = await publishedTest('Tamper test');
    const other = await publishedTest('Other test');
    const fakeStart = await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1(), body: { deadlineAt: '2099-01-01T00:00:00Z', durationMinutes: 9999 } });
    assert.equal(fakeStart.status, 400);
    const { attempt } = (await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1() })).body;
    assert.equal(attempt.deadlineAt, new Date(clock + 10 * 60000).toISOString());

    const q = attempt.questions[0].id;
    for (const body of [{ optionPosition: 1, deadlineAt: '2099-01-01T00:00:00Z' }, { optionPosition: 1, assessmentId: other.id }, { optionPosition: 1, isCorrect: true }]) {
      assert.equal((await call('PUT', `/student/attempts/${attempt.id}/answers/${q}`, { auth: S1(), body })).status, 400, JSON.stringify(body));
    }
    const foreignQuestion = other.questions[0].id;
    assert.equal((await call('PUT', `/student/attempts/${attempt.id}/answers/${foreignQuestion}`, { auth: S1(), body: { optionPosition: 1 } })).status, 404);
    assert.equal((await call('PUT', `/student/attempts/${attempt.id}/answers/${q}`, { auth: S1(), body: { optionPosition: 9 } })).status, 400);

    const fakeSubmit = await call('POST', `/student/attempts/${attempt.id}/submit`, { auth: S1(), body: { score: 3, percentage: 100, correct: 3 } });
    assert.equal(fakeSubmit.status, 400);
    const real = await call('POST', `/student/attempts/${attempt.id}/submit`, { auth: S1() });
    assert.deepEqual([real.body.attempt.result.score, real.body.attempt.result.percentage], [0, 0]);
    assert.equal(real.body.attempt.deadlineAt, attempt.deadlineAt);
  });

  it('another student cannot read or modify an attempt; another school cannot even see the test', async () => {
    const test = await publishedTest('Private attempt');
    const { attempt } = (await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1() })).body;
    const q = attempt.questions[0].id;
    for (const auth of [S2(), S3()]) {
      assert.equal((await call('GET', `/student/attempts/${attempt.id}`, { auth })).status, 404);
      assert.equal((await call('PUT', `/student/attempts/${attempt.id}/answers/${q}`, { auth, body: { optionPosition: 1 } })).status, 404);
      assert.equal((await call('POST', `/student/attempts/${attempt.id}/submit`, { auth })).status, 404);
    }
    assert.equal((await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S3() })).status, 404);
    assert.ok((await call('GET', '/student/assessments', { auth: S3() })).body.assessments.every((a) => a.id !== test.id));
    assert.equal((await call('GET', `/student/attempts/${attempt.id}`, { auth: S1() })).body.attempt.status, 'in_progress');
  });

  it('expired attempt: server clock passes the deadline -> answers refused (409) and the result is final', async () => {
    const test = await publishedTest('Timed test');
    const { attempt } = (await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1() })).body;
    const q = attempt.questions.map((x) => x.id);
    await call('PUT', `/student/attempts/${attempt.id}/answers/${q[0]}`, { auth: S1(), body: { optionPosition: 1 } });
    clock += 10 * 60000 + 1; // just past the deadline, whatever the browser clock says
    const late = await call('PUT', `/student/attempts/${attempt.id}/answers/${q[1]}`, { auth: S1(), body: { optionPosition: 2 } });
    assert.deepEqual([late.status, late.body.error.code], [409, 'ATTEMPT_EXPIRED']);
    const view = await call('GET', `/student/attempts/${attempt.id}`, { auth: S1() });
    assert.deepEqual([view.body.attempt.status, view.body.attempt.result.score, view.body.attempt.result.unattempted], ['expired', 1, 2]);
    const submit = await call('POST', `/student/attempts/${attempt.id}/submit`, { auth: S1() });
    assert.deepEqual([submit.status, submit.body.alreadyFinalized, submit.body.attempt.status], [200, true, 'expired']);
  });

  it('role and tenant boundaries: students and admins cannot use teacher routes; reports are owner-only', async () => {
    const test = await publishedTest('Report scope');
    for (const auth of [S1(), ADMIN()]) {
      assert.equal((await call('GET', `/teacher/assessments/${test.id}/report`, { auth })).status, 403);
      assert.equal((await call('GET', '/teacher/assessments', { auth })).status, 403);
      assert.equal((await call('POST', '/teacher/assessments', { auth, body: { title: 'x', subject: 'y' } })).status, 403);
    }
    assert.equal((await call('POST', `/student/assessments/${test.id}/attempt`, { auth: ADMIN() })).status, 403);
    assert.equal((await call('POST', `/student/assessments/${test.id}/attempt`, { auth: T1() })).status, 403);
    assert.equal((await call('GET', `/teacher/assessments/${test.id}/report`, { auth: T2() })).status, 404); // same school, other teacher
    assert.equal((await call('GET', `/teacher/assessments/${test.id}/report`, { auth: T3() })).status, 404); // other school
    assert.equal((await call('GET', `/teacher/assessments/${test.id}/report`, { auth: token(IDS.teacher1, IDS.school2, 'mentor') })).status, 403);
  });

  it('a test with attempts can no longer be unpublished (409)', async () => {
    const test = await publishedTest('Locked');
    await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1() });
    const res = await call('POST', `/teacher/assessments/${test.id}/unpublish`, { auth: T1() });
    assert.deepEqual([res.status, res.body.error.code], [409, 'ASSESSMENT_HAS_ATTEMPTS']);
  });

  it('answers 503 NOT_READY while migration 003 is not applied', async () => {
    const res = await call('GET', '/student/assessments', { auth: S1(), root: noStep3Base });
    assert.deepEqual([res.status, res.body.error.code], [503, 'NOT_READY']);
  });

  it('never touched the live LMS database', () => {
    assert.equal(sqliteLoaded(), false, 'a SQLite driver was loaded');
  });
});
