// Session checks: GET /api/auth/me answers who a session belongs to (the client re-checks its stored
// session with it); expired, tampered, wrongly signed, revoked and stale-role tokens are refused.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

describe('session checks', () => {
  let ctx;
  let jwt;
  before(async () => {
    ctx = await startTestApp();
    jwt = require(path.join(__dirname, '..', '..', 'node_modules', 'jsonwebtoken'));
  });
  after(async () => { await ctx.stop(); });

  const me = (token) => ctx.api('GET', '/api/auth/me', { token });

  it('returns the caller\'s own account from the database, without secrets', async () => {
    const response = await ctx.api('GET', '/api/auth/me', { as: 'studentA' });
    assert.equal(response.status, 200);
    assert.equal(Number(response.body.id), ctx.ids.users.studentA);
    assert.equal(response.body.role, 'student');
    assert.equal(Number(response.body.university_id), ctx.ids.schoolA);
    assert.ok(!('password' in response.body) && !response.text.includes('$2'), 'no password hash');
  });

  it('role and school come from the database, not from the token', async () => {
    // a correctly signed token that claims more than the account has is refused
    const response = await me(ctx.tokenFor('studentA', { role: 'admin' }));
    assert.ok([401, 403].includes(response.status), `stale role -> ${response.status}`);
  });

  it('no token, a malformed one, a forged signature, alg=none and an expired token are all refused', async () => {
    const good = ctx.tokenFor('adminA');
    const [h, p] = good.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), role: 'superadmin' })).toString('base64url');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${p}.`;
    const otherKey = jwt.sign({ userId: ctx.ids.users.adminA, role: 'admin', universityId: ctx.ids.schoolA }, 'x'.repeat(48), { algorithm: 'HS256' });
    for (const [label, token] of [
      ['none', undefined], ['garbage', 'not-a-token'], ['tampered payload', `${h}.${forgedPayload}.${good.split('.')[2]}`],
      ['alg none', none], ['other secret', otherKey], ['expired', ctx.tokenFor('adminA', {}, { expiresIn: -10 })],
    ]) {
      const response = token === undefined ? await ctx.api('GET', '/api/auth/me') : await me(token);
      assert.equal(response.status, 401, label);
    }
  });

  it('signing out ends every earlier session; a new login works', async () => {
    const token = ctx.tokenFor('mentorA2');
    assert.equal((await me(token)).status, 200);
    assert.equal((await ctx.api('POST', '/api/auth/logout', { token })).status, 200);
    assert.equal((await me(token)).status, 401, 'the old token no longer works');
    await new Promise((r) => setTimeout(r, 1100)); // tokens carry whole seconds
    const login = await ctx.api('POST', '/api/auth/login', { body: { email: 'mentora2@test.invalid', password: ctx.password } });
    assert.equal(login.status, 200, login.text.slice(0, 120));
    assert.equal((await me(login.body.token)).status, 200);
  });

  it('a disabled (un-approved) account loses its session at once', async () => {
    const token = ctx.tokenFor('accountantA');
    assert.equal((await me(token)).status, 200);
    await ctx.db.run('UPDATE users SET isApproved = 0 WHERE id = ?', [ctx.ids.users.accountantA]);
    try {
      assert.equal((await me(token)).status, 401);
    } finally {
      await ctx.db.run('UPDATE users SET isApproved = 1 WHERE id = ?', [ctx.ids.users.accountantA]);
    }
  });

  it('a role change takes effect on the next request', async () => {
    const token = ctx.tokenFor('storekeeperA');
    assert.equal((await me(token)).status, 200);
    await ctx.db.run("UPDATE users SET role = 'accountant' WHERE id = ?", [ctx.ids.users.storekeeperA]);
    try {
      assert.ok([401, 403].includes((await me(token)).status));
      assert.ok([401, 403].includes((await ctx.api('GET', '/api/storekeeper/inventory', { token })).status));
    } finally {
      await ctx.db.run("UPDATE users SET role = 'storekeeper' WHERE id = ?", [ctx.ids.users.storekeeperA]);
    }
  });
});
