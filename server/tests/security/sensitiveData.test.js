/**
 * Sensitive data never leaves the server (audit findings SEC-001, SEC-018, SEC-021).
 * Every GET route is called as every role; no response may contain a password, a password
 * hash, a one-time code, a payment gateway signature, a secret or a stack trace.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');
const { listRoutes } = require('../helpers/routeInventory');

const SECRET_FIELD = /"(password|password_hash|passwordHash|db_password|otp|razorpay_signature|key_secret|jwt_secret|refreshToken)"\s*:/i;
const BCRYPT_HASH = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/;
const INTERNALS = /(SQLITE_[A-Z]+|relation "\w+" does not exist|violates (?:unique|not-null|foreign key) constraint|at [\w.<>]+ \(.*:\d+:\d+\)|node_modules[\\/]|[A-Z]:\\\\Users|\/home\/\w+\/)/;

function problemsIn(text) {
  const problems = [];
  if (SECRET_FIELD.test(text)) problems.push(`secret field ${text.match(SECRET_FIELD)[1]}`);
  if (BCRYPT_HASH.test(text)) problems.push('password hash');
  if (text.includes('GATEWAY-SIGNATURE')) problems.push('payment gateway signature');
  if (text.includes('test-only-jwt-secret') || text.includes('test-only-refresh-secret')) problems.push('signing secret');
  if (INTERNALS.test(text)) problems.push(`internal detail "${text.match(INTERNALS)[0].slice(0, 40)}"`);
  return problems;
}

describe('sensitive data in responses', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  const fill = (routePath) =>
    routePath
      .replace(':classroomId', ids.classroomA).replace(':courseId', ids.courseA).replace(':studentId', ids.users.studentA)
      .replace(':userId', ids.users.studentA).replace(':mentorId', ids.users.mentorA).replace(':teacherId', ids.users.mentorA)
      .replace(':assessmentId', ids.assessmentA).replace(':questionId', ids.questionA).replace(':weekId', ids.weekA)
      .replace(':chapterId', ids.chapterA).replace(':liveClassId', ids.liveClassA).replace(':certificateId', ids.certificateA)
      .replace(':resultId', ids.resultA).replace(':date', '2026-01-15').replace(':role', 'student').replace(':grade', '5');

  for (const account of ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA', 'superadmin']) {
    it(`no GET response for ${account} contains credentials or internals`, async () => {
      const routes = listRoutes(ctx.app).filter((route) => route.method === 'GET' && route.path.startsWith('/api'));
      const problems = [];
      const seen = new Set();
      for (const route of routes) {
        // :id means a different record type per router; try the ids that exist
        const candidates = route.path.includes(':id')
          ? [ids.users.studentA, ids.classroomA, ids.courseA, ids.resultA, ids.paymentA].map((id) => fill(route.path).replace(':id', id))
          : [fill(route.path)];
        for (const url of candidates.map((candidate) => candidate.replace(/:\w+/g, '1'))) {
          if (seen.has(url)) continue;
          seen.add(url);
          const response = await ctx.api('GET', url, { as: account });
          for (const problem of problemsIn(response.text)) problems.push(`${url} (${response.status}): ${problem}`);
        }
      }
      assert.deepEqual(problems, []);
    });
  }

  it('user records are returned without the password column, for every way of reading them', async () => {
    const readers = [
      ['adminA', `/api/users/${ids.users.studentA}`],
      ['adminA', '/api/users'],
      ['mentorA', '/api/users?role=student'],
      ['adminA', '/api/admin/users'],
      ['adminA', '/api/users/all'],
      ['adminA', '/api/admin/students'],
      ['superadmin', '/api/superadmin/users'],
      ['accountantA', '/api/accountant/students'],
    ];
    for (const [account, url] of readers) {
      const response = await ctx.api('GET', url, { as: account });
      assert.equal(response.status, 200, `${account} ${url}`);
      assert.ok(response.text.includes('@test.invalid'), `${url} returned no users`);
      assert.deepEqual(problemsIn(response.text), [], `${account} ${url}`);
    }
  });

  it('write responses do not echo passwords either', async () => {
    const created = await ctx.api('POST', '/api/superadmin/create-user', {
      as: 'superadmin',
      body: { name: 'Echo Check', email: 'echo@test.invalid', password: 'Echo-Check-Passw0rd', role: 'mentor', universityId: ids.schoolA },
    });
    assert.ok(created.status < 300, `create-user -> ${created.status} ${created.text.slice(0, 150)}`);
    assert.equal(created.text.includes('Echo-Check-Passw0rd'), false);
    assert.deepEqual(problemsIn(created.text), []);

    const updated = await ctx.api('PUT', `/api/superadmin/users/${ids.users.studentA2}`, { as: 'superadmin', body: { name: 'Still Student' } });
    assert.deepEqual(problemsIn(updated.text), []);
  });

  it('payment lists reach finance staff without the gateway signature', async () => {
    for (const url of ['/api/transactions', `/api/transactions/student/${ids.users.studentA}`, `/api/accountant/student-payments-history?studentId=${ids.users.studentA}`]) {
      const response = await ctx.api('GET', url, { as: 'accountantA' });
      assert.equal(response.status, 200, url);
      assert.ok(response.text.includes('TXN-A') || response.text.includes('PAYMENT-A'), `${url} returned no payment`);
      assert.equal(response.text.includes('GATEWAY-SIGNATURE'), false, url);
    }
  });

  it('error responses carry a message, not database or file-system details', async () => {
    const probes = [
      ['GET', `/api/courses/${ids.courseA}%27%20OR%201=1--`, 'adminA'],
      ['GET', "/api/users?role=student'%20OR%20'1'='1", 'adminA'],
      ['GET', '/api/translation/content/1000/course/password%20FROM%20users--/en', 'adminA'],
      ['GET', '/api/translation/content/1000/users/password/en', 'adminA'],
      ['POST', '/api/auth/login', null],
      ['GET', '/api/results/classroom/not-a-number', 'adminA'],
    ];
    for (const [method, url, account] of probes) {
      const response = await ctx.api(method, url, { as: account || undefined, body: method === 'POST' ? '{"email": ' : undefined });
      assert.deepEqual(problemsIn(response.text), [], `${method} ${url} -> ${response.status}`);
      assert.ok(response.status < 500 || !/SQLITE|syntax error|does not exist|invalid input syntax/i.test(response.text));
    }
  });

  it('request-supplied names never reach SQL: injection strings return nothing extra', async () => {
    const all = await ctx.api('GET', '/api/users?role=student', { as: 'adminA' });
    const injected = await ctx.api('GET', "/api/users?role=student'%20OR%20'1'='1", { as: 'adminA' });
    assert.equal(all.body.data.length, 2);
    assert.equal(injected.body.data.length, 0);
    for (const field of ['password', 'password FROM users--', 'title; DROP TABLE users', '*']) {
      const response = await ctx.api('GET', `/api/translation/content/${ids.courseA}/course/${encodeURIComponent(field)}/en`, { as: 'adminA' });
      assert.equal(response.status, 400, field);
    }
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM users')).n > 5, true);
  });
});
