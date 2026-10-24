/**
 * Phase 2C Step 1 Tenant Isolation & Deduplication Test Suite
 *
 * Exercises the ACTUAL GET /api/accountant/unallocated-payments route in accountantRoutes.js
 * on an isolated temporary database cloned from the REAL project schema
 * (see phase2c_test_fixture.js).
 *
 * The real payments table has no university column, so a payment's tenant is
 * always its student's users.university_id. Verifies:
 * Case 1: Student U1 payment -> visible to Univ 1 only
 * Case 2: Student U2 payment -> visible to Univ 2 only
 * Case 3: Student with NULL university -> excluded from ALL tenants
 * Case 4: Staff member with missing/null university_id in DB -> fails closed with HTTP 403
 * Case 5: Staff token claiming another university is ignored; the users table decides
 * Deduplication: multiple classroom assignments return exactly 1 row per payment with the latest class
 * Schedule context: a single active schedule resolves the fee structure; none is reported as NO_ACTIVE_SCHEDULE;
 *                   the real schema itself refuses a second active schedule for one student
 */

const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, user, feeStructure, financialSnapshot, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-phase2c-isolation-cases-secret';
process.env.JWT_SECRET = JWT_SECRET;

const createTestToken = (payload) => signToken(JWT_SECRET, payload);
const makeRequest = (server, path, token) => request(server, 'GET', path, { token });

async function seed(db) {
  await insert(db, 'users', user(1, 'accountant', 1, 'Accountant Univ 1'));
  await insert(db, 'users', user(2, 'accountant', 2, 'Accountant Univ 2'));
  await insert(db, 'users', user(3, 'accountant', null, 'Accountant No Univ'));
  await insert(db, 'users', user(11, 'student', 1, 'Student U1'));
  await insert(db, 'users', user(12, 'student', 2, 'Student U2'));
  await insert(db, 'users', user(15, 'student', null, 'Student Null Univ'));
  await insert(db, 'users', user(16, 'student', 1, 'Student Multi-Class'));

  await insert(db, 'classrooms', { id: 101, university_id: 1, name: 'Grade 10-A', grade: '10', section: 'A' });
  await insert(db, 'classrooms', { id: 102, university_id: 1, name: 'Grade 11-A', grade: '11', section: 'A' });
  await insert(db, 'classrooms', { id: 201, university_id: 2, name: 'Grade 10-B', grade: '10', section: 'B' });

  // Student 16: historical Grade 10 assignment + current Grade 11 assignment
  await insert(db, 'student_classroom_assignment', { id: 1, studentId: 16, classroomId: 101 });
  await insert(db, 'student_classroom_assignment', { id: 2, studentId: 16, classroomId: 102 });

  await insert(db, 'feeStructures', feeStructure(901, 1, 'Secondary', 12100));
  await insert(db, 'feeStructures', feeStructure(902, 2, 'Secondary', 12100));

  // Student 11 has one clean active schedule; student 16 has none
  await insert(db, 'student_fee_schedules', { id: 401, studentId: 11, feeStructureId: 901, planId: 'quarterly', planName: 'Quarterly Plan', totalFee: 12100, scheduleSnapshot: '[]', status: 'active' });

  const unallocated = (id, studentId, amount) => ({ id, studentId, amount, type: 'full', status: 'success', scheduleId: null, installmentStage: null });
  await insert(db, 'payments', unallocated(101, 11, 1000)); // Case 1
  await insert(db, 'payments', unallocated(102, 12, 2000)); // Case 2
  await insert(db, 'payments', unallocated(106, 15, 6000)); // Case 3 (orphaned student)
  await insert(db, 'payments', unallocated(108, 16, 8000)); // Deduplication
}

