// Notification bell API: every portal reads only its own notifications, marking read cannot touch another
// school's or another user's notification, concurrent "mark read" calls keep every reader, and the
// platform owner sees only notifications addressed to that account.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('notification bell', () => {
  let ctx;
  let ids;
  let targetedA;
  let forOwner;
  let annA; // published to everyone in School A (the app stores "all" as "both")
  let annB;
  const readBy = async (id) => JSON.parse((await ctx.db.get('SELECT readBy FROM announcements WHERE id = ?', [id])).readBy || '[]');

  before(async () => {
    ctx = await startTestApp();
    ids = ctx.ids;
    const broadcast = (school, by) => ctx.db.run(
      "INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, publishFor) VALUES (?, 'Sports day', 'x', ?, 'admin', 'both')", [school, by]);
    annA = (await broadcast(ids.schoolA, ids.users.adminA)).lastID;
    annB = (await broadcast(ids.schoolB, ids.users.adminB)).lastID;
    targetedA = (await ctx.db.run(
      "INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, recipientUserId, type) VALUES (?, 'Your result', 'x', ?, 'system', ?, 'RESULT_AVAILABLE')",
      [ids.schoolA, ids.users.mentorA, ids.users.studentA])).lastID;
    forOwner = (await ctx.db.run(
      "INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, recipientUserId, type) VALUES (?, 'New school signed up', 'x', ?, 'system', ?, 'CALENDAR_EVENT')",
      [ids.schoolA, ids.users.adminA, ids.users.superadmin])).lastID;
  });
  after(async () => { await ctx.stop(); });

  it('each portal gets its notifications, and only its school\'s', async () => {
    for (const as of ['adminA', 'mentorA', 'studentA']) {
      const response = await ctx.api('GET', '/api/announcements', { as });
      assert.equal(response.status, 200, as);
      const got = response.body.map((a) => Number(a.id));
      assert.ok(got.includes(annA), `${as} misses its school announcement`);
      assert.ok(!got.includes(annB), `${as} sees another school's announcement`);
      assert.ok(!got.includes(forOwner), `${as} sees the platform owner's notification`);
    }
  });

  it('a notification addressed to one user is shown to that user only', async () => {
    const own = await ctx.api('GET', '/api/announcements', { as: 'studentA' });
    assert.ok(own.body.some((a) => Number(a.id) === targetedA));
    for (const as of ['studentA2', 'mentorA', 'adminA']) {
      const other = await ctx.api('GET', '/api/announcements', { as });
      assert.ok(!other.body.some((a) => Number(a.id) === targetedA), `${as} sees studentA's notification`);
    }
  });

  it('the platform owner has a working bell with only the notifications addressed to it', async () => {
    const response = await ctx.api('GET', '/api/announcements', { as: 'superadmin' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.map((a) => Number(a.id)), [forOwner]);
    assert.equal((await ctx.api('PUT', `/api/announcements/${forOwner}/read`, { as: 'superadmin', body: {} })).status, 200);
    assert.deepEqual(await readBy(forOwner), [String(ids.users.superadmin)]);
    // ...and cannot mark a school's announcement
    assert.equal((await ctx.api('PUT', `/api/announcements/${annA}/read`, { as: 'superadmin', body: {} })).status, 404);
  });

  it('marking read is limited to the caller\'s own school and own notifications', async () => {
    const before = await readBy(annA);
    assert.equal((await ctx.api('PUT', `/api/announcements/${annA}/read`, { as: 'studentB', body: {} })).status, 404);
    assert.equal((await ctx.api('PUT', `/api/announcements/${targetedA}/read`, { as: 'studentA2', body: {} })).status, 404);
    assert.equal((await ctx.api('PUT', '/api/announcements/not-a-number/read', { as: 'studentA', body: {} })).status, 404);
    assert.deepEqual(await readBy(annA), before);
    assert.deepEqual(await readBy(targetedA), []);
  });

  it('read state is per user, idempotent, and survives concurrent marking', async () => {
    const readers = ['adminA', 'mentorA', 'mentorA2', 'studentA', 'studentA2'];
    const responses = await Promise.all(readers.concat(readers).map((as) => ctx.api('PUT', `/api/announcements/${annA}/read`, { as, body: {} })));
    assert.ok(responses.every((r) => r.status === 200), responses.map((r) => r.status).join(','));
    const marked = await readBy(annA);
    assert.deepEqual([...marked].sort(), readers.map((n) => String(ids.users[n])).sort());

    const list = await ctx.api('GET', '/api/announcements', { as: 'studentA' });
    const row = list.body.find((a) => Number(a.id) === annA);
    assert.ok(JSON.parse(row.readBy).includes(String(ids.users.studentA)));
  });
});
