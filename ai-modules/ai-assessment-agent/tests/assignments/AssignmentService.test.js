// Descriptive Assignments: rules through the real service + PostgreSQL adapter (throw-away database).
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { IDS, createLmsTestDb } = require('../helpers/lmsTestDb');
const { AssignmentService } = require('../../backend/src/assignments/AssignmentService');

const T1 = { userId: IDS.teacher1, universityId: IDS.school1, kind: 'teacher' };
const T2 = { userId: IDS.teacher2, universityId: IDS.school1, kind: 'teacher' };
const T3 = { userId: IDS.teacher3, universityId: IDS.school2, kind: 'teacher' };
const S1 = { userId: IDS.student1, universityId: IDS.school1, kind: 'student' }; // class 10
const S2 = { userId: IDS.student2, universityId: IDS.school1, kind: 'student' }; // class 11
const S3 = { userId: IDS.student3, universityId: IDS.school2, kind: 'student' }; // school 2
const T0 = Date.parse('2026-10-01T09:00:00.000Z');
const code = async (fn) => { try { await fn(); } catch (err) { return err.code; } assert.fail('expected an error'); };
const details = async (fn) => { try { await fn(); } catch (err) { return err.details.map((d) => `${d.field}:${d.code}`); } assert.fail('expected an error'); };

let db, svc, clock, keyN;
beforeEach(async () => {
  db = await createLmsTestDb();
  await db.exec("INSERT INTO users (id, name, email, password, role, university_id) VALUES (40, 'Second Student', 's40@s1.test', 'x', 'student', 1)");
  await db.exec('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (40, 10)');
  clock = T0;
  keyN = 0;
  svc = new AssignmentService({ adapter: db.adapter(), now: () => clock });
});

const QUESTIONS = [{ text: 'Explain photosynthesis.', maxMarks: 6 }, { text: 'Compare mitosis and meiosis.', maxMarks: 4 }];
const draft = async (over = {}) => await svc.create(T1, { title: 'Biology essay', instructions: 'Answer in full sentences.', classroomId: IDS.class10, maxMarks: 10, ...over });
async function published(over = {}) {
  const a = await draft(over);
  await svc.replaceQuestions(T1, a.id, { questions: QUESTIONS });
  return await svc.publish(T1, a.id);
}
const file = () => ({ storageKey: `0000000${keyN}-0000-4000-8000-00000000000${keyN++}.pdf`, originalFilename: 'answer.pdf', size: 1234, sha256: 'a'.repeat(64) });

