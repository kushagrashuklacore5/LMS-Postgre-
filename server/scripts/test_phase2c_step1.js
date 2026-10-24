/**
 * Phase 2C Step 1 Automated Test Suite
 *
 * Validates:
 * 1. GET /api/accountant/unallocated-payments authentication & role authorization (401, 403, 200).
 * 2. Unallocated filtering: only successful/paid payments with missing schedule/stage linkage are returned.
 * 3. University/tenant isolation: staff only see unallocated payments for their authorized university.
 * 4. Academic-session confirmation safety notice & read-only enforcement (no writes or auto-inference).
 *
 * Runs on an isolated temporary database cloned from the REAL project schema
 * (see phase2c_test_fixture.js). The project database is only read for its schema.
 */

const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, all, user, feeStructure, financialSnapshot, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-phase2c-secret-key-12345';
process.env.JWT_SECRET = JWT_SECRET;

const createTestToken = (payload) => signToken(JWT_SECRET, payload);
const makeRequest = (server, path, token) => request(server, 'GET', path, { token });

async function seed(db) {
  // 1: Accountant (Univ 1), 2: Admin (Univ 1), 3-5: Students (Univ 1), 6: Accountant (Univ 2), 7: Student (Univ 2)
  await insert(db, 'users', user(1, 'accountant', 1, 'Accountant One'));
  await insert(db, 'users', user(2, 'admin', 1, 'Admin One'));
  await insert(db, 'users', user(3, 'student', 1, 'Rashmi Shetty'));
  await insert(db, 'users', user(4, 'student', 1, 'John Doe'));
  await insert(db, 'users', user(5, 'student', 1, 'Student Three'));
  await insert(db, 'users', user(6, 'accountant', 2, 'Accountant Two'));
  await insert(db, 'users', user(7, 'student', 2, 'Univ 2 Student'));

  await insert(db, 'classrooms', { id: 10, university_id: 1, name: 'Grade 12-A', grade: '12', section: 'A' });
  await insert(db, 'student_classroom_assignment', { studentId: 3, classroomId: 10 });

  await insert(db, 'feeStructures', feeStructure(917, 1, 'Secondary', 12100));

  // Students 3 and 4 each have one active schedule; payment #1 below is historical and not linked to it
  const schedule = (id, studentId) => ({ id, studentId, feeStructureId: 917, planId: 'plan_quarterly', planName: 'Quarterly Plan', totalFee: 12100, scheduleSnapshot: '[]', status: 'active' });
  await insert(db, 'student_fee_schedules', schedule(50, 3));
  await insert(db, 'student_fee_schedules', schedule(51, 4));

  // The real payments table has NO university column: a payment's tenant is its student's.
  const payment = (id, studentId, amount, type, status, transactionId, scheduleId, installmentStage, createdAt) =>
    ({ id, studentId, amount, type, status, transactionId, scheduleId, installmentStage, createdAt });
  // 1: Student 3 - historical ₹8,050, success, no schedule/stage (UNALLOCATED)
  await insert(db, 'payments', payment(1, 3, 8050, 'full', 'success', 'TXN_HIST_001', null, null, '2026-04-30 10:00:00'));
  // 2: Student 4 - properly allocated ₹3,025 to stage 1 (must NOT appear)
  await insert(db, 'payments', payment(2, 4, 3025, 'installment', 'paid', 'TXN_ALLOC_002', 51, 1, '2026-05-15 11:00:00'));
  // 3: Student 5 - offline ₹1,610 with no schedule/stage (UNALLOCATED)
  await insert(db, 'payments', payment(3, 5, 1610, 'offline_cash', 'success', 'TXN_HIST_003', null, null, '2026-05-20 12:00:00'));
  // 4: Student 3 - failed payment (must NOT appear)
  await insert(db, 'payments', payment(4, 3, 4000, 'full', 'failed', 'TXN_FAIL_004', null, null, '2026-06-01 13:00:00'));
  // 5: Student 7 (Univ 2) - unallocated ₹5,000 (must NOT appear for Univ 1)
  await insert(db, 'payments', payment(5, 7, 5000, 'full', 'success', 'TXN_UNIV2_005', null, null, '2026-06-05 14:00:00'));
}

