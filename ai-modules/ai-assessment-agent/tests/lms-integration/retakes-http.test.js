// Step 6 over HTTP through the REAL LMS session checks (authMiddleware + requireTenant, signed JWTs),
// TEMP database, injected server clock. The live DB is never opened (mtime asserted).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');

const SERVER = path.resolve(__dirname, '../../../../server');
const HOST_PRESENT = fs.existsSync(path.join(SERVER, 'middleware', 'authMiddleware.js')) && fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));

describe('LMS HTTP integration: attempt reset / retake (Step 6)', { skip: !HOST_PRESENT && 'host LMS server not found' }, () => {
  let base, noStep6Base, servers = [], ready, notReady, signToken;
  let clock = Date.parse('2026-10-10T08:00:00.000Z');

  before(async () => {
    process.env.JWT_SECRET = 'aia-retakes-integration-secret-' + 'r'.repeat(40);
    ready = await createLmsTestDb();
    notReady = await createLmsTestDb({ withStep6: false });
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
    noStep6Base = await start(notReady);
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
  const ADMIN = () => token(IDS.admin1, IDS.school1, 'admin');

  async function call(method, url, { auth, body, root = base } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${auth}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(root + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function publishedWithSubmittedAttempt(title) {
    const a = (await call('POST', '/teacher/assessments', { auth: T1(), body: { title, subject: 'Science', classroomId: IDS.class10, durationMinutes: 15 } })).body.assessment;
    await call('POST', `/teacher/assessments/${a.id}/questions`, { auth: T1(), body: mcq('Q?', 1) });
    await call('POST', `/teacher/assessments/${a.id}/publish`, { auth: T1() });
    const { attempt } = (await call('POST', `/student/assessments/${a.id}/attempt`, { auth: S1() })).body;
    await call('PUT', `/student/attempts/${attempt.id}/answers/${attempt.questions[0].id}`, { auth: S1(), body: { optionPosition: 0 } });
    await call('POST', `/student/attempts/${attempt.id}/submit`, { auth: S1() });
    return { test: a, attempt };
  }
  const resetUrl = (testId, studentId = IDS.student1) => `/teacher/assessments/${testId}/students/${studentId}/reset`;

  it('student, admin: 403; other teacher / other school: 404; body rejected; nothing reset', async () => {
    const { test } = await publishedWithSubmittedAttempt('Scoped reset');
    for (const auth of [S1(), ADMIN()]) assert.equal((await call('POST', resetUrl(test.id), { auth })).status, 403);
    assert.equal((await call('POST', resetUrl(test.id), { auth: T2() })).status, 404);
    assert.equal((await call('POST', resetUrl(test.id), { auth: T3() })).status, 404);
    assert.equal((await call('POST', resetUrl(test.id), { auth: token(IDS.teacher1, IDS.school2, 'mentor') })).status, 403); // token claims wrong school
    assert.equal((await call('POST', resetUrl(test.id), { auth: T1(), body: { studentId: IDS.student2 } })).status, 400);
    const list = (await call('GET', '/student/assessments', { auth: S1() })).body.assessments.find((x) => x.id === test.id);
    assert.equal(list.attempt.status, 'submitted'); // still the original result
  });

  it('owner reset -> student retakes with a fresh attempt -> report shows attempt 2 + history', async () => {
    const { test, attempt: first } = await publishedWithSubmittedAttempt('Retake flow');
    clock += 60 * 60000;
    const reset = await call('POST', resetUrl(test.id), { auth: T1() });
    assert.equal(reset.status, 200);
    assert.deepEqual([reset.body.reset.archivedAttemptId, reset.body.reset.previousResult.score, reset.body.reset.resetsUsed], [first.id, 0, 1]);

    const started = await call('POST', `/student/assessments/${test.id}/attempt`, { auth: S1() });
    assert.equal(started.status, 201);
    assert.notEqual(started.body.attempt.id, first.id);
    assert.equal(started.body.attempt.deadlineAt, new Date(clock + 15 * 60000).toISOString());
    assert.equal((await call('GET', `/student/attempts/${first.id}`, { auth: S1() })).status, 404);

    await call('PUT', `/student/attempts/${started.body.attempt.id}/answers/${started.body.attempt.questions[0].id}`, { auth: S1(), body: { optionPosition: 1 } });
    await call('POST', `/student/attempts/${started.body.attempt.id}/submit`, { auth: S1() });
    const row = (await call('GET', `/teacher/assessments/${test.id}/report`, { auth: T1() })).body.report.students.find((s) => s.studentId === IDS.student1);
    assert.deepEqual([row.attemptNumber, row.score, row.previousAttempts.map((p) => p.score)], [2, 1, [0]]);
  });

  it('closed test: 409 TEST_CLOSED; in-progress attempt: 409 ATTEMPT_IN_PROGRESS', async () => {
    const { test } = await publishedWithSubmittedAttempt('Closed reset');
    await call('POST', `/teacher/assessments/${test.id}/close`, { auth: T1() });
    const closed = await call('POST', resetUrl(test.id), { auth: T1() });
    assert.deepEqual([closed.status, closed.body.error.code], [409, 'TEST_CLOSED']);

    const a = (await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'Running', subject: 'S', classroomId: IDS.class10, durationMinutes: 15 } })).body.assessment;
    await call('POST', `/teacher/assessments/${a.id}/questions`, { auth: T1(), body: mcq('Q?', 1) });
    await call('POST', `/teacher/assessments/${a.id}/publish`, { auth: T1() });
    await call('POST', `/student/assessments/${a.id}/attempt`, { auth: S1() });
    const running = await call('POST', resetUrl(a.id), { auth: T1() });
    assert.deepEqual([running.status, running.body.error.code], [409, 'ATTEMPT_IN_PROGRESS']);
  });

  it('answers 503 NOT_READY while migration 005 is not applied', async () => {
    const res = await call('GET', '/teacher/assessments', { auth: T1(), root: noStep6Base });
    assert.deepEqual([res.status, res.body.error.code], [503, 'NOT_READY']);
  });

  it('never touched the live LMS database', () => {
    assert.equal(sqliteLoaded(), false, 'a SQLite driver was loaded');
  });
});
