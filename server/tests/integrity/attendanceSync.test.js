// Attendance marked by the teacher reaches the student at once: the student's attendance API returns the
// new status, and the student's open page is told to reload (Socket.IO, own room only).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');

const SOCKET_CLIENT = path.resolve(__dirname, '..', '..', '..', 'client', 'node_modules', 'socket.io-client');

describe('attendance reaches the student', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  const today = new Date().toLocaleDateString('en-CA');
  const mark = (status) => ctx.api('POST', '/api/attendance/mark', {
    as: 'mentorA', body: { classroomId: ids.classroomA, date: today, attendanceData: [{ studentId: ids.users.studentA, status }] },
  });
  const todayFor = async (as) => {
    const response = await ctx.api('GET', '/api/attendance/student', { as });
    assert.equal(response.status, 200);
    const records = response.body.data || response.body;
    return records.filter((r) => String(r.date).startsWith(today)).map((r) => r.status);
  };

  it('the student sees each change the teacher saves, and no other student does', async () => {
    assert.equal((await mark('absent')).status, 200);
    assert.deepEqual(await todayFor('studentA'), ['absent']);
    assert.equal((await mark('present')).status, 200);
    assert.deepEqual(await todayFor('studentA'), ['present']);
    assert.deepEqual(await todayFor('studentA2'), []);
  });

  it('the student\'s open page is told to reload; other students are not', { skip: !fs.existsSync(SOCKET_CLIENT) && 'socket.io-client is not installed in client/' }, async () => {
    const { io } = require(SOCKET_CLIENT);
    const connect = (as) => new Promise((resolve, reject) => {
      const socket = io(ctx.base, { transports: ['websocket'], auth: { token: ctx.tokenFor(as) }, forceNew: true });
      const events = [];
      socket.on('attendance:updated', (payload) => events.push(payload));
      socket.on('connect', () => resolve({ socket, events }));
      socket.on('connect_error', reject);
    });
    const marked = await connect('studentA');
    const other = await connect('studentA2');
    try {
      assert.equal((await mark('absent')).status, 200);
      const deadline = Date.now() + 5000;
      while (marked.events.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      assert.deepEqual(marked.events, [{ classroomId: ids.classroomA, date: today }]);
      await new Promise((r) => setTimeout(r, 300));
      assert.deepEqual(other.events, []);
    } finally {
      marked.socket.disconnect();
      other.socket.disconnect();
    }
  });
});
