// Migration 008: "Assign to" selected students + teacher-shared AI Performance Reports.
// Real module router over a TEMP database file, FAKE provider only (no network, no real AI).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createLmsTestDb, IDS, mcq } = require('../helpers/lmsTestDb');
const { MockProvider } = require('../helpers/mockProvider');
const { reportFor } = require('../helpers/reportFixture');
const { createLmsAssessmentAgentRouter, assessmentErrorHandler } = require('../../backend/src/integration/lmsAssessmentAgent');

const SERVER = path.resolve(__dirname, '../../../../server');
const hostPresent = fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const SKIP = !hostPresent && 'host express not found';
const ASHA = 21; // synthetic students added to class 10 (with IDS.student1)
const BILAL = 22;
const USERS = {
  [IDS.teacher1]: { userId: IDS.teacher1, universityId: IDS.school1, role: 'mentor' },
  [IDS.teacher2]: { userId: IDS.teacher2, universityId: IDS.school1, role: 'mentor' },
  [IDS.student1]: { userId: IDS.student1, universityId: IDS.school1, role: 'student' },
  [ASHA]: { userId: ASHA, universityId: IDS.school1, role: 'student' },
  [BILAL]: { userId: BILAL, universityId: IDS.school1, role: 'student' },
  [IDS.student3]: { userId: IDS.student3, universityId: IDS.school2, role: 'student' },
};

