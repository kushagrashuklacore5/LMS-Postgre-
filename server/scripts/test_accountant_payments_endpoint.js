/**
 * Isolated Test Suite for GET /api/accountant/payments
 *
 * Verifies that GET /api/accountant/payments:
 * 1. Blocks unauthenticated (guest) requests with 401
 * 2. Blocks non-staff (student) callers with 403
 * 3. Fails closed (403) for staff with missing/null university_id in DB
 * 4. Queries the REAL database (not mock data)
 * 5. Strictly isolates payments per university tenant
 * 6. Excludes payments belonging to orphaned students (null university)
 * 7. Correctly formats response payload ({ success: true, data: [...] })
 */

const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, user, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-accountant-payments-secret';
process.env.JWT_SECRET = JWT_SECRET;

const createTestToken = (payload) => signToken(JWT_SECRET, payload);
const makeRequest = (server, path, token) => request(server, 'GET', path, { token });

async function seed(db) {
  // Staff accounts
  await insert(db, 'users', user(1, 'accountant', 1, 'Accountant Univ 1'));
  await insert(db, 'users', user(2, 'accountant', 2, 'Accountant Univ 2'));
  await insert(db, 'users', user(3, 'accountant', null, 'Accountant No Univ'));
  await insert(db, 'users', user(4, 'student', 1, 'Student Univ 1'));

  // Students
  await insert(db, 'users', user(11, 'student', 1, 'Rahul Sharma'));
  await insert(db, 'users', user(12, 'student', 2, 'Aisha Siddiqui'));
  await insert(db, 'users', user(13, 'student', null, 'Orphan Student'));

  // Payments
  await insert(db, 'payments', {
    id: 501,
    studentId: 11,
    amount: 15000,
    amountPaise: 1500000,
    type: 'offline_cash',
    status: 'paid',
    transactionId: 'TXN-501',
    description: 'Term 1 Fee',
    createdAt: '2026-09-01T10:00:00.000Z'
  });

  await insert(db, 'payments', {
    id: 502,
    studentId: 12,
    amount: 25000,
    amountPaise: 2500000,
    type: 'online',
    status: 'success',
    transactionId: 'TXN-502',
    description: 'Annual Fee',
    createdAt: '2026-09-05T12:30:00.000Z'
  });

  await insert(db, 'payments', {
    id: 503,
    studentId: 13,
    amount: 8000,
    amountPaise: 800000,
    type: 'offline_cheque',
    status: 'paid',
    transactionId: 'TXN-503',
    description: 'Orphan Payment',
    createdAt: '2026-09-10T09:15:00.000Z'
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST: GET /api/accountant/payments Real DB & Isolation Suite');
  console.log('================================================================\n');

  const fixture = await createIsolatedDb('accountant-payments-test');
  const testDb = fixture.db;
  let server;

  try {
    await seed(testDb);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.tenant = { database: testDb };
      next();
    });
    app.use('/api/accountant', require('../routes/accountantRoutes'));

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    const tokenU1 = createTestToken({ userId: 1, role: 'accountant', universityId: 1 });
    const tokenU2 = createTestToken({ userId: 2, role: 'accountant', universityId: 2 });
    const tokenNoUniv = createTestToken({ userId: 3, role: 'accountant', universityId: null });
    const tokenStudent = createTestToken({ userId: 4, role: 'student', universityId: 1 });

    // Test 1: Unauthenticated request must return 401
    console.log('--- Test 1: Unauthenticated access blocked ---');
    const resUnauth = await makeRequest(server, '/api/accountant/payments', null);
    assert.strictEqual(resUnauth.statusCode, 401, `Unauthenticated request must return 401, got ${resUnauth.statusCode}`);
    console.log('✅ PASS: Guest access blocked with 401\n');

    // Test 2: Student role access must return 403
    console.log('--- Test 2: Non-staff (student) access blocked ---');
    const resStudent = await makeRequest(server, '/api/accountant/payments', tokenStudent);
    assert.strictEqual(resStudent.statusCode, 403, `Student request must return 403, got ${resStudent.statusCode}`);
    console.log('✅ PASS: Student access blocked with 403\n');

    // Test 3: Staff with null university in DB fails closed with 403
    console.log('--- Test 3: Staff missing university in DB fails closed ---');
    const resNoUniv = await makeRequest(server, '/api/accountant/payments', tokenNoUniv);
    assert.strictEqual(resNoUniv.statusCode, 403, `Staff with no university must return 403, got ${resNoUniv.statusCode}`);
    console.log('✅ PASS: Missing tenant fails closed with 403\n');

    // Test 4: Accountant Univ 1 gets only Univ 1 payments from real DB
    console.log('--- Test 4: Univ 1 accountant receives real Univ 1 payments only ---');
    const resU1 = await makeRequest(server, '/api/accountant/payments', tokenU1);
    assert.strictEqual(resU1.statusCode, 200, `Univ 1 request must return 200, got ${resU1.statusCode}`);
    assert.strictEqual(resU1.body.success, true, 'Response must have success: true');
    assert.ok(Array.isArray(resU1.body.data), 'Response data must be an array');
    assert.strictEqual(resU1.body.data.length, 1, `Univ 1 should see exactly 1 payment, got ${resU1.body.data.length}`);

    const u1Payment = resU1.body.data[0];
    assert.strictEqual(u1Payment.id, 501, 'Payment ID must be 501');
    assert.strictEqual(u1Payment.studentName, 'Rahul Sharma', 'Student name must be Rahul Sharma from DB');
    assert.strictEqual(u1Payment.amount, 15000, 'Amount must be 15000');
    assert.strictEqual(u1Payment.status, 'Paid', 'Status must be Paid');
    assert.strictEqual(u1Payment.date, '2026-09-01', 'Date must match ISO date string');
    assert.strictEqual(u1Payment.transactionId, 'TXN-501', 'Transaction ID must be TXN-501');

    // Verify mock data is absent
    const mockFound = resU1.body.data.some(p => p.studentName === 'Ali Ahmed' || p.studentName === 'Sara Khan');
    assert.strictEqual(mockFound, false, 'Hardcoded mock data must not be returned');
    console.log('✅ PASS: Real DB data queried with correct shape; mock data eliminated\n');

    // Test 5: Accountant Univ 2 gets only Univ 2 payments
    console.log('--- Test 5: Univ 2 accountant receives real Univ 2 payments only ---');
    const resU2 = await makeRequest(server, '/api/accountant/payments', tokenU2);
    assert.strictEqual(resU2.statusCode, 200, `Univ 2 request must return 200, got ${resU2.statusCode}`);
    assert.strictEqual(resU2.body.data.length, 1, `Univ 2 should see exactly 1 payment, got ${resU2.body.data.length}`);

    const u2Payment = resU2.body.data[0];
    assert.strictEqual(u2Payment.id, 502, 'Payment ID must be 502');
    assert.strictEqual(u2Payment.studentName, 'Aisha Siddiqui', 'Student name must be Aisha Siddiqui');
    assert.strictEqual(u2Payment.amount, 25000, 'Amount must be 25000');
    assert.strictEqual(u2Payment.status, 'Paid', 'Status must be Paid');
    console.log('✅ PASS: Univ 2 tenant scoping strictly isolated\n');

    // Test 6: Orphaned student payments are excluded from all tenants
    console.log('--- Test 6: Orphan student payments excluded from all tenants ---');
    const orphanSeenByU1 = resU1.body.data.some(p => p.id === 503);
    const orphanSeenByU2 = resU2.body.data.some(p => p.id === 503);
    assert.strictEqual(orphanSeenByU1, false, 'Orphan payment 503 must not be seen by Univ 1');
    assert.strictEqual(orphanSeenByU2, false, 'Orphan payment 503 must not be seen by Univ 2');
    console.log('✅ PASS: Payments for students without university are excluded from all tenants\n');

    console.log('🎉 ALL 6 /api/accountant/payments TESTS PASSED SUCCESSFULLY!');
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await fixture.cleanup();
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
