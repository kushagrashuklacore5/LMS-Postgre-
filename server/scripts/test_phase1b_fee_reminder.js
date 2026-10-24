/**
 * Phase 1B: Secure POST /api/classrooms/send-fee-reminder
 *
 * Exercises the ACTUAL route in routes/classroomRoutes.js and the real email template builder
 * (services/feeReminderEmail.js).
 *
 * Isolation, installed and VERIFIED before any route is loaded:
 *  - config/database-switch and config/sqlite-db are replaced by an isolated temporary database
 *    (an EMPTY clone of the real schema: the project database is opened read-only for its table
 *    definitions only; no rows are read or copied; nothing is written to it);
 *  - services/emailService is replaced by a fake that only records calls. The real email service
 *    (which reads .env and creates a mail transport) is never loaded, so no email can be sent.
 * All identities, names, addresses and amounts below are test-only values.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const { createIsolatedDb, insert, all, get, user, feeStructure, financialSnapshot, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-phase1b-fee-reminder-secret';
process.env.JWT_SECRET = JWT_SECRET;

const DB_SWITCH_PATH = require.resolve('../config/database-switch');
const SQLITE_DB_PATH = require.resolve('../config/sqlite-db');
const EMAIL_SERVICE_PATH = require.resolve('../services/emailService');
const isLiveDbModule = (key) => /[\\/]config[\\/](sqlite-db|postgres-db)\.js$/i.test(key);

// Fake email service: records every call, never sends. `mode` controls the simulated outcome.
const sentEmails = [];
const fakeEmailService = {
  mode: 'sent',
  async sendFeeReminderEmail(args) {
    sentEmails.push({ ...args });
    if (this.mode === 'fail') return { success: false, error: 'simulated transport failure' };
    if (this.mode === 'mock') return { success: true, mock: true };
    return { success: true, delivered: true };
  }
};

const logLines = [];
const say = console.log.bind(console);
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => logLines.push(args.map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch (e) { return String(a); } })())).join(' '));
}
const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(String(reason && reason.message ? reason.message : reason)));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    say(`✅ [PASS] ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    say(`❌ [FAIL] ${name}\n      - ${String(e.message).slice(0, 600)}`);
  }
}

// Test-only identities
const ACC_U1 = 1, ADMIN_U1 = 2, MENTOR_A = 3, MENTOR_B = 4, ACC_NO_UNIV = 5, ACC_U3 = 6, STOREKEEPER_U1 = 7;
const S_DUE = 11, S_PAID_UP = 12, S_LEGACY = 13, S_HTML = 14, S_DUP = 15, S_CONCURRENT = 16, S_EXPIRED = 17, S_RECENT = 18, S_MENTOR_B = 19, S_FAIL = 20, S_MOCK = 21;
const S_U2 = 31, S_U3 = 41;
const HTML_NAME = '<b>Bold</b> & "Quote" <script>alert(1)</script>';

const utcSqlTime = (msAgo) => new Date(Date.now() - msAgo).toISOString().replace('T', ' ').slice(0, 19);

async function seed(db) {
  for (const u of [
    user(ACC_U1, 'accountant', 1), user(ADMIN_U1, 'admin', 1), user(MENTOR_A, 'mentor', 1), user(MENTOR_B, 'mentor', 1),
    user(ACC_NO_UNIV, 'accountant', null), user(ACC_U3, 'accountant', 3), user(STOREKEEPER_U1, 'storekeeper', 1),
    user(S_DUE, 'student', 1), user(S_PAID_UP, 'student', 1), user(S_LEGACY, 'student', 1), user(S_HTML, 'student', 1, HTML_NAME),
    user(S_DUP, 'student', 1), user(S_CONCURRENT, 'student', 1), user(S_EXPIRED, 'student', 1), user(S_RECENT, 'student', 1),
    user(S_MENTOR_B, 'student', 1), user(S_FAIL, 'student', 1), user(S_MOCK, 'student', 1),
    user(S_U2, 'student', 2), user(S_U3, 'student', 3)
  ]) await insert(db, 'users', u);

  await insert(db, 'classrooms', { id: 101, university_id: 1, name: 'U1 Grade 12 <A>', grade: '12', section: 'A', classTeacher: MENTOR_A });
  await insert(db, 'classrooms', { id: 102, university_id: 1, name: 'U1 Grade 3', grade: '3', section: 'B', classTeacher: MENTOR_B });
  await insert(db, 'classrooms', { id: 201, university_id: 2, name: 'U2 Grade 12', grade: '12', section: 'A', classTeacher: null });
  await insert(db, 'classrooms', { id: 301, university_id: 3, name: 'U3 Grade 12', grade: '12', section: 'A', classTeacher: null });
  for (const sid of [S_DUE, S_LEGACY, S_HTML, S_DUP, S_CONCURRENT, S_EXPIRED, S_RECENT, S_FAIL, S_MOCK]) await insert(db, 'student_classroom_assignment', { studentId: sid, classroomId: 101 });
  for (const sid of [S_PAID_UP, S_MENTOR_B]) await insert(db, 'student_classroom_assignment', { studentId: sid, classroomId: 102 });
  await insert(db, 'student_classroom_assignment', { studentId: S_U2, classroomId: 201 });
  await insert(db, 'student_classroom_assignment', { studentId: S_U3, classroomId: 301 });

  // University 3 has NO fee structure
  await insert(db, 'feeStructures', feeStructure(901, 1, 'Secondary', 12100, { dueDate: '2099-06-30' }));
  await insert(db, 'feeStructures', feeStructure(902, 1, 'Primary', 8000, { dueDate: '2099-06-30' }));
  await insert(db, 'feeStructures', feeStructure(903, 2, 'Secondary', 9000));

  // S_PAID_UP: fully paid through a proper allocated installment (zero balance, not legacy-blocked)
  await insert(db, 'student_fee_schedules', {
    id: 701, studentId: S_PAID_UP, feeStructureId: 902, planId: 'full', planName: 'Full Payment (100%)', totalFee: 8000, totalFeePaise: 800000, status: 'active',
    scheduleSnapshot: JSON.stringify([{ stageNumber: 1, label: 'Full', percentage: 100, expectedAmountPaise: 800000, expectedAmount: 8000, dueDate: '2099-06-30' }])
  });
  await insert(db, 'payments', { id: 801, studentId: S_PAID_UP, amount: 8000, amountPaise: 800000, type: 'Offline (Cash)', paymentMethod: 'Cash', status: 'success', scheduleId: 701, installmentStage: 1, feeStructureId: 902, planId: 'full', createdAt: '2026-05-01 10:00:00' });
  // S_LEGACY: historical unallocated payment -> collection blocked
  await insert(db, 'payments', { id: 802, studentId: S_LEGACY, amount: 8050, type: 'full', status: 'success', scheduleId: null, installmentStage: null, createdAt: '2026-04-30 10:00:00' });

  // Earlier reminders: one 25 hours old (outside the window), one 1 hour old (inside), one old untargeted
  const reminder = (target, msAgo) => ({ university_id: 1, title: '⚠️ Fee Payment Reminder: old', content: 'old', createdByUser: ACC_U1, createdByRole: 'accountant', publishFor: 'students', priority: 'high', targetUserId: target, createdAt: utcSqlTime(msAgo), updatedAt: utcSqlTime(msAgo) });
  await insert(db, 'announcements', reminder(S_EXPIRED, 25 * 3600 * 1000));
  await insert(db, 'announcements', reminder(S_RECENT, 1 * 3600 * 1000));
  await insert(db, 'announcements', reminder(null, 1 * 3600 * 1000));
}

async function main() {
  say('================================================================');
  say('🧪 PHASE 1B: SECURE FEE REMINDER');
  say('================================================================');

  const fixture = await createIsolatedDb('phase1b-reminder');
  const db = fixture.db;
  let server;

  try {
    // --- Install the substitutes, then verify them BEFORE loading any route ---
    for (const [modulePath, exportsValue] of [[DB_SWITCH_PATH, db], [SQLITE_DB_PATH, db], [EMAIL_SERVICE_PATH, fakeEmailService]]) {
      require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: exportsValue, children: [], paths: [] };
    }
    assert.strictEqual(require('../config/database-switch'), db, 'database-switch substitution failed');
    assert.strictEqual(require('../config/sqlite-db'), db, 'sqlite-db substitution failed');
    assert.strictEqual(require('../services/emailService'), fakeEmailService, 'emailService substitution failed');
    assert.notStrictEqual(path.resolve(fixture.dbPath), path.resolve(__dirname, '../data/lms_permanent.db'));
    say('Substitutes verified: database-switch, sqlite-db -> temporary DB; emailService -> fake recorder');

    await seed(db);
    const { buildFeeReminderEmail, normalizeReminderNote } = require('../services/feeReminderEmail');
    const svc = require('../services/installmentService');

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.tenant = { database: db }; next(); });
    app.use('/api/classrooms', require('../routes/classroomRoutes'));
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    say(`Isolated test database: ${fixture.dbPath}\n`);

    const tokens = [];
    const token = (userId, role, opts) => { const t = signToken(JWT_SECRET, { userId, role }); tokens.push(t); return opts === 'expired' ? jwt.sign({ userId, role, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET) : t; };
    const remind = (tok, body) => request(server, 'POST', '/api/classrooms/send-fee-reminder', { token: tok, body });
    const acc = token(ACC_U1, 'accountant');
    const announcementsFor = (sid) => all(db, `SELECT * FROM announcements WHERE targetUserId = ? AND title LIKE '⚠️ Fee Payment Reminder:%' AND content <> 'old' ORDER BY id`, [sid]);
    const announcementCount = async () => (await get(db, 'SELECT COUNT(*) n FROM announcements')).n;
    const expectRefusedWithoutSideEffects = async (res, status, label) => {
      assert.strictEqual(res.statusCode, status, `${label}: expected ${status}, got ${res.statusCode}: ${res.rawBody}`);
      assert.strictEqual(res.body && res.body.success, false, `${label}: success must be false`);
    };
    const pristineFinance = await financialSnapshot(db);

    await test('0. isolation verified: temporary DB and fake email in place; real email service never loaded', async () => {
      assert.strictEqual(require.cache[EMAIL_SERVICE_PATH].exports, fakeEmailService);
      for (const key of Object.keys(require.cache).filter(isLiveDbModule)) assert.strictEqual(require.cache[key].exports, db, key);
    });

    // ---------------------------------------------------------------- authentication / authorization
    await test('1. missing, invalid, expired and wrongly signed tokens get 401; nothing is sent or written', async () => {
      const before = await announcementCount();
      for (const [tok, label] of [[null, 'no token'], ['garbage', 'malformed'], [token(ACC_U1, 'accountant', 'expired'), 'expired'], [signToken('another-secret', { userId: ACC_U1, role: 'accountant' }), 'bad signature'], ['superadmin-' + Buffer.from(JSON.stringify({ role: 'superadmin' })).toString('base64'), 'unsigned superadmin token']]) {
        await expectRefusedWithoutSideEffects(await remind(tok, { studentId: S_DUE }), 401, label);
      }
      assert.strictEqual(sentEmails.length, 0);
      assert.strictEqual(await announcementCount(), before);
    });

    await test('2. roles: student and storekeeper get 403; a forged role claim is checked against the database', async () => {
      await expectRefusedWithoutSideEffects(await remind(token(S_DUE, 'student'), { studentId: S_DUE }), 403, 'student');
      await expectRefusedWithoutSideEffects(await remind(token(STOREKEEPER_U1, 'storekeeper'), { studentId: S_DUE }), 403, 'storekeeper');
      await expectRefusedWithoutSideEffects(await remind(token(S_DUE, 'accountant'), { studentId: S_DUE }), 403, 'student claiming accountant');
      assert.strictEqual(sentEmails.length, 0);
    });

    await test('3. staff with no university get 403 (no default university)', async () => {
      const res = await remind(token(ACC_NO_UNIV, 'accountant'), { studentId: S_DUE });
      await expectRefusedWithoutSideEffects(res, 403, 'no university');
      assert.strictEqual(sentEmails.length, 0);
    });

    await test('4. student of another university is refused (403); unknown / non-student IDs 404; malformed ID 400', async () => {
      const cross = await remind(acc, { studentId: S_U2 });
      await expectRefusedWithoutSideEffects(cross, 403, 'cross-university');
      assert.strictEqual(cross.body.code, 'CROSS_TENANT_FORBIDDEN');
      await expectRefusedWithoutSideEffects(await remind(acc, { studentId: 99999 }), 404, 'unknown');
      await expectRefusedWithoutSideEffects(await remind(acc, { studentId: MENTOR_A }), 404, 'not a student');
      for (const bad of [undefined, null, '', 'abc', -1, 0, 1.5, { $gt: 0 }]) {
        await expectRefusedWithoutSideEffects(await remind(acc, { studentId: bad }), 400, `studentId ${JSON.stringify(bad)}`);
      }
      assert.strictEqual(sentEmails.length, 0);
      assert.deepStrictEqual(await all(db, 'SELECT id FROM announcements WHERE targetUserId = ?', [S_U2]), []);
    });

    await test('5. a mentor may remind only students of a classroom they are class teacher of', async () => {
      const notTheirs = await remind(token(MENTOR_A, 'mentor'), { studentId: S_MENTOR_B });
      await expectRefusedWithoutSideEffects(notTheirs, 403, 'mentor A -> mentor B student');
      assert.strictEqual(notTheirs.body.code, 'NOT_CLASS_TEACHER');
      assert.strictEqual(sentEmails.length, 0);
      const theirs = await remind(token(MENTOR_B, 'mentor'), { studentId: S_MENTOR_B });
      assert.strictEqual(theirs.statusCode, 200, theirs.rawBody);
      assert.strictEqual(sentEmails.length, 1);
      const [row] = await announcementsFor(S_MENTOR_B);
      assert.strictEqual(row.createdByUser, MENTOR_B);
      assert.strictEqual(row.createdByRole, 'mentor');
    });

    // ---------------------------------------------------------------- trusted server-side details
    await test('6. browser-supplied email, name, amount, class, due date and university cannot influence the reminder', async () => {
      sentEmails.length = 0;
      const res = await remind(acc, {
        studentId: S_DUE, studentEmail: 'attacker@evil.test', studentName: 'Forged Name', classroomName: 'Forged Class',
        amount: 1, dueDate: '1999-01-01', universityId: 2, university_id: 2, status: 'Paid', message: 'Please pay.'
      });
      assert.strictEqual(res.statusCode, 200, res.rawBody);
      assert.strictEqual(sentEmails.length, 1);
      const sent = sentEmails[0];
      const dbStudent = await get(db, 'SELECT name, email FROM users WHERE id = ?', [S_DUE]);
      const summary = await svc.calculateStudentInstallmentSummary(db, S_DUE);
      const expectedBalance = (summary.feeStructure.totalFeePaise - summary.lifetimePaidPaise) / 100;
      assert.strictEqual(sent.studentEmail, dbStudent.email, 'recipient comes from the database');
      assert.strictEqual(sent.studentName, dbStudent.name);
      assert.strictEqual(sent.classroomName, 'U1 Grade 12 <A>');
      assert.strictEqual(sent.amount, expectedBalance, 'amount is the installment-summary balance');
      assert.strictEqual(sent.amount, 12100);
      assert.strictEqual(sent.dueDate, '2099-06-30', 'due date is the fee structure due date');
      assert.strictEqual(sent.customNote, 'Please pay.');
      assert.strictEqual(res.body.reminder.amount, 12100);
      assert.ok(!JSON.stringify(sentEmails).includes('evil.test') && !JSON.stringify(sentEmails).includes('Forged'));
    });

    await test('7. the announcement is targeted, belongs to the caller\'s university, is credited to the caller, and states the real amount', async () => {
      const rows = await announcementsFor(S_DUE);
      assert.strictEqual(rows.length, 1);
      const a = rows[0];
      assert.strictEqual(a.targetUserId, S_DUE);
      assert.strictEqual(a.university_id, 1);
      assert.strictEqual(a.createdByUser, ACC_U1);
      assert.strictEqual(a.createdByRole, 'accountant');
      assert.strictEqual(a.publishFor, 'students');
      assert.ok(a.content.includes('₹12,100') && a.content.includes('2099-06-30'), a.content);
      assert.ok(!a.content.includes('31 Oct') && !a.content.includes('Forged'));
    });

    await test('8. the HTTP response exposes no message id and no email address', async () => {
      sentEmails.length = 0;
      const res = await remind(token(ADMIN_U1, 'admin'), { studentId: S_HTML });
      assert.strictEqual(res.statusCode, 200, res.rawBody);
      assert.ok(!/messageId|emailInfo/.test(res.rawBody), 'message id leaked');
      assert.ok(!res.rawBody.includes('@'), 'an email address leaked in the response');
      assert.deepStrictEqual(Object.keys(res.body.reminder).sort(), ['amount', 'announcementId', 'dueDate', 'emailStatus', 'studentId']);
      assert.strictEqual(res.body.reminder.emailStatus, 'sent');
    });

    // ---------------------------------------------------------------- cases that must send nothing
    await test('9. fee not configured, zero balance and reconciliation-blocked send no email and create no announcement', async () => {
      sentEmails.length = 0;
      const before = await announcementCount();
      const notConfigured = await remind(token(ACC_U3, 'accountant'), { studentId: S_U3 });
      await expectRefusedWithoutSideEffects(notConfigured, 409, 'fee not configured');
      assert.strictEqual(notConfigured.body.code, 'FEE_NOT_CONFIGURED');
      const zero = await remind(acc, { studentId: S_PAID_UP });
      await expectRefusedWithoutSideEffects(zero, 409, 'zero balance');
      assert.strictEqual(zero.body.code, 'NO_OUTSTANDING_BALANCE');
      const blocked = await remind(acc, { studentId: S_LEGACY });
      await expectRefusedWithoutSideEffects(blocked, 409, 'legacy blocked');
      assert.strictEqual(blocked.body.code, 'LEGACY_RECONCILIATION_REQUIRED');
      assert.strictEqual(sentEmails.length, 0);
      assert.strictEqual(await announcementCount(), before);
    });

    // ---------------------------------------------------------------- note validation + HTML escaping
    await test('10. the note is validated: non-text and over-long notes are refused (400) with nothing sent', async () => {
      sentEmails.length = 0;
      for (const message of [{ html: 1 }, ['x'], 42, 'x'.repeat(501)]) {
        await expectRefusedWithoutSideEffects(await remind(acc, { studentId: S_DUE, message }), 400, `note ${JSON.stringify(message).slice(0, 20)}`);
      }
      assert.strictEqual(sentEmails.length, 0);
      assert.deepStrictEqual(normalizeReminderNote('  hi\u0000\u0007 there \n line2  '), { ok: true, note: 'hi there \n line2' });
      assert.deepStrictEqual(normalizeReminderNote('   '), { ok: true, note: null });
      assert.strictEqual(normalizeReminderNote('x'.repeat(500)).ok, true);
    });

    await test('11. HTML injection: every dynamic value is escaped in the email body', async () => {
      const evilNote = '<a href="https://phish.test">Pay here</a><script>steal()</script>';
      const { html } = buildFeeReminderEmail({ studentName: HTML_NAME, classroomName: 'Class <img src=x onerror=alert(1)>', amount: 1234.5, dueDate: '2099-01-01<b>', note: evilNote });
      for (const raw of ['<script>', '<b>Bold</b>', '<img src=x', 'href="https://phish.test"', '2099-01-01<b>']) {
        assert.ok(!html.includes(raw), `unescaped value found: ${raw}`);
      }
      assert.strictEqual(html.split('<a ').length - 1, 1, 'only the template\'s own pay button may be a link');
      for (const escaped of ['&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;Quote&quot;', '&lt;script&gt;steal()&lt;/script&gt;', '&lt;img src=x onerror=alert(1)&gt;', '₹1,234.5']) {
        assert.ok(html.includes(escaped), `expected escaped text: ${escaped}`);
      }
      // The values the route actually passed for the HTML-named student, rendered by the real builder
      const routeCall = (await (async () => { sentEmails.length = 0; await remind(acc, { studentId: S_FAIL, message: evilNote }); return sentEmails[0]; })());
      const rendered = buildFeeReminderEmail({ studentName: routeCall.studentName, classroomName: routeCall.classroomName, amount: routeCall.amount, dueDate: routeCall.dueDate, note: routeCall.customNote }).html;
      assert.ok(!rendered.includes('<script>') && !rendered.includes('<A>') && rendered.includes('U1 Grade 12 &lt;A&gt;'));
      const omitted = buildFeeReminderEmail({ amount: 10 }).html;
      assert.ok(!/Payment Due Date|Immediate Submission|Academic Session 2026|Classroom \/ Course/.test(omitted), 'missing values are omitted, not invented');
    });

    // ---------------------------------------------------------------- duplicates
    await test('12. duplicate protection: a second reminder within 24 hours is refused (429) and sends nothing', async () => {
      sentEmails.length = 0;
      const first = await remind(acc, { studentId: S_DUP });
      assert.strictEqual(first.statusCode, 200, first.rawBody);
      const second = await remind(token(ADMIN_U1, 'admin'), { studentId: S_DUP });
      await expectRefusedWithoutSideEffects(second, 429, 'second reminder');
      assert.strictEqual(second.body.code, 'REMINDER_RECENTLY_SENT');
      assert.strictEqual(sentEmails.length, 1);
      assert.strictEqual((await announcementsFor(S_DUP)).length, 1);
      const recent = await remind(acc, { studentId: S_RECENT });
      await expectRefusedWithoutSideEffects(recent, 429, 'reminder sent 1 hour ago (seeded)');
      assert.strictEqual(sentEmails.length, 1);
    });

    await test('13. concurrent duplicates: 6 simultaneous requests produce exactly one reminder, one email, one announcement', async () => {
      sentEmails.length = 0;
      const callers = [acc, token(ADMIN_U1, 'admin'), token(MENTOR_A, 'mentor'), acc, token(ADMIN_U1, 'admin'), token(MENTOR_A, 'mentor')];
      const responses = await Promise.all(callers.map(tok => remind(tok, { studentId: S_CONCURRENT })));
      const codes = responses.map(r => r.statusCode).sort();
      assert.deepStrictEqual(codes, [200, 429, 429, 429, 429, 429], `status codes: ${codes}`);
      assert.strictEqual(sentEmails.length, 1, 'exactly one email');
      assert.strictEqual((await announcementsFor(S_CONCURRENT)).length, 1, 'exactly one announcement');
    });

    await test('14. window: a reminder older than 24 hours does not block a new one; an old untargeted reminder blocks nobody', async () => {
      sentEmails.length = 0;
      const res = await remind(acc, { studentId: S_EXPIRED });
      assert.strictEqual(res.statusCode, 200, res.rawBody);
      assert.strictEqual(sentEmails.length, 1);
    });

    // ---------------------------------------------------------------- email outcomes
    await test('15. email outcomes are reported honestly; a failed or unconfigured email still leaves the in-app reminder', async () => {
      const failed = sentEmails.length ? null : null; // S_FAIL was already reminded in test 11 (sent)
      fakeEmailService.mode = 'mock';
      const mock = await remind(acc, { studentId: S_MOCK });
      assert.strictEqual(mock.statusCode, 200, mock.rawBody);
      assert.strictEqual(mock.body.reminder.emailStatus, 'not_configured');
      assert.ok(/not configured/i.test(mock.body.message));
      fakeEmailService.mode = 'fail';
      await db.run('DELETE FROM announcements WHERE targetUserId = ?', [S_FAIL]); // test DB only: allow a fresh reminder
      await new Promise(r => setTimeout(r, 50));
      const fail = await remind(acc, { studentId: S_FAIL });
      assert.strictEqual(fail.statusCode, 200, fail.rawBody);
      assert.strictEqual(fail.body.reminder.emailStatus, 'failed');
      assert.ok(/could not be sent/i.test(fail.body.message));
      assert.strictEqual((await announcementsFor(S_FAIL)).length, 1);
      fakeEmailService.mode = 'sent';
      void failed;
    });

    // ---------------------------------------------------------------- hygiene
    await test('16. logs contain no student email address and no token', async () => {
      const joined = logLines.join('\n');
      for (const row of await all(db, "SELECT email FROM users WHERE role = 'student'")) assert.ok(!joined.includes(row.email), 'a student email address was logged');
      for (const t of tokens) assert.ok(!joined.includes(t), 'a token was logged');
      assert.ok(/Fee reminder for student \d+: announcement \d+, email (sent|not_configured|failed)/.test(joined), 'the reminder log line uses ids only');
    });

    await test('17. source scan: no default university, user or role fallbacks and no invented dates remain in this workflow', async () => {
      const routes = fs.readFileSync(path.join(__dirname, '../routes/classroomRoutes.js'), 'utf8');
      const handler = routes.slice(routes.indexOf('const FEE_REMINDER_COOLDOWN_HOURS'), routes.indexOf('module.exports = router;'));
      const builder = fs.readFileSync(path.join(__dirname, '../services/feeReminderEmail.js'), 'utf8');
      const page = fs.readFileSync(path.join(__dirname, '../../client/src/pages/mentor/ClassFeeStatus.jsx'), 'utf8');
      for (const [label, text] of [['route', handler], ['email builder', builder]]) {
        for (const bad of ['|| 1', "|| 'accountant'", '31 Oct 2026', 'Immediate Submission', 'Academic Session 2026', 'authMiddleware', 'messageId']) {
          assert.ok(!text.includes(bad), `${label} still contains: ${bad}`);
        }
      }
      const payloads = [...page.matchAll(/const payload = \{([\s\S]*?)\};/g)].map(m => m[1]);
      assert.strictEqual(payloads.length, 2, 'both reminder payloads found');
      for (const p of payloads) {
        const keys = [...p.matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]).sort();
        assert.deepStrictEqual(keys, ['message', 'studentId'], `frontend payload sends extra fields: ${keys}`);
      }
    });

    await test('18. no payment, schedule, order or fee structure row was changed by any reminder', async () => {
      assert.strictEqual(await financialSnapshot(db), pristineFinance);
    });

    await test('19. no handler threw outside its error handling', async () => {
      assert.deepStrictEqual(unhandled, []);
    });

    await test('20. isolation held to the end: real email service never loaded; every database module is the temporary DB', async () => {
      assert.strictEqual(require.cache[EMAIL_SERVICE_PATH].exports, fakeEmailService);
      for (const key of Object.keys(require.cache).filter(isLiveDbModule)) assert.strictEqual(require.cache[key].exports, db, key);
    });
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }

  const failedCount = results.filter(r => !r.ok).length;
  say(`\n📊 PHASE 1B SUMMARY: ${results.length - failedCount} / ${results.length} TESTS PASSED`);
  process.exit(failedCount > 0 || results.length === 0 ? 1 : 0);
}

main().catch((err) => {
  say('❌ Suite crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
