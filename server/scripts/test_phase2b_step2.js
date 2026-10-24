const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const Razorpay = require('razorpay');
const { runInstallmentMigrations } = require('../config/migration-runner');

const srcDbPath = path.join(__dirname, '../data/lms_permanent.db');
const testDbPath = path.join(__dirname, '../data/lms_phase2b_step2_test.db');

// Database helper promises
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

async function runPhase2BStep2Tests() {
  console.log('================================================================');
  console.log('🧪 PHASE 2B (SUB-STEP 2.1): PAYMENT VERIFICATION TEST SUITE');
  console.log('================================================================');

  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  fs.copyFileSync(srcDbPath, testDbPath);
  console.log(`Created isolated test database: ${testDbPath}\n`);

  const db = new sqlite3.Database(testDbPath);
  await runInstallmentMigrations(db);

  const mockSecret = 'TEST_RAZORPAY_SECRET_999';
  const mockKeyId = 'rzp_test_MOCK_KEY_ID_123';
  process.env.RAZORPAY_KEY_ID = mockKeyId;
  process.env.RAZORPAY_KEY_SECRET = mockSecret;

  // Helper to compute valid test signature
  function computeSignature(orderId, paymentId) {
    return crypto.createHmac('sha256', mockSecret).update(`${orderId}|${paymentId}`).digest('hex');
  }

  // Find students
  const studentA = await dbGet(db, "SELECT id, name, email FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 1");
  const studentB = await dbGet(db, "SELECT id, name, email FROM users WHERE role = 'student' AND id != ? LIMIT 1", [studentA.id]);

  console.log(`Test Student A: ID ${studentA.id} (${studentA.name})`);
  console.log(`Test Student B: ID ${studentB ? studentB.id : 'N/A'}\n`);

  // Ensure fee structure exists with 2-term plan
  let feeStructure = await dbGet(db, "SELECT id, totalFee, category FROM feeStructures LIMIT 1");
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
  if (!feeStructure) {
    await dbRun(db, "INSERT INTO feeStructures (category, grade, totalFee, installmentOptions) VALUES ('Primary', '1', 8050, ?)", [plansJson]);
    feeStructure = await dbGet(db, "SELECT id, totalFee, category FROM feeStructures LIMIT 1");
  } else {
    await dbRun(db, "UPDATE feeStructures SET installmentOptions = ? WHERE id = ?", [plansJson, feeStructure.id]);
  }

  // Load payment controller
  const paymentController = require('../controllers/payment-controller');

  // In-memory payment store for mock gateway
  const mockGatewayPayments = new Map();
  let mockOrderSeq = 2000;

  paymentController._setRazorpayClientForTesting({
    orders: {
      create: async (opts) => {
        mockOrderSeq++;
        const id = `order_mock_${mockOrderSeq}`;
        return {
          id,
          amount: opts.amount,
          currency: opts.currency || 'INR',
          receipt: opts.receipt,
          status: 'created'
        };
      }
    },
    payments: {
      fetch: async (paymentId) => {
        if (mockGatewayPayments.has(paymentId)) {
          const val = mockGatewayPayments.get(paymentId);
          if (val instanceof Error) throw val;
          return val;
        }
        throw new Error(`Payment ${paymentId} not found at gateway`);
      }
    }
  });

  function createMockContext(user, body) {
    const req = { user, body, tenant: { database: db } };
    let responseStatus = 200;
    let responseBody = null;
    const res = {
      status: (code) => { responseStatus = code; return res; },
      json: (data) => { responseBody = data; return res; }
    };
    return { req, res, getResult: () => ({ status: responseStatus, body: responseBody }) };
  }

  let testsPassed = 0;
  const totalTests = 12;

  try {
    // Setup Order 1 for Student A (Stage 1: ₹4,025)
    const ctxOrder1 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { feeStructureId: feeStructure.id, planId: 'plan_2term', installmentStage: 1 }
    );
    await paymentController.createOrder(ctxOrder1.req, ctxOrder1.res);
    const order1Res = ctxOrder1.getResult();
    const order1Id = order1Res.body.orderId;

    // -------------------------------------------------------------
    // TEST 1: Valid Captured Payment Verification
    // -------------------------------------------------------------
    console.log('▶ [TEST 1] Valid Captured Payment Verification...');
    const pay1Id = 'pay_mock_success_001';
    mockGatewayPayments.set(pay1Id, {
      id: pay1Id,
      order_id: order1Id,
      amount: 402500, // in paise
      currency: 'INR',
      status: 'captured',
      method: 'upi'
    });

    const ctx1 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order1Id,
        razorpay_payment_id: pay1Id,
        razorpay_signature: computeSignature(order1Id, pay1Id)
      }
    );

    await paymentController.verifyPayment(ctx1.req, ctx1.res);
    const res1 = ctx1.getResult();

    const paymentInDb = await dbGet(db, "SELECT * FROM payments WHERE razorpay_payment_id = ?", [pay1Id]);
    const orderInDb = await dbGet(db, "SELECT * FROM payment_orders WHERE orderId = ?", [order1Id]);

    if (
      res1.status === 200 && res1.body?.success &&
      paymentInDb && paymentInDb.amountPaise === 402500 &&
      paymentInDb.receiptNo?.startsWith('RCPT-') &&
      orderInDb.status === 'captured'
    ) {
      console.log(`✅ [PASS] Payment verified & credited: Receipt ${res1.body.receiptNo}, Order Status: ${orderInDb.status}`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 1 failed:', res1, paymentInDb, orderInDb);
    }

    // -------------------------------------------------------------
    // TEST 2: Invalid Signature (Tampered Signature)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 2] Invalid Signature Rejection...');
    const pay2Id = 'pay_mock_invalid_sig';
    mockGatewayPayments.set(pay2Id, {
      id: pay2Id,
      order_id: order1Id,
      amount: 402500,
      currency: 'INR',
      status: 'captured'
    });

    const ctx2 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order1Id,
        razorpay_payment_id: pay2Id,
        razorpay_signature: 'tampered_invalid_signature_hex_value_0000000000000000000000000000'
      }
    );

    await paymentController.verifyPayment(ctx2.req, ctx2.res);
    const res2 = ctx2.getResult();
    const pay2InDb = await dbGet(db, "SELECT * FROM payments WHERE razorpay_payment_id = ?", [pay2Id]);

    if (res2.status === 400 && res2.body?.code === 'INVALID_SIGNATURE' && !pay2InDb) {
      console.log(`✅ [PASS] Tampered signature rejected with HTTP 400, no DB record created.`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 2 failed:', res2);
    }

    // -------------------------------------------------------------
    // TEST 3: Failed Gateway Payment (status: 'failed')
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 3] Failed Gateway Payment Rejection...');
    const pay3Id = 'pay_mock_failed_gateway';
    mockGatewayPayments.set(pay3Id, {
      id: pay3Id,
      order_id: order1Id,
      amount: 402500,
      currency: 'INR',
      status: 'failed'
    });

    const ctx3 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order1Id,
        razorpay_payment_id: pay3Id,
        razorpay_signature: computeSignature(order1Id, pay3Id)
      }
    );

    await paymentController.verifyPayment(ctx3.req, ctx3.res);
    const res3 = ctx3.getResult();
    const pay3InDb = await dbGet(db, "SELECT * FROM payments WHERE razorpay_payment_id = ?", [pay3Id]);

    if (res3.status === 400 && res3.body?.code === 'PAYMENT_NOT_CAPTURED' && !pay3InDb) {
      console.log(`✅ [PASS] Failed gateway payment rejected with HTTP 400 (${res3.body.message}).`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 3 failed:', res3);
    }

    // -------------------------------------------------------------
    // TEST 4: Authorized but Not Captured Payment
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 4] Authorized (Uncaptured) Payment Rejection...');
    const pay4Id = 'pay_mock_authorized_only';
    mockGatewayPayments.set(pay4Id, {
      id: pay4Id,
      order_id: order1Id,
      amount: 402500,
      currency: 'INR',
      status: 'authorized'
    });

    const ctx4 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order1Id,
        razorpay_payment_id: pay4Id,
        razorpay_signature: computeSignature(order1Id, pay4Id)
      }
    );

    await paymentController.verifyPayment(ctx4.req, ctx4.res);
    const res4 = ctx4.getResult();

    if (res4.status === 400 && res4.body?.code === 'PAYMENT_NOT_CAPTURED') {
      console.log(`✅ [PASS] Uncaptured authorized payment rejected with HTTP 400.`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 4 failed:', res4);
    }

    // -------------------------------------------------------------
    // TEST 5: Amount Mismatch with Order
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 5] Amount Mismatch with Persisted Order...');
    // Create new order for Stage 2 (₹4,025)
    const ctxOrder2 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { feeStructureId: feeStructure.id, planId: 'plan_2term', installmentStage: 2 }
    );
    await paymentController.createOrder(ctxOrder2.req, ctxOrder2.res);
    const order2Id = ctxOrder2.getResult().body.orderId;

    const pay5Id = 'pay_mock_amount_mismatch';
    mockGatewayPayments.set(pay5Id, {
      id: pay5Id,
      order_id: order2Id,
      amount: 100000, // 1000 rupees instead of 4025
      currency: 'INR',
      status: 'captured'
    });

    const ctx5 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order2Id,
        razorpay_payment_id: pay5Id,
        razorpay_signature: computeSignature(order2Id, pay5Id)
      }
    );

    await paymentController.verifyPayment(ctx5.req, ctx5.res);
    const res5 = ctx5.getResult();

    if (res5.status === 400 && res5.body?.code === 'AMOUNT_MISMATCH') {
      console.log(`✅ [PASS] Amount mismatch rejected with HTTP 400: "${res5.body.message}"`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 5 failed:', res5);
    }

    // -------------------------------------------------------------
    // TEST 6: Order ID Mismatch
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 6] Order ID Mismatch Rejection...');
    const pay6Id = 'pay_mock_order_mismatch';
    mockGatewayPayments.set(pay6Id, {
      id: pay6Id,
      order_id: 'order_different_999',
      amount: 402500,
      currency: 'INR',
      status: 'captured'
    });

    const ctx6 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order2Id,
        razorpay_payment_id: pay6Id,
        razorpay_signature: computeSignature(order2Id, pay6Id)
      }
    );

    await paymentController.verifyPayment(ctx6.req, ctx6.res);
    const res6 = ctx6.getResult();

    if (res6.status === 400 && res6.body?.code === 'ORDER_MISMATCH') {
      console.log(`✅ [PASS] Order ID mismatch rejected with HTTP 400.`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 6 failed:', res6);
    }

    // -------------------------------------------------------------
    // TEST 7: Wrong Student Attempting Verification (Cross-Student)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 7] Cross-Student Scope Rejection...');
    const pay7Id = 'pay_mock_wrong_student';
    mockGatewayPayments.set(pay7Id, {
      id: pay7Id,
      order_id: order2Id, // Order belongs to Student A
      amount: 402500,
      currency: 'INR',
      status: 'captured'
    });

    // Student B attempts to verify Student A's order
    const ctx7 = createMockContext(
      { userId: studentB.id, role: 'student', email: studentB.email },
      {
        razorpay_order_id: order2Id,
        razorpay_payment_id: pay7Id,
        razorpay_signature: computeSignature(order2Id, pay7Id)
      }
    );

    await paymentController.verifyPayment(ctx7.req, ctx7.res);
    const res7 = ctx7.getResult();

    if (res7.status === 403 && res7.body?.code === 'FORBIDDEN') {
      console.log(`✅ [PASS] Cross-student verification blocked with HTTP 403: "${res7.body.message}"`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 7 failed:', res7);
    }

    // -------------------------------------------------------------
    // TEST 8: Duplicate Verification (Idempotent Replay)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 8] Duplicate Verification (Idempotent Replay)...');
    const paymentsCountBefore = (await dbAll(db, "SELECT id FROM payments")).length;

    const ctx8 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order1Id,
        razorpay_payment_id: pay1Id, // Replay of Test 1
        razorpay_signature: computeSignature(order1Id, pay1Id)
      }
    );

    await paymentController.verifyPayment(ctx8.req, ctx8.res);
    const res8 = ctx8.getResult();
    const paymentsCountAfter = (await dbAll(db, "SELECT id FROM payments")).length;

    if (
      res8.status === 200 && res8.body?.isDuplicate === true &&
      res8.body?.receiptNo === res1.body?.receiptNo &&
      paymentsCountBefore === paymentsCountAfter
    ) {
      console.log(`✅ [PASS] Duplicate verification returned original receipt ${res8.body.receiptNo} without duplicate write.`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 8 failed:', res8, paymentsCountBefore, paymentsCountAfter);
    }

    // -------------------------------------------------------------
    // TEST 9: Concurrent Verification Calls (Race Safety)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 9] Concurrent Verification Calls...');
    const pay9Id = 'pay_mock_concurrent_009';
    mockGatewayPayments.set(pay9Id, {
      id: pay9Id,
      order_id: order2Id,
      amount: 402500,
      currency: 'INR',
      status: 'captured'
    });

    const ctx9A = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { razorpay_order_id: order2Id, razorpay_payment_id: pay9Id, razorpay_signature: computeSignature(order2Id, pay9Id) }
    );
    const ctx9B = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { razorpay_order_id: order2Id, razorpay_payment_id: pay9Id, razorpay_signature: computeSignature(order2Id, pay9Id) }
    );

    await Promise.all([
      paymentController.verifyPayment(ctx9A.req, ctx9A.res),
      paymentController.verifyPayment(ctx9B.req, ctx9B.res)
    ]);

    const res9A = ctx9A.getResult();
    const res9B = ctx9B.getResult();
    const paymentsForPay9 = await dbAll(db, "SELECT * FROM payments WHERE razorpay_payment_id = ?", [pay9Id]);

    if (res9A.status === 200 && res9B.status === 200 && paymentsForPay9.length === 1) {
      console.log(`✅ [PASS] Concurrent verification resulted in exactly 1 payment record (${paymentsForPay9[0].receiptNo}).`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 9 failed:', res9A, res9B, paymentsForPay9);
    }

    // -------------------------------------------------------------
    // TEST 10: Two Orders for Same Stage (Overpayment Race Prevention)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 10] Overpayment Race Prevention (Stage Already Cleared)...');
    // Student A Stage 2 is now already cleared by Test 9.
    // Simulate another order created for Stage 2 attempting verification:
    await dbRun(db, `INSERT INTO payment_orders (orderId, studentId, scheduleId, installmentStage, feeStructureId, amount, currency, status)
      VALUES ('order_mock_race_extra', ?, (SELECT id FROM student_fee_schedules WHERE studentId = ?), 2, ?, 4025, 'INR', 'created')`,
      [studentA.id, studentA.id, feeStructure.id]
    );

    const pay10Id = 'pay_mock_race_extra';
    mockGatewayPayments.set(pay10Id, {
      id: pay10Id,
      order_id: 'order_mock_race_extra',
      amount: 402500,
      currency: 'INR',
      status: 'captured'
    });

    const ctx10 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: 'order_mock_race_extra',
        razorpay_payment_id: pay10Id,
        razorpay_signature: computeSignature('order_mock_race_extra', pay10Id)
      }
    );

    await paymentController.verifyPayment(ctx10.req, ctx10.res);
    const res10 = ctx10.getResult();

    if (res10.status === 409 && res10.body?.code === 'OVERPAYMENT_CONFLICT') {
      console.log(`✅ [PASS] Overpayment race rejected with HTTP 409: "${res10.body.message}"`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 10 failed:', res10);
    }

    // -------------------------------------------------------------
    // TEST 11: Gateway Timeout Handling (Safe Retry)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 11] Gateway Timeout Handling & Safe Retry...');
    const pay11Id = 'pay_mock_timeout_test';
    // First simulate timeout
    mockGatewayPayments.set(pay11Id, new Error('ETIMEDOUT Gateway connection timeout'));

    const ctx11A = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { razorpay_order_id: order1Id, razorpay_payment_id: pay11Id, razorpay_signature: computeSignature(order1Id, pay11Id) }
    );
    await paymentController.verifyPayment(ctx11A.req, ctx11A.res);
    const res11A = ctx11A.getResult();

    // Now restore successful gateway fetch and retry
    mockGatewayPayments.set(pay11Id, {
      id: pay11Id,
      order_id: order1Id,
      amount: 402500,
      currency: 'INR',
      status: 'captured'
    });

    const ctx11B = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      { razorpay_order_id: order1Id, razorpay_payment_id: pay11Id, razorpay_signature: computeSignature(order1Id, pay11Id) }
    );
    await paymentController.verifyPayment(ctx11B.req, ctx11B.res);
    const res11B = ctx11B.getResult();

    if (res11A.status === 503 && res11A.body?.code === 'GATEWAY_UNAVAILABLE' && (res11B.status === 200 || res11B.status === 409)) {
      console.log(`✅ [PASS] Gateway timeout returned HTTP 503 safely; retry executed without corruption.`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 11 failed:', res11A, res11B);
    }

    // -------------------------------------------------------------
    // TEST 12: Payment ID Conflict (Already associated with another order)
    // -------------------------------------------------------------
    console.log('\n▶ [TEST 12] Payment ID Conflict with Different Order...');
    // Attempt to use pay1Id with order2Id
    const ctx12 = createMockContext(
      { userId: studentA.id, role: 'student', email: studentA.email },
      {
        razorpay_order_id: order2Id,
        razorpay_payment_id: pay1Id, // Already bound to order1Id
        razorpay_signature: computeSignature(order2Id, pay1Id)
      }
    );

    await paymentController.verifyPayment(ctx12.req, ctx12.res);
    const res12 = ctx12.getResult();

    if (res12.status === 409 && res12.body?.code === 'PAYMENT_ID_CONFLICT') {
      console.log(`✅ [PASS] Reused payment ID with mismatched order rejected with HTTP 409: "${res12.body.message}"`);
      testsPassed++;
    } else {
      console.error('❌ [FAIL] Test 12 failed:', res12);
    }

    console.log('\n================================================================');
    console.log(`📊 PHASE 2B (STEP 2) TEST SUMMARY: ${testsPassed} / ${totalTests} TESTS PASSED`);
    console.log('================================================================');

    await new Promise((resolve) => db.close(resolve));
  } catch (err) {
    console.error('❌ Phase 2B Step 2 test suite failed:', err);
    process.exit(1);
  }
}

runPhase2BStep2Tests();
