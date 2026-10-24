// Descriptive Assignments, Prompt 2: AI-assisted evaluation over HTTP through the REAL LMS session checks.
// TEMP databases/directories, FAKE provider (counts calls; no network). The live DB is never opened.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IDS, createLmsTestDb } = require('../helpers/lmsTestDb');
const { MockProvider, providerError } = require('../helpers/mockProvider');
const { syntheticPdf } = require('../helpers/syntheticPdf');

const SERVER = path.resolve(__dirname, '../../../../server');
const HOST_PRESENT = fs.existsSync(path.join(SERVER, 'middleware', 'authMiddleware.js')) && fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));

const ANSWER_PDF = syntheticPdf('Name: Student One, st1@s1.test, Grade 10 - A\nQ1: Plants use light energy to turn carbon dioxide and water into glucose and oxygen.\nQ2: Light intensity limits the rate.');
const AI = (over = {}) => JSON.stringify({
  questions: [
    { questionId: 'Q1', marksAwarded: 4, maxMarks: 5, feedback: 'Correct overall equation; the role of chlorophyll is not explained.' },
    { questionId: 'Q2', marksAwarded: 2, maxMarks: 3, feedback: 'Names a valid limiting factor without explaining its effect.' },
  ],
  totalMarksAwarded: 6, totalMarks: 8,
  overallFeedback: 'Relevant, accurate answers that need more explanation.',
  limitations: ['Answers are short, so depth of understanding is hard to judge.'],
  ...over,
});

