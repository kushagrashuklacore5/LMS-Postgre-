// Step 6: teacher attempt reset / retake with preserved history. Fake server clock, temp DB.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AssessmentService } = require('../../backend/src/core/AssessmentService');
const { AttemptService, MAX_RESETS_PER_STUDENT } = require('../../backend/src/core/AttemptService');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');

const T0 = Date.parse('2026-10-10T08:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const session = (userId, universityId) => ({ userId, universityId, role: 'x' });
const code = async (fn) => { try { await fn(); } catch (err) { return err.code; } assert.fail('expected an error'); };

let db, adapter, service, attempts, clock, t1, t2, t3, st1, st2;
beforeEach(async () => {
  clock = T0;
  db = await createLmsTestDb();
  adapter = db.adapter();
  service = new AssessmentService({ adapter, now: () => clock });
  attempts = new AttemptService({ adapter, now: () => clock });
  const r = async (id, school) => await adapter.resolveActor(session(id, school));
  [t1, t2, t3, st1, st2] = [await r(IDS.teacher1, 1), await r(IDS.teacher2, 1), await r(IDS.teacher3, 2), await r(IDS.student1, 1), await r(IDS.student2, 1)];
});

/** Published 2-question, 20-minute test for class 10 (correct positions 1, 2). */
async function published(window = {}) {
  const a = await service.createAssessment(t1, { title: 'Retake test', subject: 'Science', classroomId: IDS.class10, durationMinutes: 20, ...window });
  await service.addQuestion(t1, a.id, mcq('Q1?', 1));
  await service.addQuestion(t1, a.id, mcq('Q2?', 2));
  return await service.publish(t1, a.id);
}
/** Student 1 starts, answers Q1 with `pos`, submits. Returns the finished attempt. */
async function takeAndSubmit(test, pos = 0) {
  const { attempt } = await attempts.startAttempt(st1, test.id);
  await attempts.saveAnswer(st1, attempt.id, attempt.questions[0].id, { optionPosition: pos });
  return (await attempts.submit(st1, attempt.id)).attempt;
}
const count = async (t) => (await db.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;
const snapshotTest = async (id) => JSON.stringify({
  a: await db.get('SELECT title, subject, status, classroom_id, duration_minutes, opens_at, closes_at, closed_at FROM aia_assessments WHERE id = ?', [id]),
  q: await db.all('SELECT id, position, text, explanation FROM aia_questions WHERE assessment_id = ? ORDER BY id', [id]),
  o: await db.all('SELECT o.question_id, o.position, o.text, o.is_correct FROM aia_options o JOIN aia_questions q ON q.id = o.question_id WHERE q.assessment_id = ? ORDER BY o.id', [id]),
});

describe('teacher resets a finished attempt; student retakes', () => {
  it('reset archives the result, removes the current attempt, and leaves the test/questions unchanged', async () => {
    const test = await published();
    const first = await takeAndSubmit(test, 0); // wrong answer: 0/2
    const before = await snapshotTest(test.id);
    clock += 30 * 60000;

    const { reset } = await attempts.resetAttempt(t1, test.id, IDS.student1);
    assert.deepEqual([reset.studentId, reset.archivedAttemptId, reset.resetAt, reset.resetsUsed, reset.resetsRemaining], [IDS.student1, first.id, at(30), 1, MAX_RESETS_PER_STUDENT - 1]);
    assert.deepEqual(reset.previousResult, first.result);
    assert.deepEqual([await count('aia_attempts'), await count('aia_attempt_answers'), await count('aia_attempt_archive')], [0, 0, 1]);

    const archived = await db.get('SELECT * FROM aia_attempt_archive');
    assert.deepEqual([archived.original_attempt_id, archived.status, archived.score, archived.reset_by, archived.reset_at], [first.id, 'submitted', 0, IDS.teacher1, at(30)]);
    assert.deepEqual(JSON.parse(archived.answers_json), [{ questionId: test.questions[0].id, optionPosition: 0, isCorrect: false }]);
    assert.equal(await snapshotTest(test.id), before);
  });

  it('after reset the student starts a FRESH attempt: new id, fresh server deadline, no old answers', async () => {
    const test = await published();
    const first = await takeAndSubmit(test, 0);
    clock += 45 * 60000;
    await attempts.resetAttempt(t1, test.id, IDS.student1);
    const list = await attempts.withAttemptStatus(st1, await service.listAvailableForStudent(st1));
    assert.equal(list[0].attempt, null); // the old result is no longer "current"

    const { created, attempt } = await attempts.startAttempt(st1, test.id);
    assert.equal(created, true);
    assert.notEqual(attempt.id, first.id);
    assert.deepEqual([attempt.status, attempt.startedAt, attempt.deadlineAt], ['in_progress', at(45), at(65)]);
    assert.deepEqual(attempt.answers, []);
    assert.equal(await code(async () => await attempts.getAttempt(st1, first.id)), 'ATTEMPT_NOT_FOUND'); // old attempt is history, not current

    await attempts.saveAnswer(st1, attempt.id, attempt.questions[0].id, { optionPosition: 1 });
    await attempts.saveAnswer(st1, attempt.id, attempt.questions[1].id, { optionPosition: 2 });
    assert.equal((await attempts.submit(st1, attempt.id)).attempt.result.score, 2);
  });

  it('report shows the CURRENT attempt with its number and the previous results as history', async () => {
    const test = await published();
    await takeAndSubmit(test, 0); // attempt 1: 0/2
    await attempts.resetAttempt(t1, test.id, IDS.student1);
    let row = (await attempts.report(t1, test.id)).students.find((s) => s.studentId === IDS.student1);
    assert.deepEqual([row.status, row.attemptNumber, row.previousAttempts.length, row.previousAttempts[0].score], ['not_started', null, 1, 0]);

    await takeAndSubmit(test, 1); // attempt 2: 1/2
    const report = await attempts.report(t1, test.id);
    row = report.students.find((s) => s.studentId === IDS.student1);
    assert.deepEqual([row.status, row.attemptNumber, row.score, row.percentage], ['submitted', 2, 1, 50]);
    assert.deepEqual(row.previousAttempts.map((p) => [p.attemptNumber, p.status, p.score, p.percentage]), [[1, 'submitted', 0, 0]]);
    // Summary counts current attempts only (no double counting of the archived one).
    assert.deepEqual([report.summary.totalSubmissions, report.summary.averageScore, report.summary.highestScore], [1, 1, 1]);
  });

  it('an attempt past its deadline is finalized and can then be reset', async () => {
    const test = await published();
    await attempts.startAttempt(st1, test.id);
    clock += 21 * 60000; // past the 20-minute deadline, nobody touched it
    const { reset } = await attempts.resetAttempt(t1, test.id, IDS.student1);
    assert.equal(reset.previousResult.unattempted, 2);
    assert.equal((await db.get('SELECT status FROM aia_attempt_archive')).status, 'expired');
  });
});

describe('reset is refused when it would be unsafe', () => {
  it('while the student is still taking the test (409 ATTEMPT_IN_PROGRESS), nothing changes', async () => {
    const test = await published();
    await attempts.startAttempt(st1, test.id);
    assert.equal(await code(async () => await attempts.resetAttempt(t1, test.id, IDS.student1)), 'ATTEMPT_IN_PROGRESS');
    assert.deepEqual([await count('aia_attempts'), await count('aia_attempt_archive')], [1, 0]);
  });

  it('on a manually closed test (409 TEST_CLOSED): a reset never reopens a test', async () => {
    const test = await published();
    await takeAndSubmit(test);
    await attempts.closeAssessment(t1, test.id);
    assert.equal(await code(async () => await attempts.resetAttempt(t1, test.id, IDS.student1)), 'TEST_CLOSED');
    assert.deepEqual([await count('aia_attempts'), await count('aia_attempt_archive')], [1, 0]);
  });

  it('on a test whose closesAt has passed (409 TEST_CLOSED)', async () => {
    const test = await published({ closesAt: at(60) });
    await takeAndSubmit(test);
    clock = Date.parse(at(60));
    assert.equal(await code(async () => await attempts.resetAttempt(t1, test.id, IDS.student1)), 'TEST_CLOSED');
  });

  it('a reset done while open does not let the student start after the window closes', async () => {
    const test = await published({ closesAt: at(60) });
    await takeAndSubmit(test);
    await attempts.resetAttempt(t1, test.id, IDS.student1);
    clock = Date.parse(at(60));
    assert.equal(await code(async () => await attempts.startAttempt(st1, test.id)), 'TEST_CLOSED');
    assert.equal((await attempts.report(t1, test.id)).students.find((s) => s.studentId === IDS.student1).status, 'missed');
  });

  it('the fresh deadline is still capped by closesAt', async () => {
    const test = await published({ closesAt: at(50) });
    await takeAndSubmit(test);
    clock = Date.parse(at(40));
    await attempts.resetAttempt(t1, test.id, IDS.student1);
    assert.equal((await attempts.startAttempt(st1, test.id)).attempt.deadlineAt, at(50));
  });

  it(`after ${MAX_RESETS_PER_STUDENT} resets of the same student: 409 RESET_LIMIT_REACHED`, async () => {
    const test = await published();
    for (let i = 0; i < MAX_RESETS_PER_STUDENT; i += 1) {
      await takeAndSubmit(test);
      await attempts.resetAttempt(t1, test.id, IDS.student1);
    }
    await takeAndSubmit(test);
    assert.equal(await code(async () => await attempts.resetAttempt(t1, test.id, IDS.student1)), 'RESET_LIMIT_REACHED');
    assert.deepEqual([await count('aia_attempts'), await count('aia_attempt_archive')], [1, MAX_RESETS_PER_STUDENT]);
  });

  it('no attempt to reset, bad ids: 404 ATTEMPT_NOT_FOUND', async () => {
    const test = await published();
    assert.equal(await code(async () => await attempts.resetAttempt(t1, test.id, IDS.student1)), 'ATTEMPT_NOT_FOUND');
    assert.equal(await code(async () => await attempts.resetAttempt(t1, test.id, 'abc')), 'ATTEMPT_NOT_FOUND');
  });
});

describe('authorization and tenant isolation', () => {
  it('other teachers (same or other school) get NOT_FOUND; students FORBIDDEN; nothing changes', async () => {
    const test = await published();
    await takeAndSubmit(test);
    assert.equal(await code(async () => await attempts.resetAttempt(t2, test.id, IDS.student1)), 'NOT_FOUND');
    assert.equal(await code(async () => await attempts.resetAttempt(t3, test.id, IDS.student1)), 'NOT_FOUND');
    assert.equal(await code(async () => await attempts.resetAttempt(st1, test.id, IDS.student1)), 'FORBIDDEN');
    assert.equal(await code(async () => await attempts.resetAttempt(st2, test.id, IDS.student1)), 'FORBIDDEN');
    assert.deepEqual([await count('aia_attempts'), await count('aia_attempt_archive')], [1, 0]);
  });

  it('a student id from another school finds no attempt in this school (404)', async () => {
    const test = await published();
    await takeAndSubmit(test);
    assert.equal(await code(async () => await attempts.resetAttempt(t1, test.id, IDS.student3)), 'ATTEMPT_NOT_FOUND');
  });

  it('archived attempts keep the test locked: it still cannot be unpublished/edited after a reset', async () => {
    const test = await published();
    await takeAndSubmit(test);
    await attempts.resetAttempt(t1, test.id, IDS.student1);
    assert.equal(await count('aia_attempts'), 0);
    assert.equal(await code(async () => await service.unpublish(t1, test.id)), 'ASSESSMENT_HAS_ATTEMPTS');
  });
});

describe('migration 005', () => {
  it('the adapter is not ready without the archive table', async () => {
    const d = await createLmsTestDb({ withStep6: false });
    assert.equal(d.adapter().isReady(), false);
    assert.equal(db.adapter().isReady(), true);
  });

  it('keeps UNIQUE(assessment_id, student_id) on current attempts and has no FK into LMS tables', async () => {
    const unique = await db.all("SELECT pg_get_indexdef(indexrelid) AS def FROM pg_index WHERE indrelid = 'aia_attempts'::regclass AND indisunique");
    assert.ok(unique.some((r) => /\(assessment_id, student_id\)/.test(r.def)), JSON.stringify(unique));
    const references = await db.all(`SELECT ccu.table_name AS target FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'aia_attempt_archive'`);
    for (const fk of references) assert.ok(fk.target.startsWith('aia_'), fk.target);
    await assert.rejects(async () => await db.run("INSERT INTO aia_attempt_archive (original_attempt_id, university_id, assessment_id, student_id, status, started_at, finished_at, total_questions, attempted, correct, incorrect, unattempted, score, percentage, answers_json, reset_by, reset_at) VALUES (1,1,999,1,'in_progress','x','x',1,1,1,0,0,1,100,'[]',1,'x')"), /check constraint|foreign key/);
  });
});
