/**
 * Authentication: who counts as signed in.
 * Covers audit findings SEC-003 (guest fallback), SEC-004 (unsigned superadmin token),
 * SEC-005 (role at registration), SEC-006 (demo logins), SEC-007 (signing secret), SEC-020 (stale sessions).
 *
 *   node --test --test-force-exit tests/security/authentication.test.js     (from the server folder)
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const jwt = require(path.resolve(__dirname, '../../node_modules/jsonwebtoken'));

// Any protected endpoint will do; this one exists for every school role.
const PROTECTED = '/api/classrooms/student-classrooms';

describe('authentication', () => {
  let ctx;
  before(async () => { ctx = await startTestApp(); });
  after(async () => { await ctx.stop(); });

  describe('requests without a valid session are rejected with 401', () => {
    const cases = {
      'no Authorization header': () => ({}),
      'empty bearer token': () => ({ token: '' }),
      'not a JWT': () => ({ token: 'not-a-jwt' }),
      'wrong scheme': () => ({ headers: { Authorization: `Basic ${Buffer.from('a:b').toString('base64')}` } }),
      'signed with another secret': () => ({ token: jwt.sign({ userId: ctx.ids.users.adminA, role: 'admin' }, 'x'.repeat(48)) }),
      'signed with the old built-in secret': () => ({ token: jwt.sign({ userId: ctx.ids.users.adminA, role: 'admin', universityId: 1 }, 'default_jwt_secret_key') }),
      'tampered payload (role changed, signature kept)': () => {
        const [header, , signature] = ctx.tokenFor('studentA').split('.');
        const forged = Buffer.from(JSON.stringify({ userId: ctx.ids.users.adminA, role: 'admin', universityId: 1 })).toString('base64url');
        return { token: `${header}.${forged}.${signature}` };
      },
      'unsigned token (alg none)': () => {
        const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
        return { token: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ userId: ctx.ids.users.adminA, role: 'admin' })}.` };
      },
      'expired token': () => ({ token: ctx.tokenFor('adminA', {}, { expiresIn: '-10s' }) }),
      'token without a user id': () => ({ token: ctx.tokenFor('adminA', { userId: undefined }) }),
      'token for an account that does not exist': () => ({ token: ctx.tokenFor('adminA', { userId: 999999 }) }),
      'unsigned "superadmin-<base64>" token (SEC-004)': () => ({
        token: `superadmin-${Buffer.from(JSON.stringify({ email: 'attacker@example.com' })).toString('base64')}`,
      }),
    };

    for (const [name, build] of Object.entries(cases)) {
      it(name, async () => {
        const response = await ctx.api('GET', PROTECTED, build());
        assert.equal(response.status, 401);
        assert.equal(response.body.success, false);
      });
    }

    it('the forged superadmin token opens no superadmin route either', async () => {
      const token = `superadmin-${Buffer.from(JSON.stringify({ email: 'attacker@example.com' })).toString('base64')}`;
      for (const url of ['/api/superadmin/users', '/api/superadmin/universities', '/api/courses']) {
        assert.equal((await ctx.api('GET', url, { token })).status, 401, url);
      }
    });
  });

  describe('a valid token only works while the account still matches it', () => {
    it('a valid session is accepted', async () => {
      assert.equal((await ctx.api('GET', PROTECTED, { as: 'studentA' })).status, 200);
    });

    it('a token claiming a higher role than the account has is refused', async () => {
      const response = await ctx.api('GET', '/api/admin/users', { token: ctx.tokenFor('studentA', { role: 'admin' }) });
      assert.equal(response.status, 403);
    });

    it('a token claiming another school is refused', async () => {
      const response = await ctx.api('GET', '/api/admin/users', { token: ctx.tokenFor('adminA', { universityId: ctx.ids.schoolB }) });
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'TENANT_MISMATCH');
    });

    it('an account that is not approved has no session', async () => {
      assert.equal((await ctx.api('GET', PROTECTED, { as: 'pendingMentorA' })).status, 401);
    });

    it('deleting an account ends its sessions at once', async () => {
      await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (900, 'temp', 'temp@test.invalid', 'x', 'student', 1, 1)");
      const token = ctx.tokenFor('studentA', { userId: 900 });
      assert.equal((await ctx.api('GET', PROTECTED, { token })).status, 200);
      await ctx.db.run('DELETE FROM users WHERE id = 900');
      assert.equal((await ctx.api('GET', PROTECTED, { token })).status, 401);
    });

    it('a role change takes effect on the next request (no 7-day window)', async () => {
      await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (901, 'was-admin', 'was-admin@test.invalid', 'x', 'admin', 1, 1)");
      const token = ctx.tokenFor('adminA', { userId: 901 });
      assert.equal((await ctx.api('GET', '/api/admin/users', { token })).status, 200);
      await ctx.db.run("UPDATE users SET role = 'student' WHERE id = 901");
      assert.equal((await ctx.api('GET', '/api/admin/users', { token })).status, 403);
    });

    it('a school role without a school cannot use school data (no default school)', async () => {
      await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (902, 'no-school', 'no-school@test.invalid', 'x', 'admin', NULL, 1)");
      const response = await ctx.api('GET', '/api/admin/users', { token: ctx.tokenFor('adminA', { userId: 902, universityId: null }) });
      assert.equal(response.status, 403);
    });
  });

  describe('login', () => {
    const login = (body) => ctx.api('POST', '/api/auth/login', { body });

    for (const account of ['superadmin', 'adminA', 'mentorA', 'studentA', 'accountantA', 'storekeeperA']) {
      it(`${account} signs in with the right password and gets a working token`, async () => {
        const response = await login({ email: `${account}@test.invalid`, password: ctx.password });
        assert.equal(response.status, 200);
        assert.ok(response.body.token);
        const claims = jwt.decode(response.body.token);
        assert.equal(claims.userId, ctx.ids.users[account]);
        // The response describes the user but never carries the password or its hash
        assert.equal(/password|\$2[aby]\$/i.test(JSON.stringify(response.body.user)), false);
        const probe = account === 'superadmin' ? '/api/superadmin/universities' : PROTECTED;
        assert.equal((await ctx.api('GET', probe, { token: response.body.token })).status, account === 'superadmin' ? 200 : 200);
      });
    }

    it('a wrong password and an unknown email get the same answer', async () => {
      const wrong = await login({ email: 'adminA@test.invalid', password: 'wrong-password' });
      const unknown = await login({ email: 'nobody@test.invalid', password: 'wrong-password' });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(wrong.body, unknown.body);
    });

    it('a missing or empty password is never accepted', async () => {
      assert.equal((await login({ email: 'adminA@test.invalid' })).status, 400);
      assert.equal((await login({ email: 'adminA@test.invalid', password: '' })).status, 400);
      assert.equal((await login({})).status, 400);
    });

    it('former demo addresses have no special treatment (SEC-006)', async () => {
      const demoEmails = [
        'student@gmail.com', 'mentor@gmail.com', 'admin@gmail.com', 'accountant@demo.com',
        'accountant@test.com', 'storekeeper@demo.com', 'superadmin@core5.com', 'portal@core5.co.in',
      ];
      const usersBefore = (await ctx.db.get('SELECT COUNT(*) AS n FROM users')).n;
      for (const email of demoEmails) {
        for (const body of [{ email }, { email, password: '' }, { email, password: 'anything' }, { email, password: '12345678' }]) {
          const response = await login(body);
          assert.ok([400, 401].includes(response.status), `${email} ${JSON.stringify(Object.keys(body))} -> ${response.status}`);
          assert.equal(response.body.token, undefined);
        }
      }
      // ...and logging in did not create those accounts
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM users')).n, usersBefore);
    });

    it('an existing demo address still needs its real password', async () => {
      await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) SELECT 903, 'Demo Admin', 'admin@gmail.com', password, 'admin', 1, 1 FROM users WHERE id = ?", [ctx.ids.users.adminA]);
      assert.equal((await login({ email: 'admin@gmail.com', password: 'anything' })).status, 401);
      assert.equal((await login({ email: 'admin@gmail.com', password: ctx.password })).status, 200);
    });

    it('an unapproved account cannot sign in', async () => {
      assert.equal((await login({ email: 'pendingMentorA@test.invalid', password: ctx.password })).status, 403);
    });

    it('a legacy plain-text password still signs in once and is then stored as a bcrypt hash', async () => {
      await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (904, 'legacy', 'legacy@test.invalid', 'legacy-plain-password', 'student', 1, 1)");
      assert.equal((await login({ email: 'legacy@test.invalid', password: 'legacy-plain-password' })).status, 200);
      const stored = (await ctx.db.get('SELECT password FROM users WHERE id = 904')).password;
      assert.match(stored, /^\$2[aby]\$/);
      assert.equal((await login({ email: 'legacy@test.invalid', password: 'legacy-plain-password' })).status, 200);
      assert.equal((await login({ email: 'legacy@test.invalid', password: stored })).status, 401);
    });

    it('repeated wrong passwords for one account are rate limited', async () => {
      const statuses = [];
      for (let attempt = 0; attempt < 12; attempt++) {
        statuses.push((await login({ email: 'studentA2@test.invalid', password: `wrong-${attempt}` })).status);
      }
      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
      assert.equal(statuses[11], 429);
      // Another account from the same address is not locked out with it
      assert.equal((await login({ email: 'mentorA2@test.invalid', password: ctx.password })).status, 200);
    });
  });

  describe('registration (SEC-005)', () => {
    const register = (body) => ctx.api('POST', '/api/auth/register', { body });
    const applicant = (email, extra = {}) => ({ name: 'Applicant', email, password: 'Applicant-Passw0rd', ...extra });

    it('is closed unless the operator enables it', async () => {
      const response = await register(applicant('closed@test.invalid', { role: 'admin' }));
      assert.equal(response.status, 403);
      assert.equal(await ctx.db.get("SELECT id FROM users WHERE email = 'closed@test.invalid'"), undefined);
    });

    describe('when enabled for one school', () => {
      before(() => {
        process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
        process.env.PUBLIC_REGISTRATION_SCHOOL_ID = String(ctx.ids.schoolA);
      });
      after(() => {
        delete process.env.ALLOW_PUBLIC_REGISTRATION;
        delete process.env.PUBLIC_REGISTRATION_SCHOOL_ID;
      });

      for (const requested of ['admin', 'superadmin', 'accountant', 'storekeeper', 'vendor', 'portal_admin']) {
        it(`asking for role "${requested}" creates an unapproved student, not a ${requested}`, async () => {
          const email = `wants-${requested}@test.invalid`;
          const response = await register(applicant(email, { role: requested, isApproved: true, university_id: ctx.ids.schoolB }));
          assert.equal(response.status, 201);
          const created = await ctx.db.get('SELECT role, isApproved, university_id FROM users WHERE email = ?', [email]);
          assert.deepEqual(created, { role: 'student', isApproved: 0, university_id: ctx.ids.schoolA });
        });
      }

      it('a self-registered mentor waits for approval and cannot sign in meanwhile', async () => {
        const response = await register(applicant('new-mentor@test.invalid', { role: 'mentor' }));
        assert.equal(response.status, 201);
        assert.equal(/password/i.test(JSON.stringify(response.body)), false);
        const login = await ctx.api('POST', '/api/auth/login', { body: { email: 'new-mentor@test.invalid', password: 'Applicant-Passw0rd' } });
        assert.equal(login.status, 403);
      });

      it('rejects short passwords and duplicate addresses', async () => {
        assert.equal((await register(applicant('short@test.invalid', { password: 'short' }))).status, 400);
        assert.equal((await register(applicant('adminA@test.invalid'))).status, 400);
      });
    });
  });
});
