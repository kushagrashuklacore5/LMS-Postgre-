// End-to-end HTTP tests through the REAL LMS session checks (server/middleware/authMiddleware +
// requireTenant, real signed JWTs) mounted exactly as server.js does, against a TEMP database.
// The live LMS database is never opened (asserted by mtime). Skipped if the host LMS is absent.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');

const SERVER = path.resolve(__dirname, '../../../../server');
const HOST_PRESENT = fs.existsSync(path.join(SERVER, 'middleware', 'authMiddleware.js')) && fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));

describe('LMS HTTP integration: /api/assessment-agent', { skip: !HOST_PRESENT && 'host LMS server not found' }, () => {
  let base, server, noMigrationServer, noMigrationBase, ready, notReady, signToken;

  before(async () => {
    process.env.JWT_SECRET = 'aia-integration-test-secret-' + 'x'.repeat(40);
    ready = await createLmsTestDb();
    notReady = await createLmsTestDb({ withMigration: false });

    // requireTenant reads universities through config/database-switch: point it at the temp DB (read-only).
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

    const build = (testDb) => {
      const app = express();
      app.use('/api/assessment-agent', requireAuth, requireTenant, createLmsAssessmentAgentRouter({ express, database: testDb.sql, schema: testDb.schema }), assessmentErrorHandler);
      app.use('/api', (req, res) => res.status(418).json({ host: 'catch-all' })); // stands in for universalRoutes
      return app;
    };
    const listen = (app) => new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    server = await listen(build(ready));
    noMigrationServer = await listen(build(notReady));
    base = `http://127.0.0.1:${server.address().port}/api/assessment-agent`;
    noMigrationBase = `http://127.0.0.1:${noMigrationServer.address().port}/api/assessment-agent`;
  });

  after(async () => {
    server && server.close();
    noMigrationServer && noMigrationServer.close();
    await ready.close(); await notReady.close();
  });

  const token = (userId, universityId, role) => signToken({ userId, universityId, role, email: 'x@test', name: 'x' }, { expiresIn: '10m' });
  const T1 = () => token(IDS.teacher1, IDS.school1, 'mentor');
  const T3 = () => token(IDS.teacher3, IDS.school2, 'mentor');
  const S1 = () => token(IDS.student1, IDS.school1, 'student');
  const S2 = () => token(IDS.student2, IDS.school1, 'student');

  async function call(method, url, { auth, body, raw, root = base } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${auth}`;
    if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(root + url, { method, headers, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  it('requires a valid LMS session (401 from the LMS auth middleware)', async () => {
    assert.equal((await call('GET', '/teacher/assessments')).status, 401);
    assert.equal((await call('GET', '/teacher/assessments', { auth: 'not-a-jwt' })).status, 401);
  });

  it('teacher flow: create draft -> add question -> retrieve -> publish -> student sees it without answers', async () => {
    const created = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'HTTP quiz', subject: 'Science', classroomId: IDS.class10, durationMinutes: 15 } });
    assert.equal(created.status, 201);
    const id = created.body.assessment.id;
    assert.equal(created.body.assessment.status, 'draft');

    const withQ = await call('POST', `/teacher/assessments/${id}/questions`, { auth: T1(), body: mcq('Water boils at?', 2) });
    assert.equal(withQ.status, 201);
    assert.equal(withQ.body.assessment.questions[0].options[2].isCorrect, true);

    const list = await call('GET', '/teacher/assessments', { auth: T1() });
    assert.ok(list.body.assessments.some((a) => a.id === id && a.questionCount === 1));
    const draft = await call('GET', `/teacher/assessments/${id}`, { auth: T1() });
    assert.equal(draft.body.assessment.questions.length, 1);

    // Regression: a bodyless write right after requireTenant's database query must not stall (see handle()).
    const published = await call('POST', `/teacher/assessments/${id}/publish`, { auth: T1() });
    assert.equal(published.status, 200);
    assert.equal(published.body.assessment.status, 'published');

    const studentList = await call('GET', '/student/assessments', { auth: S1() });
    assert.ok(studentList.body.assessments.some((a) => a.id === id));
    const studentView = await call('GET', `/student/assessments/${id}`, { auth: S1() });
    assert.equal(studentView.status, 200);
    assert.equal(JSON.stringify(studentView.body).includes('isCorrect'), false);

    assert.equal((await call('GET', `/student/assessments/${id}`, { auth: S2() })).status, 404); // other class
    assert.deepEqual((await call('GET', '/student/assessments', { auth: S2() })).body.assessments, []);
  });

  it('students cannot create or modify tests (403) and nothing is written', async () => {
    const own = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'Guarded', subject: 'S' } });
    const id = own.body.assessment.id;
    for (const [method, url, body] of [
      ['POST', '/teacher/assessments', { title: 'Hack', subject: 'S' }],
      ['PATCH', `/teacher/assessments/${id}`, { title: 'Hack' }],
      ['POST', `/teacher/assessments/${id}/questions`, mcq()],
      ['POST', `/teacher/assessments/${id}/publish`, undefined],
      ['GET', `/teacher/assessments/${id}`, undefined],
    ]) {
      const res = await call(method, url, { auth: S1(), body });
      assert.equal(res.status, 403, `${method} ${url}`);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    }
    const after = await call('GET', `/teacher/assessments/${id}`, { auth: T1() });
    assert.equal(after.body.assessment.title, 'Guarded');
    assert.equal(after.body.assessment.questionCount, 0);
  });

  it('LMS admins are not teachers here (403)', async () => {
    const res = await call('POST', '/teacher/assessments', { auth: token(IDS.admin1, IDS.school1, 'admin'), body: { title: 'x', subject: 'y' } });
    assert.equal(res.status, 403);
  });

  it('client-supplied tenant/owner/status/role fields are rejected, not trusted', async () => {
    const res = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'x', subject: 'y', universityId: IDS.school2, teacherId: IDS.teacher3, status: 'published', role: 'mentor' } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.map((d) => d.field), ['universityId', 'teacherId', 'status', 'role']);
  });

  it('tenant isolation: another school\'s teacher gets 404; a token claiming the wrong school gets 403', async () => {
    const own = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'School 1', subject: 'S' } });
    const id = own.body.assessment.id;
    assert.equal((await call('GET', `/teacher/assessments/${id}`, { auth: T3() })).status, 404);
    assert.equal((await call('PATCH', `/teacher/assessments/${id}`, { auth: T3(), body: { title: 'x' } })).status, 404);
    assert.ok((await call('GET', '/teacher/assessments', { auth: T3() })).body.assessments.every((a) => a.id !== id));

    // Signed token for teacher 1 but claiming school 2 (which exists): requireTenant passes, the agent refuses.
    const wrongSchool = await call('GET', '/teacher/assessments', { auth: token(IDS.teacher1, IDS.school2, 'mentor') });
    assert.equal(wrongSchool.status, 403);
    assert.equal(wrongSchool.body.error.code, 'TENANT_MISMATCH');
    // A school that does not exist is stopped by the LMS's requireTenant.
    assert.equal((await call('GET', '/teacher/assessments', { auth: token(IDS.teacher1, 999, 'mentor') })).status, 403);
    // Classroom of another school.
    const cross = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'x', subject: 'y', classroomId: IDS.class20 } });
    assert.equal(cross.status, 400);
    assert.equal(cross.body.error.details[0].code, 'CLASSROOM_NOT_FOUND');
  });

  it('question validation errors come back as 400 with codes', async () => {
    const own = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'V', subject: 'S' } });
    const bad = mcq(); bad.options[3].isCorrect = true;
    const res = await call('POST', `/teacher/assessments/${own.body.assessment.id}/questions`, { auth: T1(), body: bad });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details, [{ field: 'options', code: 'MULTIPLE_CORRECT_OPTIONS' }]);
  });

  it('returns safe JSON for bad JSON, bodies on publish, and unknown paths (no fall-through to host routes)', async () => {
    const badJson = await call('POST', '/teacher/assessments', { auth: T1(), raw: '{"title":' });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.body.error.code, 'INVALID_JSON');

    const own = await call('POST', '/teacher/assessments', { auth: T1(), body: { title: 'P', subject: 'S' } });
    const withBody = await call('POST', `/teacher/assessments/${own.body.assessment.id}/publish`, { auth: T1(), body: { status: 'published' } });
    assert.equal(withBody.status, 400);

    const unknown = await call('GET', '/teacher/nope', { auth: T1() });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'ROUTE_NOT_FOUND');
    // Paths outside the mount still reach the host's own routes.
    assert.equal((await call('GET', '/other', { auth: T1(), root: base.replace('/assessment-agent', '') })).status, 418);
  });

  it('answers 503 NOT_READY (and creates nothing) when the migration has not been applied', async () => {
    const res = await call('GET', '/teacher/assessments', { auth: T1(), root: noMigrationBase });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'NOT_READY');
    assert.equal((await notReady.get('SELECT COUNT(*) AS n FROM aia_assessments')).n, 0);
  });

  it('the LMS wrapper route file loads without opening the database', () => {
    const wrapper = require(path.join(SERVER, 'routes', 'assessmentAgentRoutes.js'));
    assert.equal(typeof wrapper.router, 'function');
    assert.equal(typeof wrapper.errorHandler, 'function');
  });

  it('never touched the live LMS database', () => {
    assert.equal(sqliteLoaded(), false, 'a SQLite driver was loaded');
  });
});
