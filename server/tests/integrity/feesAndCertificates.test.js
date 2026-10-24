/**
 * Two flows that could not work before (their handlers used a MongoDB model the LMS never
 * connects to): recording a verified online fee payment, and course certificates.
 * The payment gateway is a stand-in object; no network call is made.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const KEY_SECRET = 'unit-test-gateway-secret-not-real';

describe('fee payments and certificates', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  describe('online fee payment', () => {
    let gateway;
    let controller;
    before(() => {
      controller = require(path.resolve(__dirname, '../../controllers/payment-controller'));
      process.env.RAZORPAY_KEY_ID = 'rzp_test_standInOnly';
      process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    });
    after(() => {
      controller.setPaymentGatewayForTests(null);
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
    });
    beforeEach(() => {
      gateway = { payment: { order_id: 'order_fee_1', status: 'captured', amount: 250000, method: 'upi' }, payments: { fetch: async () => gateway.payment } };
      controller.setPaymentGatewayForTests(gateway);
    });

    const sign = (orderId, paymentId) => crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    const verify = (account, overrides = {}) => {
      const body = { razorpay_order_id: 'order_fee_1', razorpay_payment_id: 'pay_fee_1', amount: 1, ...overrides };
      if (body.razorpay_signature === undefined) body.razorpay_signature = sign(body.razorpay_order_id, body.razorpay_payment_id);
      return ctx.api('POST', '/api/payments/verify-payment', { as: account, body });
    };
    const recorded = (paymentId) => ctx.db.all('SELECT studentId, amount, status, type FROM payments WHERE razorpay_payment_id = ?', [paymentId]);

    it('is not recorded when the signature is forged, the payment is not captured or belongs to another order', async () => {
      assert.equal((await verify('studentA', { razorpay_signature: 'f'.repeat(64) })).status, 400);
      gateway.payment.status = 'failed';
      assert.equal((await verify('studentA')).status, 400);
      gateway.payment.status = 'captured';
      gateway.payment.order_id = 'order_other';
      assert.equal((await verify('studentA')).status, 400);
      assert.deepEqual(await recorded('pay_fee_1'), []);
    });

    it('a verified payment is recorded once, for the paying student, with the amount the gateway captured', async () => {
      const first = await verify('studentA', { studentId: ids.users.studentA, amount: 1 });
      assert.equal(first.status, 200, first.text.slice(0, 200));
      const second = await verify('studentA'); // double click or retry
      assert.equal(second.status, 200);
      assert.deepEqual(await recorded('pay_fee_1'), [{ studentId: ids.users.studentA, amount: 2500, status: 'success', type: 'online' }]);
    });

    it('a student cannot record a payment for someone else; staff cannot record one for another school', async () => {
      assert.equal((await verify('studentA', { razorpay_payment_id: 'pay_fee_2', studentId: ids.users.studentA2 })).status, 403);
      assert.equal((await verify('accountantA', { razorpay_payment_id: 'pay_fee_2', studentId: ids.users.studentB })).status, 404);
      assert.deepEqual(await recorded('pay_fee_2'), []);
    });

    it('payment history comes from the payments table, limited to the student and the school', async () => {
      const own = await ctx.api('GET', `/api/payments/transactions/${ids.users.studentA}`, { as: 'studentA' });
      assert.equal(own.status, 200);
      assert.ok(own.body.transactions.some((row) => row.razorpay_payment_id === 'pay_fee_1'));
      assert.ok(own.body.transactions.every((row) => row.studentId === ids.users.studentA));

      const school = await ctx.api('GET', '/api/payments/all-transactions', { as: 'accountantA' });
      assert.equal(school.status, 200);
      assert.ok(school.text.includes('TXN-A'));
      assert.equal(school.text.includes('TXN-B'), false);
      assert.equal(/razorpay_signature|GATEWAY-SIGNATURE/.test(own.text + school.text), false);

      // refused without revealing whether that student exists
      assert.ok([403, 404].includes((await ctx.api('GET', `/api/payments/transactions/${ids.users.studentA2}`, { as: 'studentA' })).status));
      assert.equal((await ctx.api('GET', '/api/payments/all-transactions', { as: 'studentA' })).status, 403);
    });
  });

  describe('course certificates', () => {
    const generate = (account = 'studentA') => ctx.api('POST', `/api/certificates/generate/${ids.courseA}`, { as: account, body: {} });

    before(async () => {
      await ctx.db.run('DELETE FROM certificates WHERE id = ?', [ids.certificateA]); // start without one
    });

    it('is refused until every chapter of the course is completed', async () => {
      const eligibility = await ctx.api('GET', `/api/certificates/eligibility/${ids.courseA}`, { as: 'studentA' });
      assert.deepEqual(eligibility.body, { totalChapters: 1, completedChapters: 0, eligible: false });
      assert.equal((await generate()).status, 400);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM certificates WHERE studentId = ?', [ids.users.studentA])).n, 0);
    });

    it('is issued once as a real PDF that only its owner can open', async () => {
      await ctx.db.run("INSERT INTO progress (studentId, courseId, contentType, contentId, completed) VALUES (?, ?, 'chapter', ?, 1)", [ids.users.studentA, ids.courseA, ids.chapterA]);

      const issued = await generate();
      assert.equal(issued.status, 200, issued.text.slice(0, 200));
      assert.equal((await generate()).status, 400); // already exists
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM certificates WHERE studentId = ?', [ids.users.studentA])).n, 1);

      const list = await ctx.api('GET', '/api/certificates', { as: 'studentA' });
      assert.equal(list.status, 200);
      assert.equal(list.body.length, 1);
      assert.equal(list.body[0].courseId.title, 'Science A');
      assert.equal(typeof list.body[0]._id, 'string');

      const id = list.body[0]._id;
      for (const action of ['download', 'view']) {
        const file = await fetch(`${ctx.base}/api/certificates/${action}/${id}`, { headers: { Authorization: `Bearer ${ctx.tokenFor('studentA')}` } });
        assert.equal(file.status, 200, action);
        assert.ok(Buffer.from(await file.arrayBuffer()).subarray(0, 4).toString() === '%PDF', `${action} did not return a PDF`);
      }
      // the link in the list is a signed, expiring one and works; the bare path does not
      assert.equal((await fetch(ctx.base + list.body[0].certificateUrl)).status, 200);
      assert.equal((await fetch(ctx.base + list.body[0].certificateUrl.split('?')[0])).status, 403);

      // nobody else can open it
      for (const account of ['studentA2', 'studentB', 'mentorA2']) {
        const other = await ctx.api('GET', `/api/certificates/download/${id}`, { as: account });
        assert.ok([403, 404].includes(other.status), `${account} -> ${other.status}`);
      }
      assert.deepEqual((await ctx.api('GET', '/api/certificates', { as: 'studentA2' })).body, []);
    });

    it('cannot be requested for a course the student does not take', async () => {
      assert.equal((await ctx.api('POST', `/api/certificates/generate/${ids.courseA2}`, { as: 'studentA', body: {} })).status, 404);
      assert.equal((await ctx.api('POST', `/api/certificates/generate/${ids.courseB}`, { as: 'studentA', body: {} })).status, 404);
    });
  });

  // Saving a fee structure rewrites what each student of those grades owes. That rewrite
  // had no school in its WHERE clause: one school's save changed every school's students.
  describe('fee structure', () => {
    const fees = { tuitionFee: 6000, transportFee: 1000, computerLabFee: 0, libraryFee: 500, sportsFee: 0, examinationFee: 0, miscellaneousFee: 0, dueDate: '2027-03-31' };
    const owed = async (userId) => ctx.db.get('SELECT totalFees, feesPaid, pendingFees FROM students WHERE userId = ?', [userId]);

    before(async () => {
      // both schools have a Grade 5 class (the "Secondary" range) with one student each
      await ctx.db.run("INSERT INTO students (userId, studentId, grade, totalFees, feesPaid, pendingFees) VALUES (?, 'FEE-A', '5', 1000, 200, 800)", [ids.users.studentA]);
      await ctx.db.run("INSERT INTO students (userId, studentId, grade, totalFees, feesPaid, pendingFees) VALUES (?, 'FEE-B', '5', 1000, 200, 800)", [ids.users.studentB]);
    });

    it('amounts must be numbers from zero upwards, and the total is worked out by the server', async () => {
      for (const bad of [{ tuitionFee: -500 }, { transportFee: 'abc' }, { libraryFee: 1e12 }, { tuitionFee: 0, transportFee: 0, libraryFee: 0 }]) {
        const response = await ctx.api('POST', '/api/classrooms/fee-structures', { as: 'adminA', body: { category: 'Secondary', ...fees, ...bad } });
        assert.equal(response.status, 400, `${JSON.stringify(bad)} -> ${response.status} ${response.text.slice(0, 80)}`);
      }
      assert.equal((await ctx.api('POST', '/api/classrooms/fee-structures', { as: 'adminA', body: { category: 'Anything', ...fees } })).status, 400);
      assert.equal((await ctx.db.get("SELECT COUNT(*) AS n FROM feeStructures WHERE category = 'Secondary'")).n, 0);
      assert.deepEqual(await owed(ids.users.studentA), { totalFees: 1000, feesPaid: 200, pendingFees: 800 });
    });

    it('saving it changes what this school\'s students owe and nobody else\'s', async () => {
      const saved = await ctx.api('POST', '/api/classrooms/fee-structures', { as: 'adminA', body: { category: 'Secondary', ...fees, totalFee: 1 } });
      assert.equal(saved.status, 201, saved.text.slice(0, 120));
      const row = await ctx.db.get("SELECT * FROM feeStructures WHERE category = 'Secondary' AND university_id = ?", [ids.schoolA]);
      assert.equal(row.totalFee, 7500, 'the total is the sum of the parts, not the number the browser sent');

      // the update runs just after the response
      for (let attempt = 0; attempt < 40 && (await owed(ids.users.studentA)).totalFees !== 7500; attempt++) await new Promise((r) => setTimeout(r, 50));
      assert.deepEqual(await owed(ids.users.studentA), { totalFees: 7500, feesPaid: 200, pendingFees: 7300 });
      assert.deepEqual(await owed(ids.users.studentB), { totalFees: 1000, feesPaid: 200, pendingFees: 800 }, 'the other school is untouched');

      const edited = await ctx.api('PUT', `/api/classrooms/fee-structures/${row.id}`, { as: 'adminA', body: { ...fees, tuitionFee: 7000, totalFee: 5 } });
      assert.equal(edited.status, 200, edited.text.slice(0, 120));
      for (let attempt = 0; attempt < 40 && (await owed(ids.users.studentA)).totalFees !== 8500; attempt++) await new Promise((r) => setTimeout(r, 50));
      assert.equal((await owed(ids.users.studentA)).totalFees, 8500);
      assert.deepEqual(await owed(ids.users.studentB), { totalFees: 1000, feesPaid: 200, pendingFees: 800 }, 'the other school is untouched after an edit');

      assert.equal((await ctx.api('PUT', `/api/classrooms/fee-structures/${row.id}`, { as: 'adminA', body: { ...fees, tuitionFee: -1 } })).status, 400);
      assert.equal((await ctx.api('PUT', `/api/classrooms/fee-structures/${row.id}`, { as: 'adminB', body: fees })).status, 404);
    });
  });
});
