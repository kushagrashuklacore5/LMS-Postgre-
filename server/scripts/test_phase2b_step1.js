const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const Razorpay = require('razorpay');
const { runInstallmentMigrations } = require('../config/migration-runner');

// Mock Razorpay Order Creation for offline / test suite
let mockOrderCounter = 1000;
Razorpay.prototype.orders = {
  create: async (options) => {
    mockOrderCounter++;
    return {
      id: `order_mock_${mockOrderCounter}`,
      entity: 'order',
      amount: options.amount,
      amount_paid: 0,
      amount_due: options.amount,
      currency: options.currency || 'INR',
      receipt: options.receipt,
      status: 'created',
      notes: options.notes || {},
      created_at: Math.floor(Date.now() / 1000)
    };
  }
};

const srcDbPath = path.join(__dirname, '../data/lms_permanent.db');
const testDbPath = path.join(__dirname, '../data/lms_phase2b_test.db');

// Helper to query
const dbGet = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
});
const dbRun = (db, sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

async function runPhase2BStep1Tests() {
  console.log('================================================================');
  console.log('🧪 PHASE 2B (STEP 1): SECURE RAZORPAY ORDER CREATION TEST SUITE');
  console.log('================================================================');

  // 1. Prepare fresh test database from live DB
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  fs.copyFileSync(srcDbPath, testDbPath);
  console.log(`Created isolated test database: ${testDbPath}\n`);

  const db = new sqlite3.Database(testDbPath);
  await runInstallmentMigrations(db);

  // Set environment variables for test
  process.env.RAZORPAY_KEY_ID = 'rzp_test_MOCK_KEY_ID_123';
  process.env.RAZORPAY_KEY_SECRET = 'MOCK_SECRET_XYZ_456';

  // Find test students
  const studentA = await dbGet(db, "SELECT id, name, email FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 1");
  const studentB = await dbGet(db, "SELECT id, name, email FROM users WHERE role = 'student' AND id != ? LIMIT 1", [studentA.id]);
  
  console.log(`Test Student A: ID ${studentA.id} (${studentA.name})`);
  console.log(`Test Student B: ID ${studentB ? studentB.id : 'N/A'}\n`);

  // Ensure fee structure exists
  let feeStructure = await dbGet(db, "SELECT id, totalFee, category FROM feeStructures LIMIT 1");
  if (!feeStructure) {
    const plansJson = JSON.stringify([
      {
        id: 'plan_2term',
        name: '2-Term Academic Plan',
        installmentsCount: 2,
        splitType: 'equal',
        isActive: true,
        installments: [
          { number: 1, percentage: 50, dueDate: '2026-10-31' },
          { number: 2, percentage: 50, dueDate: '2026-12-31' }
        ]
      }
    ]);
    await dbRun(db, "INSERT INTO feeStructures (category, grade, totalFee, installmentOptions) VALUES ('Primary', '1', 8050, ?)", [plansJson]);
    feeStructure = await dbGet(db, "SELECT id, totalFee, category FROM feeStructures LIMIT 1");
  } else {
    const plansJson = JSON.stringify([
      {
        id: 'plan_2term',
        name: '2-Term Academic Plan',
        installmentsCount: 2,
        splitType: 'equal',
        isActive: true,
        installments: [
          { number: 1, percentage: 50, dueDate: '2026-10-31' },
          { number: 2, percentage: 50, dueDate: '2026-12-31' }
        ]
      }
    ]);
    await dbRun(db, "UPDATE feeStructures SET installmentOptions = ? WHERE id = ?", [plansJson, feeStructure.id]);
  }

  // Load payment controller and inject mocked Razorpay test client
  const paymentController = require('../controllers/payment-controller');
  paymentController._setRazorpayClientForTesting({
    orders: {
      create: async (options) => {
        mockOrderCounter++;
        return {
          id: `order_mock_${mockOrderCounter}`,
          entity: 'order',
          amount: options.amount,
          amount_paid: 0,
          amount_due: options.amount,
          currency: options.currency || 'INR',
          receipt: options.receipt,
          status: 'created',
          notes: options.notes || {},
          created_at: Math.floor(Date.now() / 1000)
        };
      }
    }
  });

  let testsPassed = 0;
  let testsTotal = 5;

  // Mock req/res helper
  function createMockContext(user, body) {
    const req = {
      user,
      body,
      tenant: { database: db }
    };
    let responseStatus = 200;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return res;
      },
      json: (data) => {
        responseBody = data;
        return res;
      }
    };
    return { req, res, getResult: () => ({ status: responseStatus, body: responseBody }) };
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Server-Calculated Amount from Database Schedule
    // -------------------------------------------------------------
    console.log('▶ [TEST 1] Server-Calculated Amount from Database Schedule...');
    const ctx1 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { feeStructureId: feeStructure.id, planId: 'plan_2term', installmentStage: 1 }
    );

    await paymentController.createOrder(ctx1.req, ctx1.res);
    const res1 = ctx1.getResult();

    const orderInDb = await dbGet(db, "SELECT * FROM payment_orders WHERE orderId = ?", [res1.body?.orderId]);

    const expectedStage1Fee = Math.round(Number(feeStructure.totalFee || 8050) * 0.5); // 4025

    if (res1.status === 200 && res1.body?.success && res1.body?.amount === expectedStage1Fee && orderInDb && orderInDb.amount === expectedStage1Fee) {
      console.log(`✅ [PASS] Order created with server-calculated amount: ₹${res1.body.amount} (OrderID: ${res1.body.orderId})`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 1 failed:', res1);
    }

    // -------------------------------------------------------------
    // TEST 2: Tampered / Overpayment Amount Rejection
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 2] Tampered Amount Rejection (Client requests ₹9,000 for a ₹4,025 stage)...');
    const ctx2 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { feeStructureId: feeStructure.id, planId: 'plan_2term', installmentStage: 1, amount: 9000 }
    );

    await paymentController.createOrder(ctx2.req, ctx2.res);
    const res2 = ctx2.getResult();

    if (res2.status === 400 && res2.body?.success === false && res2.body?.message?.includes('exceeds the remaining balance')) {
      console.log(`✅ [PASS] Tampered amount rejected with HTTP 400: "${res2.body.message}"`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 2 failed: Tampered amount was not rejected:', res2);
    }

    // -------------------------------------------------------------
    // TEST 3: Invalid Student Scope Rejection (Student A -> Student B)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 3] Invalid Student Scope Rejection (Student A attempting to create order for Student B)...');
    const targetStudentId = studentB ? studentB.id : 9999;
    const ctx3 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { studentId: targetStudentId, feeStructureId: feeStructure.id, planId: 'plan_2term', installmentStage: 1 }
    );

    await paymentController.createOrder(ctx3.req, ctx3.res);
    const res3 = ctx3.getResult();

    if (res3.status === 403 && res3.body?.success === false && res3.body?.message?.includes('Access denied')) {
      console.log(`✅ [PASS] Cross-student order creation rejected with HTTP 403: "${res3.body.message}"`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 3 failed: Cross-student scope violation was not blocked:', res3);
    }

    // -------------------------------------------------------------
    // TEST 4: Duplicate Order Request Reuses Active Order
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 4] Duplicate Order Request Reuses Active Order (within 15 min)...');
    const ctx4 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { feeStructureId: feeStructure.id, planId: 'plan_2term', installmentStage: 1 }
    );

    await paymentController.createOrder(ctx4.req, ctx4.res);
    const res4 = ctx4.getResult();

    if (res4.status === 200 && res4.body?.orderId === res1.body?.orderId && res4.body?.message === 'Active order reused for checkout') {
      console.log(`✅ [PASS] Duplicate order request reused active Order ID ${res4.body.orderId} safely.`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 4 failed: Duplicate order was not handled idempotently:', res4);
    }

    // -------------------------------------------------------------
    // TEST 5: Secret Key Isolation Check
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 5] Secret Key Isolation (Ensuring secret key is never leaked in response)...');
    const hasSecretLeaked = JSON.stringify(res1.body).includes('MOCK_SECRET_XYZ_456');
    const hasKeyId = res1.body?.keyId === 'rzp_test_MOCK_KEY_ID_123';

    if (!hasSecretLeaked && hasKeyId) {
      console.log('✅ [PASS] Key Secret isolated; only public Key ID returned to client.');
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 5 failed: Secret leaked or keyId missing.');
    }

    console.log('\n================================================================');
    console.log(`📊 PHASE 2B (STEP 1) TEST SUMMARY: ${testsPassed} / ${testsTotal} TESTS PASSED`);
    console.log('================================================================');

    db.close();
  } catch (err) {
    console.error('❌ Phase 2B Step 1 test suite failed:', err);
    db.close();
    process.exit(1);
  }
}

runPhase2BStep1Tests();