describe('teacher: create, validate, edit drafts', () => {
  it('creates a draft owned by the session teacher in the session school (server-derived identity)', async () => {
    const a = await draft();
    assert.deepEqual([a.status, a.maxMarks, a.classroom.name, a.questionCount], ['draft', 10, 'Grade 10 - A', 0]);
    const row = await db.get('SELECT university_id, teacher_id, classroom_id, status FROM aia_assignments WHERE id = ?', [a.id]);
    assert.deepEqual({ ...row }, { university_id: 1, teacher_id: 1, classroom_id: 10, status: 'draft' });
  });

  it('validation: required fields, ranges, due date format; forged owner/school/status/student fields are rejected', async () => {
    assert.deepEqual(await details(async () => await svc.create(T1, {})), ['title:REQUIRED', 'classroomId:REQUIRED', 'maxMarks:OUT_OF_RANGE']);
    assert.ok((await details(async () => await draft({ maxMarks: 0 }))).includes('maxMarks:OUT_OF_RANGE'));
    assert.ok((await details(async () => await draft({ maxMarks: 12.5 }))).includes('maxMarks:OUT_OF_RANGE'));
    assert.ok((await details(async () => await draft({ dueAt: '2026-10-05 10:00' }))).includes('dueAt:INVALID_DATETIME'));
    for (const forged of ['teacherId', 'ownerId', 'universityId', 'schoolId', 'status', 'studentId', 'id']) {
      assert.deepEqual(await details(async () => await draft({ [forged]: 99 })), [`${forged}:UNKNOWN_FIELD`], forged);
    }
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_assignments')).n, 0);
  });

  it('class must be in the teacher\'s school (another school\'s class id is refused)', async () => {
    assert.deepEqual(await details(async () => await draft({ classroomId: IDS.class20 })), ['classroomId:CLASSROOM_NOT_FOUND']);
    const a = await draft();
    assert.deepEqual(await details(async () => await svc.update(T1, a.id, { classroomId: IDS.class20 })), ['classroomId:CLASSROOM_NOT_FOUND']);
  });

  it('draft editing: details and questions (add, edit, remove, reorder by replacing the list)', async () => {
    const a = await draft();
    assert.equal((await svc.update(T1, a.id, { title: 'Renamed', dueAt: '2026-10-10T17:00:00+05:30' })).dueAt, '2026-10-10T11:30:00.000Z');
    let d = await svc.replaceQuestions(T1, a.id, { questions: [...QUESTIONS, { text: 'Third', maxMarks: 1 }] });
    assert.deepEqual(d.questions.map((q) => [q.position, q.text]), [[1, 'Explain photosynthesis.'], [2, 'Compare mitosis and meiosis.'], [3, 'Third']]);
    d = await svc.replaceQuestions(T1, a.id, { questions: [QUESTIONS[1], QUESTIONS[0]] }); // remove + reorder
    assert.deepEqual(d.questions.map((q) => q.text), ['Compare mitosis and meiosis.', 'Explain photosynthesis.']);
    assert.deepEqual([d.questionCount, d.questionMarksTotal], [2, 10]);
    assert.ok((await details(async () => await svc.replaceQuestions(T1, a.id, { questions: [{ text: '', maxMarks: 0, id: 3 }] }))).includes('questions[0].id:UNKNOWN_FIELD'));
  });
});

describe('teacher: publish, marks total, lock, close', () => {
  it('publishing needs questions whose marks add up to maxMarks, and a future due date', async () => {
    const a = await draft();
    assert.deepEqual(await details(async () => await svc.publish(T1, a.id)), ['questions:NO_QUESTIONS']);
    await svc.replaceQuestions(T1, a.id, { questions: [{ text: 'Q', maxMarks: 7 }] });
    assert.deepEqual(await details(async () => await svc.publish(T1, a.id)), ['questions:MARKS_MISMATCH']);
    await svc.replaceQuestions(T1, a.id, { questions: QUESTIONS });
    await svc.update(T1, a.id, { dueAt: new Date(T0 - 60000).toISOString() });
    assert.deepEqual(await details(async () => await svc.publish(T1, a.id)), ['dueAt:DUE_IN_PAST']);
    await svc.update(T1, a.id, { dueAt: null });
    const p = await svc.publish(T1, a.id);
    assert.deepEqual([p.status, p.acceptingSubmissions, !!p.publishedAt], ['published', true, true]);
    assert.equal(await code(async () => await svc.publish(T1, a.id)), 'NOT_A_DRAFT');
  });

  it('published and closed assignments are locked (details and questions)', async () => {
    const p = await published();
    assert.equal(await code(async () => await svc.update(T1, p.id, { title: 'Changed' })), 'ASSIGNMENT_LOCKED');
    assert.equal(await code(async () => await svc.replaceQuestions(T1, p.id, { questions: QUESTIONS })), 'ASSIGNMENT_LOCKED');
    const c = await svc.close(T1, p.id);
    assert.deepEqual([c.status, c.acceptingSubmissions], ['closed', false]);
    assert.equal(await code(async () => await svc.close(T1, p.id)), 'NOT_PUBLISHED');
    assert.equal(await code(async () => await svc.update(T1, p.id, { title: 'Changed' })), 'ASSIGNMENT_LOCKED');
  });

  it('isolation: other teachers (same or other school) get NOT_FOUND; students and admins-as-non-teachers get FORBIDDEN', async () => {
    const p = await published();
    for (const other of [T2, T3]) {
      for (const fn of [async () => await svc.getOwn(other, p.id), async () => await svc.close(other, p.id), async () => await svc.submissions(other, p.id), async () => await svc.update(other, p.id, { title: 'x' })]) {
        assert.equal(await code(fn), 'NOT_FOUND');
      }
      assert.deepEqual(await svc.listOwn(other), []);
    }
    for (const notTeacher of [S1, { ...S1, kind: 'admin' }, null]) {
      assert.equal(await code(async () => await svc.create(notTeacher, { title: 'x', classroomId: 10, maxMarks: 5 })), 'FORBIDDEN');
      assert.equal(await code(async () => await svc.listOwn(notTeacher)), 'FORBIDDEN');
    }
  });
});

