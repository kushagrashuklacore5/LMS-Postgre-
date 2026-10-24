/**
 * Isolated Test Suite for POST /api/accountant/pay-invoice/:invoiceId
 *
 * Verifies that POST /api/accountant/pay-invoice/:invoiceId:
 * 1. Blocks unauthenticated (guest) requests with HTTP 401
 * 2. Blocks non-staff (student) callers with HTTP 403
 * 3. Fails closed (403) for staff with missing/null university_id in DB
 * 4. Blocks cross-tenant invoice payments (Univ 1 accountant cannot pay Univ 2 invoice) -> 404
 * 5. Successfully processes payment for legitimate invoice belonging to accountant's university -> 200
 * 6. Records payment transaction with verified non-null userId
 * 7. Blocks paying an invoice that is already paid -> 400
 */

const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, user, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-pay-invoice-secret';
process.env.JWT_SECRET = JWT_SECRET;

const createTestToken = (payload) => signToken(JWT_SECRET, payload);
const makeRequest = (server, method, path, token, body = {}) => request(server, method, path, { token, body });

async function ensureTables(db) {
  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_date DATETIME NOT NULL,
        status TEXT DEFAULT 'pending',
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        razorpay_signature TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => err ? reject(err) : resolve());
  });
}

async function seed(db) {
  await ensureTables(db);

  // Staff accounts
  await insert(db, 'users', user(1, 'accountant', 1, 'Accountant Univ 1'));
  await insert(db, 'users', user(2, 'accountant', 2, 'Accountant Univ 2'));
  await insert(db, 'users', user(3, 'accountant', null, 'Accountant No Univ'));
  await insert(db, 'users', user(4, 'student', 1, 'Student Univ 1'));

  // Invoices
  await insert(db, 'invoices', {
    id: 101,
    invoiceNumber: 'INV-U1-001',
    vendorId: 1,
    vendorName: 'Lab Supplies Co',
    amount: 50000,
    status: 'pending',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    university_id: 1
  });

  await insert(db, 'invoices', {
    id: 201,
    invoiceNumber: 'INV-U2-001',
    vendorId: 2,
    vendorName: 'Campus Stationery',
    amount: 30000,
    status: 'pending',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    university_id: 2
  });

  await insert(db, 'invoices', {
    id: 102,
    invoiceNumber: 'INV-U1-002',
    vendorId: 1,
    vendorName: 'Lab Supplies Co',
    amount: 12000,
    status: 'paid',
    issueDate: '2026-08-01',
    dueDate: '2026-08-31',
    university_id: 1
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST: POST /api/accountant/pay-invoice/:id Security & Isolation');
  console.log('================================================================\n');

  const fixture = await createIsolatedDb('pay-invoice-test');
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
    const resUnauth = await makeRequest(server, 'POST', '/api/accountant/pay-invoice/101', null);
    assert.strictEqual(resUnauth.statusCode, 401, `Unauthenticated request must return 401, got ${resUnauth.statusCode}`);
    console.log('✅ PASS: Guest access blocked with 401\n');

    // Test 2: Non-staff (student) access must return 403
    console.log('--- Test 2: Non-staff (student) access blocked ---');
    const resStudent = await makeRequest(server, 'POST', '/api/accountant/pay-invoice/101', tokenStudent);
    assert.strictEqual(resStudent.statusCode, 403, `Student request must return 403, got ${resStudent.statusCode}`);
    console.log('✅ PASS: Student access blocked with 403\n');

    // Test 3: Staff missing university in DB fails closed with 403
    console.log('--- Test 3: Staff missing university fails closed ---');
    const resNoUniv = await makeRequest(server, 'POST', '/api/accountant/pay-invoice/101', tokenNoUniv);
    assert.strictEqual(resNoUniv.statusCode, 403, `Staff with no university must return 403, got ${resNoUniv.statusCode}`);
    console.log('✅ PASS: Missing tenant fails closed with 403\n');

    // Test 4: Cross-tenant payment attempt blocked (Univ 1 accountant cannot pay Univ 2 invoice 201)
    console.log('--- Test 4: Cross-tenant payment blocked ---');
    const resCross = await makeRequest(server, 'POST', '/api/accountant/pay-invoice/201', tokenU1);
    assert.strictEqual(resCross.statusCode, 404, `Cross-tenant invoice must return 404, got ${resCross.statusCode}`);
    
    // Verify invoice 201 is STILL pending in DB
    const inv201 = await new Promise((resolve) => testDb.get('SELECT status FROM invoices WHERE id = 201', (e, r) => resolve(r)));
    assert.strictEqual(inv201.status, 'pending', 'Cross-tenant invoice status must remain pending');
    console.log('✅ PASS: Cross-tenant invoice not accessible and remains pending\n');

    // Test 5: Authorized payment by Univ 1 accountant for Univ 1 invoice 101 succeeds
    console.log('--- Test 5: Authorized payment succeeds ---');
    const resPay = await makeRequest(server, 'POST', '/api/accountant/pay-invoice/101', tokenU1);
    assert.strictEqual(resPay.statusCode, 200, `Legitimate payment must return 200, got ${resPay.statusCode}`);
    assert.strictEqual(resPay.body.success, true);
    assert.strictEqual(resPay.body.data.status, 'paid');

    // Verify invoice 101 status is updated to 'paid' in DB
    const inv101 = await new Promise((resolve) => testDb.get('SELECT status, updatedAt FROM invoices WHERE id = 101', (e, r) => resolve(r)));
    assert.strictEqual(inv101.status, 'paid', 'Invoice status in DB must be paid');
    assert.ok(inv101.updatedAt, 'Invoice must have updatedAt recorded');
    assert.ok(resPay.body.data.paidDate, 'Response data must return paidDate');

    // Verify payment_transactions has audit record with verified non-null userId: 1
    const tx = await new Promise((resolve) => testDb.get('SELECT * FROM payment_transactions WHERE invoice_id = 101', (e, r) => resolve(r)));
    assert.ok(tx, 'Payment transaction record must exist');
    assert.strictEqual(tx.user_id, 1, 'Payment transaction user_id must be verified accountant userId (1)');
    assert.strictEqual(tx.amount, 50000, 'Transaction amount must match invoice');
    assert.strictEqual(tx.status, 'completed', 'Transaction status must be completed');
    console.log('✅ PASS: Invoice marked paid and payment transaction logged with verified accountant userId (1)\n');

    // Test 6: Attempting to pay an already-paid invoice returns 400
    console.log('--- Test 6: Paying already-paid invoice rejected ---');
    const resAlreadyPaid = await makeRequest(server, 'POST', '/api/accountant/pay-invoice/101', tokenU1);
    assert.strictEqual(resAlreadyPaid.statusCode, 400, `Paying already-paid invoice must return 400, got ${resAlreadyPaid.statusCode}`);
    console.log('✅ PASS: Already-paid invoice rejected with 400\n');

    console.log('🎉 ALL 6 POST /api/accountant/pay-invoice/:invoiceId TESTS PASSED SUCCESSFULLY!');
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
