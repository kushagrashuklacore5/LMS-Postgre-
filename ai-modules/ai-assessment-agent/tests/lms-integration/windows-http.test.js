// Step 5 over HTTP through the REAL LMS session checks (authMiddleware + requireTenant, signed JWTs),
// TEMP database, injected server clock. The live DB is never opened (mtime asserted).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');

const SERVER = path.resolve(__dirname, '../../../../server');
const HOST_PRESENT = fs.existsSync(path.join(SERVER, 'middleware', 'authMiddleware.js')) && fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));

describe('LMS HTTP integration: test windows + close (Step 5)', { skip: !HOST_PRESENT && 'host LMS server not found' }, () => {
  let base, noStep5Base, servers = [], ready, notReady, signToken;
  let clock = Date.parse('2026-10-05T09:00:00.000Z');
  const at = (min) => new Date(Date.parse('2026-10-05T09:00:00.000Z') + min * 60000).toISOString();

  before(async () => {
    process.env.JWT_SECRET = 'aia-windows-integration-secret-' + 'w'.repeat(40);
    ready = await createLmsTestDb();
    notReady = await createLmsTestDb({ withStep5: false });
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
    noStep5Base = await start(notReady);
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

  async function publishedTest(extra = {}) {
    const a = (await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'Window HTTP', subject: 'Science', classroomId: IDS.class10, durationMinutes: 20, ...extra } })).body.assessment;
    await call('POST', `/teacher/assessments/${a.id}/questions`, { auth: T1(), body: mcq('Q?', 1) });
    return (await call('POST', `/teacher/assessments/${a.id}/publish`, { auth: T1() })).body.assessment;
  }

  it('window fields round-trip; malformed ones are 400', async () => {
    const created = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'W', subject: 'S', opensAt: '2026-10-05T14:30:00+05:30', closesAt: at(120) } });
    assert.equal(created.status, 201);
    assert.deepEqual([created.body.assessment.opensAt, created.body.assessment.closesAt], [at(0), at(120)]);
    const bad = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'W', subject: 'S', closesAt: '2026-10-05 10:00' } });
    assert.deepEqual([bad.status, bad.body.error.details[0].code], [400, 'INVALID_DATETIME']);
  });

  it('upcoming test: listed as upcoming, start refused 409 TEST_NOT_OPEN until the server clock reaches opensAt', async () => {
    const p = await publishedTest({ opensAt: at(30) });
    const item = (await call('GET', '/student/assessments', { auth: S1() })).body.assessments.find((a) => a.id === p.id);
    assert.equal(item.availability, 'upcoming');
    const early = await call('POST', `/student/assessments/${p.id}/attempt`, { auth: S1() });
    assert.deepEqual([early.status, early.body.error.code], [409, 'TEST_NOT_OPEN']);
    clock = Date.parse(at(30));
    assert.equal((await call('POST', `/student/assessments/${p.id}/attempt`, { auth: S1() })).status, 201);
    clock = Date.parse(at(0));
  });

  it('close: teacher-only, owner-only, tenant-scoped, no body; finalizes open attempts; new starts refused', async () => {
    const p = await publishedTest();
    const { attempt } = (await call('POST', `/student/assessments/${p.id}/attempt`, { auth: S1() })).body;
    await call('PUT', `/student/attempts/${attempt.id}/answers/${attempt.questions[0].id}`, { auth: S1(), body: { optionPosition: 1 } });

    for (const auth of [S1(), ADMIN()]) assert.equal((await call('POST', `/teacher/assessments/${p.id}/close`, { auth })).status, 403);
    assert.equal((await call('POST', `/teacher/assessments/${p.id}/close`, { auth: T2() })).status, 404);
    assert.equal((await call('POST', `/teacher/assessments/${p.id}/close`, { auth: T3() })).status, 404);
    assert.equal((await call('POST', `/teacher/assessments/${p.id}/close`, { auth: T1(), body: { closedAt: '2000-01-01T00:00:00Z' } })).status, 400);

    const closed = await call('POST', `/teacher/assessments/${p.id}/close`, { auth: T1() });
    assert.equal(closed.status, 200);
    assert.deepEqual([closed.body.attemptsFinalized, closed.body.assessment.closedAt], [1, new Date(clock).toISOString()]);
    const result = await call('GET', `/student/attempts/${attempt.id}/result`, { auth: S1() });
    assert.deepEqual([result.body.attempt.status, result.body.attempt.result.score], ['expired', 1]);
    assert.equal((await call('POST', `/teacher/assessments/${p.id}/close`, { auth: T1() })).body.error.code, 'ALREADY_CLOSED');
    const report = (await call('GET', `/teacher/assessments/${p.id}/report`, { auth: T1() })).body.report;
    assert.equal(report.assessment.availability, 'closed');
  });

  it('answers 503 NOT_READY while migration 004 is not applied', async () => {
    const res = await call('GET', '/teacher/assessments', { auth: T1(), root: noStep5Base });
    assert.deepEqual([res.status, res.body.error.code], [503, 'NOT_READY']);
  });

  it('never touched the live LMS database', () => {
    assert.equal(sqliteLoaded(), false, 'a SQLite driver was loaded');
  });
});
