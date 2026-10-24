// A new calendar event reaches its audience's notification bell (once per person), never another
// school's or another class's users, and not when the creator chose not to notify.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('calendar events in the notification bell', () => {
  let ctx;
  before(async () => { ctx = await startTestApp(); });
  after(async () => { await ctx.stop(); });

  // the notification is written just after the response; wait for it
  const bellOf = async (as, eventId, { expect = true } = {}) => {
    const deadline = Date.now() + (expect ? 5000 : 800);
    let found;
    do {
      const response = await ctx.api('GET', '/api/announcements', { as });
      assert.equal(response.status, 200);
      found = response.body.filter((a) => a.type === 'CALENDAR_EVENT' && Number(a.entityId) === Number(eventId));
      if (found.length || !expect) break;
      await new Promise((r) => setTimeout(r, 100));
    } while (Date.now() < deadline);
    return found;
  };
  const create = async (as, body) => {
    const response = await ctx.api('POST', '/api/calendar', { as, body: { startDate: '2026-11-20T10:00:00.000Z', endDate: '2026-11-20T11:00:00.000Z', ...body } });
    assert.equal(response.status, 201, response.text.slice(0, 160));
    return response.body.id;
  };

  it('an admin event for students and faculty reaches both, once each, in the same school only', async () => {
    const id = await create('adminA', { title: 'Sports Day', publishFor: 'both', notify: true });
    for (const as of ['studentA', 'studentA2', 'mentorA']) {
      const notes = await bellOf(as, id);
      assert.equal(notes.length, 1, as);
      assert.match(notes[0].title + ' ' + notes[0].content, /Sports Day|Calendar/);
    }
    for (const as of ['studentB', 'mentorB', 'adminA']) assert.deepEqual(await bellOf(as, id, { expect: false }), [], as);
  });

  it('a teacher\'s whole-class event reaches the students of that teacher\'s classes only', async () => {
    const id = await create('mentorA', { title: 'Class test', allClasses: true, notify: true });
    assert.equal((await bellOf('studentA', id)).length, 1);
    assert.deepEqual(await bellOf('studentA2', id, { expect: false }), []);
    assert.deepEqual(await bellOf('studentB', id, { expect: false }), []);
  });

  it('nothing is sent when the creator unticks "notify"', async () => {
    const id = await create('adminA', { title: 'Quiet event', publishFor: 'students' });
    assert.deepEqual(await bellOf('studentA', id, { expect: false }), []);
  });
});
