/**
 * Paid plans: price, period and payment status are decided by the server and the gateway,
 * never by the request (SEC-013). The payment gateway is replaced by a stand-in object;
 * no network call and no real payment is made.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const KEY_SECRET = 'unit-test-gateway-secret-not-real';
const STANDARD_PAISE = 99900;

describe('subscription payments', () => {
  let ctx;
  let gateway;
  let controller;

  before(async () => {
    ctx = await startTestApp();
    controller = require(path.resolve(__dirname, '../../controllers/subscription-controller'));
    Object.assign(process.env, {
      RAZORPAY_KEY_ID: 'rzp_test_standInOnly',
      RAZORPAY_KEY_SECRET: KEY_SECRET,
      PLAN_PRICE_STANDARD_INR: '999',
    });
  });
  after(async () => {
    controller.setPaymentGatewayForTests(null);
    for (const name of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'PLAN_PRICE_STANDARD_INR', 'PLAN_PRICE_PROFESSIONAL_INR']) delete process.env[name];
    await ctx.stop();
  });

  // What the gateway would say about one order and its payment
  beforeEach(() => {
    gateway = {
      createdOrders: [],
      order: { id: 'order_1', amount: STANDARD_PAISE, notes: { planId: 'standard' } },
      payment: { id: 'pay_1', order_id: 'order_1', status: 'captured', amount: STANDARD_PAISE },
      orders: {
        create: async (options) => { gateway.createdOrders.push(options); return { id: 'order_new', amount: options.amount, currency: options.currency }; },
        fetch: async () => gateway.order,
      },
      payments: { fetch: async () => gateway.payment },
    };
    controller.setPaymentGatewayForTests(gateway);
  });

  const sign = (orderId, paymentId) => crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const verify = (overrides = {}, account = 'adminA') => {
    const body = { orderId: 'order_1', paymentId: 'pay_1', planId: 'standard', ...overrides };
    if (body.signature === undefined) body.signature = sign(body.orderId, body.paymentId);
    return ctx.api('POST', '/api/subscriptions/verify-payment', { as: account, body });
  };
  const paidPlans = () => ctx.db.all("SELECT planType, durationDays, amount, paymentId FROM subscriptions WHERE planType <> 'free'");

  it('the order is created for the server\'s price, whatever amount the browser sends', async () => {
    const response = await ctx.api('POST', '/api/subscriptions/create-order', { as: 'adminA', body: { planId: 'standard', planName: 'Hacked', amount: 1 } });
    assert.equal(response.status, 200);
    assert.equal(gateway.createdOrders[0].amount, STANDARD_PAISE);
    assert.deepEqual(gateway.createdOrders[0].notes, { planId: 'standard' });
    assert.equal(response.body.planData.amount, 999);
  });

  it('an unknown plan is refused; a plan without a configured price cannot be bought', async () => {
    for (const planId of ['enterprise', 'free', '__proto__', '', null, { $ne: 1 }]) {
      assert.equal((await ctx.api('POST', '/api/subscriptions/create-order', { as: 'adminA', body: { planId, amount: 1 } })).status, 400, JSON.stringify(planId));
      assert.equal((await verify({ planId })).status, 400, JSON.stringify(planId));
    }
    assert.equal((await ctx.api('POST', '/api/subscriptions/create-order', { as: 'adminA', body: { planId: 'professional', amount: 1 } })).status, 503);
    assert.equal((await verify({ planId: 'professional' })).status, 503);
    assert.deepEqual(await paidPlans(), []);
  });

  describe('a plan is not activated when', () => {
    const cases = {
      'the signature is forged': () => verify({ signature: 'a'.repeat(64) }),
      'the signature is missing': () => verify({ signature: '' }),
      'the signature belongs to another payment': () => verify({ signature: sign('order_1', 'pay_other') }),
      'less than the price was paid': () => { gateway.payment.amount = 100; return verify(); },
      'the order was created for a smaller amount': () => { gateway.order.amount = 100; gateway.payment.amount = 100; return verify(); },
      'the payment is only authorised, not captured': () => { gateway.payment.status = 'authorized'; return verify(); },
      'the payment failed': () => { gateway.payment.status = 'failed'; return verify(); },
      'the payment belongs to another order': () => { gateway.payment.order_id = 'order_2'; return verify(); },
      'the order was created for a different plan': async () => {
        process.env.PLAN_PRICE_PROFESSIONAL_INR = '999'; // same price, so only the plan differs
        try { return await verify({ planId: 'professional' }); } finally { delete process.env.PLAN_PRICE_PROFESSIONAL_INR; }
      },
    };
    for (const [name, attempt] of Object.entries(cases)) {
      it(name, async () => {
        assert.equal((await attempt()).status, 400);
        assert.deepEqual(await paidPlans(), []);
      });
    }

    it('the gateway cannot be reached (answered as a gateway error, not as success)', async () => {
      gateway.payments.fetch = async () => { throw new Error('ETIMEDOUT'); };
      assert.equal((await verify()).status, 502);
      assert.deepEqual(await paidPlans(), []);
    });

    it('the caller is not allowed to buy plans', async () => {
      for (const account of ['studentA', 'mentorA', 'accountantA']) assert.equal((await verify({}, account)).status, 403);
      assert.deepEqual(await paidPlans(), []);
    });
  });

  it('a verified, fully paid order activates exactly the plan and period that were paid for, once', async () => {
    const first = await verify({ planName: 'Professional', amount: 1, durationDays: 3650 });
    assert.equal(first.status, 200, first.text.slice(0, 200));
    assert.deepEqual(await paidPlans(), [{ planType: 'standard', durationDays: 30, amount: 999, paymentId: 'pay_1' }]);
    const expiry = new Date(first.body.subscription.expiryDate).getTime();
    // about 30 days from now (not the 3650 the request asked for); stored times may be in local time
    assert.ok(Math.abs(expiry - (Date.now() + 30 * 86400 * 1000)) < 24 * 3600 * 1000, new Date(expiry).toISOString());

    // the same payment sent again (double click, retry or replay) changes nothing
    const again = await verify();
    assert.equal(again.status, 409);
    const replayByOther = await verify({}, 'adminB');
    assert.equal(replayByOther.status, 409);
    assert.equal((await paidPlans()).length, 1);
  });
});
