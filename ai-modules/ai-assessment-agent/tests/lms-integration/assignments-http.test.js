// Descriptive Assignments over HTTP through the REAL LMS session checks (authMiddleware + requireTenant, signed JWTs).
// TEMP databases and a TEMP submission directory; a FAKE provider whose call count must stay ZERO (no AI in this step).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { IDS, createLmsTestDb } = require('../helpers/lmsTestDb');
const { MockProvider } = require('../helpers/mockProvider');
const { syntheticPdf } = require('../helpers/syntheticPdf');

const SERVER = path.resolve(__dirname, '../../../../server');
const HOST_PRESENT = fs.existsSync(path.join(SERVER, 'middleware', 'authMiddleware.js')) && fs.existsSync(path.join(SERVER, 'node_modules', 'express'));
const sqliteLoaded = () => Object.keys(require.cache).some((file) => /node_modules[\\/](sqlite3|better-sqlite3)[\\/]/.test(file));
const PDF = syntheticPdf('Synthetic answer: photosynthesis converts light energy.');

describe('LMS HTTP integration: Descriptive Assignments', { skip: !HOST_PRESENT && 'host LMS server not found' }, () => {
  let base, legacyBase, servers = [], files = [], signToken, uploadDir;
  const provider = new MockProvider(() => { throw new Error('NO AI CALL IS ALLOWED IN THIS STEP'); });

  before(async () => {
    process.env.JWT_SECRET = 'aia-assignments-integration-secret-' + 'a'.repeat(40);
    const full = await createLmsTestDb();
    const legacy = await createLmsTestDb({ withAssignments: false });
    files.push(full, legacy);
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aia-assign-uploads-'));
    const lmsDb = full.hostDatabase();
    for (const mod of ['config/database-switch.js']) {
      const file = path.join(SERVER, mod);
      require.cache[file] = { id: file, filename: file, loaded: true, exports: lmsDb };
    }
    const express = require(path.join(SERVER, 'node_modules', 'express'));
    ({ signToken } = require(path.join(SERVER, 'config', 'jwt')));
    const requireAuth = require(path.join(SERVER, 'middleware', 'authMiddleware'));
    const requireTenant = require(path.join(SERVER, 'middleware', 'requireTenant'));
    const { createLmsAssessmentAgentRouter, assessmentErrorHandler } = require('../../backend/src/integration/lmsAssessmentAgent');
    const start = (testDb) => new Promise((resolve) => {
      const app = express();
      app.use(express.json({ limit: '50mb' })); // like the host server: must not swallow PDF bodies
      app.use('/api/assessment-agent', requireAuth, requireTenant,
        createLmsAssessmentAgentRouter({ express, database: testDb.sql, schema: testDb.schema, env: {}, generationProvider: provider, submissionsDir: path.join(uploadDir, 'submissions') }), assessmentErrorHandler);
      const s = app.listen(0, '127.0.0.1', () => { servers.push(s); resolve(`http://127.0.0.1:${s.address().port}/api/assessment-agent`); });
    });
    base = await start(full);
    legacyBase = await start(legacy);
  });

  after(async () => {
    for (const s of servers) s.close();
    for (const f of files) { await f.close(); }
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  const token = (userId, universityId, role) => signToken({ userId, universityId, role, email: 'x@test', name: 'x' }, { expiresIn: '10m' });
  const T1 = () => token(IDS.teacher1, IDS.school1, 'mentor');
  const T2 = () => token(IDS.teacher2, IDS.school1, 'mentor');
  const T3 = () => token(IDS.teacher3, IDS.school2, 'mentor');
  const S1 = () => token(IDS.student1, IDS.school1, 'student');
  const S2 = () => token(IDS.student2, IDS.school1, 'student');
  const S3 = () => token(IDS.student3, IDS.school2, 'student');
  const ADMIN = () => token(IDS.admin1, IDS.school1, 'admin');
  async function call(method, url, { auth, body, raw, contentType, root = base } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${auth}`;
    let payload;
    if (raw !== undefined) { headers['Content-Type'] = contentType || 'application/pdf'; payload = raw; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(root + url, { method, headers, body: payload });
    const buf = Buffer.from(await res.arrayBuffer());
    const isJson = (res.headers.get('content-type') || '').includes('json');
    return { status: res.status, headers: res.headers, buf, body: isJson && buf.length ? JSON.parse(buf.toString('utf8')) : null, text: buf.toString('latin1') };
  }
  const upload = (id, { auth = S1(), raw = PDF, name = 'My Essay.pdf', contentType } = {}) =>
    call('PUT', `/student/assignments/${id}/submission?filename=${encodeURIComponent(name)}`, { auth, raw, contentType });
  const storedFiles = () => (fs.existsSync(path.join(uploadDir, 'submissions')) ? fs.readdirSync(path.join(uploadDir, 'submissions')) : []);

  let aid;
  it('teacher creates a draft, sets questions, publishes', async () => {
    const c = await call('POST', '/teacher/assignments', { auth: T1(), body: { title: 'Essay HTTP', instructions: 'Write clearly.', classroomId: IDS.class10, maxMarks: 10 } });
    assert.equal(c.status, 201);
    aid = c.body.assignment.id;
    const q = await call('PUT', `/teacher/assignments/${aid}/questions`, { auth: T1(), body: { questions: [{ text: 'Explain photosynthesis.', maxMarks: 6 }, { text: 'Name two pigments.', maxMarks: 4 }] } });
    assert.deepEqual([q.status, q.body.assignment.questionMarksTotal], [200, 10]);
    const p = await call('POST', `/teacher/assignments/${aid}/publish`, { auth: T1() });
    assert.deepEqual([p.status, p.body.assignment.status], [200, 'published']);
    assert.equal((await call('PUT', `/teacher/assignments/${aid}/questions`, { auth: T1(), body: { questions: [] } })).body.error.code, 'ASSIGNMENT_LOCKED');
  });

  it('authorization matrix: unauthenticated 401; students/admins 403 on teacher routes; other teacher/school 404; other school class 400', async () => {
    assert.equal((await call('GET', '/teacher/assignments')).status, 401);
    assert.equal((await call('GET', '/student/assignments')).status, 401);
    assert.equal((await upload(aid, { auth: null })).status, 401);
    for (const auth of [S1(), ADMIN()]) {
      assert.equal((await call('GET', '/teacher/assignments', { auth })).status, 403);
      assert.equal((await call('POST', '/teacher/assignments', { auth, body: { title: 'x', classroomId: IDS.class10, maxMarks: 5 } })).status, 403);
      assert.equal((await call('GET', `/teacher/assignments/${aid}/submissions`, { auth })).status, 403);
    }
    assert.equal((await call('GET', '/student/assignments', { auth: ADMIN() })).status, 403);
    assert.equal((await call('GET', '/student/assignments', { auth: T1() })).status, 403);
    for (const auth of [T2(), T3()]) {
      assert.equal((await call('GET', `/teacher/assignments/${aid}`, { auth })).status, 404);
      assert.equal((await call('GET', `/teacher/assignments/${aid}/submissions`, { auth })).status, 404);
      assert.equal((await call('POST', `/teacher/assignments/${aid}/close`, { auth })).status, 404);
    }
    const otherClass = await call('POST', '/teacher/assignments', { auth: T1(), body: { title: 'x', classroomId: IDS.class20, maxMarks: 5 } });
    assert.deepEqual([otherClass.status, otherClass.body.error.details[0].code], [400, 'CLASSROOM_NOT_FOUND']);
  });

  it('forged owner / school / student / status fields are rejected (400), never applied', async () => {
    for (const forged of [{ teacherId: IDS.teacher2 }, { ownerId: 2 }, { universityId: IDS.school2 }, { schoolId: 2 }, { status: 'published' }, { studentId: 5 }]) {
      const r = await call('POST', '/teacher/assignments', { auth: T1(), body: { title: 'Forged', classroomId: IDS.class10, maxMarks: 5, ...forged } });
      assert.deepEqual([r.status, r.body.error.details[0].code], [400, 'UNKNOWN_FIELD'], JSON.stringify(forged));
    }
    // a forged studentId in the upload URL/query is ignored: the session decides whose submission it is
    const r = await call('PUT', `/student/assignments/${aid}/submission?filename=x.pdf&studentId=${IDS.student2}`, { auth: S1(), raw: PDF });
    assert.equal(r.status, 201);
    const dash = await call('GET', `/teacher/assignments/${aid}/submissions`, { auth: T1() });
    assert.deepEqual(dash.body.students.filter((s) => s.submission).map((s) => s.studentId), [IDS.student1]);
  });

  it('student visibility: own class only (other class / school 404); list shows status', async () => {
    const list = await call('GET', '/student/assignments', { auth: S1() });
    assert.deepEqual(list.body.assignments.map((a) => [a.title, a.myStatus]), [['Essay HTTP', 'submitted']]);
    for (const auth of [S2(), S3()]) {
      assert.equal((await call('GET', `/student/assignments/${aid}`, { auth })).status, 404);
      assert.equal((await upload(aid, { auth })).status, 404);
    }
  });

  it('upload validation: MIME, magic bytes, empty, corrupt, oversized, bad name, active content; nothing stored', async () => {
    const before = storedFiles().length;
    const cases = [
      [{ contentType: 'text/html', raw: Buffer.from('<script>alert(1)</script>') }, 415, 'INVALID_FILE_TYPE'],
      [{ contentType: 'application/octet-stream' }, 415, 'INVALID_FILE_TYPE'],
      [{ raw: Buffer.from(`GIF89a${' '.repeat(200)}%%EOF`) }, 415, 'INVALID_FILE_TYPE'],
      [{ raw: Buffer.alloc(0) }, 400, 'EMPTY_FILE'],
      [{ raw: PDF.subarray(0, PDF.length - 50) }, 400, 'CORRUPT_FILE'],
      [{ name: 'essay.exe' }, 400, 'INVALID_FILE_NAME'],
      [{ raw: Buffer.from(PDF.toString('latin1').replace('/Type /Catalog', '/Type /Catalog /OpenAction << /S /JavaScript >>'), 'latin1') }, 400, 'ACTIVE_CONTENT'],
    ];
    for (const [opts, status, codeName] of cases) {
      const r = await upload(aid, opts);
      assert.deepEqual([r.status, r.body && r.body.error.code], [status, codeName], JSON.stringify({ ...opts, raw: undefined }));
    }
    const big = await upload(aid, { raw: Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]) });
    assert.equal(big.status, 413);
    assert.equal(storedFiles().length, before);
  });

  it('path traversal in the filename is neutralized: stored under a server key inside the store; display name only', async () => {
    const r = await upload(aid, { name: '../../../../etc/evil.pdf' });
    assert.deepEqual([r.status, r.body.replaced, r.body.submission.originalFilename, r.body.submission.version], [200, true, 'evil.pdf', 2]);
    assert.equal(r.text.includes(uploadDir) || r.text.includes('storageKey'), false);
    assert.deepEqual(storedFiles().length, 1); // the replaced file was deleted; only the current one exists
    assert.match(storedFiles()[0], /^[0-9a-f-]{36}\.pdf$/);
  });

  it('downloads: teacher (own assignment) and student (own file) get the exact PDF as an attachment; others cannot', async () => {
    const dash = await call('GET', `/teacher/assignments/${aid}/submissions`, { auth: T1() });
    const sid = dash.body.students.find((s) => s.submission).submission.id;
    const t = await call('GET', `/teacher/assignments/${aid}/submissions/${sid}/file`, { auth: T1() });
    assert.equal(t.status, 200);
    assert.deepEqual(t.buf, PDF);
    assert.equal(t.headers.get('content-type'), 'application/pdf');
    assert.match(t.headers.get('content-disposition'), /^attachment; filename="evil\.pdf"/);
    assert.equal(t.headers.get('x-content-type-options'), 'nosniff');
    assert.match(t.headers.get('content-security-policy'), /sandbox/);
    const s = await call('GET', `/student/assignments/${aid}/submission/file`, { auth: S1() });
    assert.deepEqual([s.status, s.buf.equals(PDF)], [200, true]);
    assert.equal((await call('GET', `/teacher/assignments/${aid}/submissions/${sid}/file`, { auth: T2() })).status, 404);
    assert.equal((await call('GET', `/teacher/assignments/${aid}/submissions/${sid}/file`, { auth: S1() })).status, 403);
    assert.equal((await call('GET', `/student/assignments/${aid}/submission/file`, { auth: S2() })).status, 404);
    assert.equal((await call('GET', `/teacher/assignments/${aid}/submissions/..%2F..%2Fetc/file`, { auth: T1() })).status, 404);
  });

  it('teacher dashboard: submitted vs not submitted; manual marks; evaluated submissions cannot be replaced', async () => {
    const dash = await call('GET', `/teacher/assignments/${aid}/submissions`, { auth: T1() });
    assert.deepEqual(dash.body.summary, { students: 1, submitted: 1, evaluated: 0, notSubmitted: 0, missed: 0 });
    const sid = dash.body.students[0].submission.id;
    const e = await call('PUT', `/teacher/assignments/${aid}/submissions/${sid}/evaluation`, { auth: T1(), body: { finalMarks: 8, teacherFeedback: 'Good.' } });
    assert.deepEqual([e.status, e.body.submission.status], [200, 'evaluated']);
    assert.equal((await upload(aid)).body.error.code, 'SUBMISSION_EVALUATED');
    const mine = await call('GET', `/student/assignments/${aid}`, { auth: S1() });
    assert.deepEqual([mine.body.assignment.myStatus, mine.body.assignment.submission.finalMarks], ['evaluated', 8]);
  });

  it('closing stops submissions', async () => {
    const c = await call('POST', '/teacher/assignments', { auth: T1(), body: { title: 'To close', classroomId: IDS.class10, maxMarks: 5 } });
    const id = c.body.assignment.id;
    await call('PUT', `/teacher/assignments/${id}/questions`, { auth: T1(), body: { questions: [{ text: 'Q', maxMarks: 5 }] } });
    await call('POST', `/teacher/assignments/${id}/publish`, { auth: T1() });
    assert.equal((await call('POST', `/teacher/assignments/${id}/close`, { auth: T1() })).status, 200);
    assert.equal((await upload(id)).body.error.code, 'ASSIGNMENT_CLOSED');
    assert.equal((await call('GET', '/student/assignments', { auth: S1() })).body.assignments.find((a) => a.id === id).myStatus, 'missed');
  });

  it('database without migration 007: assignment routes answer 503; assessments still work', async () => {
    const r = await call('GET', '/teacher/assignments', { auth: T1(), root: legacyBase });
    assert.deepEqual([r.status, r.body.error.code], [503, 'ASSIGNMENTS_NOT_READY']);
    assert.equal((await call('GET', '/teacher/assessments', { auth: T1(), root: legacyBase })).status, 200);
  });

  it('ZERO AI provider calls during the whole assignment flow', () => {
    assert.equal(provider.calls.length, 0);
  });

  it('never touched the live LMS database', () => {
    assert.equal(sqliteLoaded(), false, 'a SQLite driver was loaded');
  });
});
