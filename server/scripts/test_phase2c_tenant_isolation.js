/**
 * Phase 2C Tenant Isolation Test Suite (accountant fee routes + installment service)
 *
 * Runs the ACTUAL routes and service on an isolated temporary database cloned
 * from the REAL project schema (see phase2c_test_fixture.js), with test-only
 * identities. The project database is only read for its schema; no gateway is called.
 *
 * Covers, with cross-university negative and same-university positive cases:
 *  - fees-stats totals, counts and recent payments
 *  - the accountant students list
 *  - student-installment-status and student-payments-history authorization
 *  - offline collection (refusals must write nothing)
 *  - fee structure resolution never crossing universities
 *  - missing tenant identity failing closed (no default university)
 */

const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, all, get, user, feeStructure, financialSnapshot, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-phase2c-tenant-isolation-secret';
process.env.JWT_SECRET = JWT_SECRET;

const svc = require('../services/installmentService');

// Route and service logging is noise here; test output goes through say()
const say = console.log.bind(console);
console.log = () => {};
console.error = () => {};

// Test-only identities
const ACC_U1 = 1, ACC_U2 = 2, ACC_NO_UNIV = 3, ADMIN_U1 = 4, ACC_U3 = 5;
const STU_U1 = 11, STU_U1_LEGACY = 12, STU_U2 = 21, STU_U2_PAID = 22, STU_U3 = 31, STU_NO_UNIV = 41;
const FS_U1 = 901, FS_U2 = 902; // U2's id is higher: an unscoped "latest structure" lookup would wrongly pick it for U1