async function runRegressionTests() {
  console.log('================================================================');
  console.log('🧪 PHASE 2C STEP 1: ROUTE HANDLER ISOLATION & DEDUPLICATION TEST');
  console.log('================================================================\n');

  const fixture = await createIsolatedDb('phase2c-isolation');
  const testDb = fixture.db;
  let server;

  try {
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

    const tokenUniv1 = createTestToken({ userId: 1, role: 'accountant', universityId: 1 });
    const tokenUniv2 = createTestToken({ userId: 2, role: 'accountant', universityId: 2 });
    const tokenNoUniv = createTestToken({ userId: 3, role: 'accountant', universityId: null });

    const resU1 = await makeRequest(server, '/api/accountant/unallocated-payments', tokenUniv1);
    assert.strictEqual(resU1.statusCode, 200, `Univ 1 accountant request must succeed with 200, got ${resU1.statusCode}: ${resU1.rawBody}`);
    const u1Payments = resU1.body.data;

    const resU2 = await makeRequest(server, '/api/accountant/unallocated-payments', tokenUniv2);
    assert.strictEqual(resU2.statusCode, 200, 'Univ 2 accountant request must succeed with 200');
    const u2Payments = resU2.body.data;

    console.log('--- TEST 1: Case 1 (Student U1 payment) ---');
    assert.ok(u1Payments.some(p => p.paymentId === 101), 'Payment 101 must be visible to Univ 1');
    assert.ok(!u2Payments.some(p => p.paymentId === 101), 'Payment 101 must NOT be visible to Univ 2');
    console.log('✅ PASS: Univ 1 staff can see Payment 101; Univ 2 staff cannot\n');

    console.log('--- TEST 2: Case 2 (Student U2 payment) ---');
    assert.ok(u2Payments.some(p => p.paymentId === 102), 'Payment 102 must be visible to Univ 2');
    assert.ok(!u1Payments.some(p => p.paymentId === 102), 'Payment 102 must NOT be visible to Univ 1');
    assert.deepStrictEqual(u2Payments.map(p => p.paymentId), [102], 'Univ 2 must see exactly its own unallocated payment');
    assert.ok(u1Payments.every(p => p.universityId === 1) && u2Payments.every(p => p.universityId === 2), 'Every returned row must belong to the caller\'s university');
    console.log('✅ PASS: Univ 2 staff can see Payment 102; Univ 1 staff cannot\n');

    console.log('--- TEST 3: Case 3 (Student with NULL university_id is excluded) ---');
    assert.ok(!u1Payments.some(p => p.paymentId === 106), 'Payment 106 (NULL student uni) must NOT be visible to Univ 1');
    assert.ok(!u2Payments.some(p => p.paymentId === 106), 'Payment 106 must NOT be visible to Univ 2');
    console.log('✅ PASS: Orphaned student with NULL university_id is not exposed to any tenant\n');

    console.log('--- TEST 4: Case 4 (Staff member with missing/null university_id fails closed) ---');
    const resNoUniv = await makeRequest(server, '/api/accountant/unallocated-payments', tokenNoUniv);
    assert.strictEqual(resNoUniv.statusCode, 403, 'Staff with missing tenant in DB must receive HTTP 403');
    assert.strictEqual(resNoUniv.body.success, false);
    assert.strictEqual(resNoUniv.body.data, undefined, 'No rows may be returned without a tenant');
    console.log('✅ PASS: Missing staff tenant association fails closed with HTTP 403 without fallback\n');

    console.log('--- TEST 5: Case 5 (Token university claim is not trusted) ---');
    const forgedClaim = createTestToken({ userId: 1, role: 'accountant', universityId: 2 }); // user 1 is Univ 1 in the DB
    const resForged = await makeRequest(server, '/api/accountant/unallocated-payments', forgedClaim);
    assert.strictEqual(resForged.statusCode, 200);
    assert.deepStrictEqual(resForged.body.data.map(p => p.paymentId).sort(), [101, 108], 'Scope must follow users.university_id, not the token claim');
    const noUnivForged = createTestToken({ userId: 3, role: 'accountant', universityId: 1 }); // user 3 has no university in the DB
    assert.strictEqual((await makeRequest(server, '/api/accountant/unallocated-payments', noUnivForged)).statusCode, 403, 'A claimed university must not rescue an account with none');
    console.log('✅ PASS: Tenant scope comes from the users table; a forged claim changes nothing\n');

    console.log('--- TEST 6: Deduplication (Multiple classroom assignments) ---');
    const payment108Rows = u1Payments.filter(p => p.paymentId === 108);
    assert.strictEqual(payment108Rows.length, 1, 'Payment 108 must return exactly 1 row despite multiple classroom assignments');
    assert.strictEqual(payment108Rows[0].currentAcademicContext.classroomId, 102, 'Must deterministically resolve latest classroom (Grade 11-A)');
    console.log('✅ PASS: Multiple classroom assignments return exactly 1 row with deterministic latest classroom\n');

    console.log('--- TEST 7: No active schedule is reported, never guessed ---');
    const p108 = payment108Rows[0];
    assert.strictEqual(p108.currentAcademicContext.isStructureDeterminedSafely, false, 'Must NOT mark structure safely determined');
    assert.strictEqual(p108.currentAcademicContext.activeScheduleId, null, 'Must NOT invent an active schedule');
    assert.strictEqual(p108.currentAcademicContext.currentFeeStructureId, null, 'Must NOT infer a fee structure from the current grade');
    assert.strictEqual(p108.currentAcademicContext.scheduleAmbiguity, 'NO_ACTIVE_SCHEDULE');
    console.log('✅ PASS: Student without an active schedule gets no inferred fee context\n');

    console.log('--- TEST 8: Single Active Schedule Clean Context ---');
    const p101 = u1Payments.find(p => p.paymentId === 101);
    assert.ok(p101, 'Payment 101 must be present');
    assert.strictEqual(p101.currentAcademicContext.isStructureDeterminedSafely, true);
    assert.strictEqual(p101.currentAcademicContext.activeScheduleId, 401);
    assert.strictEqual(p101.currentAcademicContext.currentFeeStructureId, 901);
    console.log('✅ PASS: Single active schedule correctly resolves fee-structure context\n');

    console.log('--- TEST 9: Read-only (financial tables byte-identical after all requests) ---');
    assert.strictEqual(await financialSnapshot(testDb), before, 'Listing unallocated payments must not write to any financial table');
    console.log('✅ PASS: Zero writes\n');

    console.log('--- TEST 10: Real schema refuses a second active schedule for one student ---');
    await assert.rejects(
      insert(testDb, 'student_fee_schedules', { id: 402, studentId: 11, feeStructureId: 901, planId: 'semi_annual', planName: 'Semi-Annual Plan', totalFee: 12100, scheduleSnapshot: '[]', status: 'active' }),
      /SQLITE_CONSTRAINT/,
      'The unique active-schedule index must reject a second active schedule'
    );
    console.log('✅ PASS: Multiple active schedules cannot exist in the real schema (DB-enforced)\n');

    console.log('🎉 ALL TENANT ISOLATION AND DEDUPLICATION ROUTE HANDLER TESTS PASSED!\n');
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }
}

runRegressionTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