describe('student visibility', () => {
  it('students see published/closed assignments of their own class only; drafts, other classes and schools are 404', async () => {
    const d = await draft({ title: 'Draft only' });
    const p = await published();
    assert.deepEqual((await svc.listForStudent(S1)).map((a) => [a.title, a.myStatus, a.teacherName]), [['Biology essay', 'not_submitted', 'Teacher One']]);
    assert.equal(await code(async () => await svc.getForStudent(S1, d.id)), 'NOT_FOUND');
    assert.deepEqual(await svc.listForStudent(S2), []);
    assert.equal(await code(async () => await svc.getForStudent(S2, p.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await svc.getForStudent(S3, p.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await svc.getForStudent(T1, p.id)), 'FORBIDDEN');
    const view = await svc.getForStudent(S1, p.id);
    assert.deepEqual(view.questions.map((q) => [q.position, q.maxMarks]), [[1, 6], [2, 4]]);
    assert.equal(JSON.stringify(view).includes('teacherId'), false);
  });
});

describe('submissions', () => {
  it('first upload creates the submission; re-upload before evaluation replaces it (version + 1, old key returned for deletion)', async () => {
    const p = await published();
    const first = await svc.recordSubmission(S1, p.id, file());
    assert.deepEqual([first.created, first.submission.status, first.submission.version, first.replacedStorageKey], [true, 'submitted', 1, null]);
    const oldKey = (await db.get('SELECT storage_key FROM aia_assignment_submissions')).storage_key;
    const second = await svc.recordSubmission(S1, p.id, { ...file(), originalFilename: 'v2.pdf' });
    assert.deepEqual([second.created, second.submission.version, second.submission.originalFilename, second.replacedStorageKey], [false, 2, 'v2.pdf', oldKey]);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_assignment_submissions')).n, 1); // one current submission
    assert.equal(JSON.stringify(second.submission).match(/storageKey|sha256|\.pdf"?\s*:/), null);
    assert.deepEqual(Object.keys(second.submission).sort(), ['fileSize', 'id', 'originalFilename', 'status', 'submittedAt', 'version']);
  });

  it('closed, past-due or already-evaluated submissions are refused; nothing changes', async () => {
    const p = await published({ dueAt: new Date(T0 + 3600000).toISOString() });
    await svc.recordSubmission(S1, p.id, file());
    clock = T0 + 3600000; // due now
    assert.equal(await code(async () => await svc.recordSubmission(S1, p.id, file())), 'ASSIGNMENT_PAST_DUE');
    assert.equal(await code(async () => await svc.assertCanSubmit(S1, p.id)), 'ASSIGNMENT_PAST_DUE');
    clock = T0;
    const sub = (await svc.submissions(T1, p.id)).students.find((s) => s.studentId === IDS.student1).submission;
    await svc.evaluate(T1, p.id, sub.id, { finalMarks: 7.5, teacherFeedback: 'Clear structure.' });
    assert.equal(await code(async () => await svc.recordSubmission(S1, p.id, file())), 'SUBMISSION_EVALUATED');
    const q = await published({ title: 'Closed one' });
    await svc.close(T1, q.id);
    assert.equal(await code(async () => await svc.recordSubmission(S1, q.id, file())), 'ASSIGNMENT_CLOSED');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_assignment_submissions')).n, 1);
  });

  it('students cannot submit to drafts, other classes or other schools, and teachers cannot submit', async () => {
    const d = await draft();
    const p = await published();
    assert.equal(await code(async () => await svc.recordSubmission(S1, d.id, file())), 'NOT_FOUND');
    assert.equal(await code(async () => await svc.recordSubmission(S2, p.id, file())), 'NOT_FOUND');
    assert.equal(await code(async () => await svc.recordSubmission(S3, p.id, file())), 'NOT_FOUND');
    assert.equal(await code(async () => await svc.recordSubmission(T1, p.id, file())), 'FORBIDDEN');
  });
});

describe('teacher submission dashboard + manual marks', () => {
  it('shows who submitted and who has not; after closing, non-submitters are missed', async () => {
    const p = await published();
    await svc.recordSubmission(S1, p.id, file());
    let dash = await svc.submissions(T1, p.id);
    assert.deepEqual(dash.students.map((s) => [s.studentName, s.status]), [['Second Student', 'not_submitted'], ['Student One', 'submitted']]);
    assert.deepEqual(dash.summary, { students: 2, submitted: 1, evaluated: 0, notSubmitted: 1, missed: 0 });
    assert.equal(JSON.stringify(dash).includes('storageKey'), false);
    await svc.close(T1, p.id);
    dash = await svc.submissions(T1, p.id);
    assert.deepEqual(dash.students.map((s) => s.status), ['missed', 'submitted']);
    assert.equal((await svc.listForStudent({ ...S1, userId: 40 })).find((a) => a.id === p.id).myStatus, 'missed');
  });

  it('manual final marks: 0..maxMarks in 0.5 steps; evaluated status and feedback reach the student', async () => {
    const p = await published();
    await svc.recordSubmission(S1, p.id, file());
    const sid = (await svc.submissions(T1, p.id)).students.find((s) => s.submission).submission.id;
    for (const bad of [-1, 10.5, 3.25, '8', null]) assert.ok((await details(async () => await svc.evaluate(T1, p.id, sid, { finalMarks: bad }))).includes('finalMarks:OUT_OF_RANGE'), String(bad));
    assert.ok((await details(async () => await svc.evaluate(T1, p.id, sid, { finalMarks: 5, aiMarks: 9 }))).includes('aiMarks:UNKNOWN_FIELD'));
    assert.equal(await code(async () => await svc.evaluate(T2, p.id, sid, { finalMarks: 5 })), 'NOT_FOUND');
    const r = await svc.evaluate(T1, p.id, sid, { finalMarks: 8.5, teacherFeedback: 'Good comparison.' });
    assert.deepEqual([r.submission.status, r.submission.finalMarks], ['evaluated', 8.5]);
    assert.equal((await db.get('SELECT evaluated_by FROM aia_assignment_submissions')).evaluated_by, IDS.teacher1);
    const mine = await svc.getForStudent(S1, p.id);
    assert.deepEqual([mine.myStatus, mine.submission.finalMarks, mine.submission.teacherFeedback], ['evaluated', 8.5, 'Good comparison.']);
  });

  it('a submission id from another assignment cannot be used through this one', async () => {
    const p = await published();
    const q = await published({ title: 'Other' });
    await svc.recordSubmission(S1, q.id, file());
    const otherSid = (await svc.submissions(T1, q.id)).students.find((s) => s.submission).submission.id;
    assert.equal(await code(async () => await svc.evaluate(T1, p.id, otherSid, { finalMarks: 1 })), 'SUBMISSION_NOT_FOUND');
    assert.equal(await code(async () => await svc.submissionFileFor(T1, p.id, otherSid)), 'SUBMISSION_NOT_FOUND');
  });
});

describe('without migration 007', () => {
  it('the assignment service reports ASSIGNMENTS_NOT_READY (503); assessments are unaffected', async () => {
    const pre = await createLmsTestDb({ withAssignments: false });
    const adapter = pre.adapter();
    assert.equal(adapter.isReady(), true);
    assert.throws(() => new AssignmentService({ adapter }), (e) => e.code === 'ASSIGNMENTS_NOT_READY' && e.statusCode === 503);
  });
});
