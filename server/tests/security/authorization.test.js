/**
 * Authorization: what each role may do once signed in (least privilege).
 * Covers SEC-005 (privilege escalation), SEC-012 (missing role and ownership checks),
 * SEC-013 (subscription and payment operations), SEC-015 (export) and the role matrix
 * in section 5 of the audit.
 *
 * "Allowed" below means the request got past authentication and authorization
 * (any status except 401 and 403); the handler's own result is not the point here.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

const ROLES = ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA', 'superadmin'];
// Reading the current plan creates a free record; what must never appear is a paid plan.
const PAID_PLAN = "SELECT id FROM subscriptions WHERE planType <> 'free'";
const denied = (status) => status === 403;
const allowedThrough = (status) => status !== 401 && status !== 403;

describe('authorization', () => {
  let ctx;
  before(async () => { ctx = await startTestApp(); });
  after(async () => { await ctx.stop(); });

  describe('each area of the API is open only to its roles', () => {
    // [description, url, roles that may read it]
    const AREAS = [
      ['school administration', '/api/admin/users', ['adminA']],
      ['admin dashboard', '/api/admin/dashboard', ['adminA']],
      ['bulk student import', '/api/onboarding/fields', ['adminA']],
      ['platform: all users', '/api/superadmin/users', ['superadmin']],
      ['platform: all schools', '/api/superadmin/universities', ['superadmin']],
      ['platform: demo requests', '/api/demo-requests', ['superadmin']],
      ['whole-table export', '/api/database-export/tables', ['superadmin']],
      ['accountant export', '/api/accountant-export/tables', ['superadmin']],
      ['fee collection (staff)', '/api/accountant/students', ['adminA', 'accountantA']],
      ['fee statistics', '/api/accountant/fees-stats', ['adminA', 'accountantA']],
      ['all transactions', '/api/transactions', ['adminA', 'accountantA']],
      ['inventory', '/api/storekeeper/inventory', ['adminA', 'storekeeperA']],
      ['stock requests', '/api/stock-requests', ['adminA', 'accountantA', 'storekeeperA']],
      ['expenses', '/api/expenses', ['adminA', 'accountantA']],
      ['supply requirements', '/api/requirements', ['adminA', 'accountantA', 'storekeeperA']],
      ['vendor portal', '/api/vendor/profile', []],
      ['staff directory', '/api/users', ['mentorA', 'adminA', 'accountantA', 'storekeeperA']],
      ['class results', `/api/results/classroom/100`, ['mentorA', 'adminA']],
      ['course list', '/api/courses', ['studentA', 'mentorA', 'adminA']],
      ['own student dashboard', '/api/student/dashboard', ['studentA']],
      ['current plan', '/api/subscriptions/current', ROLES],
    ];

    for (const [name, url, readers] of AREAS) {
      it(`${name}: ${url}`, async () => {
        for (const role of ROLES) {
          const { status } = await ctx.api('GET', url, { as: role });
          if (readers.includes(role)) {
            assert.ok(allowedThrough(status), `${role} should be allowed, got ${status}`);
          } else {
            assert.ok(denied(status), `${role} should be refused, got ${status}`);
          }
        }
      });
    }
  });

  describe('write operations are refused for roles without that authority', () => {
    // [description, method, url, body, roles that must be refused]
    const WRITES = [
      ['create a student', 'POST', '/api/admin/create-student', { fullName: 'X', email: 'x@test.invalid', password: 'Passw0rd!x' }, ['studentA', 'mentorA', 'accountantA', 'storekeeperA', 'superadmin']],
      ['create a teacher', 'POST', '/api/admin/create-teacher', { fullName: 'X', email: 'y@test.invalid', password: 'Passw0rd!x' }, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['delete a user', 'DELETE', '/api/admin/users/14', undefined, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['delete a user (users router)', 'DELETE', '/api/users/14', undefined, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['change a user', 'PUT', '/api/users/14', { role: 'admin' }, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['create a school', 'POST', '/api/superadmin/create-university', { name: 'Z', area: 'Z', adminEmail: 'z@test.invalid' }, ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA']],
      ['create any user (platform)', 'POST', '/api/superadmin/create-user', { name: 'Z', email: 'zz@test.invalid', password: 'Passw0rd!z', role: 'admin', universityId: 1 }, ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA']],
      ['delete a school', 'DELETE', '/api/superadmin/universities/2', undefined, ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA']],
      ['create a platform owner', 'POST', '/api/superadmin/internal/create-superadmin', { name: 'Z', email: 'sa@test.invalid' }, ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA']],
      ['reset a platform owner password', 'POST', '/api/superadmin/internal/reset-password', { superadminId: 1 }, ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA']],
      ['create a classroom', 'POST', '/api/classrooms', { grade: '7', section: 'A' }, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['change a fee structure', 'PUT', '/api/classrooms/fee-structures/1800', { tuitionFee: 1 }, ['studentA', 'accountantA', 'storekeeperA']],
      ['create a course', 'POST', '/api/courses/create-course', { title: 'X' }, ['studentA', 'accountantA', 'storekeeperA']],
      ['delete a course', 'DELETE', '/api/courses/1000', undefined, ['studentA', 'accountantA', 'storekeeperA']],
      ['mark attendance', 'POST', '/api/attendance/mark', { classroomId: 100, date: '2026-02-01', attendanceData: [] }, ['studentA', 'accountantA', 'storekeeperA']],
      ['enter a term result', 'POST', '/api/results', { classroomId: 100, studentId: 13, subjects: [] }, ['studentA', 'accountantA', 'storekeeperA']],
      ['delete a term result', 'DELETE', '/api/results/1600', undefined, ['studentA', 'accountantA', 'storekeeperA']],
      ['create an assessment', 'POST', '/api/assessments/create', { courseId: 1000, title: 'X' }, ['studentA', 'accountantA', 'storekeeperA']],
      ['publish an assessment', 'PUT', '/api/assessments/1400/publish', {}, ['studentA', 'accountantA', 'storekeeperA']],
      ['add a question', 'POST', '/api/assessments/add-question', { assessmentId: 1400, questionText: 'X' }, ['studentA', 'accountantA', 'storekeeperA']],
      ['change a week', 'PUT', '/api/weeks/1100', { title: 'X' }, ['studentA', 'accountantA', 'storekeeperA']],
      ['delete a material', 'DELETE', '/api/materials/1300', undefined, ['studentA', 'accountantA', 'storekeeperA']],
      ['change a calendar event', 'PUT', '/api/calendar/1960', { title: 'X' }, ['studentA', 'accountantA', 'storekeeperA']],
      ['record an offline fee', 'POST', '/api/accountant/collect-offline-fee', { studentId: 13, amount: 1 }, ['studentA', 'mentorA', 'storekeeperA', 'superadmin']],
      ['pay a vendor invoice', 'POST', '/api/accountant/pay-invoice/1', {}, ['studentA', 'mentorA', 'storekeeperA']],
      ['start a free trial', 'POST', '/api/subscriptions/activate-free-trial', {}, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['cancel the subscription', 'POST', '/api/subscriptions/cancel', {}, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['buy a plan', 'POST', '/api/subscriptions/verify-payment', { orderId: 'order_sub_1', paymentId: 'p', planId: 'professional', amount: 1 }, ['studentA', 'mentorA', 'accountantA', 'storekeeperA']],
      ['change a demo request', 'PATCH', '/api/demo-requests/1/status', { status: 'Done' }, ['studentA', 'mentorA', 'adminA', 'accountantA', 'storekeeperA']],
      ['change a stock request', 'PUT', '/api/stock-requests/1', { status: 'approved' }, ['studentA', 'mentorA']],
      ['raise a supply requirement', 'POST', '/api/requirements', { items: [] }, ['studentA']],
      ['submit an assessment', 'POST', '/api/assessments/submit', { assessmentId: 1400, answers: [] }, ['mentorA', 'adminA', 'accountantA', 'storekeeperA']],
    ];

    for (const [name, method, url, body, refused] of WRITES) {
      it(`${name}: ${method} ${url}`, async () => {
        for (const role of refused) {
          const { status } = await ctx.api(method, url, { as: role, body });
          assert.ok(denied(status), `${role} should be refused, got ${status}`);
        }
      });
    }

    it('the refused requests above changed nothing', async () => {
      assert.deepEqual(await ctx.db.all('SELECT id FROM universities ORDER BY id'), [{ id: 1 }, { id: 2 }]);
      assert.equal((await ctx.db.get('SELECT role FROM users WHERE id = 14')).role, 'student');
      assert.equal((await ctx.db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'superadmin'")).n, 1);
      assert.ok(await ctx.db.get('SELECT id FROM courses WHERE id = 1000'));
      assert.ok(await ctx.db.get('SELECT id FROM results WHERE id = 1600'));
      assert.equal((await ctx.db.get('SELECT tuitionFee FROM feeStructures WHERE id = 1800')).tuitionFee, 5000);
      assert.equal(await ctx.db.get(PAID_PLAN), undefined);
    });
  });

  describe('privilege escalation through request fields', () => {
    it('a school admin cannot give anyone the platform owner role', async () => {
      for (const role of ['superadmin', 'portal_admin', 'vendor', 'root']) {
        const response = await ctx.api('PUT', '/api/users/14', { as: 'adminA', body: { role } });
        assert.equal(response.status, 400, role);
      }
      assert.equal((await ctx.db.get('SELECT role FROM users WHERE id = 14')).role, 'student');
    });

    it('a school admin cannot change or delete the platform owner account', async () => {
      // The platform owner row sits in the same table; give it a school id to prove that does not help.
      await ctx.db.run('UPDATE users SET university_id = 1 WHERE id = 1');
      try {
        assert.equal((await ctx.api('PUT', '/api/users/1', { as: 'adminA', body: { name: 'hijacked', email: 'hijack@test.invalid' } })).status, 404);
        assert.equal((await ctx.api('DELETE', '/api/users/1', { as: 'adminA' })).status, 404);
        assert.equal((await ctx.api('DELETE', '/api/admin/users/1', { as: 'adminA' })).status, 404);
        assert.equal((await ctx.db.get('SELECT email FROM users WHERE id = 1')).email, 'superadmin@test.invalid');
      } finally {
        await ctx.db.run('UPDATE users SET university_id = NULL WHERE id = 1');
      }
    });

    it('a legitimate admin can still manage users of their own school', async () => {
      const response = await ctx.api('PUT', '/api/users/14', { as: 'adminA', body: { name: 'Renamed Student' } });
      assert.equal(response.status, 200);
      assert.equal((await ctx.db.get('SELECT name FROM users WHERE id = 14')).name, 'Renamed Student');
    });

    it('extra identity fields in a request body do not change who the caller is', async () => {
      const body = { role: 'superadmin', userId: ctx.ids.users.studentA, universityId: 2, university_id: 2, isAdmin: true };
      const response = await ctx.api('GET', '/api/admin/users', { as: 'studentA', body: undefined, headers: { 'X-User-ID': '10', 'X-Role': 'admin' } });
      assert.equal(response.status, 403);
      const viaBody = await ctx.api('POST', '/api/admin/create-teacher', { as: 'studentA', body });
      assert.equal(viaBody.status, 403);
    });
  });

  describe('subscriptions and payments need a verified payment (SEC-013)', () => {
    it('a plan cannot be bought when the payment gateway is not configured', async () => {
      const order = await ctx.api('POST', '/api/subscriptions/create-order', { as: 'adminA', body: { planId: 'professional', planName: 'Professional', amount: 1 } });
      assert.equal(order.status, 503);
      const verify = await ctx.api('POST', '/api/subscriptions/verify-payment', {
        as: 'adminA',
        body: { orderId: 'order_sub_123', paymentId: 'pay_fake', signature: 'anything', planId: 'professional', planName: 'Professional', amount: 1, durationDays: 3650 },
      });
      assert.equal(verify.status, 503);
      assert.equal(await ctx.db.get(PAID_PLAN), undefined);
    });

    it('a forged gateway signature is rejected and no plan is activated', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholderForUnitTest';
      process.env.RAZORPAY_KEY_SECRET = 'unit-test-secret-not-a-real-key';
      process.env.PLAN_PRICE_PROFESSIONAL_INR = '4999';
      try {
        for (const signature of ['', 'deadbeef', 'a'.repeat(64)]) {
          const response = await ctx.api('POST', '/api/subscriptions/verify-payment', {
            as: 'adminA',
            body: { orderId: 'order_sub_123', paymentId: 'pay_fake', signature, planId: 'professional', planName: 'Professional', amount: 1 },
          });
          assert.equal(response.status, 400, `signature "${signature.slice(0, 8)}"`);
        }
        assert.equal(await ctx.db.get(PAID_PLAN), undefined);
      } finally {
        delete process.env.RAZORPAY_KEY_ID;
        delete process.env.RAZORPAY_KEY_SECRET;
        delete process.env.PLAN_PRICE_PROFESSIONAL_INR;
      }
    });
  });
});
