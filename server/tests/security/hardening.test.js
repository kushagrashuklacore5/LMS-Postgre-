/**
 * Smaller hardening checks that do not fit the other suites:
 *   SEC-007  no credential literals in the source that runs on the server
 *   SEC-011  assessment time window is enforced when answers are submitted
 *   SEC-017  realtime events reach only signed-in sockets of the same school
 *   SEC-021  passwords are never written to the log
 *   SEC-022  legacy password formats are verified and flagged for upgrade
 *   REL-001  the fee statistics endpoint answers instead of taking the server down
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const SOCKET_CLIENT = path.resolve(SERVER_ROOT, '..', 'client', 'node_modules', 'socket.io-client');

describe('hardening', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  it('REL-001: fee statistics answer with this school\'s numbers and the server keeps running', async () => {
    for (const account of ['accountantA', 'adminA']) {
      const response = await ctx.api('GET', '/api/accountant/fees-stats', { as: account });
      assert.equal(response.status, 200, account);
      assert.equal(response.body.data.totalFeesCollected, 5000); // School A's one payment, not School B's
      assert.equal(response.body.data.totalStudents, 2);
    }
    for (const url of ['/api/accountant/dashboard', '/api/accountant/students', '/api/transactions/stats']) {
      assert.equal((await ctx.api('GET', url, { as: 'accountantA' })).status, 200, url);
    }
    assert.equal((await fetch(`${ctx.base}/health`)).status, 200);
  });

  describe('SEC-011: assessment submission window', () => {
    const submit = () => ctx.api('POST', '/api/assessments/submit', { as: 'studentA', body: { assessmentId: ids.assessmentA, answers: [] } });
    const setWindow = (start, end, published = 1) =>
      ctx.db.run('UPDATE assessments SET startTime = ?, endTime = ?, isPublished = ? WHERE id = ?', [start, end, published, ids.assessmentA]);
    const hours = (n) => new Date(Date.now() + n * 3600 * 1000).toISOString();

    // Found in the browser run: a quiz whose end was before its start was saved
    it('a quiz cannot be created with a window that closes before it opens', async () => {
      const create = (body) => ctx.api('POST', '/api/assessments/create', { as: 'mentorA', body: { courseId: ids.courseA, title: 'Window check', ...body } });
      assert.equal((await create({ startTime: hours(5), endTime: hours(1) })).status, 400);
      const sameMoment = hours(1);
      assert.equal((await create({ startTime: sameMoment, endTime: sameMoment })).status, 400);
      assert.equal((await create({ startTime: 'tomorrow-ish', endTime: hours(1) })).status, 400);
      assert.equal((await create({ startTime: hours(1), endTime: hours(2), timer: -5 })).status, 400);
      assert.equal((await ctx.db.get("SELECT COUNT(*) AS n FROM assessments WHERE title = 'Window check'")).n, 0);
      assert.equal((await create({ startTime: hours(1), endTime: hours(2), timer: 30 })).status, 201);
    });

    it('refused before the start time, after the end time and while unpublished', async () => {
      await setWindow(hours(1), hours(2));
      assert.equal((await submit()).status, 403);
      await setWindow(hours(-2), hours(-1));
      assert.equal((await submit()).status, 403);
      await setWindow(hours(-1), hours(1), 0);
      assert.equal((await submit()).status, 404);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM assessment_attempts')).n, 0);
    });

    it('accepted inside the window, marked on the server, and only once', async () => {
      await setWindow(hours(-1), hours(1));
      const first = await ctx.api('POST', '/api/assessments/submit', {
        as: 'studentA',
        body: { assessmentId: ids.assessmentA, answers: [{ questionId: ids.questionA, answer: 'A' }], score: 100, percentage: 100, result: 'PASS' },
      });
      assert.equal(first.status, 200, first.text.slice(0, 150));
      const second = await submit();
      assert.equal(second.body.alreadyAttempted, true);
      const attempts = await ctx.db.all('SELECT studentId, score FROM assessment_attempts WHERE assessmentId = ?', [ids.assessmentA]);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].studentId, ids.users.studentA);
      assert.equal(attempts[0].score, 0); // a score sent by the browser is ignored
    });
  });

  it('SEC-021: a login attempt leaves neither the password nor the token in the log', async () => {
    const lines = [];
    const original = { log: console.log, error: console.error, warn: console.warn };
    const collect = (...args) => lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    Object.assign(console, { log: collect, error: collect, warn: collect });
    let token;
    try {
      const wrong = 'Unique-Wrong-Passw0rd-7f3a';
      await ctx.api('POST', '/api/auth/login', { body: { email: 'admina@test.invalid', password: wrong } });
      token = (await ctx.api('POST', '/api/auth/login', { body: { email: 'admina@test.invalid', password: ctx.password } })).body.token;
      await ctx.api('GET', '/api/admin/users', { token });
      await ctx.api('GET', '/api/admin/users', { token: `${token}tampered` });
      const logged = lines.join('\n');
      assert.equal(logged.includes(wrong), false, 'a wrong password was logged');
      assert.equal(logged.includes(ctx.password), false, 'the password was logged');
      assert.equal(logged.includes(token.slice(0, 20)), false, 'a token was logged');
    } finally {
      Object.assign(console, original);
    }
    assert.ok(token);
  });

  describe('SEC-022: stored password formats', () => {
    const { verifyPassword, hashPassword, generateVendorPassword } = require(path.join(SERVER_ROOT, 'utils', 'passwordUtils'));

    it('bcrypt hashes verify and need no upgrade', async () => {
      const stored = hashPassword('Vendor-Passw0rd');
      assert.match(stored, /^\$2[aby]\$/);
      assert.deepEqual(await verifyPassword('Vendor-Passw0rd', stored), { valid: true, needsUpgrade: false });
      assert.deepEqual(await verifyPassword('wrong', stored), { valid: false, needsUpgrade: false });
    });

    it('legacy unsalted SHA-256 and plain-text values verify once and are flagged for upgrade', async () => {
      const sha = crypto.createHash('sha256').update('Old-Vendor-Passw0rd').digest('hex');
      assert.deepEqual(await verifyPassword('Old-Vendor-Passw0rd', sha), { valid: true, needsUpgrade: true });
      assert.deepEqual(await verifyPassword('wrong', sha), { valid: false, needsUpgrade: false });
      assert.deepEqual(await verifyPassword('plain-old-value', 'plain-old-value'), { valid: true, needsUpgrade: true });
      // the stored digest itself is not a password
      assert.equal((await verifyPassword(sha, sha)).valid, false);
    });

    it('empty or non-text input never verifies', async () => {
      for (const [plain, stored] of [['', ''], ['', 'x'], [undefined, 'x'], ['x', null], [{}, 'x'], ['x', undefined]]) {
        assert.equal((await verifyPassword(plain, stored)).valid, false);
      }
    });

    it('generated vendor passwords are long and varied', () => {
      const passwords = new Set(Array.from({ length: 50 }, () => generateVendorPassword()));
      assert.equal(passwords.size, 50);
      for (const password of passwords) assert.ok(password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password));
    });
  });

  it('SEC-017: realtime events reach signed-in sockets of the same school only', { skip: !fs.existsSync(SOCKET_CLIENT) && 'socket.io-client is not installed in client/' }, async () => {
    const { io } = require(SOCKET_CLIENT);
    const connect = (token) =>
      new Promise((resolve, reject) => {
        const socket = io(ctx.base, { transports: ['websocket'], auth: token ? { token } : {}, forceNew: true });
        const received = [];
        socket.onAny((event, payload) => received.push({ event, payload }));
        socket.on('connect', () => resolve({ socket, received }));
        socket.on('connect_error', reject);
      });

    const sameSchool = await connect(ctx.tokenFor('accountantA'));
    const otherSchool = await connect(ctx.tokenFor('adminB'));
    const anonymous = await connect(null);
    const forged = await connect('not-a-real-token');
    await new Promise((resolve) => setTimeout(resolve, 300)); // let the server place the sockets in rooms

    try {
      const created = await ctx.api('POST', '/api/expenses', { as: 'adminA', body: { description: 'REALTIME-EXPENSE-A', amount: 42, category: 'Supplies' } });
      assert.ok(created.status < 300, `${created.status}`);
      await new Promise((resolve) => setTimeout(resolve, 500));

      assert.ok(sameSchool.received.some((message) => JSON.stringify(message).includes('REALTIME-EXPENSE-A')), 'the same school did not get its own event');
      assert.deepEqual(otherSchool.received, [], 'another school received the event');
      assert.deepEqual(anonymous.received, [], 'a socket without a login received the event');
      assert.deepEqual(forged.received, [], 'a socket with a forged token received the event');
    } finally {
      [sameSchool, otherSchool, anonymous, forged].forEach(({ socket }) => socket.close());
    }
  });

  describe('links typed by a teacher are plain web addresses (stored XSS)', () => {
    const DANGEROUS = ['javascript:alert(document.cookie)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', '//evil.example/x', 'not a link'];
    const future = new Date(Date.now() + 86400e3).toISOString();

    it('script and data links are refused for materials, chapters and live classes', async () => {
      for (const link of DANGEROUS) {
        const material = await ctx.api('POST', '/api/materials/upload', { as: 'mentorA', body: { courseId: ids.courseA, title: 'Link', type: 'pdf_link', linkUrl: link } });
        const chapter = await ctx.api('POST', '/api/chapters/create-chapter', { as: 'mentorA', body: { courseId: ids.courseA, title: 'Ch', videoUrl: link, order: 9 } });
        const chapterImage = await ctx.api('POST', '/api/chapters/create-chapter', { as: 'mentorA', body: { courseId: ids.courseA, title: 'Ch', videoUrl: 'https://example.org/v', imageUrl: link, order: 9 } });
        const live = await ctx.api('POST', '/api/live-classes', { as: 'mentorA', body: { courseId: ids.courseA, title: 'Live', scheduledStartTime: future, scheduledEndTime: future, meetingLink: link } });
        assert.deepEqual([material.status, chapter.status, chapterImage.status, live.status], [400, 400, 400, 400], link);
      }
      const stored = JSON.stringify([
        await ctx.db.all('SELECT linkUrl FROM course_materials'),
        await ctx.db.all('SELECT videoUrl, imageUrl FROM chapters'),
        await ctx.db.all('SELECT meetingLink FROM live_classes'),
      ]);
      assert.equal(/javascript:|vbscript:|data:text/i.test(stored), false);
    });

    it('ordinary https links still work', async () => {
      const material = await ctx.api('POST', '/api/materials/upload', { as: 'mentorA', body: { courseId: ids.courseA, title: 'Sheet', type: 'pdf_link', linkUrl: 'https://example.org/sheet.pdf' } });
      const chapter = await ctx.api('POST', '/api/chapters/create-chapter', { as: 'mentorA', body: { courseId: ids.courseA, title: 'Video lesson', videoUrl: 'https://example.org/video', order: 2 } });
      // live classes no longer take a typed meeting link: the server creates the room (helpers/lectures.js)
      const live = await ctx.api('POST', '/api/live-classes', { as: 'mentorA', body: { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Doubts', mode: 'schedule', scheduledStartTime: new Date(Date.now() + 86400000).toISOString(), meetingLink: 'https://meet.example.org/abc' } });
      assert.ok(material.status < 300 && chapter.status < 300 && live.status < 300, `${material.status} ${chapter.status} ${live.status}`);
      assert.equal((await ctx.db.get('SELECT meetingLink FROM live_classes WHERE id = ?', [live.body.data.id])).meetingLink, null, 'a typed link is not stored');
    });
  });

  it('first passwords for new accounts are long and unpredictable', async () => {
    const created = [];
    for (let i = 0; i < 3; i++) {
      const response = await ctx.api('POST', '/api/admin/create-teacher', { as: 'adminA', body: { name: `Teacher ${i}`, email: `new.teacher${i}@test.invalid` } });
      assert.equal(response.status, 201, response.text.slice(0, 120));
      created.push(response.body.generatedPassword);
    }
    assert.equal(new Set(created).size, 3);
    for (const password of created) assert.ok(password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), 'weak generated password');
  });

  // Found in the browser run: "not-an-email" was accepted and became an account nobody could
  // sign in to or reset.
  it('an account cannot be created with something that is not an email address', async () => {
    const before = (await ctx.db.get('SELECT COUNT(*) AS n FROM users')).n;
    for (const email of ['not-an-email', 'a@b', 'two@@test.invalid', 'spa ce@test.invalid', '<x>@test.invalid', '@test.invalid']) {
      const teacher = await ctx.api('POST', '/api/admin/create-teacher', { as: 'adminA', body: { name: 'T', email } });
      assert.equal(teacher.status, 400, `teacher ${email}: ${teacher.text.slice(0, 80)}`);
      const student = await ctx.api('POST', '/api/admin/create-student', { as: 'adminA', body: { fullName: 'S', email, classroomId: ctx.ids.classroomA } });
      assert.equal(student.status, 400, `student ${email}: ${student.text.slice(0, 80)}`);
      const school = await ctx.api('POST', '/api/superadmin/create-university', { as: 'superadmin', body: { name: `School ${email}`, email } });
      assert.equal(school.status, 400, `school ${email}: ${school.text.slice(0, 80)}`);
      const staff = await ctx.api('POST', '/api/superadmin/create-user', { as: 'superadmin', body: { name: 'U', email, password: 'Long-enough-1', role: 'admin', universityId: ctx.ids.schoolA } });
      assert.equal(staff.status, 400, `staff ${email}: ${staff.text.slice(0, 80)}`);
    }
    const edit = await ctx.api('PUT', `/api/superadmin/users/${ctx.ids.users.mentorA2}`, { as: 'superadmin', body: { email: 'not-an-email' } });
    assert.equal(edit.status, 400, edit.text.slice(0, 80));
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM users')).n, before, 'no account was created');
    assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM universities')).n, 2, 'no school was created');
  });

  it('SEC-007: no credential literals in the server source', () => {
    const SOURCE_DIRS = ['config', 'controllers', 'helpers', 'middleware', 'routes', 'schedulers', 'services', 'utils', 'monitor'];
    const files = [path.join(SERVER_ROOT, 'server.js')];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js')) files.push(full);
      }
    };
    SOURCE_DIRS.map((name) => path.join(SERVER_ROOT, name)).filter(fs.existsSync).forEach(walk);

    const FORBIDDEN = [
      [/rzp_(live|test)_[A-Za-z0-9]{6,}/, 'a Razorpay key'],
      [/process\.env\.(JWT_SECRET|JWT_REFRESH_SECRET|RAZORPAY_KEY_SECRET|EMAIL_PASS|HF_TOKEN)\s*\|\|\s*['"`][^'"`]+['"`]/, 'a fallback value for a secret'],
      [/hf_[A-Za-z0-9]{30,}/, 'a Hugging Face token'],
    ];
    const problems = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [pattern, what] of FORBIDDEN) {
        if (pattern.test(text)) problems.push(`${path.relative(SERVER_ROOT, file)}: ${what}`);
      }
    }
    // files that are part of this version of the server (old "-backup"/"-broken" copies are not loaded)
    assert.deepEqual(problems.filter((problem) => !/-backup\.js|-broken\.js/.test(problem)), []);
  });
});
