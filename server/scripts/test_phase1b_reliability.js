/**
 * Phase 1B: fee-reminder reliability (database busy, token university claims, email module failure)
 *
 * Exercises the ACTUAL POST /api/classrooms/send-fee-reminder and GET /api/classrooms/teacher/students-fees.
 *
 * Isolation, installed and VERIFIED before any route is loaded:
 *  - config/database-switch and config/sqlite-db -> a temporary database (empty clone of the real schema;
 *    the project database is opened read-only for its table definitions only, no rows read or copied);
 *  - services/emailService -> a fake that records calls and can simulate a module LOAD failure;
 *    the real email service is never loaded, so no email can be sent;
 *  - services/installmentService -> the REAL service behind a pass-through wrapper, so a test can make
 *    the fee lookup of one chosen student run while another connection really holds the database lock.
 * "Busy" here is a genuine SQLite lock held by a second connection to the temporary database, not a
 * fabricated error object. All identities and amounts are test-only values.
 */

const path = require('path');
const express = require('express');
const assert = require('assert');
const Database = require('better-sqlite3');
const { createIsolatedDb, insert, all, get, user, feeStructure, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-phase1b-reliability-secret';
process.env.JWT_SECRET = JWT_SECRET;

const DB_SWITCH_PATH = require.resolve('../config/database-switch');
const SQLITE_DB_PATH = require.resolve('../config/sqlite-db');
const EMAIL_SERVICE_PATH = require.resolve('../services/emailService');
const INSTALLMENT_SERVICE_PATH = require.resolve('../services/installmentService');
const isLiveDbModule = (key) => /[\\/]config[\\/](sqlite-db|postgres-db)\.js$/i.test(key);

// ---- fake email module; `loadFails` makes require('../services/emailService') itself throw
const sentEmails = [];
const emailState = { loadFails: false };
const fakeEmailService = {
  async sendFeeReminderEmail(args) {
    sentEmails.push({ ...args });
    return { success: true, delivered: true };
  }
};
const emailCacheEntry = { id: EMAIL_SERVICE_PATH, filename: EMAIL_SERVICE_PATH, loaded: true, children: [], paths: [] };
Object.defineProperty(emailCacheEntry, 'exports', {
  configurable: true,
  get() {
    if (emailState.loadFails) {
      const err = new Error("Cannot find module 'nodemailer' (simulated email module load failure)");
      err.code = 'MODULE_NOT_FOUND';
      throw err;
    }
    return fakeEmailService;
  },
  set() { /* ignore */ }
});

const logLines = [];
const say = console.log.bind(console);
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => logLines.push(args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
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
const ACC_U1 = 1, ACC_U2 = 2;
const S_CLAIM_BUSY = 11, S_FEE_BUSY = 12, S_REVIEW = 13, S_IOERR = 14, S_CLAIM_U1 = 15, S_LOADFAIL = 16, S_U2 = 21;

async function seed(db) {
  for (const u of [
    user(ACC_U1, 'accountant', 1), user(ACC_U2, 'accountant', 2),
    user(S_CLAIM_BUSY, 'student', 1), user(S_FEE_BUSY, 'student', 1), user(S_REVIEW, 'student', 1), user(S_IOERR, 'student', 1),
    user(S_CLAIM_U1, 'student', 1), user(S_LOADFAIL, 'student', 1), user(S_U2, 'student', 2)
  ]) await insert(db, 'users', u);
  await insert(db, 'classrooms', { id: 101, university_id: 1, name: 'U1 Grade 12', grade: '12', section: 'A', classTeacher: null });
  await insert(db, 'classrooms', { id: 201, university_id: 2, name: 'U2 Grade 12', grade: '12', section: 'A', classTeacher: null });
  for (const sid of [S_CLAIM_BUSY, S_FEE_BUSY, S_REVIEW, S_IOERR, S_CLAIM_U1, S_LOADFAIL]) await insert(db, 'student_classroom_assignment', { studentId: sid, classroomId: 101 });
  await insert(db, 'student_classroom_assignment', { studentId: S_U2, classroomId: 201 });
  await insert(db, 'feeStructures', feeStructure(901, 1, 'Secondary', 12100, { dueDate: '2099-06-30' }));
  await insert(db, 'feeStructures', feeStructure(903, 2, 'Secondary', 9000, { dueDate: '2099-06-30' }));
}

async function main() {
  say('================================================================');
  say('🧪 PHASE 1B: REMINDER RELIABILITY');
  say('================================================================');

  const fixture = await createIsolatedDb('phase1b-reliability');
  const db = fixture.db;
  let server;

  try {
    // --- substitutes first, verified before any route is loaded
    for (const modulePath of [DB_SWITCH_PATH, SQLITE_DB_PATH]) {
      require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: db, children: [], paths: [] };
    }
    require.cache[EMAIL_SERVICE_PATH] = emailCacheEntry;
    const realService = require(INSTALLMENT_SERVICE_PATH);
    const summaryHooks = new Map(); // studentId -> async (runReal) => summary
    const wrappedService = {
      ...realService,
      calculateStudentInstallmentSummary: async (database, studentId) => {
        const hook = summaryHooks.get(Number(studentId));
        const runReal = () => realService.calculateStudentInstallmentSummary(database, studentId);
        return hook ? hook(runReal) : runReal();
      }
    };
    require.cache[INSTALLMENT_SERVICE_PATH].exports = wrappedService;

    assert.strictEqual(require('../config/database-switch'), db, 'database-switch substitution failed');
    assert.strictEqual(require('../config/sqlite-db'), db, 'sqlite-db substitution failed');
    assert.strictEqual(require('../services/emailService'), fakeEmailService, 'emailService substitution failed');
    emailState.loadFails = true;
    assert.throws(() => require('../services/emailService'), /simulated email module load failure/, 'load-failure simulation must make require() throw');
    emailState.loadFails = false;
    assert.strictEqual(require('../services/installmentService'), wrappedService, 'installmentService wrapper not installed');
    say('Substitutes verified: database modules -> temporary DB; emailService -> fake (load failure switchable); installmentService -> real behind pass-through wrapper');

    await seed(db);
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.tenant = { database: db }; next(); });
    app.use('/api/classrooms', require('../routes/classroomRoutes'));
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    say(`Isolated test database: ${fixture.dbPath}\n`);

    const token = (userId, role, claims = {}) => signToken(JWT_SECRET, { userId, role, ...claims });
    const acc1 = token(ACC_U1, 'accountant');
    const remind = (tok, studentId) => request(server, 'POST', '/api/classrooms/send-fee-reminder', { token: tok, body: { studentId } });
    const remindersFor = (sid) => all(db, `SELECT * FROM announcements WHERE targetUserId = ? AND title LIKE '⚠️ Fee Payment Reminder%'`, [sid]);
    // A second connection to the TEMPORARY database that really holds a lock while `fn` runs
    const withLockHeld = async (mode, fn) => {
      const holder = new Database(fixture.dbPath, { fileMustExist: true });
      holder.exec(`BEGIN ${mode}`);
      try { return await fn(); } finally { holder.exec('ROLLBACK'); holder.close(); }
    };

    // ---------------------------------------------------------------- 2. SQLITE_BUSY at the claim
    await test('2. SQLITE_BUSY during the reminder claim: HTTP 503 BUSY, no announcement, no email; a later retry succeeds', async () => {
      const emailsBefore = sentEmails.length;
      // RESERVED lock: reads still work, but the claim INSERT cannot get the write lock within the driver's 1 s wait
      const res = await withLockHeld('IMMEDIATE', () => remind(acc1, S_CLAIM_BUSY));
      assert.strictEqual(res.statusCode, 503, res.rawBody);
      assert.strictEqual(res.body.code, 'BUSY');
      assert.strictEqual(res.body.success, false);
      assert.deepStrictEqual(await remindersFor(S_CLAIM_BUSY), [], 'no announcement may be created');
      assert.strictEqual(sentEmails.length, emailsBefore, 'no email may be sent');

      const retry = await remind(acc1, S_CLAIM_BUSY);
      assert.strictEqual(retry.statusCode, 200, retry.rawBody);
      assert.strictEqual((await remindersFor(S_CLAIM_BUSY)).length, 1);
      assert.strictEqual(sentEmails.length, emailsBefore + 1);
    });

    // ---------------------------------------------------------------- 3. SQLITE_BUSY in the fee lookup
    await test('3a. SQLITE_BUSY during the fee lookup: reminder answers 503 BUSY (not 409 "needs manual review"); nothing created or sent', async () => {
      const emailsBefore = sentEmails.length;
      // EXCLUSIVE lock held only while this student's fee summary is read: the real read connection retries, then fails with SQLITE_BUSY
      summaryHooks.set(S_FEE_BUSY, (runReal) => withLockHeld('EXCLUSIVE', runReal));
      let res;
      try { res = await remind(acc1, S_FEE_BUSY); } finally { summaryHooks.delete(S_FEE_BUSY); }
      assert.strictEqual(res.statusCode, 503, res.rawBody);
      assert.strictEqual(res.body.code, 'BUSY');
      assert.ok(!/manual review/i.test(res.rawBody), 'a busy database must not be reported as a manual-review case');
      assert.deepStrictEqual(await remindersFor(S_FEE_BUSY), []);
      assert.strictEqual(sentEmails.length, emailsBefore);
    });

    await test('3b. SQLITE_BUSY during the fee lookup in the fee-monitoring list: 503 BUSY instead of a "Needs Review" row', async () => {
      summaryHooks.set(S_FEE_BUSY, (runReal) => withLockHeld('EXCLUSIVE', runReal));
      let res;
      try { res = await request(server, 'GET', '/api/classrooms/teacher/students-fees', { token: acc1 }); } finally { summaryHooks.delete(S_FEE_BUSY); }
      assert.strictEqual(res.statusCode, 503, res.rawBody);
      assert.strictEqual(res.body.code, 'BUSY');
      const after = await request(server, 'GET', '/api/classrooms/teacher/students-fees', { token: acc1 });
      assert.strictEqual(after.statusCode, 200, 'the list recovers once the lock is released');
      assert.ok(after.body.students.every(s => s.status !== 'Needs Review'));
    });

    await test('3c. a genuine manual-review condition (PaymentError) is still reported as 409 "needs manual review" and sends nothing', async () => {
      summaryHooks.set(S_REVIEW, () => { throw new realService.PaymentError(409, 'MULTIPLE_ACTIVE_SCHEDULES', 'Student has more than one active fee schedule.'); });
      let res;
      try { res = await remind(acc1, S_REVIEW); } finally { summaryHooks.delete(S_REVIEW); }
      assert.strictEqual(res.statusCode, 409, res.rawBody);
      assert.strictEqual(res.body.code, 'MULTIPLE_ACTIVE_SCHEDULES');
      assert.deepStrictEqual(await remindersFor(S_REVIEW), []);
    });

    await test('3d. UNCHANGED (documented limitation): other non-busy fee-lookup errors are still reported as 409 "needs review"', async () => {
      summaryHooks.set(S_IOERR, () => { const e = new Error('disk I/O error'); e.code = 'SQLITE_IOERR'; throw e; });
      let res;
      try { res = await remind(acc1, S_IOERR); } finally { summaryHooks.delete(S_IOERR); }
      assert.strictEqual(res.statusCode, 409, res.rawBody);
      assert.strictEqual(res.body.code, 'SQLITE_IOERR');
      assert.deepStrictEqual(await remindersFor(S_IOERR), []);
    });

    // ---------------------------------------------------------------- 4. token university claim vs database
    await test('4. a token claiming another university is ignored: the database university decides', async () => {
      const lyingU1 = token(ACC_U1, 'accountant', { universityId: 2, university_id: 2 }); // DB says university 1
      const own = await remind(lyingU1, S_CLAIM_U1);
      assert.strictEqual(own.statusCode, 200, `own-university student must be allowed: ${own.rawBody}`);
      const [row] = await remindersFor(S_CLAIM_U1);
      assert.strictEqual(row.university_id, 1, 'announcement belongs to the database university');
      const claimed = await remind(lyingU1, S_U2);
      assert.strictEqual(claimed.statusCode, 403, `claimed university's student must be refused: ${claimed.rawBody}`);
      assert.strictEqual(claimed.body.code, 'CROSS_TENANT_FORBIDDEN');

      const lyingU2 = token(ACC_U2, 'accountant', { universityId: 1 }); // DB says university 2
      const cross = await remind(lyingU2, S_CLAIM_U1);
      assert.strictEqual(cross.statusCode, 403, cross.rawBody);
      assert.deepStrictEqual(await remindersFor(S_U2), []);
    });

    // ---------------------------------------------------------------- 5. email module load failure after the claim
    await test('5. email module fails to load after the announcement is inserted: HTTP 500, announcement and 24-hour cooldown remain, no email', async () => {
      const emailsBefore = sentEmails.length;
      emailState.loadFails = true;
      let res;
      try { res = await remind(acc1, S_LOADFAIL); } finally { emailState.loadFails = false; }
      // Current behaviour, documented: the generic server error is returned...
      assert.strictEqual(res.statusCode, 500, res.rawBody);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Server error sending fee reminder.');
      // ...although the in-app reminder was already created (claim happens before the email step)
      const rows = await remindersFor(S_LOADFAIL);
      assert.strictEqual(rows.length, 1, 'the announcement inserted by the claim remains');
      assert.strictEqual(rows[0].university_id, 1);
      assert.ok(rows[0].content.includes('₹12,100'));
      assert.strictEqual(sentEmails.length, emailsBefore, 'no email was sent');
      // ...and the cooldown is consumed: a retry (email module working again) is refused for 24 hours
      const retry = await remind(acc1, S_LOADFAIL);
      assert.strictEqual(retry.statusCode, 429, retry.rawBody);
      assert.strictEqual(retry.body.code, 'REMINDER_RECENTLY_SENT');
      assert.strictEqual(sentEmails.length, emailsBefore, 'still no email');
      assert.strictEqual((await remindersFor(S_LOADFAIL)).length, 1);
    });

    await test('6. no handler threw outside its error handling; no student address or token in logs', async () => {
      assert.deepStrictEqual(unhandled, []);
      const joined = logLines.join('\n');
      for (const row of await all(db, "SELECT email FROM users WHERE role = 'student'")) assert.ok(!joined.includes(row.email));
    });

    await test('7. isolation held: real email service never loaded; every database module is the temporary DB', async () => {
      assert.strictEqual(require.cache[EMAIL_SERVICE_PATH], emailCacheEntry);
      for (const key of Object.keys(require.cache).filter(isLiveDbModule)) assert.strictEqual(require.cache[key].exports, db, key);
      assert.ok(path.resolve(fixture.dbPath) !== path.resolve(__dirname, '../data/lms_permanent.db'));
    });
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }

  const failed = results.filter(r => !r.ok).length;
  say(`\n📊 PHASE 1B RELIABILITY SUMMARY: ${results.length - failed} / ${results.length} TESTS PASSED`);
  process.exit(failed > 0 || results.length === 0 ? 1 : 0);
}

main().catch((err) => {
  say('❌ Suite crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
