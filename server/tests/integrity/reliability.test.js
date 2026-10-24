/**
 * Reliability: sessions that can be ended, health checks, failures that are answered
 * instead of hanging, request limits, paging and duplicate prevention.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

describe('reliability', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  const login = async (email, password = ctx.password) => (await ctx.api('POST', '/api/auth/login', { body: { email, password } })).body.token;
  const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100));

  describe('ending sessions', () => {
    it('logout ends the session on the server, on every device; a new login works', async () => {
      const phone = await login('mentora2@test.invalid');
      const laptop = await login('mentora2@test.invalid');
      assert.equal((await ctx.api('GET', '/api/courses/mentor', { token: phone })).status, 200);

      assert.equal((await ctx.api('POST', '/api/auth/logout', { token: phone })).status, 200);
      assert.equal((await ctx.api('GET', '/api/courses/mentor', { token: phone })).status, 401);
      assert.equal((await ctx.api('GET', '/api/courses/mentor', { token: laptop })).status, 401);

      await nextSecond();
      const fresh = await login('mentora2@test.invalid');
      assert.equal((await ctx.api('GET', '/api/courses/mentor', { token: fresh })).status, 200);
      // other accounts were not affected
      assert.equal((await ctx.api('GET', '/api/courses/mentor', { as: 'mentorA' })).status, 200);
    });

    it('logout needs a session', async () => {
      assert.equal((await ctx.api('POST', '/api/auth/logout')).status, 401);
    });

    it('resetting a password signs out whoever was using the old one', async () => {
      const email = 'studenta2@test.invalid';
      const stolen = await login(email);
      await nextSecond();
      const outbox = require(path.join(SERVER_ROOT, 'services', 'emailService')).outbox;
      await ctx.api('POST', '/api/password-reset/send-otp', { body: { email } });
      const code = [...outbox].reverse().find((mail) => mail.to === email).html.match(/>(\d{6})</)[1];
      await ctx.api('POST', '/api/password-reset/verify-otp', { body: { email, otp: code } });
      const reset = await ctx.api('POST', '/api/password-reset/reset-password', { body: { email, newPassword: 'After-Reset-Passw0rd', confirmPassword: 'After-Reset-Passw0rd' } });
      assert.equal(reset.status, 200);
      assert.equal((await ctx.api('GET', '/api/courses/student', { token: stolen })).status, 401);
      const fresh = await login(email, 'After-Reset-Passw0rd');
      assert.equal((await ctx.api('GET', '/api/courses/student', { token: fresh })).status, 200);
    });
  });

  describe('health and request tracing', () => {
    it('liveness and readiness answer without a login; readiness checks the database', async () => {
      const live = await fetch(`${ctx.base}/health`);
      const ready = await fetch(`${ctx.base}/health/ready`);
      assert.equal(live.status, 200);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: 'ready' });
    });

    it('every response carries a request id, including errors', async () => {
      const ok = await ctx.api('GET', '/api/courses', { as: 'adminA' });
      const denied = await ctx.api('GET', '/api/courses');
      assert.match(ok.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
      assert.match(denied.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
      assert.notEqual(ok.headers.get('x-request-id'), denied.headers.get('x-request-id'));
    });
  });

  describe('failures are answered, not left hanging', () => {
    // A small app built the way server.js builds the real one
    const serve = (configure) =>
      new Promise((resolve) => {
        require(path.join(SERVER_ROOT, 'middleware', 'asyncErrors'));
        const express = require(path.join(SERVER_ROOT, 'node_modules', 'express'));
        const { globalErrorHandler } = require(path.join(SERVER_ROOT, 'middleware', 'global-error-handler'));
        const app = express();
        configure(app);
        app.use(globalErrorHandler);
        const server = http.createServer(app).listen(0, '127.0.0.1', () => resolve(server));
      });

    it('an async handler that throws, a rejected promise and a synchronous throw all get a safe 500', async () => {
      const server = await serve((app) => {
        app.get('/async-throw', async () => { throw new Error('SECRET-DETAIL database password=hunter2'); });
        app.get('/reject', () => Promise.reject(new Error('SECRET-DETAIL upstream timed out')));
        app.get('/sync-throw', () => { throw new Error('SECRET-DETAIL boom'); });
        app.get('/async-middleware', async (req, res, next) => { await Promise.resolve(); next(); }, (req, res) => res.json({ ok: true }));
      });
      const realError = console.error;
      console.error = () => {};
      try {
        const base = `http://127.0.0.1:${server.address().port}`;
        for (const url of ['/async-throw', '/reject', '/sync-throw']) {
          const response = await fetch(base + url, { signal: AbortSignal.timeout(5000) });
          const text = await response.text();
          assert.equal(response.status, 500, url);
          assert.equal(text.includes('SECRET-DETAIL'), false, url);
          assert.equal(JSON.parse(text).success, false);
        }
        assert.equal((await fetch(`${base}/async-middleware`)).status, 200);
      } finally {
        console.error = realError;
        server.close();
      }
    });

    it('an oversized JSON body is refused with 413 and a wrong content is refused with 400', async () => {
      const big = await ctx.api('POST', '/api/auth/login', { body: { email: 'a@test.invalid', password: 'x'.repeat(6 * 1024 * 1024) } });
      assert.equal(big.status, 413);
      const broken = await ctx.api('POST', '/api/auth/login', { body: '{"email": "a@test.invalid", ' });
      assert.equal(broken.status, 400);
      assert.equal((await fetch(`${ctx.base}/health`)).status, 200);
    });

    it('wrong types and unexpected shapes get a 4xx, never a 5xx', async () => {
      const probes = [
        ['POST', '/api/auth/login', { email: ['a'], password: { $gt: '' } }],
        ['POST', '/api/auth/login', []],
        ['POST', '/api/attendance/mark', { classroomId: [ids.classroomA], date: {}, attendanceData: {} }],
        ['POST', '/api/results', { classroomId: 'abc', studentId: null }],
        ['GET', '/api/courses/abc'],
        ['GET', '/api/users/999999999999999999999'],
        ['GET', '/api/classrooms/-1/students'],
        ['GET', `/api/results/student/${ids.users.studentA}%00`],
        ['GET', '/api/attendance?classroomId=1%20OR%201=1&date=2026-01-15'],
      ];
      for (const [method, url, body] of probes) {
        const response = await ctx.api(method, url, { as: 'adminA', body });
        assert.ok(response.status >= 400 && response.status < 500, `${method} ${url} -> ${response.status}`);
      }
    });
  });

  describe('large collections and repeated writes', () => {
    it('lists can be paged, with the total in a header and a ceiling on the page size', async () => {
      for (let i = 0; i < 30; i++) {
        await ctx.db.run("INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES (?, ?, 'x', 'student', 1, 1)", [`Bulk ${i}`, `bulk${i}@test.invalid`]);
      }
      const firstPage = await ctx.api('GET', '/api/users?role=student&limit=10', { as: 'adminA' });
      const secondPage = await ctx.api('GET', '/api/users?role=student&limit=10&offset=10', { as: 'adminA' });
      assert.equal(firstPage.body.data.length, 10);
      assert.equal(firstPage.headers.get('x-total-count'), '32');
      const overlap = firstPage.body.data.filter((user) => secondPage.body.data.some((other) => other.id === user.id));
      assert.equal(overlap.length, 0);
      const huge = await ctx.api('GET', '/api/users?limit=100000', { as: 'adminA' });
      assert.ok(huge.body.data.length <= 500);
      // paging never crosses the school boundary
      assert.equal(JSON.stringify([firstPage.body, secondPage.body, huge.body]).includes('studentb@test.invalid'), false);
      // without ?limit the old behaviour (everything) is unchanged
      assert.equal((await ctx.api('GET', '/api/users?role=student', { as: 'adminA' })).body.data.length, 32);
    });

    it('two simultaneous submissions of one assessment leave a single attempt', async () => {
      const submit = () => ctx.api('POST', '/api/assessments/submit', { as: 'studentA', body: { assessmentId: ids.assessmentA, answers: [] } });
      const responses = await Promise.all([submit(), submit(), submit()]);
      assert.ok(responses.every((response) => response.status < 500), responses.map((r) => r.status).join(','));
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM assessment_attempts WHERE assessmentId = ? AND studentId = ?', [ids.assessmentA, ids.users.studentA])).n, 1);
    });

    it('the lookup indexes exist', async () => {
      // PostgreSQL folds unquoted index names to lower case
      const names = (await ctx.db.all('SELECT indexname AS name FROM pg_indexes WHERE schemaname = current_schema()')).map((row) => row.name);
      for (const expected of ['idx_users_university_id_role', 'idx_course_students_studentId', 'idx_courses_classroomId', 'idx_results_classroomId', 'idx_payments_studentId', 'idx_assessment_attempts_one_per_student']) {
        assert.ok(names.includes(expected.toLowerCase()), `missing ${expected}`);
      }
    });
  });
});
