// Admin user list: ?role= is applied by the server (dashboard "View" links open it pre-filtered),
// stays inside the admin's school, and never lists the platform owner.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('admin user list filters', () => {
  let ctx;
  before(async () => {
    ctx = await startTestApp();
    // a platform-owner account stored with a school id, as in real data
    await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (40, 'owner', 'owner@test.invalid', 'x', 'superadmin', ?, 1)", [ctx.ids.schoolA]);
    // an older mentor account with the role name "teacher"
    await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (41, 'legacy', 'legacy@test.invalid', 'x', 'teacher', ?, 1)", [ctx.ids.schoolA]);
  });
  after(async () => { await ctx.stop(); });

  const list = async (query) => {
    const response = await ctx.api('GET', `/api/admin/users${query}`, { as: 'adminA' });
    return { status: response.status, users: response.body };
  };

  it('?role=student returns only this school\'s students', async () => {
    const { status, users } = await list('?role=student');
    assert.equal(status, 200);
    assert.deepEqual(users.map((u) => Number(u.id)).sort(), [13, 14]);
    assert.ok(users.every((u) => u.role === 'student'));
  });

  it('?role=mentor returns mentors, including accounts with the older role name "teacher"', async () => {
    const { users } = await list('?role=mentor');
    assert.deepEqual(users.map((u) => Number(u.id)).sort((a, b) => a - b), [11, 12, 17, 41]);
  });

  it('the unfiltered list has no platform owner and no other school', async () => {
    const { users } = await list('');
    const got = users.map((u) => Number(u.id));
    assert.ok(!got.includes(40) && !got.includes(1), 'platform owner listed');
    assert.ok(!got.some((id) => id >= 20 && id < 30), 'another school listed');
    assert.ok(got.includes(15) && got.includes(16), 'accountant/storekeeper missing from "all"');
  });

  it('an unknown role is refused rather than ignored', async () => {
    assert.equal((await list('?role=superadmin')).status, 400);
    assert.equal((await list("?role=student'--")).status, 400);
  });
});