async function seed(db) {
  await insert(db, 'users', user(ACC_U1, 'accountant', 1));
  await insert(db, 'users', user(ACC_U2, 'accountant', 2));
  await insert(db, 'users', user(ACC_NO_UNIV, 'accountant', null));
  await insert(db, 'users', user(ADMIN_U1, 'admin', 1));
  await insert(db, 'users', user(ACC_U3, 'accountant', 3));
  await insert(db, 'users', user(STU_U1, 'student', 1));
  await insert(db, 'users', user(STU_U1_LEGACY, 'student', 1));
  await insert(db, 'users', user(STU_U2, 'student', 2));
  await insert(db, 'users', user(STU_U2_PAID, 'student', 2));
  await insert(db, 'users', user(STU_U3, 'student', 3)); // university 3 has NO fee structure
  await insert(db, 'users', user(STU_NO_UNIV, 'student', null));

  await insert(db, 'classrooms', { id: 101, university_id: 1, name: 'Grade 12-A', grade: '12', section: 'A' });
  await insert(db, 'classrooms', { id: 201, university_id: 2, name: 'Grade 12-B', grade: '12', section: 'B' });
  await insert(db, 'classrooms', { id: 301, university_id: 3, name: 'Grade 12-C', grade: '12', section: 'C' });
  for (const [studentId, classroomId] of [[STU_U1, 101], [STU_U1_LEGACY, 101], [STU_U2, 201], [STU_U2_PAID, 201], [STU_U3, 301]]) {
    await insert(db, 'student_classroom_assignment', { studentId, classroomId });
  }

  await insert(db, 'feeStructures', feeStructure(FS_U1, 1, 'Secondary', 12100));
  await insert(db, 'feeStructures', feeStructure(FS_U2, 2, 'Secondary', 9000));

  // Historical payments with no schedule/stage linkage (the real table has no university column)
  const legacy = (id, studentId, amount, transactionId, createdAt) =>
    ({ id, studentId, amount, type: 'full', status: 'success', transactionId, scheduleId: null, installmentStage: null, createdAt });
  await insert(db, 'payments', legacy(501, STU_U1_LEGACY, 8050, 'TXN_U1_501', '2026-04-30 10:00:00'));
  await insert(db, 'payments', legacy(502, STU_U2_PAID, 5000, 'TXN_U2_502', '2026-05-01 10:00:00'));
  await insert(db, 'payments', legacy(503, STU_U2_PAID, 700, 'TXN_U2_503', '2026-05-02 10:00:00'));
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    say(`✅ [PASS] ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    say(`❌ [FAIL] ${name}\n      - ${e.message}`);
  }
}

async function main() {
  say('================================================================');
  say('🧪 PHASE 2C: TENANT ISOLATION (ACCOUNTANT FEE ROUTES + SERVICE)');
  say('================================================================');

  const fixture = await createIsolatedDb('phase2c-tenant');
  const db = fixture.db;
  let server;

  try {
    await seed(db);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.tenant = { database: db }; next(); }); // routes read the isolated DB, never the project DB
    app.use('/api/accountant', require('../routes/accountantRoutes'));
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    say(`Isolated test database: ${fixture.dbPath}\n`);

    // Tokens deliberately carry NO university claim: scope must come from the users table
    const token = (userId, role) => signToken(JWT_SECRET, { userId, role });
    const accU1 = token(ACC_U1, 'accountant'), accU2 = token(ACC_U2, 'accountant'), accNone = token(ACC_NO_UNIV, 'accountant');
    const adminU1 = token(ADMIN_U1, 'admin'), accU3 = token(ACC_U3, 'accountant');
    const GET = (path, tok) => request(server, 'GET', `/api/accountant${path}`, { token: tok });
    const POST = (path, tok, body) => request(server, 'POST', `/api/accountant${path}`, { token: tok, body });
    const offline = (studentId, extra = {}) => ({ studentId, amount: 1000, installmentStage: 1, paymentMethod: 'Cash', planId: 'full', idempotencyKey: `T-${studentId}-${Math.random().toString(36).slice(2)}`, ...extra });

    const pristine = await financialSnapshot(db);
    const assertNothingWritten = async (label) => assert.strictEqual(await financialSnapshot(db), pristine, `${label}: financial tables must be unchanged`);

    // ---------------------------------------------------------------- fees-stats
    await test('1. fees-stats: totals, student count and recent payments are limited to the caller\'s university', async () => {
      const u1 = await GET('/fees-stats', accU1);
      assert.strictEqual(u1.statusCode, 200, u1.rawBody);
      assert.strictEqual(u1.body.data.totalFeesCollected, 8050, 'U1 total must exclude U2 payments');
      assert.strictEqual(u1.body.data.totalStudents, 2, 'U1 has exactly 2 students');
      assert.deepStrictEqual(u1.body.data.recentPayments.map(p => p.transactionId), ['TXN_U1_501']);

      const u2 = await GET('/fees-stats', accU2);
      assert.strictEqual(u2.statusCode, 200, u2.rawBody);
      assert.strictEqual(u2.body.data.totalFeesCollected, 5700, 'U2 total must exclude U1 payments');
      assert.strictEqual(u2.body.data.totalStudents, 2);
      assert.deepStrictEqual(u2.body.data.recentPayments.map(p => p.transactionId).sort(), ['TXN_U2_502', 'TXN_U2_503']);

      const admin = await GET('/fees-stats', adminU1);
      assert.strictEqual(admin.statusCode, 200);
      assert.strictEqual(admin.body.data.totalFeesCollected, 8050, 'A U1 admin sees U1 figures');

      const u3 = await GET('/fees-stats', accU3);
      assert.strictEqual(u3.body.data.totalFeesCollected, 0, 'A university with no payments sees zero, not another tenant\'s total');
      assert.deepStrictEqual(u3.body.data.recentPayments, []);
    });

    await test('2. fees-stats and dashboard: staff with no university fail closed with 403 (no default to university 1)', async () => {
      for (const path of ['/fees-stats', '/dashboard', '/students', '/unallocated-payments']) {
        const res = await GET(path, accNone);
        assert.strictEqual(res.statusCode, 403, `${path} must return 403, got ${res.statusCode}: ${res.rawBody}`);
        assert.strictEqual(res.body.success, false);
        assert.strictEqual(res.body.data, undefined, `${path} must not return data`);
        assert.strictEqual(res.body.students, undefined, `${path} must not return students`);
      }
      const dashU1 = await GET('/dashboard', accU1);
      assert.strictEqual(dashU1.statusCode, 200, dashU1.rawBody);
      assert.strictEqual(dashU1.body.data.universityId, 1);
      assert.strictEqual(dashU1.body.data.totalRevenue, 8050);
    });

    // ---------------------------------------------------------------- students list
    await test('3. students list: only the caller\'s university; orphaned students are in nobody\'s list', async () => {
      const ids = async (tok) => (await GET('/students', tok)).body.students.map(s => s.id).sort((a, b) => a - b);
      assert.deepStrictEqual(await ids(accU1), [STU_U1, STU_U1_LEGACY]);
      assert.deepStrictEqual(await ids(accU2), [STU_U2, STU_U2_PAID]);
      assert.deepStrictEqual(await ids(accU3), [STU_U3]);
    });

    // ---------------------------------------------------------------- reconciliation list
    await test('4. reconciliation list: each university sees only its own eligible unallocated payments', async () => {
      const u1 = await GET('/unallocated-payments', accU1);
      const u2 = await GET('/unallocated-payments', accU2);
      assert.strictEqual(u1.statusCode, 200, u1.rawBody);
      assert.strictEqual(u2.statusCode, 200, u2.rawBody);
      assert.deepStrictEqual(u1.body.data.map(p => p.paymentId), [501]);
      assert.deepStrictEqual(u2.body.data.map(p => p.paymentId).sort(), [502, 503]);
      assert.strictEqual(u2.body.summary.totalUnallocatedAmount, 5700);
      assert.ok([...u1.body.data, ...u2.body.data].every(p => p.allocationStatus === 'unallocated' && p.scheduleId === null && p.installmentStage === null));
    });

    // ---------------------------------------------------------------- installment status
    await test('5. student-installment-status: same-university staff allowed, cross-university staff refused', async () => {
      const own = await GET(`/student-installment-status?studentId=${STU_U1}`, accU1);
      assert.strictEqual(own.statusCode, 200, own.rawBody);
      assert.strictEqual(own.body.data.student.id, STU_U1);

      const adminOwn = await GET(`/student-installment-status?studentId=${STU_U1}`, adminU1);
      assert.strictEqual(adminOwn.statusCode, 200);

      for (const [tok, studentId, label] of [[accU1, STU_U2, 'U1 staff -> U2 student'], [accU2, STU_U1_LEGACY, 'U2 staff -> U1 student'], [accU1, STU_NO_UNIV, 'U1 staff -> student with no university'], [accNone, STU_U1, 'staff with no university']]) {
        const res = await GET(`/student-installment-status?studentId=${studentId}`, tok);
        assert.strictEqual(res.statusCode, 403, `${label} must be 403, got ${res.statusCode}: ${res.rawBody}`);
        assert.strictEqual(res.body.data, undefined, `${label} must not receive data`);
      }

      const other = await GET(`/student-installment-status?studentId=${STU_U2}`, accU2);
      assert.strictEqual(other.statusCode, 200);
      assert.strictEqual(other.body.data.student.id, STU_U2);

      const unknown = await GET('/student-installment-status?studentId=999999', accU1);
      assert.strictEqual(unknown.statusCode, 404, 'An unknown student id keeps its not-found answer');
    });

    await test('6. students still read their own status only; legacy block is unchanged', async () => {
      const self = await GET('/student-installment-status', token(STU_U2, 'student'));
      assert.strictEqual(self.statusCode, 200, self.rawBody);
      assert.strictEqual(self.body.data.student.id, STU_U2);

      const peek = await GET(`/student-installment-status?studentId=${STU_U2}`, token(STU_U1, 'student'));
      assert.strictEqual(peek.statusCode, 403);

      const legacy = await GET('/student-installment-status', token(STU_U1_LEGACY, 'student'));
      assert.strictEqual(legacy.body.data.collectionBlocked, true);
      assert.strictEqual(legacy.body.data.collectionBlockedReason, 'LEGACY_RECONCILIATION_REQUIRED');
      assert.strictEqual(legacy.body.data.unallocatedPaid, 8050);
    });

    await test('7. student-payments-history: cross-university staff refused, same-university staff allowed', async () => {
      const denied = await GET(`/student-payments-history?studentId=${STU_U2_PAID}`, accU1);
      assert.strictEqual(denied.statusCode, 403, denied.rawBody);
      assert.strictEqual(denied.body.data, undefined);
      assert.strictEqual(denied.body.payments, undefined);

      const allowed = await GET(`/student-payments-history?studentId=${STU_U2_PAID}`, accU2);
      assert.strictEqual(allowed.statusCode, 200);
      assert.strictEqual(allowed.body.data.length, 2);

      const noTenant = await GET(`/student-payments-history?studentId=${STU_U1}`, accNone);
      assert.strictEqual(noTenant.statusCode, 403);
    });

    // ---------------------------------------------------------------- fee structure resolution
    await test('8. fee structure resolution never selects another university\'s structure', async () => {
      const u1 = await GET(`/student-installment-status?studentId=${STU_U1}`, accU1);
      assert.strictEqual(u1.body.data.feeStructure.id, FS_U1, 'U1 student must resolve to the U1 structure, not the newer U2 one');
      assert.strictEqual(u1.body.data.feeStructure.totalFee, 12100);

      const u2 = await GET('/student-installment-status', token(STU_U2, 'student'));
      assert.strictEqual(u2.body.data.feeStructure.id, FS_U2);

      const u3 = await GET('/student-installment-status', token(STU_U3, 'student'));
      assert.strictEqual(u3.statusCode, 200, u3.rawBody);
      assert.strictEqual(u3.body.data.feeStructure, null, 'A university with no structure must get none, not a borrowed one');

      const orphan = await GET('/student-installment-status', token(STU_NO_UNIV, 'student'));
      assert.strictEqual(orphan.body.data.feeStructure, null, 'A student with no university must get no structure');
    });

    await test('9. viewing and refused requests so far wrote nothing', async () => {
      await assertNothingWritten('after read-only requests');
    });

    // ---------------------------------------------------------------- offline collection (refusals)
    await test('10. offline collection: cross-university and tenant-less staff are refused and nothing is written', async () => {
      const cross = await POST('/collect-offline-fee', accU1, offline(STU_U2));
      assert.strictEqual(cross.statusCode, 403, cross.rawBody);
      assert.strictEqual(cross.body.code, 'CROSS_TENANT_FORBIDDEN');

      const reverse = await POST('/collect-offline-fee', accU2, offline(STU_U1));
      assert.strictEqual(reverse.statusCode, 403);

      const orphan = await POST('/collect-offline-fee', accU1, offline(STU_NO_UNIV));
      assert.strictEqual(orphan.statusCode, 403, 'A student with no university belongs to nobody');

      const noTenant = await POST('/collect-offline-fee', accNone, offline(STU_U1));
      assert.strictEqual(noTenant.statusCode, 403);

      await assertNothingWritten('after refused collections');
    });

    await test('11. offline collection: another university\'s fee structure cannot be used, and a university without one cannot borrow', async () => {
      const foreignStructure = await POST('/collect-offline-fee', accU1, offline(STU_U1, { feeStructureId: FS_U2 }));
      assert.strictEqual(foreignStructure.statusCode, 404, foreignStructure.rawBody);
      assert.strictEqual(foreignStructure.body.code, 'FEE_STRUCTURE_NOT_FOUND');

      const noStructure = await POST('/collect-offline-fee', accU3, offline(STU_U3));
      assert.strictEqual(noStructure.statusCode, 409, noStructure.rawBody);
      assert.strictEqual(noStructure.body.code, 'FEE_STRUCTURE_NOT_FOUND');

      await assertNothingWritten('after fee-structure refusals');
    });

    await test('12. offline collection: legacy reconciliation block is unchanged (no auto-allocation)', async () => {
      const blocked = await POST('/collect-offline-fee', accU1, offline(STU_U1_LEGACY));
      assert.strictEqual(blocked.statusCode, 409, blocked.rawBody);
      assert.strictEqual(blocked.body.code, 'LEGACY_RECONCILIATION_REQUIRED');
      await assertNothingWritten('after legacy-blocked collection');
    });

    await test('13. service: offline collection without a staff university is refused before touching the database', async () => {
      for (const actor of [undefined, {}, { userId: ACC_U1 }, { userId: ACC_U1, universityId: null }, { userId: ACC_U1, universityId: 0 }, { userId: ACC_U1, universityId: 'abc' }]) {
        await assert.rejects(svc.recordOfflineInstallmentPayment(db, offline(STU_U1), actor), (e) => e.statusCode === 403 && e.code === 'TENANT_REQUIRED');
      }
      await assert.rejects(svc.recordOfflineInstallmentPayment(db, offline(STU_U2), { userId: ACC_U1, universityId: 1 }), (e) => e.statusCode === 403 && e.code === 'CROSS_TENANT_FORBIDDEN');
      await assertNothingWritten('after service-level refusals');
    });

    // ---------------------------------------------------------------- positive write (isolated DB only)
    await test('14. same-university offline collection succeeds, uses the student\'s own university structure, and touches no other row', async () => {
      const othersBefore = JSON.stringify(await all(db, 'SELECT * FROM payments WHERE id IN (501, 502, 503) ORDER BY id'));

      const ok = await POST('/collect-offline-fee', accU1, offline(STU_U1));
      assert.strictEqual(ok.statusCode, 201, ok.rawBody);
      assert.strictEqual(ok.body.payment.studentId, STU_U1);
      assert.strictEqual(ok.body.payment.feeStructureId, FS_U1);
      assert.strictEqual(ok.body.payment.recordedBy, ACC_U1);

      const schedule = await get(db, 'SELECT * FROM student_fee_schedules WHERE studentId = ?', [STU_U1]);
      assert.strictEqual(schedule.feeStructureId, FS_U1, 'Schedule must be built from the U1 structure');
      assert.strictEqual(schedule.totalFee, 12100);

      assert.strictEqual(JSON.stringify(await all(db, 'SELECT * FROM payments WHERE id IN (501, 502, 503) ORDER BY id')), othersBefore, 'Existing payments must be untouched');
      assert.strictEqual((await get(db, 'SELECT COUNT(*) n FROM payments')).n, 4, 'Exactly one new payment row');

      const u2Stats = await GET('/fees-stats', accU2);
      assert.strictEqual(u2Stats.body.data.totalFeesCollected, 5700, 'A U1 collection must not appear in U2 figures');
      const u1Stats = await GET('/fees-stats', accU1);
      assert.strictEqual(u1Stats.body.data.totalFeesCollected, 9050);
    });

    // ---------------------------------------------------------------- online order preparation (service)
    await test('15. online order preparation resolves only the student\'s own university structure', async () => {
      const u2 = await svc.prepareOrderDetails(db, { studentId: STU_U2, planId: 'full', installmentStage: 1 });
      assert.strictEqual(u2.feeStructureId, FS_U2);
      assert.strictEqual(u2.orderAmountRupees, 9000);

      const before = await financialSnapshot(db);
      await assert.rejects(svc.prepareOrderDetails(db, { studentId: STU_U3, planId: 'full', installmentStage: 1 }), (e) => e.statusCode === 409 && e.code === 'FEE_STRUCTURE_NOT_FOUND');
      await assert.rejects(svc.prepareOrderDetails(db, { studentId: STU_U3, planId: 'full', installmentStage: 1, feeStructureId: FS_U1 }), (e) => e.statusCode === 404 && e.code === 'FEE_STRUCTURE_NOT_FOUND');
      await assert.rejects(svc.prepareOrderDetails(db, { studentId: STU_NO_UNIV, planId: 'full', installmentStage: 1 }), (e) => e.code === 'FEE_STRUCTURE_NOT_FOUND');
      assert.strictEqual(await financialSnapshot(db), before, 'Refused order preparation must write nothing');
    });

    await test('16. legacy payments were never allocated by any request in this suite', async () => {
      const legacy = await all(db, 'SELECT id, amount, status, transactionId, scheduleId, installmentStage FROM payments WHERE id IN (501, 502, 503) ORDER BY id');
      assert.deepStrictEqual(legacy, [
        { id: 501, amount: 8050, status: 'success', transactionId: 'TXN_U1_501', scheduleId: null, installmentStage: null },
        { id: 502, amount: 5000, status: 'success', transactionId: 'TXN_U2_502', scheduleId: null, installmentStage: null },
        { id: 503, amount: 700, status: 'success', transactionId: 'TXN_U2_503', scheduleId: null, installmentStage: null }
      ]);
    });
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }

  const failed = results.filter(r => !r.ok).length;
  say(`\n📊 PHASE 2C TENANT ISOLATION SUMMARY: ${results.length - failed} / ${results.length} TESTS PASSED`);
  if (failed > 0 || results.length === 0) process.exit(1);
}

main().catch((err) => {
  say('❌ Suite crashed:', err);
  process.exit(1);
});