/** A server over its own temp DB. `as(userId)` returns a fetch helper for that session. */
async function startServer({ dbOptions, env = {}, report = reportFor({ labels: ['A1'], subject: 'Maths', difficulty: 'unspecified', limited: true }) } = {}) {
  const express = require(path.join(SERVER, 'node_modules', 'express'));
  const db = await createLmsTestDb(dbOptions);
  await db.exec(`INSERT INTO users (id, name, email, password, role, university_id) VALUES
    (${ASHA}, 'Synthetic Asha', 'asha@s1.test', 'x', 'student', 1), (${BILAL}, 'Synthetic Bilal', 'bilal@s1.test', 'x', 'student', 1)`);
  await db.exec(`INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (${ASHA}, 10), (${BILAL}, 10)`);
  const provider = new MockProvider(JSON.stringify(report));
  const app = express();
  app.use((req, res, next) => { req.user = USERS[req.headers['x-test-user']]; next(); }); // stands in for the host's auth
  app.use('/api', createLmsAssessmentAgentRouter({ express, database: db.sql, schema: db.schema, env, generationProvider: provider }), assessmentErrorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const as = (userId) => async (method, url, body) => {
    const r = await fetch(`${root}${url}`, {
      method, headers: { 'x-test-user': String(userId), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null, raw: text };
  };
  const stop = async () => { server.close(); await db.close(); };
  return { as, provider, stop, db };
}

/** Draft with one MCQ in class 10 (teacher1). */
async function draft(teacher, title) {
  const created = await teacher('POST', '/teacher/assessments', { title, subject: 'Maths', classroomId: IDS.class10 });
  assert.equal(created.status, 201);
  const id = created.body.assessment.id;
  assert.equal((await teacher('POST', `/teacher/assessments/${id}/questions`, mcq())).status, 201);
  return id;
}

describe('Assign to: selected students (migration 008)', { skip: SKIP }, () => {
  let srv; let teacher; let s1; let asha; let bilal;
  before(async () => {
    srv = await startServer();
    [teacher, s1, asha, bilal] = [IDS.teacher1, IDS.student1, ASHA, BILAL].map((u) => srv.as(u));
  });
  after(async () => srv && await srv.stop());

  it('the picker lists the class students (id + name only); another school\'s class is 404; students are refused', async () => {
    const r = await teacher('GET', `/teacher/classrooms/${IDS.class10}/students`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.students, [{ id: IDS.student1, name: 'Student One' }, { id: ASHA, name: 'Synthetic Asha' }, { id: BILAL, name: 'Synthetic Bilal' }]);
    assert.equal((await teacher('GET', `/teacher/classrooms/${IDS.class20}/students`)).status, 404);
    assert.equal((await s1('GET', `/teacher/classrooms/${IDS.class10}/students`)).status, 403);
  });

  it('no body = the whole class (unchanged behaviour)', async () => {
    const id = await draft(teacher, 'Whole class');
    const p = await teacher('POST', `/teacher/assessments/${id}/publish`);
    assert.equal(p.status, 200);
    assert.deepEqual(p.body.assessment.recipients, { mode: 'class', studentIds: [] });
    for (const st of [s1, asha, bilal]) assert.ok((await st('GET', '/student/assessments')).body.assessments.some((a) => a.id === id));
  });

  it('exactly the selected students see, open and start it; others get 404 everywhere; the teacher report lists only them', async () => {
    const id = await draft(teacher, 'Selected only');
    const p = await teacher('POST', `/teacher/assessments/${id}/publish`, { recipientIds: [ASHA, IDS.student1] });
    assert.equal(p.status, 200);
    assert.deepEqual(p.body.assessment.recipients, { mode: 'selected', studentIds: [IDS.student1, ASHA] });
    for (const st of [s1, asha]) {
      assert.ok((await st('GET', '/student/assessments')).body.assessments.some((a) => a.id === id));
      assert.equal((await st('GET', `/student/assessments/${id}`)).status, 200);
    }
    assert.equal((await asha('POST', `/student/assessments/${id}/attempt`)).status, 201);
    assert.equal((await bilal('GET', '/student/assessments')).body.assessments.some((a) => a.id === id), false);
    assert.equal((await bilal('GET', `/student/assessments/${id}`)).status, 404);
    assert.equal((await bilal('POST', `/student/assessments/${id}/attempt`)).status, 404);
    const report = await teacher('GET', `/teacher/assessments/${id}/report`);
    assert.deepEqual(report.body.report.students.map((s) => s.studentId).sort((a, b) => a - b), [IDS.student1, ASHA]);
    // The analytics of a non-recipient do not count the test (not "pending"/"missed" for Bilal).
    const titlesFor = async (sid) => (await teacher('GET', `/teacher/students/${sid}/performance`)).body.metrics.history.map((h) => h.title);
    assert.equal((await titlesFor(BILAL)).includes('Selected only'), false);
    assert.equal((await titlesFor(ASHA)).includes('Selected only'), true);
  });

  it('selecting every student of the class is stored as "whole class"', async () => {
    const id = await draft(teacher, 'All selected');
    const p = await teacher('POST', `/teacher/assessments/${id}/publish`, { recipientIds: [IDS.student1, ASHA, BILAL] });
    assert.deepEqual(p.body.assessment.recipients, { mode: 'class', studentIds: [] });
  });

  it('rejects invalid selections (and nothing is published)', async () => {
    const id = await draft(teacher, 'Invalid selections');
    const codeOf = async (body) => { const r = await teacher('POST', `/teacher/assessments/${id}/publish`, body); return `${r.status}:${(r.body.error.details[0] || {}).code}`; };
    assert.equal(await codeOf({ recipientIds: [IDS.student2] }), '400:NOT_IN_CLASS'); // class 11
    assert.equal(await codeOf({ recipientIds: [IDS.student3] }), '400:NOT_IN_CLASS'); // other school
    assert.equal(await codeOf({ recipientIds: [] }), '400:SELECT_AT_LEAST_ONE');
    assert.equal(await codeOf({ recipientIds: ['4'] }), '400:INVALID_ID');
    assert.equal(await codeOf({ recipientIds: [ASHA, ASHA] }), '400:DUPLICATE');
    assert.equal(await codeOf({ recipientIds: [ASHA], classroomId: 11 }), '400:UNKNOWN_FIELD');
    assert.equal((await teacher('GET', `/teacher/assessments/${id}`)).body.assessment.status, 'draft');
  });

  it('unpublish + republish to the whole class clears the earlier selection', async () => {
    const id = await draft(teacher, 'Republish');
    await teacher('POST', `/teacher/assessments/${id}/publish`, { recipientIds: [ASHA] });
    assert.equal((await teacher('POST', `/teacher/assessments/${id}/unpublish`)).status, 200);
    const p = await teacher('POST', `/teacher/assessments/${id}/publish`);
    assert.deepEqual(p.body.assessment.recipients, { mode: 'class', studentIds: [] });
    assert.equal((await bilal('GET', `/student/assessments/${id}`)).status, 200);
  });
});

describe('Shared AI Performance Reports (migration 008)', { skip: SKIP }, () => {
  let srv; let teacher; let teacher2; let s1; let asha; let other;
  let reportId;
  before(async () => {
    srv = await startServer();
    [teacher, teacher2, s1, asha, other] = [IDS.teacher1, IDS.teacher2, IDS.student1, ASHA, IDS.student3].map((u) => srv.as(u));
    const id = await draft(teacher, 'Finished test');
    await teacher('POST', `/teacher/assessments/${id}/publish`);
    const { body } = await s1('POST', `/student/assessments/${id}/attempt`);
    await s1('PUT', `/student/attempts/${body.attempt.id}/answers/${body.attempt.questions[0].id}`, { optionPosition: 1 });
    await s1('POST', `/student/attempts/${body.attempt.id}/submit`);
  });
  after(async () => srv && await srv.stop());

  it('generating a report (ONE explicit AI call) stores it and returns its id', async () => {
    const r = await teacher('POST', `/teacher/students/${IDS.student1}/performance/analysis`);
    assert.equal(r.status, 200);
    assert.equal(r.body.analysis.status, 'ok');
    assert.ok(Number.isInteger(r.body.analysis.reportId));
    assert.equal(srv.provider.calls.length, 1);
    reportId = r.body.analysis.reportId;
  });

  it('before it is shared, the student sees no notification and cannot open it (404)', async () => {
    assert.deepEqual((await s1('GET', '/student/performance-reports')).body.reports, []);
    assert.equal((await s1('GET', `/student/performance-reports/${reportId}`)).status, 404);
  });

  it('only the teacher who generated it can send it; students cannot', async () => {
    assert.equal((await teacher2('POST', `/teacher/performance-reports/${reportId}/share`)).status, 404);
    assert.equal((await s1('POST', `/teacher/performance-reports/${reportId}/share`)).status, 403);
    assert.equal((await teacher('POST', '/teacher/performance-reports/999999/share')).status, 404);
    assert.equal((await teacher('POST', `/teacher/performance-reports/${reportId}/share`, { studentId: ASHA })).status, 400); // no body accepted
  });

  it('"Send to Student" shares it once (a second click changes nothing)', async () => {
    const first = await teacher('POST', `/teacher/performance-reports/${reportId}/share`);
    assert.equal(first.status, 200);
    assert.equal(first.body.alreadyShared, false);
    assert.equal(first.body.report.studentId, IDS.student1);
    const second = await teacher('POST', `/teacher/performance-reports/${reportId}/share`);
    assert.deepEqual([second.status, second.body.alreadyShared, second.body.report.sharedAt], [200, true, first.body.report.sharedAt]);
  });

  it('the student gets ONE notification: a reference only (no report content, no PDF bytes)', async () => {
    const r = await s1('GET', '/student/performance-reports');
    assert.equal(r.body.reports.length, 1);
    const n = r.body.reports[0];
    assert.deepEqual(Object.keys(n).sort(), ['focusLabel', 'id', 'message', 'read', 'sharedAt', 'teacherName', 'title']);
    assert.deepEqual([n.id, n.title, n.message, n.teacherName, n.read], [reportId, 'New Performance Report', 'Your teacher has shared an AI Performance Report with you.', 'Teacher One', false]);
    assert.ok(r.raw.length < 600);
    assert.equal(/%PDF|JVBER|executiveSummary/.test(r.raw), false);
  });

  it('the student downloads THEIR report data (no AI call, no internal fields) and it is marked read', async () => {
    const calls = srv.provider.calls.length;
    const r = await s1('GET', `/student/performance-reports/${reportId}`);
    assert.equal(r.status, 200);
    const rep = r.body.report;
    assert.deepEqual(rep.student, { name: 'Student One', classes: [{ name: 'Grade 10 - A' }] });
    assert.deepEqual(rep.scope, { assessments: 1, subjects: ['Maths'] });
    assert.ok(rep.ai.content.executiveSummary && rep.ai.content.mentorActions.length >= 1);
    assert.equal('preview' in rep.ai, false);
    assert.equal(/provider|mock|teacherId|teacher_id|prompt|evidenceRecords/i.test(JSON.stringify(Object.keys(rep)) + JSON.stringify(Object.keys(rep.ai))), false);
    assert.equal(srv.provider.calls.length, calls); // zero AI calls
    assert.equal((await s1('GET', '/student/performance-reports')).body.reports[0].read, true);
    await s1('GET', `/student/performance-reports/${reportId}`);
    assert.equal(srv.provider.calls.length, calls);
  });

  it('another student (same or other school) and teachers cannot open it; bad ids are 404', async () => {
    assert.equal((await asha('GET', `/student/performance-reports/${reportId}`)).status, 404);
    assert.equal((await other('GET', `/student/performance-reports/${reportId}`)).status, 404);
    assert.deepEqual((await asha('GET', '/student/performance-reports')).body.reports, []);
    assert.equal((await teacher('GET', `/student/performance-reports/${reportId}`)).status, 403);
    for (const bad of ['0', 'abc', '1e3', `${reportId}.0`]) assert.equal((await s1('GET', `/student/performance-reports/${bad}`)).status, 404, bad);
  });
});

describe('Shared reports keep the PREVIEW warning (plain messages only)', { skip: SKIP }, () => {
  it('a preview report is stored with its warnings and the student receives them', async () => {
    const report = reportFor({ labels: ['A1'], subject: 'Maths', difficulty: 'unspecified', limited: true });
    report.executiveSummary.interpretation = 'The student answered 17 hard questions.'; // INVENTED_NUMBER
    const srv = await startServer({ env: { AIA_REPORT_PREVIEW_MODE: 'true' }, report });
    try {
      const [teacher, s1] = [srv.as(IDS.teacher1), srv.as(IDS.student1)];
      const id = await draft(teacher, 'Preview test');
      await teacher('POST', `/teacher/assessments/${id}/publish`);
      const { body } = await s1('POST', `/student/assessments/${id}/attempt`);
      await s1('POST', `/student/attempts/${body.attempt.id}/submit`);
      const gen = await teacher('POST', `/teacher/students/${IDS.student1}/performance/analysis`);
      assert.equal(gen.body.analysis.preview.validated, false);
      await teacher('POST', `/teacher/performance-reports/${gen.body.analysis.reportId}/share`);
      const rep = (await s1('GET', `/student/performance-reports/${gen.body.analysis.reportId}`)).body.report;
      assert.equal(rep.ai.preview.validated, false);
      assert.ok(rep.ai.preview.warnings.length >= 1);
      for (const w of rep.ai.preview.warnings) assert.deepEqual(Object.keys(w), ['message']); // no codes / sections
    } finally {
      await srv.stop();
    }
  });
});

describe('Before migration 008 (live schema today): everything else works unchanged', { skip: SKIP }, () => {
  it('publish to the class works, selection is 503, the report is generated but not storable, sharing is 503', async () => {
    const srv = await startServer({ dbOptions: { withRecipientsReports: false } });
    try {
      const [teacher, s1] = [srv.as(IDS.teacher1), srv.as(IDS.student1)];
      const id = await draft(teacher, 'Pre-008');
      const sel = await teacher('POST', `/teacher/assessments/${id}/publish`, { recipientIds: [ASHA] });
      assert.deepEqual([sel.status, sel.body.error.code], [503, 'RECIPIENTS_NOT_READY']);
      const p = await teacher('POST', `/teacher/assessments/${id}/publish`);
      assert.deepEqual([p.status, p.body.assessment.recipients.mode], [200, 'class']);
      const { body } = await s1('POST', `/student/assessments/${id}/attempt`);
      await s1('POST', `/student/attempts/${body.attempt.id}/submit`);
      const gen = await teacher('POST', `/teacher/students/${IDS.student1}/performance/analysis`);
      assert.deepEqual([gen.status, gen.body.analysis.status, gen.body.analysis.reportId], [200, 'ok', null]);
      assert.equal((await teacher('POST', '/teacher/performance-reports/1/share')).status, 503);
      assert.deepEqual((await s1('GET', '/student/performance-reports')).body.reports, []);
    } finally {
      await srv.stop();
    }
  });
});
