/**
 * Help assistant read-only tools (helpers/assistantTools.js), conversation context (helpers/assistantContext.js)
 * and the tool round in routes/assistantRoutes.js, 22 October 2026.
 *
 * A small HTTP server stands in for the chatbot: a request with tools=true is answered with the tool calls the
 * test sets, a request carrying tool_results with a final answer; every request body is recorded. So these tests
 * prove what the LMS executes, for whom, with which fields and which conversation context; the model is not
 * involved.
 *
 * Fixture (tests/helpers/testApp.js): school A has classroomA (class teacher mentorA, studentA), classroomA2
 * (mentorA2, studentA2), courses "Science A" (mentorA) and "History A" (mentorA2), liveClassA, an attendance and a
 * result for studentA; school B has "Science B" with its own teacher and student. One more school A course,
 * "Science Lab" (mentorA2), is added here for duplicate-name tests.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startTestApp } = require('../helpers/testApp');
const { invalidArgs } = require('../../helpers/assistantTools');
const conversation = require('../../helpers/assistantContext');

describe('help assistant tools', () => {
  let ctx;
  let ids;
  let fake;
  let received;
  let toolCalls;
  let secondReply;
  let scienceLab;

  const call = (name, args, id = 'call_1') => ({ id, name, args });
  // One question through the LMS proxy. Returns the HTTP reply, the tool results the LMS produced and the
  // context it sent to the chatbot.
  const ask = async (as, calls, question = 'How many students are there?', session_id = undefined, token = undefined) => {
    toolCalls = calls;
    received = [];
    const body = { question, ...(session_id ? { session_id } : {}) };
    const r = await ctx.api('POST', '/api/assistant/api/v1/chat', token ? { token, body } : { as, body });
    const second = received.find((x) => x.body.tool_results);
    return { r, results: second?.body.tool_results, sentContext: received[0]?.body.context, second: second?.body };
  };
  const data = async (as, c, question) => (await ask(as, [c], question)).results[0];

  before(async () => {
    fake = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : null;
        received.push({ body });
        const out = body?.tool_results
          ? secondReply || { status: 200, body: { answer: 'final answer', citations: [], sources: [] } }
          : { status: 200, body: { answer: '', citations: [], sources: [], tool_calls: toolCalls } };
        res.writeHead(out.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out.body));
      });
    });
    await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
    ctx = await startTestApp();
    ids = ctx.ids;
    // The school database records class teachers in the older classTeacher column (the fixture only fills
    // classTeacherId); the class page endpoint reads classTeacher, so set it as real data has it.
    await ctx.db.run('UPDATE classrooms SET classTeacher = classTeacherId');
    scienceLab = (await ctx.db.run("INSERT INTO courses (title, description, mentorId, classroomId, university_id) VALUES ('Science Lab', 'Synthetic course', ?, ?, ?)", [ids.users.mentorA2, ids.classroomA2, ids.schoolA])).lastID;
    process.env.CHATBOT_URL = `http://127.0.0.1:${fake.address().port}`;
    process.env.CHATBOT_CALLER_KEY = 'test-caller-key';
  });

  after(async () => {
    delete process.env.CHATBOT_URL;
    delete process.env.CHATBOT_CALLER_KEY;
    await ctx.stop();
    await new Promise((resolve) => fake.close(resolve));
  });

  beforeEach(() => {
    received = [];
    secondReply = null;
    conversation.clearAll();
  });

  /* ---------------- counts, lists, details ---------------- */

  it('runs a count for the admin school and sends the result back once for the answer', async () => {
    const { r, results, second } = await ask('adminA', [call('getRecordCount', { record_type: 'students' })]);
    assert.equal(r.status, 200);
    assert.equal(r.body.answer, 'final answer');
    assert.equal(received.length, 2, 'exactly one tool round');
    assert.equal(second.tools, false);
    const school = await ctx.db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND university_id = ?", [ids.schoolA]);
    assert.deepEqual(results, [{ id: 'call_1', ok: true, data: { record_type: 'students', count: school.n } }]);
  });

  it('keeps schools apart: each admin counts only their own school', async () => {
    const a = (await data('adminA', call('getRecordCount', { record_type: 'courses' }))).data.count;
    const b = (await data('adminB', call('getRecordCount', { record_type: 'courses' }))).data.count;
    assert.equal(a, (await ctx.db.get('SELECT COUNT(*) AS n FROM courses WHERE university_id = ?', [ids.schoolA])).n);
    assert.equal(b, (await ctx.db.get('SELECT COUNT(*) AS n FROM courses WHERE university_id = ?', [ids.schoolB])).n);
  });

  it('refuses another school\'s record by id, even when the user typed the id', async () => {
    const result = await data('adminA', call('getRecordDetails', { record_type: 'courses', record_id: ids.courseB }), `Details of course ${ids.courseB}`);
    assert.equal(result.ok, false);
    assert.equal(result.data, undefined);
  });

  it('returns only allowlisted fields: no emails, fees or nested data', async () => {
    const { results } = await ask('adminA', [
      call('listRecords', { record_type: 'students' }),
      call('getRecordDetails', { record_type: 'courses', record_id: ids.courseA }, 'call_2'),
    ], `Students, and course ${ids.courseA}`);
    for (const s of results[0].data.records) assert.deepEqual(Object.keys(s).filter((k) => !['id', 'name', 'grade', 'rollNumber'].includes(k)), []);
    const course = results[1].data;
    assert.equal(course.id, ids.courseA);
    assert.equal(course.teacherName, 'mentorA');
    assert.equal(typeof course.studentCount, 'number');
    assert.doesNotMatch(JSON.stringify(results), /@|password|token|totalFees|pendingFees|mentorEmail/i);
  });

  it('paginates with at most 20 rows and says whether more exist', async () => {
    const { results } = await ask('adminA', [call('listRecords', { record_type: 'courses', page: 1, page_size: 1 }), call('listRecords', { record_type: 'courses', page: 3, page_size: 1 }, 'call_2')]);
    const [p1, p3] = results.map((x) => x.data);
    assert.equal(p1.records.length, 1);
    assert.equal(p1.total, 3);
    assert.equal(p1.has_more, true);
    assert.equal(p3.has_more, false);
    assert.equal(invalidArgs('listRecords', { record_type: 'courses', page_size: 21 }), 'invalid page size');
    assert.equal(invalidArgs('listRecords', { record_type: 'courses', page: 0 }), 'invalid page');
  });

  it('filters by name and by a supported status only', async () => {
    const live = await data('adminA', call('listRecords', { record_type: 'live_classes', status: 'scheduled' }));
    assert.ok(live.data.records.every((l) => l.status === 'scheduled') && live.data.total >= 1);
    assert.deepEqual((await data('adminA', call('listRecords', { record_type: 'courses', status: 'live' }))), { id: 'call_1', ok: false, error: 'unsupported filter' });
    const empty = await data('adminA', call('listRecords', { record_type: 'courses', name_contains: 'no-such-course-zzz' }));
    assert.deepEqual(empty, { id: 'call_1', ok: true, data: { record_type: 'courses', total: 0, page: 1, page_size: 10, has_more: false, records: [] } });
  });

  /* ---------------- names, search, references ---------------- */

  it('answers "who teaches Science" from the courses the user can see, with their teachers', async () => {
    const result = await data('adminA', call('searchRecords', { query: 'Science', record_type: 'courses' }));
    const found = result.data.records.map((c) => [c.title, c.teacherName]).sort();
    assert.deepEqual(found, [['Science A', 'mentorA'], ['Science Lab', 'mentorA2']], 'school B\'s "Science B" is not included');
  });

  it('resolves one name, and returns candidates instead of guessing when several match', async () => {
    const one = await data('adminA', call('resolveRecordReference', { record_type: 'courses', name: 'science a' }));
    assert.equal(one.data.status, 'resolved');
    assert.equal(one.data.record.id, ids.courseA, 'an exact name wins over a partial match');
    const several = await data('adminA', call('getRelatedRecords', { record_type: 'courses', relation: 'teacher', name: 'Science' }));
    assert.equal(several.data.status, 'ambiguous');
    assert.deepEqual(several.data.candidates.map((c) => c.title).sort(), ['Science A', 'Science Lab']);
    assert.doesNotMatch(JSON.stringify(several), /@/);
    const none = await data('adminA', call('resolveRecordReference', { record_type: 'courses', name: 'Science B' }));
    assert.equal(none.data.status, 'not_found', 'another school\'s record is simply not found');
  });

  it('follows relationships: a course\'s teacher, a teacher\'s courses, a class\'s students', async () => {
    const teacher = await data('adminA', call('getRelatedRecords', { record_type: 'courses', relation: 'teacher', name: 'History A' }));
    assert.deepEqual(teacher.data.records, [{ id: ids.users.mentorA2, name: 'mentorA2' }]);
    const courses = await data('adminA', call('getRelatedRecords', { record_type: 'teachers', relation: 'courses', name: 'mentorA2' }));
    assert.deepEqual(courses.data.records.map((c) => c.title).sort(), ['History A', 'Science Lab']);
    const students = await data('mentorA', call('getRelatedRecords', { record_type: 'classrooms', relation: 'students', name: 'Grade 5 - A' }));
    assert.deepEqual(students.data.records.map((s) => s.id), [ids.users.studentA]);
    const live = await data('studentA', call('getRelatedRecords', { record_type: 'courses', relation: 'live_classes', name: 'Science A' }));
    assert.deepEqual(live.data.records.map((l) => l.id), [ids.liveClassA]);
  });

  it('uses the user\'s only record when no name is given ("who teaches my class")', async () => {
    const mine = await data('studentA', call('getRelatedRecords', { record_type: 'classrooms', relation: 'teacher' }));
    assert.equal(mine.data.of.id, ids.classroomA);
    assert.deepEqual(mine.data.records.map((t) => t.name), ['mentorA']);
    const admin = await data('adminA', call('getRelatedRecords', { record_type: 'classrooms', relation: 'teacher' }));
    assert.equal(admin.data.status, 'ambiguous', 'an admin has several classes: ask which');
  });

  it('treats "no class assigned" as no class, not as an error', async () => {
    // Found live: a student without a class got "not available right now" because the endpoint answers 404.
    const id = (await ctx.db.run("INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES ('Unassigned', 'unassigned@test.invalid', 'x', 'student', ?, 1)", [ids.schoolA])).lastID;
    const token = ctx.tokenFor('studentA', { userId: id });
    const { results } = await ask(null, [call('listRecords', { record_type: 'classrooms' }), call('getRelatedRecords', { record_type: 'classrooms', relation: 'teacher' }, 'call_2')], 'Who teaches my class?', undefined, token);
    assert.deepEqual(results[0], { id: 'call_1', ok: true, data: { record_type: 'classrooms', total: 0, page: 1, page_size: 10, has_more: false, records: [] } });
    assert.equal(results[1].data.status, 'not_found');
  });

  it('tells the chatbot what each role can read, from the session role', async () => {
    const sent = {};
    for (const as of ['adminA', 'mentorA', 'studentA', 'accountantA']) {
      sent[as] = (await ask(as, [call('getRecordCount', { record_type: 'courses' })])).second?.capabilities ?? received[0].body.capabilities;
    }
    assert.ok(sent.adminA.record_types.includes('teachers'));
    assert.ok(!sent.mentorA.record_types.includes('teachers'), 'a teacher has no teacher list');
    assert.deepEqual(Object.keys(sent.mentorA.relations).sort(), ['classrooms', 'courses'], 'no admin-only relations');
    assert.ok(!sent.mentorA.relations.courses.includes('progress'));
    assert.ok(!sent.studentA.relations.classrooms.includes('students'), 'students cannot read classmates');
    assert.deepEqual(sent.accountantA, { record_types: ['announcements'], relations: {} });
    // The role comes from the session: a request body cannot change it.
    const r = await ctx.api('POST', '/api/assistant/api/v1/chat', { as: 'studentA', body: { question: 'q', capabilities: sent.adminA } });
    assert.equal(r.status, 200);
    assert.deepEqual(received.at(-1).body.capabilities ?? received[0].body.capabilities, sent.studentA);
  });

  it('never traverses to records the user could not open directly', async () => {
    // mentorA2 does not teach Science A: the course is not found for them, so neither is its teacher or roster.
    const other = await data('mentorA2', call('getRelatedRecords', { record_type: 'courses', relation: 'students', record_id: ids.courseA }), `course ${ids.courseA}`);
    assert.equal(other.data.status, 'not_found');
    assert.deepEqual(await data('studentA', call('getRelatedRecords', { record_type: 'classrooms', relation: 'students' })), { id: 'call_1', ok: false, error: 'This information is not available for your role.' });
    assert.deepEqual(await data('studentA', call('getRelatedRecords', { record_type: 'teachers', relation: 'courses', name: 'mentorA' })), { id: 'call_1', ok: false, error: 'This information is not available for your role.' });
    const crossSchool = await data('adminA', call('getRelatedRecords', { record_type: 'courses', relation: 'live_classes', name: 'Science B' }));
    assert.equal(crossSchool.data.status, 'not_found');
  });

  /* ---------------- role capabilities ---------------- */

  it('gives each role its own records: teacher\'s classes and students, student\'s attendance and results', async () => {
    const teacherCourses = (await data('mentorA', call('listRecords', { record_type: 'courses' }))).data.records.map((c) => c.id);
    assert.deepEqual(teacherCourses, [ids.courseA]);
    const teacherStudents = (await data('mentorA', call('listRecords', { record_type: 'students' }))).data.records;
    assert.deepEqual(teacherStudents.map((s) => s.id), [ids.users.studentA], 'only the students of the teacher\'s classes');
    const attendance = (await data('studentA', call('listRecords', { record_type: 'attendance' }))).data.records;
    assert.deepEqual(attendance.map((a) => [a.date, a.status]), [['2026-01-15', 'present']]);
    const results = (await data('studentA', call('listRecords', { record_type: 'results' }))).data.records;
    assert.equal(results[0].overallPercentage, 80);
    assert.equal(results[0].subjects, undefined, 'nested data is not passed on');
    for (const as of ['studentA', 'mentorA']) {
      const r = await data(as, call('listRecords', { record_type: 'teachers' }));
      assert.equal(r.ok, false, as);
    }
    assert.equal((await data('adminA', call('listRecords', { record_type: 'attendance' }))).ok, false, 'attendance lists are the student\'s own only');
  });

  it('gives a student only courses of their class', async () => {
    const { results } = await ask('studentA', [
      call('getRecordDetails', { record_type: 'courses', record_id: ids.courseA }),
      call('getRecordDetails', { record_type: 'courses', record_id: ids.courseA2 }, 'call_2'),
      call('getRecordDetails', { record_type: 'live_classes', record_id: ids.liveClassA }, 'call_3'),
    ], `Courses ${ids.courseA} and ${ids.courseA2}, live class ${ids.liveClassA}`);
    assert.equal(results[0].ok, true, 'enrolled course');
    assert.equal(results[1].ok, false, 'a course of another class');
    assert.equal(results[2].ok, true);
  });

  /* ---------------- invalid calls ---------------- */

  it('never executes unknown tools, invalid arguments or ids the user did not give', async () => {
    const { r, results } = await ask('adminA', [
      call('deleteRecords', { record_type: 'students' }),
      call('listRecords', { record_type: 'users' }, 'call_2'),
      call('getRecordDetails', { record_type: 'courses', record_id: ids.courseA }, 'call_3'),
    ], 'Give me the details of this course');
    assert.equal(r.status, 200);
    assert.deepEqual(results, [
      { id: 'call_1', ok: false, error: 'unknown tool' },
      { id: 'call_2', ok: false, error: 'unsupported record type' },
      { id: 'call_3', ok: false, error: 'record id not given by the user' },
    ]);
    assert.equal(invalidArgs('listRecords', { record_type: 'courses', sql: 'DROP TABLE users' }), 'unknown argument');
    assert.equal(invalidArgs('getRecordDetails', { record_type: 'courses', record_id: '1 OR 1=1' }), 'invalid record id');
    assert.equal(invalidArgs('listRecords', { record_type: 'courses', name_contains: { enum: ['x'] } }), 'invalid name filter');
    assert.equal(invalidArgs('getRelatedRecords', { record_type: 'courses', relation: 'courses' }), 'unsupported relation');
    assert.equal(invalidArgs('searchRecords', { query: '' }), 'invalid search text');
  });

  it('answers a record that does not exist as not available', async () => {
    const result = await data('adminA', call('getRecordDetails', { record_type: 'live_classes', record_id: 987654 }), 'live class 987654');
    assert.deepEqual(result, { id: 'call_1', ok: false, error: 'This record was not found or is not available to you.' });
  });

  it('leaves knowledge-base searches to the assistant and passes them through', async () => {
    const calls = [call('searchKnowledgeBase', { query: 'add a student' }), call('getRecordCount', { record_type: 'students' }, 'call_2')];
    const { results, second } = await ask('adminA', calls);
    assert.deepEqual(results.map((x) => x.id), ['call_2']);
    assert.deepEqual(second.tool_calls, calls);
  });

  it('refuses more than three calls or a second tool round, and runs a repeated call once', async () => {
    const four = [1, 2, 3, 4].map((i) => call('getRecordCount', { record_type: 'courses' }, `call_${i}`));
    let { r } = await ask('adminA', four);
    assert.equal(r.status, 502);
    assert.equal(received.length, 1);

    secondReply = { status: 200, body: { answer: '', citations: [], sources: [], tool_calls: [call('getRecordCount', { record_type: 'courses' })] } };
    ({ r } = await ask('adminA', [call('getRecordCount', { record_type: 'courses' })]));
    assert.equal(r.status, 502);
    secondReply = null;

    const { results } = await ask('adminA', [call('getRecordCount', { record_type: 'courses' }), call('getRecordCount', { record_type: 'courses' }, 'call_2')]);
    assert.equal(results[1].error, 'repeated call');
  });

  it('passes a model failure in the answer step on as the chatbot error', async () => {
    secondReply = { status: 503, body: { error: { code: 'llm_unavailable', message: 'The AI model service is unavailable.' } } };
    const { r } = await ask('adminA', [call('getRecordCount', { record_type: 'courses' })]);
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'llm_unavailable');
  });

  it('runs nothing for a missing or expired session', async () => {
    toolCalls = [call('getRecordCount', { record_type: 'students' })];
    received = [];
    assert.equal((await ctx.api('POST', '/api/assistant/api/v1/chat', { body: { question: 'How many students?' } })).status, 401);
    const expired = ctx.tokenFor('adminA', {}, { expiresIn: -10 });
    assert.equal((await ctx.api('POST', '/api/assistant/api/v1/chat', { token: expired, body: { question: 'How many students?' } })).status, 401);
    assert.equal(received.length, 0);
  });

  it('writes nothing to the database', async () => {
    const tables = (await ctx.db.all("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'")).map((t) => t.name);
    const snapshot = async () => {
      const counts = {};
      for (const t of tables) counts[t] = (await ctx.db.get(`SELECT COUNT(*) AS n FROM "${t}"`)).n;
      return counts;
    };
    const before = await snapshot();
    for (const as of ['adminA', 'mentorA', 'studentA']) {
      await ask(as, [call('listRecords', { record_type: 'courses' }), call('searchRecords', { query: 'Science' }, 'call_2'), call('getRelatedRecords', { record_type: 'courses', relation: 'live_classes', name: 'Science A' }, 'call_3')]);
    }
    assert.deepEqual(await snapshot(), before);
  });

  /* ---------------- conversation context ---------------- */

  it('remembers the shown records for follow-ups in the same session: "who teaches the first one?"', async () => {
    const first = await ask('adminA', [call('listRecords', { record_type: 'courses' })], 'Show my courses', 'chat-1');
    assert.equal(first.sentContext, undefined, 'a new conversation has no context');
    const shown = first.results[0].data.records;

    const followUp = await ask('adminA', [call('getRelatedRecords', { record_type: 'courses', relation: 'teacher', record_id: shown[0].id })], 'Who teaches the first one?', 'chat-1');
    assert.deepEqual(followUp.sentContext.results.map((r) => r.id), shown.map((c) => c.id));
    assert.equal(followUp.sentContext.last_list.tool, 'listRecords');
    assert.equal(followUp.results[0].ok, true, 'an id shown earlier in this conversation is accepted');
    assert.equal(followUp.results[0].data.of.id, shown[0].id);

    const next = await ask('adminA', [call('listRecords', { record_type: 'live_classes' })], 'What about its live classes?', 'chat-1');
    assert.equal(next.sentContext.focus.id, shown[0].id, 'the course the conversation is about');
    // Found live: after "who teaches the first one" (one teacher back), the course list was replaced by that
    // single teacher and "the second course" / "next page" no longer worked. The list being worked through stays.
    assert.deepEqual(next.sentContext.results.map((r) => r.id), shown.map((c) => c.id));
    assert.equal(next.sentContext.last_list.args.record_type, 'courses');
  });

  it('keeps conversations apart: another user, another session, or a changed role gets no context', async () => {
    await ask('adminA', [call('listRecords', { record_type: 'courses' })], 'Show my courses', 'shared-id');
    assert.ok((await ask('adminA', [call('getRecordCount', { record_type: 'courses' })], 'and?', 'shared-id')).sentContext);
    assert.equal((await ask('adminB', [call('getRecordCount', { record_type: 'courses' })], 'and?', 'shared-id')).sentContext, undefined, 'another school\'s admin');
    assert.equal((await ask('mentorA', [call('getRecordCount', { record_type: 'courses' })], 'and?', 'shared-id')).sentContext, undefined, 'another user');
    assert.equal((await ask('adminA', [call('getRecordCount', { record_type: 'courses' })], 'and?', 'other-chat')).sentContext, undefined, 'another session');

    // An id remembered by adminA's conversation is not an allowed id in another user's conversation.
    const id = ids.courseA;
    const stolen = await ask('mentorA2', [call('getRecordDetails', { record_type: 'courses', record_id: id })], 'Tell me about the first one', 'shared-id');
    assert.equal(stolen.results[0].error, 'record id not given by the user');

    const user = { userId: ids.users.adminA, role: 'admin', universityId: ids.schoolA };
    assert.ok(conversation.contextFor(user, 'shared-id'));
    assert.equal(conversation.contextFor({ ...user, role: 'mentor' }, 'shared-id'), null, 'a role change starts afresh');
    assert.equal(conversation.contextFor({ ...user, universityId: ids.schoolB }, 'shared-id'), null, 'a school change starts afresh');
  });

  it('forgets a conversation after 30 idle minutes and old lists after three turns, within a size bound', () => {
    const user = { userId: 1, role: 'admin', universityId: 1 };
    const listed = [call('listRecords', { record_type: 'courses' })];
    const shown = [{ id: 'call_1', ok: true, data: { record_type: 'courses', total: 1, page: 1, has_more: false, records: [{ id: 5, title: 'Maths' }] } }];
    conversation.remember(user, 's', listed, shown, 0);
    assert.equal(conversation.contextFor(user, 's', conversation.TTL_MS - 1).results[0].id, 5);
    assert.equal(conversation.contextFor(user, 's', conversation.TTL_MS + 1), null);

    conversation.remember(user, 't', listed, shown, 0);
    for (let i = 0; i < 3; i += 1) conversation.remember(user, 't', [], [], 1);
    assert.equal(conversation.contextFor(user, 't', 2), null, 'the topic moved on');

    conversation.clearAll();
    for (let i = 0; i <= conversation.MAX_CONVERSATIONS; i += 1) conversation.remember({ ...user, userId: i }, 's', listed, shown, 0);
    assert.equal(conversation.size(), conversation.MAX_CONVERSATIONS);
    assert.equal(conversation.contextFor({ ...user, userId: 0 }, 's', 1), null, 'the least recently used is dropped');
    assert.equal(conversation.contextFor(user, undefined), null, 'no session id, no context');
  });

  it('stores only ids, short labels and the validated list request', async () => {
    await ask('adminA', [call('listRecords', { record_type: 'students' })], 'Show students', 'chat-pii');
    const sent = (await ask('adminA', [call('getRecordCount', { record_type: 'courses' })], 'and?', 'chat-pii')).sentContext;
    for (const r of sent.results) assert.deepEqual(Object.keys(r).sort(), ['id', 'label', 'n', 'record_type']);
    assert.doesNotMatch(JSON.stringify(sent), /@|grade|rollNumber|Show students/);
  });
});