async function runTests() {
  console.log('🚀 Starting Phase 2C Step 1 Automated Test Suite...\n');

  const fixture = await createIsolatedDb('phase2c-step1');
  const testDb = fixture.db;
  let server;

  try {
    console.log('Test 0: Fixture is the real schema (payments has no university_id column)');
    assert.ok(!fixture.columns('payments').includes('university_id'), 'Real payments table is not expected to have a university_id column');
    assert.ok(fixture.columns('users').includes('university_id'), 'Real users table must have university_id');
    console.log('✅ PASS: Tests run against the real schema\n');

    await seed(testDb);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.tenant = { database: testDb }; // routes read the isolated DB, never the project DB
      next();
    });
    app.use('/api/accountant', require('../routes/accountantRoutes'));

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    const before = await financialSnapshot(testDb);

    // 1. Authentication & Role Authorization
    console.log('Test 1: Unauthenticated request should return 401 Unauthorized');
    const noAuthRes = await makeRequest(server, '/api/accountant/unallocated-payments', null);
    assert.strictEqual(noAuthRes.statusCode, 401, 'Expected 401 for no token');
    assert.strictEqual(noAuthRes.body.success, false);
    console.log('✅ PASS: Unauthenticated access blocked with 401\n');

    console.log('Test 2: Student role access should return 403 Forbidden');
    const studentToken = createTestToken({ userId: 3, role: 'student', universityId: 1 });
    const studentRes = await makeRequest(server, '/api/accountant/unallocated-payments', studentToken);
    assert.strictEqual(studentRes.statusCode, 403, 'Expected 403 for student role');
    assert.strictEqual(studentRes.body.success, false);
    console.log('✅ PASS: Student role blocked with 403 Forbidden\n');

    console.log('Test 3: Accountant role access should return 200 OK');
    const accountantToken = createTestToken({ userId: 1, role: 'accountant', universityId: 1 });
    const accountantRes = await makeRequest(server, '/api/accountant/unallocated-payments', accountantToken);
    assert.strictEqual(accountantRes.statusCode, 200, `Expected 200 for accountant role, got ${accountantRes.statusCode}: ${accountantRes.rawBody}`);
    assert.strictEqual(accountantRes.body.success, true);
    console.log('✅ PASS: Accountant successfully authorized with 200 OK\n');

    console.log('Test 4: Admin role access should return 200 OK');
    const adminToken = createTestToken({ userId: 2, role: 'admin', universityId: 1 });
    const adminRes = await makeRequest(server, '/api/accountant/unallocated-payments', adminToken);
    assert.strictEqual(adminRes.statusCode, 200, 'Expected 200 for admin role');
    assert.strictEqual(adminRes.body.success, true);
    console.log('✅ PASS: Admin successfully authorized with 200 OK\n');

    // 2. Unallocated Filtering & Results Integrity
    console.log('Test 5: Verify unallocated payment filtering & data payload');
    const data = accountantRes.body.data;
    const summary = accountantRes.body.summary;

    // Univ 1 should return Payment #1 (₹8,050) and Payment #3 (₹1,610)
    // Should NOT include Payment #2 (allocated) or Payment #4 (failed) or Payment #5 (Univ 2)
    assert.strictEqual(data.length, 2, `Expected exactly 2 unallocated payments, got ${data.length}`);
    assert.strictEqual(summary.totalUnallocatedCount, 2);
    assert.strictEqual(summary.totalUnallocatedAmount, 9660);
    assert.strictEqual(summary.affectedStudentsCount, 2);

    const payment1 = data.find((p) => p.paymentId === 1);
    assert.ok(payment1, 'Payment 1 should be present in results');
    assert.strictEqual(payment1.studentId, 3);
    assert.strictEqual(payment1.studentName, 'Rashmi Shetty');
    assert.strictEqual(payment1.amount, 8050);
    assert.strictEqual(payment1.transactionId, 'TXN_HIST_001');
    assert.strictEqual(payment1.scheduleId, null);
    assert.strictEqual(payment1.installmentStage, null);
    assert.strictEqual(payment1.allocationStatus, 'unallocated');
    assert.strictEqual(payment1.currentAcademicContext.grade, '12');
    assert.strictEqual(payment1.currentAcademicContext.currentFeeStructureId, 917);
    assert.strictEqual(payment1.reconciliationRequirement.academicSessionConfirmed, false);
    assert.strictEqual(payment1.reconciliationRequirement.status, 'ACADEMIC_SESSION_UNCONFIRMED');
    console.log('✅ PASS: Correct filtering of historical unallocated payments (2 of 5 payments matched)\n');

    // 3. Multi-Tenant University Scoping
    console.log('Test 6: Multi-tenant scoping - University 2 accountant sees only University 2 unallocated payments');
    const univ2Token = createTestToken({ userId: 6, role: 'accountant', universityId: 2 });
    const univ2Res = await makeRequest(server, '/api/accountant/unallocated-payments', univ2Token);
    assert.strictEqual(univ2Res.statusCode, 200);
    assert.strictEqual(univ2Res.body.data.length, 1, 'Univ 2 should see only 1 unallocated payment');
    assert.strictEqual(univ2Res.body.data[0].paymentId, 5, 'Univ 2 should see Payment 5 only');
    assert.strictEqual(univ2Res.body.data[0].studentId, 7);
    assert.strictEqual(univ2Res.body.summary.totalUnallocatedAmount, 5000);
    console.log('✅ PASS: Tenant scoping strictly isolates unallocated payments per university\n');

    // 4. Read-Only Verification (No database mutations)
    console.log('Test 7: Read-Only Safety Check (financial tables are byte-identical after all requests)');
    assert.strictEqual(await financialSnapshot(testDb), before, 'Listing unallocated payments must not write to any financial table');
    const stillUnallocated = await all(testDb, 'SELECT scheduleId, installmentStage FROM payments WHERE id IN (1, 3, 5)');
    assert.ok(stillUnallocated.every(p => p.scheduleId === null && p.installmentStage === null), 'No payment may be auto-allocated');
    console.log('✅ PASS: Zero database writes; no payment was allocated\n');

    console.log('🎉 ALL 8 PHASE 2C STEP 1 TESTS PASSED SUCCESSFULLY!');
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
