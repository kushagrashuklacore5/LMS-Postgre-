/**
 * Live lectures (JaaS) — start, schedule, join, attendance, history (16 October 2026).
 *
 * The meeting provider is never called: JaaS needs no API call to open a room, the join token is
 * signed here with a key pair made for this test, and webhooks are posted with a test secret.
 * So these tests prove the LMS rules and the token / signature handling, not real video.
 *
 * Fixture (tests/helpers/testApp.js): classroomA (class teacher mentorA), courseA (mentorA, home
 * classroomA, studentA enrolled), classroomA2 / courseA2 (mentorA2, studentA2), school B.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { startTestApp } = require('../helpers/testApp');

describe('live lectures', () => {
  let ctx;
  let ids;
  let U;
  const x = {};
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const SECRET = 'test-webhook-secret';
  const configure = () => {
    process.env.JAAS_APP_ID = 'vpaas-magic-cookie-test';
    process.env.JAAS_API_KEY_ID = 'key1';
    process.env.JAAS_PRIVATE_KEY = keys.privateKey.replace(/\n/g, '\\n');
    process.env.JAAS_WEBHOOK_SECRET = SECRET;
  };
  const unconfigure = () => { ['JAAS_APP_ID', 'JAAS_API_KEY_ID', 'JAAS_PRIVATE_KEY', 'JAAS_WEBHOOK_SECRET'].forEach((k) => delete process.env[k]); };
  const addUser = async (name, role, school) =>
    (await ctx.db.run('INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, ?, ?, 1)', [name, `${name.toLowerCase().replace(/\s+/g, '.')}@test.invalid`, 'x', role, school])).lastID;
  const as = (userId, role = 'mentor', school = 1) => ({ token: ctx.tokenFor(role === 'student' ? 'studentA' : role === 'admin' ? 'adminA' : 'mentorA', { userId, role, universityId: school }) });
  const refused = (r) => [403, 404].includes(r.status);
  const create = (auth, body) => ctx.api('POST', '/api/live-classes', { ...auth, body });
  const later = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
  const sign = (raw, t = Math.floor(Date.now() / 1000), secret = SECRET) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('base64')}`;
  const webhook = (payload, header) => {
    const raw = JSON.stringify(payload);
    return ctx.api('POST', '/api/live-classes/webhooks/jaas', { body: raw, headers: { 'X-Jaas-Signature': header === undefined ? sign(raw) : header } });
  };
  const roomOf = async (id) => (await ctx.db.get('SELECT providerRoom FROM live_classes WHERE id = ?', [id])).providerRoom;
  const event = (type, room, userId, when, key) => ({
    idempotencyKey: key || crypto.randomUUID(), eventType: type, fqn: `vpaas-magic-cookie-test/${room}`, timestamp: when, data: userId ? { id: String(userId), name: 'x' } : {},
  });
  const attendance = (lectureId, studentId) => ctx.db.get('SELECT * FROM live_class_attendance WHERE liveClassId = ? AND studentId = ?', [lectureId, studentId]);

  before(async () => {
    ctx = await startTestApp();
    ids = ctx.ids;
    U = ids.users;
    configure();
    // another teacher's course taught to classroomA (mentorA is only its class teacher)
    x.other = await addUser('Other Teacher', 'mentor', ids.schoolA);
    x.otherCourse = (await ctx.db.run('INSERT INTO courses (title, mentorId, classroomId, university_id) VALUES (?, ?, ?, ?)', ['Other Course', x.other, ids.classroomA, ids.schoolA])).lastID;
    // a class mentorA runs where courseA is not taught
    x.classX = (await ctx.db.run("INSERT INTO classrooms (university_id, name, grade, section, classTeacherId) VALUES (?, 'Grade 9 - X', '9', 'X', ?)", [ids.schoolA, U.mentorA])).lastID;
    // students: in classroomA but not enrolled; enrolled in courseA but in another class; a second eligible one
    x.memberOnly = await addUser('Member Only', 'student', ids.schoolA);
    await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [x.memberOnly, ids.classroomA]);
    await ctx.db.run('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)', [ids.courseA, U.studentA2]);
    x.second = await addUser('Second Eligible', 'student', ids.schoolA);
    await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [x.second, ids.classroomA]);
    await ctx.db.run('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)', [ids.courseA, x.second]);
  });
  after(async () => { unconfigure(); await ctx.stop(); });

  describe('starting and scheduling', () => {
    it('offers a teacher only their own courses taught to the class', async () => {
      const r = await ctx.api('GET', `/api/live-classes/teaching/${ids.classroomA}/courses`, { as: 'mentorA' });
      assert.equal(r.status, 200, r.text.slice(0, 160));
      assert.deepEqual(r.body.data.map((c) => c.id), [ids.courseA], 'not the other teacher\'s course of the same class');
    });

    it('an authorized teacher starts a class now: live, embedded, one row', async () => {
      const r = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Fractions', mode: 'now', requestKey: 'k-1' });
      assert.equal(r.status, 201, r.text.slice(0, 200));
      assert.equal(r.body.data.status, 'live');
      assert.equal(r.body.data.embedded, true);
      x.live = r.body.data.id;
      const row = await ctx.db.get('SELECT * FROM live_classes WHERE id = ?', [x.live]);
      assert.equal(row.classroomId, ids.classroomA);
      assert.equal(row.university_id, ids.schoolA);
      assert.match(row.providerRoom, /^lms-[0-9a-f-]{36}$/, 'an unguessable room');
    });

    it('a repeated request or a second "start now" returns the same lecture', async () => {
      const again = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Fractions', mode: 'now', requestKey: 'k-1' });
      assert.equal(again.status, 200);
      assert.equal(again.body.duplicate, true);
      assert.equal(again.body.data.id, x.live);
      const second = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Fractions again', mode: 'now' });
      assert.equal(second.body.data.id, x.live, 'one live lecture per class and course');
      const both = await Promise.all([1, 2].map(() => create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Twin', mode: 'schedule', scheduledStartTime: later(120), requestKey: 'twin' })));
      assert.equal(both[0].body.data.id, both[1].body.data.id, 'two simultaneous submissions');
      assert.equal((await ctx.db.get("SELECT COUNT(*) AS n FROM live_classes WHERE requestKey = 'twin'")).n, 1);
    });

    it('refuses another teacher\'s course, a class teacher\'s non-course, and a course not taught to the class', async () => {
      const cases = [
        [{ as: 'mentorA2' }, { classroomId: ids.classroomA, courseId: ids.courseA }, 'another teacher, another course'],
        [{ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: x.otherCourse }, 'class teacher, not the course mentor'],
        [{ as: 'mentorA' }, { classroomId: x.classX, courseId: ids.courseA }, 'course not taught to that class'],
        [{ as: 'mentorB' }, { classroomId: ids.classroomA, courseId: ids.courseA }, 'another school'],
        [{ as: 'adminA' }, { classroomId: ids.classroomA, courseId: ids.courseA }, 'an admin does not start lectures'],
        [{ as: 'studentA' }, { classroomId: ids.classroomA, courseId: ids.courseA }, 'a student'],
      ];
      const before = (await ctx.db.get('SELECT COUNT(*) AS n FROM live_classes')).n;
      for (const [auth, body, why] of cases) {
        const r = await create(auth, { ...body, title: 'Nope', mode: 'schedule', scheduledStartTime: later(60) });
        assert.ok(refused(r), `${why}: ${r.status} ${r.text.slice(0, 100)}`);
      }
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM live_classes')).n, before);
    });

    it('schedules a valid future class; past, invalid and missing values are refused', async () => {
      const ok = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Decimals', description: 'Chapter 4', mode: 'schedule', scheduledStartTime: later(10), durationMinutes: 45 });
      assert.equal(ok.status, 201, ok.text.slice(0, 160));
      assert.equal(ok.body.data.status, 'scheduled');
      x.scheduled = ok.body.data.id;
      const stored = await ctx.db.get('SELECT scheduledStartTime, scheduledEndTime FROM live_classes WHERE id = ?', [x.scheduled]);
      assert.match(stored.scheduledStartTime, /Z$/, 'stored in UTC');
      assert.equal(new Date(stored.scheduledEndTime) - new Date(stored.scheduledStartTime), 45 * 60000);
      for (const [body, why] of [
        [{ scheduledStartTime: later(-5) }, 'past'],
        [{ scheduledStartTime: 'tomorrow-ish' }, 'not a date'],
        [{ scheduledStartTime: later(60 * 24 * 400) }, 'more than a year ahead'],
        [{ scheduledStartTime: later(60), title: '  ' }, 'no topic'],
        [{ scheduledStartTime: later(60), durationMinutes: 5 }, 'too short'],
        [{ scheduledStartTime: later(60), mode: 'maybe' }, 'unknown mode'],
      ]) {
        const r = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'T', mode: 'schedule', ...body });
        assert.equal(r.status, 400, `${why}: ${r.status}`);
      }
    });

    it('without JaaS credentials "start now" is refused and leaves no record; scheduling still works', async () => {
      unconfigure();
      try {
        const before = (await ctx.db.get('SELECT COUNT(*) AS n FROM live_classes')).n;
        const r = await create({ as: 'mentorA2' }, { classroomId: ids.classroomA2, courseId: ids.courseA2, title: 'History', mode: 'now' });
        assert.equal(r.status, 503);
        assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM live_classes')).n, before);
        assert.equal((await ctx.api('GET', '/api/live-classes/config', { as: 'mentorA' })).body.data.configured, false);
        const s = await create({ as: 'mentorA2' }, { classroomId: ids.classroomA2, courseId: ids.courseA2, title: 'History', mode: 'schedule', scheduledStartTime: later(5) });
        assert.equal(s.status, 201);
        assert.equal((await ctx.api('POST', `/api/live-classes/${s.body.data.id}/start`, { as: 'mentorA2' })).status, 503);
      } finally {
        configure();
      }
    });
  });

  describe('joining', () => {
    it('the teacher gets a moderator token and an eligible student a participant token, for this room only', async () => {
      const room = await roomOf(x.live);
      const teacher = await ctx.api('POST', `/api/live-classes/${x.live}/join`, { as: 'mentorA' });
      assert.equal(teacher.status, 200, teacher.text.slice(0, 160));
      const t = jwt.verify(teacher.body.data.meeting.jwt, keys.publicKey, { algorithms: ['RS256'], audience: 'jitsi', issuer: 'chat' });
      assert.equal(t.context.user.moderator, true);
      assert.equal(t.room, room);
      assert.equal(teacher.body.data.meeting.roomName, `vpaas-magic-cookie-test/${room}`);
      assert.equal(jwt.decode(teacher.body.data.meeting.jwt, { complete: true }).header.kid, 'vpaas-magic-cookie-test/key1');
      assert.ok(t.exp - t.iat <= 10 * 60, 'short-lived');

      const student = await ctx.api('POST', `/api/live-classes/${x.live}/join`, { as: 'studentA' });
      assert.equal(student.status, 200, student.text.slice(0, 160));
      const s = jwt.verify(student.body.data.meeting.jwt, keys.publicKey, { algorithms: ['RS256'] });
      assert.equal(s.context.user.moderator, false, 'students are never moderators');
      assert.equal(s.context.user.id, String(U.studentA));
      // the private key and webhook secret never appear in an answer
      for (const r of [teacher, student, await ctx.api('GET', '/api/live-classes/config', { as: 'mentorA' })]) {
        assert.ok(!/PRIVATE KEY/.test(r.text) && !r.text.includes(SECRET), 'a secret was sent to the browser');
      }
    });

    it('class membership without enrolment, enrolment in another class, other schools and other teachers are denied', async () => {
      for (const [auth, why] of [
        [as(x.memberOnly, 'student'), 'in the class, not enrolled'],
        [{ as: 'studentA2' }, 'enrolled, other class'],
        [{ as: 'studentB' }, 'another school'],
        [{ as: 'mentorA2' }, 'another teacher'],
        [{ as: 'adminB' }, 'another school\'s admin'],
      ]) {
        const r = await ctx.api('POST', `/api/live-classes/${x.live}/join`, auth);
        assert.ok(refused(r), `${why}: ${r.status}`);
      }
      assert.ok(refused(await ctx.api('POST', `/api/live-classes/${x.live}/join`, { as: 'adminA' })), 'an admin does not join');
    });

    it('a scheduled lecture cannot be joined yet', async () => {
      const r = await ctx.api('POST', `/api/live-classes/${x.scheduled}/join`, { as: 'studentA' });
      assert.equal(r.status, 409);
    });
  });

  describe('webhooks and attendance', () => {
    it('accepts only correctly signed, fresh webhooks', async () => {
      const room = await roomOf(x.live);
      const body = event('PARTICIPANT_JOINED', room, U.studentA, Date.now());
      assert.equal((await webhook(body, 't=1,v1=abc')).status, 401, 'wrong signature');
      assert.equal((await webhook(body, '')).status, 401, 'no signature');
      const raw = JSON.stringify(body);
      assert.equal((await webhook(body, sign(raw, Math.floor(Date.now() / 1000) - 3600))).status, 401, 'an hour old');
      assert.equal((await webhook(body, sign(raw, undefined, 'wrong-secret'))).status, 401, 'another secret');
      delete process.env.JAAS_WEBHOOK_SECRET;
      assert.equal((await webhook(body)).status, 401, 'refused while no secret is configured');
      configure();
      assert.equal(await ctx.db.get('SELECT 1 FROM live_class_events WHERE liveClassId = ?', [x.live]), undefined, 'nothing recorded');
    });

    it('duplicate and out-of-order events; several intervals add up', async () => {
      const room = await roomOf(x.live);
      const t0 = Date.now() - 50 * 60000;
      await ctx.db.run('UPDATE live_classes SET actualStartTime = ? WHERE id = ?', [new Date(t0 - 60000).toISOString(), x.live]);
      // studentA: 0-2 min, then 5-7 min (delivered out of order, the first join twice)
      const join1 = event('PARTICIPANT_JOINED', room, U.studentA, t0, 'j1');
      const sequence = [
        event('PARTICIPANT_LEFT', room, U.studentA, t0 + 120000, 'l1'),
        join1,
        event('PARTICIPANT_LEFT', room, U.studentA, t0 + 420000, 'l2'),
        event('PARTICIPANT_JOINED', room, U.studentA, t0 + 300000, 'j2'),
        join1,
      ];
      const outcomes = [];
      for (const e of sequence) outcomes.push((await webhook(e)).body.outcome);
      assert.deepEqual(outcomes, ['recorded', 'recorded', 'recorded', 'recorded', 'duplicate']);
      const a = await attendance(x.live, U.studentA);
      assert.equal(a.attendedSeconds, 240);
      assert.equal(a.intervals, 2);
      assert.equal(a.status, 'pending', 'never "missed" or "attended" while the lecture is live');
      assert.equal(a.source, 'provider');
      // events about someone who is not a student of the lecture are not attendance
      assert.equal((await webhook(event('PARTICIPANT_JOINED', room, x.memberOnly, t0))).body.outcome, 'not a student of the lecture');
      assert.equal((await webhook(event('PARTICIPANT_JOINED', room, U.mentorA, t0))).body.outcome, 'not a student of the lecture');
      assert.equal((await webhook(event('PARTICIPANT_JOINED', 'lms-unknown', U.studentA, t0))).body.outcome, 'unknown room');
    });

    it('the student list says "live" (not missed) while the lecture runs', async () => {
      const mine = (await ctx.api('GET', '/api/live-classes/student', as(x.second, 'student'))).body.data.find((l) => l.id === x.live);
      assert.equal(mine.myStatus, 'live');
      assert.equal(mine.canJoin, true);
    });

    it('ROOM_DESTROYED completes the lecture once; attended and missed are set; a second end changes nothing', async () => {
      const room = await roomOf(x.live);
      const end = Date.now() - 10 * 60000;
      assert.equal((await webhook(event('ROOM_DESTROYED', room, null, end, 'end-1'))).body.outcome, 'completed');
      assert.equal((await webhook(event('ROOM_DESTROYED', room, null, end + 5000, 'end-2'))).body.outcome, 'already finished');
      const row = await ctx.db.get('SELECT status, actualEndTime, endedBy, attendanceState FROM live_classes WHERE id = ?', [x.live]);
      assert.deepEqual([row.status, row.actualEndTime, row.endedBy, row.attendanceState], ['completed', new Date(end).toISOString(), 'provider', 'final']);
      assert.equal((await attendance(x.live, U.studentA)).status, 'attended');
      assert.equal((await attendance(x.live, x.second)).status, 'missed', 'eligible, never joined');
      assert.equal(await attendance(x.live, x.memberOnly), undefined, 'not eligible: no row');
      assert.equal((await ctx.api('POST', `/api/live-classes/${x.live}/end`, { as: 'mentorA' })).status, 200, 'ending again is harmless');
      assert.equal((await attendance(x.live, U.studentA)).attendedSeconds, 240);
    });

    it('the in-meeting page records the signed-in student\'s presence (server time), not a teacher\'s', async () => {
      await ctx.db.run("UPDATE live_classes SET status = 'scheduled', scheduledStartTime = ? WHERE id = ?", [later(5), x.scheduled]);
      const started = await ctx.api('POST', `/api/live-classes/${x.scheduled}/start`, { as: 'mentorA' });
      assert.equal(started.status, 200, started.text.slice(0, 200));
      assert.equal(started.body.data.status, 'live');
      // naming another student is refused outright; a time sent by the browser is ignored
      assert.equal((await ctx.api('POST', `/api/live-classes/${x.scheduled}/presence`, { as: 'studentA', body: { kind: 'join', studentId: U.studentA2 } })).status, 403);
      const join = await ctx.api('POST', `/api/live-classes/${x.scheduled}/presence`, { as: 'studentA', body: { kind: 'join', at: '2020-01-01T00:00:00Z', attendedSeconds: 99999 } });
      assert.equal(join.body.data.recorded, true);
      const ev = await ctx.db.get('SELECT * FROM live_class_events WHERE liveClassId = ?', [x.scheduled]);
      assert.equal(ev.userId, U.studentA, 'the id comes from the session, not the body');
      assert.ok(Math.abs(new Date(ev.at) - Date.now()) < 60000, 'the time comes from the server');
      assert.equal((await ctx.api('POST', `/api/live-classes/${x.scheduled}/presence`, { as: 'mentorA', body: { kind: 'join' } })).body.data.recorded, false);
      assert.ok(refused(await ctx.api('POST', `/api/live-classes/${x.scheduled}/presence`, { ...as(x.memberOnly, 'student'), body: { kind: 'join' } })));
      assert.equal((await ctx.api('POST', `/api/live-classes/${x.scheduled}/presence`, { as: 'studentA', body: { kind: 'fly' } })).status, 400);
      await ctx.api('POST', `/api/live-classes/${x.scheduled}/leave`, { as: 'studentA' });
      assert.equal((await ctx.api('POST', `/api/live-classes/${x.scheduled}/end`, { as: 'mentorA' })).body.data.status, 'completed');
      const a = await attendance(x.scheduled, U.studentA);
      assert.equal(a.source, 'client');
      assert.equal(a.intervals, 1);
      assert.equal(a.status, 'missed', 'a few seconds is not a qualifying attendance');
    });

    it('a completed lecture where nothing was measured is "unknown", not "missed"', async () => {
      const r = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Silent', mode: 'now' });
      await ctx.api('POST', `/api/live-classes/${r.body.data.id}/end`, { as: 'mentorA' });
      assert.equal((await attendance(r.body.data.id, U.studentA)).status, 'unknown');
      const listed = (await ctx.api('GET', '/api/live-classes/student', { as: 'studentA' })).body.data.find((l) => l.id === r.body.data.id);
      assert.equal(listed.myStatus, 'unknown');
    });

    it('interval arithmetic: overlapping joins, a leave without a join, an open interval', () => {
      // loaded here: the module opens the database, which must be the test one
      const { intervalsFrom } = require('../../helpers/lectures');
      const t = (s) => new Date(1_000_000_000_000 + s * 1000).toISOString();
      const spans = intervalsFrom(
        [{ kind: 'leave', at: t(5) }, { kind: 'join', at: t(10) }, { kind: 'join', at: t(20) }, { kind: 'leave', at: t(70) }, { kind: 'join', at: t(100) }],
        { lectureStart: 1_000_000_000_000, openEndFor: () => 1_000_000_000_000 + 130 * 1000 }
      );
      assert.deepEqual(spans.map(([a, b]) => (b - a) / 1000), [60, 30]);
    });
  });

  describe('notifying the students', () => {
    const notes = (type, lectureId) => ctx.db.all("SELECT recipientUserId FROM announcements WHERE type = ? AND entityType = 'live_class' AND entityId = ? ORDER BY recipientUserId", [type, lectureId]);
    it('scheduling and starting notify exactly the enrolled students of the class, once each', async () => {
      const s = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Notify me', mode: 'schedule', scheduledStartTime: later(15) });
      const expected = [U.studentA, x.second].sort((a, b) => a - b);
      assert.deepEqual((await notes('LIVE_CLASS_SCHEDULED', s.body.data.id)).map((r) => Number(r.recipientUserId)), expected, 'not the class member who is not enrolled, nor the enrolled student of another class');
      await ctx.api('POST', `/api/live-classes/${s.body.data.id}/start`, { as: 'mentorA' });
      await ctx.api('POST', `/api/live-classes/${s.body.data.id}/start`, { as: 'mentorA' });
      assert.deepEqual((await notes('LIVE_CLASS_STARTED', s.body.data.id)).map((r) => Number(r.recipientUserId)), expected, 'starting twice notifies once');
      const bell = await ctx.api('GET', '/api/announcements', { as: 'studentA' });
      assert.ok(JSON.stringify(bell.body).includes('Live Class Started'), 'the student sees it');
      const other = await ctx.api('GET', '/api/announcements', as(x.memberOnly, 'student'));
      assert.ok(!JSON.stringify(other.body).includes('Notify me'), 'a class member who is not enrolled does not');
      await ctx.api('POST', `/api/live-classes/${s.body.data.id}/end`, { as: 'mentorA' });
    });
  });

  describe('cancelling and history', () => {
    it('a scheduled lecture is cancelled (kept, not deleted); a live one must be ended instead', async () => {
      const s = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Revision', mode: 'schedule', scheduledStartTime: later(600) });
      assert.ok(refused(await ctx.api('POST', `/api/live-classes/${s.body.data.id}/cancel`, { as: 'mentorA2' })));
      const c = await ctx.api('DELETE', `/api/live-classes/${s.body.data.id}`, { as: 'mentorA' });
      assert.equal(c.body.data.status, 'cancelled');
      assert.ok(await ctx.db.get('SELECT 1 FROM live_classes WHERE id = ?', [s.body.data.id]), 'kept');
      assert.equal((await ctx.api('POST', `/api/live-classes/${s.body.data.id}/start`, { as: 'mentorA' })).status, 409);
      assert.equal((await ctx.api('POST', `/api/live-classes/${s.body.data.id}/join`, { as: 'studentA' })).status, 409);
      x.cancelled = s.body.data.id;
      const live = await create({ as: 'mentorA' }, { classroomId: ids.classroomA, courseId: ids.courseA, title: 'Running', mode: 'now' });
      assert.equal((await ctx.api('POST', `/api/live-classes/${live.body.data.id}/cancel`, { as: 'mentorA' })).status, 409);
      assert.equal((await ctx.api('POST', `/api/live-classes/${live.body.data.id}/end`, { as: 'adminA' })).body.data.status, 'completed', 'the admin fallback');
      assert.ok(refused(await ctx.api('POST', `/api/live-classes/${live.body.data.id}/end`, { as: 'adminB' })));
    });

    it('each view holds exactly what it should', async () => {
      const teacher = (await ctx.api('GET', '/api/live-classes/mine', { as: 'mentorA' })).body.data;
      assert.ok(teacher.every((l) => l.teacherId === U.mentorA));
      const statuses = new Map(teacher.map((l) => [l.id, l.status]));
      assert.equal(statuses.get(x.live), 'completed');
      assert.equal(statuses.get(x.cancelled), 'cancelled');
      const summary = teacher.find((l) => l.id === x.live).attendance;
      assert.deepEqual([summary.attended, summary.missed], [1, 1]);

      assert.ok(!(await ctx.api('GET', '/api/live-classes/mine', { as: 'mentorA2' })).body.data.some((l) => l.teacherId === U.mentorA), 'not another teacher\'s');
      assert.ok(refused(await ctx.api('GET', `/api/live-classes/${x.live}`, { as: 'mentorA2' })));
      assert.ok(refused(await ctx.api('GET', `/api/live-classes/${x.live}/attendance`, { as: 'studentA' })));
      const detail = (await ctx.api('GET', `/api/live-classes/${x.live}/attendance`, { as: 'mentorA' })).body.data;
      assert.deepEqual(detail.students.map((s) => [s.studentId, s.status]).sort(), [[U.studentA, 'attended'], [x.second, 'missed']].sort());

      const student = (await ctx.api('GET', '/api/live-classes/student', { as: 'studentA' })).body.data;
      assert.equal(student.find((l) => l.id === x.live).myStatus, 'attended');
      assert.equal(student.find((l) => l.id === x.cancelled).myStatus, 'cancelled');
      assert.equal((await ctx.api('GET', '/api/live-classes/student', as(x.second, 'student'))).body.data.find((l) => l.id === x.live).myStatus, 'missed');
      assert.deepEqual((await ctx.api('GET', '/api/live-classes/student', as(x.memberOnly, 'student'))).body.data, [], 'class member, not enrolled');
      assert.ok(!(await ctx.api('GET', '/api/live-classes/student', { as: 'studentA2' })).body.data.some((l) => l.classroomId === ids.classroomA), 'enrolled, other class');
      assert.ok((await ctx.api('GET', '/api/live-classes/student', { as: 'studentB' })).body.data.every((l) => l.courseId === ids.courseB), 'only school B\'s own');

      const school = (await ctx.api('GET', `/api/live-classes/school?classroomId=${ids.classroomA}`, { as: 'adminA' })).body.data;
      assert.ok(school.some((l) => l.id === x.live) && school.every((l) => l.classroomId === ids.classroomA));
      assert.ok(!(await ctx.api('GET', '/api/live-classes/school', { as: 'adminB' })).body.data.some((l) => l.id === x.live));
      assert.ok(refused(await ctx.api('GET', `/api/live-classes/${x.live}`, { as: 'adminB' })));
      assert.equal((await ctx.api('GET', '/api/live-classes/mine', { as: 'superadmin' })).status >= 400, true);
    });
  });
});
