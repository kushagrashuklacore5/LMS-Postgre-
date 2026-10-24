/**
 * Phase 1A: No Fabricated Accountant Financial Data
 *
 * Backend: exercises the ACTUAL GET /api/classrooms/teacher/students-fees,
 * GET /api/accountant/expenses and GET /api/accountant/payments handlers.
 * Frontend: imports the Reports page's data module (client/src/pages/accountant/reportData.js)
 * and scans the changed page sources for any fabricated record or amount.
 *
 * Isolation: an isolated temporary database (EMPTY clone of the real schema; the project
 * database is opened read-only for its table definitions only, no rows are read or copied,
 * nothing is written) is placed in Node's module cache where the routes look for their
 * database, before any route is loaded. The last test proves the project database module
 * was never loaded. All identities, amounts and names below are test-only values.
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, user, feeStructure, financialSnapshot, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-phase1a-no-fabricated-finance-secret';
process.env.JWT_SECRET = JWT_SECRET;

const DB_SWITCH_PATH = require.resolve('../config/database-switch');
// Some modules (e.g. middleware/quotaMiddleware.js, loaded by the classroom routes) open the
// project database by requiring config/sqlite-db directly. It must be substituted as well.
const SQLITE_DB_PATH = require.resolve('../config/sqlite-db');
const isLiveDbModule = (cacheKey) => /[\\/]config[\\/](sqlite-db|postgres-db)\.js$/i.test(cacheKey);
const CLIENT_SRC = path.join(__dirname, '../../client/src');

const say = console.log.bind(console);
console.log = () => {};
console.error = () => {};
console.warn = () => {};

const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(String(reason && reason.message ? reason.message : reason)));

// Values that only ever existed as fabricated fallbacks in the old code
const FABRICATED_MARKERS = [
  'Rahul Sharma', 'Priya Verma', 'Aman Deep', 'Neha Gupta', 'Vikram Mehta', 'Ananya Roy',
  'STU-101', 'INV-2026-00', 'FND-80', 'Apex Cloud', 'Global Book Publishers', 'Core Security Services',
  'Tuition Fee Collections', 'Govt Higher Education Grant', 'Alumni Development Fund',
  '465000', '250000', '120000', '75000', '45000', '32000', '18500', '15000',
  'DEFAULT_TOTAL_FEE', 'DEFAULT_DUE_DATE', 'mockExpenses', "'2026-10-31'", "'2026-10-01'"
];

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
const ACC_U1 = 1, ADMIN_U1 = 2, MENTOR_A = 3, MENTOR_B = 4, MENTOR_NONE = 5, ACC_NO_UNIV = 6, ACC_U2 = 7, ACC_U3 = 8, ACC_U4 = 9;
const S_TWO_CLASSES = 11, S_LEGACY = 12, S_NO_CLASS = 13, S_PAID = 14, S_U2 = 21, S_U3 = 31, S_NO_UNIV = 41;

async function seed(db) {
  for (const u of [
    user(ACC_U1, 'accountant', 1), user(ADMIN_U1, 'admin', 1), user(MENTOR_A, 'mentor', 1), user(MENTOR_B, 'mentor', 1),
    user(MENTOR_NONE, 'mentor', 1), user(ACC_NO_UNIV, 'accountant', null), user(ACC_U2, 'accountant', 2),
    user(ACC_U3, 'accountant', 3), user(ACC_U4, 'accountant', 4),
    user(S_TWO_CLASSES, 'student', 1), user(S_LEGACY, 'student', 1), user(S_NO_CLASS, 'student', 1), user(S_PAID, 'student', 1),
    user(S_U2, 'student', 2), user(S_U3, 'student', 3), user(S_NO_UNIV, 'student', null)
  ]) await insert(db, 'users', u);

  await insert(db, 'classrooms', { id: 101, university_id: 1, name: 'U1 Grade 12', grade: '12', section: 'A', classTeacher: MENTOR_A });
  await insert(db, 'classrooms', { id: 102, university_id: 1, name: 'U1 Grade 3', grade: '3', section: 'B', classTeacher: MENTOR_B });
  await insert(db, 'classrooms', { id: 201, university_id: 2, name: 'U2 Grade 12', grade: '12', section: 'A', classTeacher: null });
  await insert(db, 'classrooms', { id: 301, university_id: 3, name: 'U3 Grade 12', grade: '12', section: 'A', classTeacher: null });
  for (const [studentId, classroomId] of [[S_TWO_CLASSES, 101], [S_TWO_CLASSES, 102], [S_LEGACY, 101], [S_PAID, 102], [S_U2, 201], [S_U3, 301]]) {
    await insert(db, 'student_classroom_assignment', { studentId, classroomId });
  }

  // University 3 deliberately has NO fee structure; university 4 has no students at all
  await insert(db, 'feeStructures', feeStructure(901, 1, 'Secondary', 12100));
  await insert(db, 'feeStructures', feeStructure(902, 1, 'Primary', 8000));
  await insert(db, 'feeStructures', feeStructure(903, 2, 'Secondary', 9000));

  const pay = (id, studentId, amount, status, createdAt = '2026-05-01 10:00:00') =>
    ({ id, studentId, amount, type: 'full', status, transactionId: `TXN-1A-${id}`, scheduleId: null, installmentStage: null, createdAt });
  await insert(db, 'payments', pay(501, S_LEGACY, 8050, 'success'));
  await insert(db, 'payments', pay(502, S_PAID, 8000, 'success'));
  await insert(db, 'payments', pay(503, S_U2, 5000, 'success'));
  await insert(db, 'payments', pay(504, S_TWO_CLASSES, 999, 'failed'));
  await insert(db, 'payments', pay(505, S_U3, 700, 'success'));
  await insert(db, 'payments', pay(506, S_NO_CLASS, 100, 'success', null)); // a payment with no recorded date
}

async function main() {
  say('================================================================');
  say('🧪 PHASE 1A: NO FABRICATED ACCOUNTANT FINANCIAL DATA');
  say('================================================================');

  const fixture = await createIsolatedDb('phase1a-finance');
  const db = fixture.db;
  let server;

  try {
    for (const modulePath of [DB_SWITCH_PATH, SQLITE_DB_PATH]) {
      require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: db, children: [], paths: [] };
    }
    await seed(db);

    const svc = require('../services/installmentService');
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.tenant = { database: db }; next(); });
    app.use('/api/classrooms', require('../routes/classroomRoutes'));
    app.use('/api/accountant', require('../routes/accountantRoutes'));
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    say(`Isolated test database: ${fixture.dbPath}\n`);

    const token = (userId, role) => signToken(JWT_SECRET, { userId, role }); // no university claim: scope must come from the DB
    const fees = (tok) => request(server, 'GET', '/api/classrooms/teacher/students-fees', { token: tok });
    const ids = (res) => res.body.students.map(s => s.id).sort((a, b) => a - b);
    const byId = (res, id) => res.body.students.find(s => s.id === id);
    const pristine = await financialSnapshot(db);

    // ------------------------------------------------------------ students-fees: scope, duplicates, amounts
    await test('1. accountant sees each student of their university exactly once, even with two classrooms; no other university', async () => {
      const res = await fees(token(ACC_U1, 'accountant'));
      assert.strictEqual(res.statusCode, 200, res.rawBody);
      assert.deepStrictEqual(ids(res), [S_TWO_CLASSES, S_LEGACY, S_NO_CLASS, S_PAID]);
      assert.strictEqual(res.body.students.length, new Set(ids(res)).size, 'no duplicate rows');
      const two = byId(res, S_TWO_CLASSES);
      assert.ok(two.className.includes('U1 Grade 12') && two.className.includes('U1 Grade 3'), 'both classroom names on the single row');
      assert.strictEqual(byId(res, S_NO_CLASS).className, null, 'a student with no classroom gets no invented classroom name');
      assert.deepStrictEqual(res.body.summary, { totalStudents: 4, feeConfigured: 4, feeNotConfigured: 0 });

      const admin = await fees(token(ADMIN_U1, 'admin'));
      assert.strictEqual(admin.statusCode, 200);
      assert.deepStrictEqual(ids(admin), ids(res), 'admin of the same university sees the same students');
    });

    await test('2. amounts are the real installment-summary figures (same source as the student fee page), never assumed', async () => {
      const res = await fees(token(ACC_U1, 'accountant'));
      for (const row of res.body.students) {
        const summary = await svc.calculateStudentInstallmentSummary(db, row.id);
        const expectedTotal = (summary.activeSchedule ? summary.activeSchedule.totalFeePaise : summary.feeStructure.totalFeePaise) / 100;
        assert.strictEqual(row.totalFee, expectedTotal, `student ${row.id} total`);
        assert.strictEqual(row.paidAmount, summary.lifetimePaid, `student ${row.id} paid`);
        assert.strictEqual(row.remainingBalance, Math.max(0, expectedTotal - summary.lifetimePaid), `student ${row.id} remaining`);
        assert.strictEqual(row.feeStructureId, summary.feeStructure.id);
        assert.strictEqual(row.collectionBlocked, summary.collectionBlocked);
      }
      const legacy = byId(res, S_LEGACY);
      assert.deepStrictEqual([legacy.totalFee, legacy.paidAmount, legacy.remainingBalance, legacy.status], [12100, 8050, 4050, 'Partial']);
      assert.strictEqual(legacy.collectionBlocked, true, 'legacy reconciliation flag is surfaced, not hidden');
      const paid = byId(res, S_PAID);
      assert.deepStrictEqual([paid.totalFee, paid.paidAmount, paid.remainingBalance, paid.status], [8000, 8000, 0, 'Paid']);
      const pending = byId(res, S_TWO_CLASSES);
      assert.strictEqual(pending.paidAmount, 0, 'a failed payment is not counted as paid');
      assert.strictEqual(pending.status, 'Pending');
      assert.strictEqual(byId(res, S_NO_CLASS).paidAmount, 100);
    });

    await test('3. a university without a fee structure gets an explicit "not configured" state with null amounts', async () => {
      const res = await fees(token(ACC_U3, 'accountant'));
      assert.strictEqual(res.statusCode, 200, res.rawBody);
      assert.deepStrictEqual(ids(res), [S_U3]);
      const row = byId(res, S_U3);
      assert.strictEqual(row.feeConfigured, false);
      assert.strictEqual(row.totalFee, null, 'no invented total');
      assert.strictEqual(row.remainingBalance, null, 'no invented balance');
      assert.strictEqual(row.status, 'Fee Not Configured');
      assert.strictEqual(row.statusCode, 'FEE_NOT_CONFIGURED');
      assert.strictEqual(row.paidAmount, 700, 'real payments are still reported');
      assert.strictEqual(row.dueDate, null, 'no invented due date');
      assert.deepStrictEqual(res.body.summary, { totalStudents: 1, feeConfigured: 0, feeNotConfigured: 1 });
    });

    await test('4. university isolation: each accountant sees only their own students and payments', async () => {
      const u2 = await fees(token(ACC_U2, 'accountant'));
      assert.deepStrictEqual(ids(u2), [S_U2]);
      assert.deepStrictEqual([byId(u2, S_U2).totalFee, byId(u2, S_U2).paidAmount], [9000, 5000]);
      const u1 = await fees(token(ACC_U1, 'accountant'));
      assert.ok(!ids(u1).includes(S_U2) && !ids(u1).includes(S_U3) && !ids(u1).includes(S_NO_UNIV), 'no other-university or no-university student');
      const empty = await fees(token(ACC_U4, 'accountant'));
      assert.strictEqual(empty.statusCode, 200);
      assert.deepStrictEqual(empty.body.students, [], 'a university with no students gets an empty list, not samples');
      assert.deepStrictEqual(empty.body.summary, { totalStudents: 0, feeConfigured: 0, feeNotConfigured: 0 });
    });

    await test('5. a mentor sees only the students of classrooms they are class teacher of', async () => {
      assert.deepStrictEqual(ids(await fees(token(MENTOR_A, 'mentor'))), [S_TWO_CLASSES, S_LEGACY]);
      assert.deepStrictEqual(ids(await fees(token(MENTOR_B, 'mentor'))), [S_TWO_CLASSES, S_PAID]);
      const none = await fees(token(MENTOR_NONE, 'mentor'));
      assert.strictEqual(none.statusCode, 200);
      assert.deepStrictEqual(none.body.students, []);
    });

    await test('6. access: no/invalid token 401, student 403, staff with no university 403 (no default university)', async () => {
      assert.strictEqual((await fees(null)).statusCode, 401);
      assert.strictEqual((await fees('not-a-token')).statusCode, 401);
      assert.strictEqual((await fees(signToken('some-other-secret', { userId: ACC_U1, role: 'accountant' }))).statusCode, 401);
      assert.strictEqual((await fees(token(S_LEGACY, 'student'))).statusCode, 403);
      assert.strictEqual((await fees(token(S_LEGACY, 'accountant'))).statusCode, 403, 'a forged role claim is checked against the DB');
      const noUniv = await fees(token(ACC_NO_UNIV, 'accountant'));
      assert.strictEqual(noUniv.statusCode, 403);
      assert.strictEqual(noUniv.body.students, undefined);
      assert.strictEqual((await fees(token(999, 'accountant'))).statusCode, 401, 'unknown account');
    });

    await test('7. no response contains the old assumed fee (15000) or due date (2026-10-31)', async () => {
      for (const tok of [token(ACC_U1, 'accountant'), token(ACC_U2, 'accountant'), token(ACC_U3, 'accountant'), token(MENTOR_A, 'mentor')]) {
        const raw = (await fees(tok)).rawBody;
        assert.ok(!/\b15000\b/.test(raw), 'assumed fee 15000 found');
        assert.ok(!raw.includes('2026-10-31'), 'assumed due date found');
        assert.ok(!raw.includes('General Classroom'), 'invented classroom name found');
      }
    });

    // ------------------------------------------------------------ accountant handlers
    await test('8. /api/accountant/expenses no longer returns sample records: explicit 501 for staff, auth still enforced', async () => {
      const res = await request(server, 'GET', '/api/accountant/expenses', { token: token(ACC_U1, 'accountant') });
      assert.strictEqual(res.statusCode, 501, res.rawBody);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'NOT_IMPLEMENTED');
      assert.strictEqual(res.body.data, undefined, 'no data array at all');
      assert.ok(!/Staff Salaries|Utilities Bill|Office Supplies/.test(res.rawBody));
      assert.strictEqual((await request(server, 'GET', '/api/accountant/expenses', {})).statusCode, 401);
      assert.strictEqual((await request(server, 'GET', '/api/accountant/expenses', { token: token(S_LEGACY, 'student') })).statusCode, 403);
    });

    await test('9. /api/accountant/payments: real university-scoped rows only; an unknown date stays null', async () => {
      const res = await request(server, 'GET', '/api/accountant/payments', { token: token(ACC_U1, 'accountant') });
      assert.strictEqual(res.statusCode, 200, res.rawBody);
      assert.deepStrictEqual(res.body.data.map(p => p.id).sort(), [501, 502, 504, 506]);
      const undated = res.body.data.find(p => p.id === 506);
      assert.strictEqual(undated.date, null, 'a missing payment date must not be shown as today');
      assert.ok(res.body.data.every(p => p.id !== 503 && p.id !== 505), 'no other-university payments');
    });

    await test('10. viewing fee data wrote nothing to any financial table', async () => {
      assert.strictEqual(await financialSnapshot(db), pristine);
    });

    // ------------------------------------------------------------ Reports page data module (frontend)
    const report = await import(pathToFileURL(path.join(CLIENT_SRC, 'pages/accountant/reportData.js')).href);

    await test('11. Reports data: empty API responses give empty lists and no errors — never sample records', async () => {
      const get = async (url) => (url.includes('students-fees')
        ? { data: { success: true, students: [], summary: { totalStudents: 0 } } }
        : { data: { success: true, data: [] } });
      const data = await report.loadReportData(get, 'http://test/api');
      assert.deepStrictEqual(data.students, []);
      assert.deepStrictEqual(data.invoices, []);
      assert.deepStrictEqual(data.errors, { fees: null, invoices: null });
      const totals = report.summarizeFees(data.students);
      assert.deepStrictEqual(totals, { totalPaid: 0, totalPending: 0, paidCount: 0, pendingCount: 0, notConfiguredCount: 0 });
      assert.deepStrictEqual(report.summarizeInvoices(data.invoices), { total: 0, count: 0 });
    });

    await test('12. Reports data: API failures and malformed answers give errors, not substitute data', async () => {
      const failing = async (url) => {
        const err = new Error('Request failed');
        err.response = url.includes('students-fees') ? { status: 404, data: { message: 'Not found' } } : { status: 500, data: {} };
        throw err;
      };
      const failed = await report.loadReportData(failing, 'http://test/api');
      assert.deepStrictEqual([failed.students, failed.invoices], [[], []]);
      assert.ok(failed.errors.fees.includes('HTTP 404') && failed.errors.fees.includes('Not found'));
      assert.ok(failed.errors.invoices.includes('HTTP 500'));

      const network = await report.loadReportData(async () => { throw new Error('Network Error'); }, 'http://test/api');
      assert.ok(network.errors.fees && network.errors.invoices, 'network failure is reported');
      assert.deepStrictEqual([network.students, network.invoices], [[], []]);

      const malformed = await report.loadReportData(async () => ({ data: { success: true, students: 'oops', data: null } }), 'http://test/api');
      assert.ok(malformed.errors.fees && malformed.errors.invoices, 'malformed payloads are reported');
      const refused = await report.loadReportData(async () => ({ data: { success: false, message: 'Access denied' } }), 'http://test/api');
      assert.strictEqual(refused.errors.fees, 'Access denied');
    });

    await test('13. Reports totals: students without a fee structure are excluded from dues; unknown amounts render "—"', async () => {
      const live = await fees(token(ACC_U3, 'accountant'));
      const mixed = [...live.body.students, ...(await fees(token(ACC_U1, 'accountant'))).body.students];
      const totals = report.summarizeFees(mixed);
      assert.strictEqual(totals.notConfiguredCount, 1);
      assert.strictEqual(totals.paidCount, 1);
      assert.strictEqual(totals.pendingCount, 3);
      const expectedPending = mixed.filter(s => s.feeConfigured && s.remainingBalance > 0).reduce((sum, s) => sum + s.remainingBalance, 0);
      assert.strictEqual(totals.totalPending, expectedPending, 'only real outstanding balances');
      assert.ok(mixed.some(s => s.status === 'Fee Not Configured' && s.paidAmount === 700), 'the not-configured row is in the input but contributes no dues');
      assert.strictEqual(totals.totalPaid, 700 + 8050 + 8000 + 100);
      assert.strictEqual(report.formatInr(null), '—');
      assert.strictEqual(report.formatInr(undefined), '—');
      assert.strictEqual(report.formatInr(''), '—');
      assert.strictEqual(report.formatInr(0), '₹0');
      assert.ok(!report.hasDues(live.body.students[0]) && !report.isPaidRecord(live.body.students[0]), 'not-configured is neither paid nor pending');
    });

    await test('14. Reports invoices: real field names are used and missing values stay empty, not invented', async () => {
      const real = report.invoiceFields({ invoiceNumber: 'INV-T-1', vendorName: 'Test Vendor', amount: 1234.5, issueDate: '2026-03-04', status: 'paid' });
      assert.deepStrictEqual(real, { number: 'INV-T-1', vendor: 'Test Vendor', category: null, amount: 1234.5, date: '2026-03-04', status: 'paid' });
      const bare = report.invoiceFields({});
      assert.deepStrictEqual(bare, { number: null, vendor: null, category: null, amount: null, date: null, status: null });
      assert.deepStrictEqual(report.summarizeInvoices([{ amount: 100 }, { amount: 'x' }, {}]), { total: 100, count: 3 });
    });

    await test('15. source scan: no fabricated record, amount or date remains in the changed financial code', async () => {
      const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
      const classroomRoutes = read('server/routes/classroomRoutes.js');
      const feeRouteStart = classroomRoutes.indexOf('async function buildStudentFeeRow');
      const feeRouteEnd = classroomRoutes.indexOf('router.post("/send-fee-reminder"');
      assert.ok(feeRouteStart > 0 && feeRouteEnd > feeRouteStart, 'fee route located');
      const accountantRoutes = read('server/routes/accountantRoutes.js');
      const expensesStart = accountantRoutes.indexOf("router.get('/expenses'");
      const sources = {
        'client/src/pages/accountant/DatabaseExport.jsx': read('client/src/pages/accountant/DatabaseExport.jsx'),
        'client/src/pages/accountant/reportData.js': read('client/src/pages/accountant/reportData.js'),
        'client/src/pages/mentor/ClassFeeStatus.jsx': read('client/src/pages/mentor/ClassFeeStatus.jsx'),
        'server/routes/classroomRoutes.js (fee route)': classroomRoutes.slice(feeRouteStart, feeRouteEnd),
        'server/routes/accountantRoutes.js (expenses route)': accountantRoutes.slice(expensesStart, accountantRoutes.indexOf('router.get(', expensesStart + 10))
      };
      const found = [];
      for (const [file, text] of Object.entries(sources)) {
        for (const marker of FABRICATED_MARKERS) if (text.includes(marker)) found.push(`${file}: ${marker}`);
      }
      assert.deepStrictEqual(found, [], 'fabricated values still present');
      assert.ok(!/setFunds\(|setStudents\(\[\s*\{/.test(sources['client/src/pages/accountant/DatabaseExport.jsx']), 'no hard-coded record arrays assigned to state');
    });

    await test('16. no handler threw outside its error handling', async () => {
      assert.deepStrictEqual(unhandled, []);
    });

    await test('17. isolation held to the end: every database module in this process is the temporary database', async () => {
      assert.strictEqual(require(DB_SWITCH_PATH), db);
      const dbModules = Object.keys(require.cache).filter(isLiveDbModule);
      for (const key of dbModules) {
        assert.strictEqual(require.cache[key].exports, db, `${path.basename(key)} must be the substituted temporary database, not the project database`);
      }
    });
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }

  const failed = results.filter(r => !r.ok).length;
  say(`\n📊 PHASE 1A SUMMARY: ${results.length - failed} / ${results.length} TESTS PASSED`);
  process.exit(failed > 0 || results.length === 0 ? 1 : 0);
}

main().catch((err) => {
  say('❌ Suite crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