describe('LMS HTTP integration: AI-assisted assignment evaluation', { skip: !HOST_PRESENT && 'host LMS server not found' }, () => {
  let base, noAiBase, servers = [], dbFile, signToken, uploadDir, aid, otherAid;
  let respond = () => AI();
  const provider = new MockProvider((req) => respond(req));

  before(async () => {
    process.env.JWT_SECRET = 'aia-assignment-eval-secret-' + 'e'.repeat(40);
    dbFile = await createLmsTestDb();
    const d = dbFile;
    for (const [id, name] of [[41, 'Classmate Unreadable'], [42, 'Classmate Long']]) {
      // approved accounts: the LMS's real authMiddleware signs in only approved users
      await d.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, 'x', 'student', 1, 1)", [id, name, `c${id}@s1.test`]);
      await d.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, 10)', [id]);
    }
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aia-eval-uploads-'));
    const lmsDb = dbFile.hostDatabase();
    for (const mod of ['config/database-switch.js']) {
      const file = path.join(SERVER, mod);
      require.cache[file] = { id: file, filename: file, loaded: true, exports: lmsDb };
    }
    const express = require(path.join(SERVER, 'node_modules', 'express'));
    ({ signToken } = require(path.join(SERVER, 'config', 'jwt')));
    const requireAuth = require(path.join(SERVER, 'middleware', 'authMiddleware'));
    const requireTenant = require(path.join(SERVER, 'middleware', 'requireTenant'));
    const { createLmsAssessmentAgentRouter, assessmentErrorHandler } = require('../../backend/src/integration/lmsAssessmentAgent');
    const start = (opts) => new Promise((resolve) => {
      const app = express();
      app.use('/api/assessment-agent', requireAuth, requireTenant,
        createLmsAssessmentAgentRouter({ express, database: dbFile.sql, schema: dbFile.schema, submissionsDir: path.join(uploadDir, 'submissions'), ...opts }), assessmentErrorHandler);
      const s = app.listen(0, '127.0.0.1', () => { servers.push(s); resolve(`http://127.0.0.1:${s.address().port}/api/assessment-agent`); });
    });
    base = await start({ env: {}, generationProvider: provider });
    noAiBase = await start({ env: { SOA_GEMINI_API_KEY: '' } });
  });

  after(async () => {
    for (const s of servers) s.close();
    await dbFile.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  const token = (userId, universityId, role) => signToken({ userId, universityId, role, email: 'x@test', name: 'x' }, { expiresIn: '10m' });
  const T1 = () => token(IDS.teacher1, IDS.school1, 'mentor');
  const T2 = () => token(IDS.teacher2, IDS.school1, 'mentor');
  const T3 = () => token(IDS.teacher3, IDS.school2, 'mentor');
  const S = (id = IDS.student1) => token(id, IDS.school1, 'student');
  const ADMIN = () => token(IDS.admin1, IDS.school1, 'admin');
  async function call(method, url, { auth, body, raw, root = base } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${auth}`;
    let payload;
    if (raw !== undefined) { headers['Content-Type'] = 'application/pdf'; payload = raw; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(root + url, { method, headers, body: payload });
    const text = await res.text();
    return { status: res.status, text, body: text && (res.headers.get('content-type') || '').includes('json') ? JSON.parse(text) : null };
  }
  const subOf = async (studentName, id = aid) => (await call('GET', `/teacher/assignments/${id}/submissions`, { auth: T1() })).body.students.find((s) => s.studentName === studentName).submission;
  const evalUrl = (sid, id = aid) => `/teacher/assignments/${id}/submissions/${sid}/evaluate-ai`;

  it('setup: published assignment (Q1 5 + Q2 3 = 8); student uploads a PDF - ZERO provider calls so far', async () => {
    const mk = async (title) => {
      const a = (await call('POST', '/teacher/assignments', { auth: T1(), body: { title, instructions: 'Answer both questions. Questions: t1@s1.test', classroomId: IDS.class10, maxMarks: 8 } })).body.assignment;
      await call('PUT', `/teacher/assignments/${a.id}/questions`, { auth: T1(), body: { questions: [{ text: 'Explain photosynthesis.', maxMarks: 5 }, { text: 'Name a limiting factor.', maxMarks: 3 }] } });
      await call('POST', `/teacher/assignments/${a.id}/publish`, { auth: T1() });
      return a.id;
    };
    aid = await mk('Secrettitle Photosynthesis');
    otherAid = await mk('Other assignment');
    assert.equal((await call('PUT', `/student/assignments/${aid}/submission?filename=answer.pdf`, { auth: S(), raw: ANSWER_PDF })).status, 201);
    assert.equal(provider.calls.length, 0);
  });

  it('opening the dashboard, downloading the PDF, student pages, assignment detail => ZERO provider calls', async () => {
    const sub = await subOf('Student One');
    assert.equal(sub.aiEvaluation, null);
    await call('GET', `/teacher/assignments/${aid}/submissions/${sub.id}/file`, { auth: T1() });
    await call('GET', `/teacher/assignments/${aid}`, { auth: T1() });
    await call('GET', '/teacher/assignments', { auth: T1() });
    await call('GET', `/student/assignments/${aid}`, { auth: S() });
    await call('GET', '/student/assignments', { auth: S() });
    assert.equal(provider.calls.length, 0);
  });

  it('authorization: 401 / student 403 / admin 403 / other teacher 404 / other school 404 / missing or foreign submission 404 / body 400 - no calls', async () => {
    const sid = (await subOf('Student One')).id;
    assert.equal((await call('POST', evalUrl(sid))).status, 401);
    for (const auth of [S(), ADMIN()]) assert.equal((await call('POST', evalUrl(sid), { auth })).status, 403);
    for (const auth of [T2(), T3()]) assert.equal((await call('POST', evalUrl(sid), { auth })).status, 404);
    assert.equal((await call('POST', evalUrl(999999), { auth: T1() })).body.error.code, 'SUBMISSION_NOT_FOUND');
    assert.equal((await call('POST', evalUrl(sid, otherAid), { auth: T1() })).body.error.code, 'SUBMISSION_NOT_FOUND'); // not this assignment's
    const body = await call('POST', evalUrl(sid), { auth: T1(), body: { marks: 8 } });
    assert.equal(body.status, 400);
    assert.equal(provider.calls.length, 0);
  });

  it('Evaluate with AI: exactly ONE provider call; privacy-safe payload; suggestion stored in ai_* only; final marks untouched', async () => {
    const sid = (await subOf('Student One')).id;
    const r = await call('POST', evalUrl(sid), { auth: T1() });
    assert.equal(r.status, 200);
    assert.equal(provider.calls.length, 1);
    assert.deepEqual([r.body.evaluation.suggestedTotal, r.body.evaluation.questions.map((q) => [q.questionId, q.marksAwarded, q.maxMarks])], [6, [['Q1', 4, 5], ['Q2', 2, 3]]]);
    assert.deepEqual([r.body.submission.status, r.body.submission.finalMarks], ['submitted', null]);
    const sent = JSON.stringify(provider.calls[0]);
    for (const leak of ['Student One', 'st1@s1.test', 't1@s1.test', 'Teacher One', 'School One', 'Grade 10 - A', 'Secrettitle', uploadDir.replace(/\\/g, '\\\\'), '.pdf', `"${IDS.student1}"`]) {
      assert.equal(sent.includes(leak), false, `leaked: ${leak}`);
    }
    const data = JSON.parse(provider.calls[0].prompt.replace(/^[^\n]*\n/, ''));
    assert.deepEqual(data.assignment.questions, [{ id: 'Q1', text: 'Explain photosynthesis.', maxMarks: 5 }, { id: 'Q2', text: 'Name a limiting factor.', maxMarks: 3 }]);
    assert.match(data.studentAnswer, /^Name: \[student\], \[email\], \[redacted\]\nQ1: Plants use light energy/);
    const db = dbFile;
    const row = await db.get('SELECT status, ai_marks, ai_feedback, ai_question_marks_json, ai_limitations_json, ai_evaluated_at, final_marks, teacher_feedback, final_question_marks_json FROM aia_assignment_submissions WHERE id = ?', [sid]);
    assert.deepEqual([row.status, row.ai_marks, !!row.ai_evaluated_at, JSON.parse(row.ai_limitations_json).length], ['submitted', 6, true, 1]);
    assert.deepEqual([row.final_marks, row.teacher_feedback, row.final_question_marks_json], [null, null, null]);
  });

  it('students never see AI suggestions (list, detail, file endpoint)', async () => {
    for (const url of [`/student/assignments/${aid}`, '/student/assignments']) {
      const r = await call('GET', url, { auth: S() });
      for (const key of ['aiEvaluation', 'aiMarks', 'aiFeedback', 'suggestedTotal', 'limitations', 'marksAwarded', 'Correct overall equation']) {
        assert.equal(r.text.includes(key), false, `${url}: ${key}`);
      }
    }
  });

  it('teacher edits the suggestion and saves: FINAL marks are the teacher\'s (authoritative); the AI suggestion stays separate', async () => {
    const sid = (await subOf('Student One')).id;
    const bad = await call('PUT', `/teacher/assignments/${aid}/submissions/${sid}/evaluation`, { auth: T1(), body: { questionMarks: [{ questionId: 'Q1', marks: 5.5 }, { questionId: 'Q2', marks: 2 }] } });
    assert.equal(bad.body.error.details[0].code, 'OUT_OF_RANGE');
    assert.equal((await call('PUT', `/teacher/assignments/${aid}/submissions/${sid}/evaluation`, { auth: T1(), body: { questionMarks: [{ questionId: 'Q1', marks: 3 }] } })).body.error.details[0].code, 'MISSING_QUESTION');
    assert.equal((await call('PUT', `/teacher/assignments/${aid}/submissions/${sid}/evaluation`, { auth: T1(), body: { finalMarks: 7, questionMarks: [{ questionId: 'Q1', marks: 5 }, { questionId: 'Q2', marks: 2.5 }] } })).body.error.details[0].code, 'TOTAL_MISMATCH');
    const ok = await call('PUT', `/teacher/assignments/${aid}/submissions/${sid}/evaluation`, { auth: T1(), body: { questionMarks: [{ questionId: 'Q1', marks: 5 }, { questionId: 'Q2', marks: 2.5 }], teacherFeedback: 'Good explanation; expand Q2.' } });
    assert.deepEqual([ok.status, ok.body.submission.status, ok.body.submission.finalMarks, ok.body.submission.aiEvaluation.suggestedTotal], [200, 'evaluated', 7.5, 6]);
    const mine = (await call('GET', `/student/assignments/${aid}`, { auth: S() })).body.assignment.submission;
    assert.deepEqual([mine.finalMarks, mine.teacherFeedback, mine.questionMarks], [7.5, 'Good explanation; expand Q2.', [{ questionId: 'Q1', marks: 5 }, { questionId: 'Q2', marks: 2.5 }]]);
    assert.equal('aiEvaluation' in mine, false);
  });

  it('re-evaluating replaces ONLY the AI suggestion (+1 call); teacher final marks stay', async () => {
    const sid = (await subOf('Student One')).id;
    const before = provider.calls.length;
    respond = () => AI({ questions: [{ questionId: 'Q1', marksAwarded: 3, maxMarks: 5, feedback: 'Partly correct.' }, { questionId: 'Q2', marksAwarded: 1, maxMarks: 3, feedback: 'Too brief.' }], totalMarksAwarded: 4 });
    const r = await call('POST', evalUrl(sid), { auth: T1() });
    respond = () => AI();
    assert.deepEqual([r.status, provider.calls.length - before, r.body.evaluation.suggestedTotal, r.body.submission.finalMarks, r.body.submission.status], [200, 1, 4, 7.5, 'evaluated']);
  });

  it('invalid AI output (unknown id / duplicate / above max / negative / wrong total / forbidden content) -> 422, nothing saved', async () => {
    const sid = (await subOf('Student One')).id;
    const q = JSON.parse(AI()).questions;
    for (const over of [
      { questions: [q[0], { ...q[1], questionId: 'Q7' }] },
      { questions: [q[0], q[0]], totalMarksAwarded: 8 },
      { questions: [{ ...q[0], marksAwarded: 6 }, q[1]], totalMarksAwarded: 8 },
      { questions: [{ ...q[0], marksAwarded: -1 }, q[1]], totalMarksAwarded: 1 },
      { totalMarksAwarded: 7 },
      { overallFeedback: 'The student is lazy and will fail the exam.' },
    ]) {
      respond = () => AI(over);
      const r = await call('POST', evalUrl(sid), { auth: T1() });
      assert.deepEqual([r.status, r.body.error.code], [422, 'AI_OUTPUT_REJECTED'], JSON.stringify(over).slice(0, 80));
      assert.equal(r.text.includes('lazy'), false);
    }
    respond = () => AI();
    const sub = await subOf('Student One');
    assert.deepEqual([sub.aiEvaluation.suggestedTotal, sub.finalMarks], [4, 7.5]); // previous suggestion and final marks unchanged
  });

  it('concurrent evaluation (double-click) -> the second gets 429 and only ONE provider call is made', async () => {
    const sid = (await subOf('Student One')).id;
    const before = provider.calls.length;
    let finish;
    respond = () => new Promise((resolve) => { finish = () => resolve(AI()); });
    const first = call('POST', evalUrl(sid), { auth: T1() });
    while (!finish) await new Promise((r) => setTimeout(r, 5));
    const second = await call('POST', evalUrl(sid), { auth: T1() });
    assert.deepEqual([second.status, second.body.error.code], [429, 'GENERATION_IN_PROGRESS']);
    finish();
    assert.equal((await first).status, 200);
    respond = () => AI();
    assert.equal(provider.calls.length - before, 1);
  });

  it('provider 429 and 5xx -> safe errors, nothing saved, no provider text', async () => {
    const sid = (await subOf('Student One')).id;
    for (const [err, status, codeName] of [[providerError('RATE_LIMITED', 429), 429, 'AI_RATE_LIMITED'], [providerError('UNAVAILABLE', 503), 503, 'AI_UNAVAILABLE']]) {
      respond = () => err;
      const r = await call('POST', evalUrl(sid), { auth: T1() });
      assert.deepEqual([r.status, r.body.error.code], [status, codeName]);
      assert.equal(r.text.includes('provider failed'), false);
    }
    respond = () => AI();
  });

  it('unreadable PDF and oversized text fail safely BEFORE the provider; AI unavailable -> 503 without reading anything', async () => {
    assert.equal((await call('PUT', `/student/assignments/${aid}/submission?filename=blank.pdf`, { auth: S(41), raw: syntheticPdf('') })).status, 201);
    assert.equal((await call('PUT', `/student/assignments/${aid}/submission?filename=long.pdf`, { auth: S(42), raw: syntheticPdf('many words here '.repeat(1800)) })).status, 201);
    const before = provider.calls.length;
    const unreadable = await call('POST', evalUrl((await subOf('Classmate Unreadable')).id), { auth: T1() });
    assert.deepEqual([unreadable.status, unreadable.body.error.code, unreadable.body.error.message], [422, 'PDF_TEXT_UNREADABLE', 'Unable to extract readable text from this PDF.']);
    const long = await call('POST', evalUrl((await subOf('Classmate Long')).id), { auth: T1() });
    assert.deepEqual([long.status, long.body.error.code], [422, 'DOCUMENT_TOO_LARGE']);
    assert.equal(provider.calls.length, before);
    const noAi = await call('POST', evalUrl((await subOf('Student One')).id), { auth: T1(), root: noAiBase });
    assert.deepEqual([noAi.status, noAi.body.error.code], [503, 'AI_NOT_CONFIGURED']);
  });

  it('a replaced upload clears the stale AI suggestion (it described the old file)', async () => {
    assert.equal((await call('PUT', `/student/assignments/${aid}/submission?filename=fixed.pdf`, { auth: S(41), raw: ANSWER_PDF })).status, 200);
    const sid = (await subOf('Classmate Unreadable')).id;
    assert.equal((await call('POST', evalUrl(sid), { auth: T1() })).status, 200);
    assert.ok((await subOf('Classmate Unreadable')).aiEvaluation);
    assert.equal((await call('PUT', `/student/assignments/${aid}/submission?filename=v3.pdf`, { auth: S(41), raw: ANSWER_PDF })).status, 200);
    assert.equal((await subOf('Classmate Unreadable')).aiEvaluation, null);
  });

  it('existing manual marking (finalMarks only) still works', async () => {
    const sid = (await subOf('Classmate Long')).id;
    const r = await call('PUT', `/teacher/assignments/${aid}/submissions/${sid}/evaluation`, { auth: T1(), body: { finalMarks: 3, teacherFeedback: 'Too long; please summarise.' } });
    assert.deepEqual([r.status, r.body.submission.finalMarks, r.body.submission.questionMarks], [200, 3, null]);
  });

  it('never touched the live LMS database', () => {
    assert.equal(sqliteLoaded(), false, 'a SQLite driver was loaded');
  });
});
