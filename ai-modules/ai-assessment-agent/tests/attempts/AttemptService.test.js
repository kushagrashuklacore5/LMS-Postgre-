// Step 3: attempt lifecycle, server timer, deterministic grading, results, teacher report.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AssessmentService } = require('../../backend/src/core/AssessmentService');
const { AttemptService } = require('../../backend/src/core/AttemptService');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');

const T0 = Date.parse('2026-10-01T10:00:00.000Z');
const session = (userId, universityId) => ({ userId, universityId, role: 'x' });
const code = async (fn) => { try { await fn(); } catch (err) { return err.code; } assert.fail('expected an error'); };

let db, adapter, service, attempts, clock, t1, t2, t3, st1, st2, st3, stNoClass;
beforeEach(async () => {
  clock = T0;
  db = await createLmsTestDb();
  adapter = db.adapter();
  service = new AssessmentService({ adapter });
  attempts = new AttemptService({ adapter, now: () => clock });
  const r = async (id, school) => await adapter.resolveActor(session(id, school));
  [t1, t2, t3] = [await r(IDS.teacher1, 1), await r(IDS.teacher2, 1), await r(IDS.teacher3, 2)];
  [st1, st2, st3, stNoClass] = [await r(IDS.student1, 1), await r(IDS.student2, 1), await r(IDS.student3, 2), await r(IDS.studentNoClass, 1)];
});

/** Published test: 3 questions, correct positions [1, 2, 0]. */
async function publishedTest(teacher = t1, classroomId = IDS.class10, { durationMinutes = 10, title = 'Unit test' } = {}) {
  const a = await service.createAssessment(teacher, { title, subject: 'Science', classroomId, durationMinutes });
  await service.addQuestion(teacher, a.id, mcq('Question one?', 1));
  await service.addQuestion(teacher, a.id, mcq('Question two?', 2));
  await service.addQuestion(teacher, a.id, mcq('Question three?', 0));
  return await service.publish(teacher, a.id);
}
const qids = (test) => test.questions.map((q) => q.id);
const count = async (t) => (await db.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;

describe('student test list (1, 2)', () => {
  it('1. shows only published tests for the student\'s own class, with attempt status', async () => {
    const mine = await publishedTest(t1, IDS.class10, { title: 'Mine' });
    await publishedTest(t1, IDS.class11, { title: 'Other class' });
    await service.createAssessment(t1, { title: 'Draft', subject: 'S', classroomId: IDS.class10 });
    const list = await attempts.withAttemptStatus(st1, await service.listAvailableForStudent(st1));
    assert.deepEqual(list.map((a) => [a.title, a.attempt]), [['Mine', null]]);
    await attempts.startAttempt(st1, mine.id);
    assert.equal((await attempts.withAttemptStatus(st1, await service.listAvailableForStudent(st1)))[0].attempt.status, 'in_progress');
  });

  it('2. another school\'s test is invisible and cannot be started', async () => {
    const other = await publishedTest(t3, IDS.class20);
    assert.deepEqual(await service.listAvailableForStudent(st1), []);
    assert.equal(await code(async () => await attempts.startAttempt(st1, other.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await attempts.startAttempt(stNoClass, (await publishedTest()).id)), 'NOT_FOUND');
    assert.equal(await count('aia_attempts'), 0);
  });

  it('drafts cannot be started', async () => {
    const d = await service.createAssessment(t1, { title: 'D', subject: 'S', classroomId: IDS.class10 });
    assert.equal(await code(async () => await attempts.startAttempt(st1, d.id)), 'NOT_FOUND');
  });
});

describe('start attempt (3, 4, 5, 14)', () => {
  it('4. creates an attempt with SERVER start time and deadline = start + duration', async () => {
    const test = await publishedTest();
    const { created, attempt } = await attempts.startAttempt(st1, test.id);
    assert.equal(created, true);
    assert.equal(attempt.status, 'in_progress');
    assert.equal(attempt.startedAt, '2026-10-01T10:00:00.000Z');
    assert.equal(attempt.deadlineAt, '2026-10-01T10:10:00.000Z');
    assert.equal(attempt.serverNow, '2026-10-01T10:00:00.000Z');
    assert.equal(attempt.questions.length, 3);
    assert.deepEqual(attempt.answers, []);
  });

  it('3. the pre-submission payload has no correct answers, answer keys or explanations', async () => {
    const test = await publishedTest();
    await service.unpublish(t1, test.id);
    await service.updateQuestion(t1, test.id, test.questions[0].id, { ...mcq('Question one?', 1), explanation: 'SECRET EXPLANATION' });
    await service.publish(t1, test.id);
    const { attempt } = await attempts.startAttempt(st1, test.id);
    const json = JSON.stringify(attempt) + JSON.stringify(await attempts.getAttempt(st1, attempt.id));
    for (const leak of ['isCorrect', 'correctPosition', 'correctAnswer', 'explanation', 'SECRET EXPLANATION', 'outcome', 'result']) {
      assert.equal(json.includes(leak), false, leak);
    }
    assert.deepEqual(Object.keys(attempt.questions[0].options[0]).sort(), ['position', 'text']);
  });

  it('5. a second start returns the SAME attempt (resume after refresh) and never creates another', async () => {
    const test = await publishedTest();
    const first = await attempts.startAttempt(st1, test.id);
    clock += 60000;
    const again = await attempts.startAttempt(st1, test.id);
    assert.equal(again.created, false);
    assert.equal(again.attempt.id, first.attempt.id);
    assert.equal(again.attempt.deadlineAt, first.attempt.deadlineAt); // not reset by restarting
    assert.equal(await count('aia_attempts'), 1);
    await assert.rejects(async () => await adapter.insertAttempt({ universityId: 1, assessmentId: test.id, studentId: IDS.student1, startedAt: 'x', deadlineAt: null }), /unique constraint/);
  });

  it('untimed tests (no duration) have no deadline', async () => {
    const { attempt } = await attempts.startAttempt(st1, (await publishedTest(t1, IDS.class10, { durationMinutes: null })).id);
    assert.equal(attempt.deadlineAt, null);
    clock += 24 * 3600 * 1000;
    assert.equal((await attempts.getAttempt(st1, attempt.id)).status, 'in_progress');
  });
});

describe('saving answers (6, 7, 8, 9, 10)', () => {
  it('6. answers can be saved, changed and cleared before submission', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    const [q1, q2] = qids(test);
    await attempts.saveAnswer(st1, attempt.id, q1, { optionPosition: 0 });
    await attempts.saveAnswer(st1, attempt.id, String(q1), { optionPosition: 1 }); // re-answer (ids arrive as strings)
    await attempts.saveAnswer(st1, attempt.id, q2, { optionPosition: 3 });
    await attempts.saveAnswer(st1, attempt.id, q2, { optionPosition: null }); // clear
    assert.deepEqual((await attempts.getAttempt(st1, attempt.id)).answers, [{ questionId: q1, optionPosition: 1 }]);
  });

  it('7. question ids from another assessment or garbage are rejected', async () => {
    const test = await publishedTest();
    const other = await publishedTest(t1, IDS.class10, { title: 'Other' });
    const { attempt } = await attempts.startAttempt(st1, test.id);
    for (const q of [other.questions[0].id, 999999, 'abc', '0']) {
      assert.equal(await code(async () => await attempts.saveAnswer(st1, attempt.id, q, { optionPosition: 1 })), 'QUESTION_NOT_FOUND');
    }
    assert.equal(await count('aia_attempt_answers'), 0);
  });

  it('8. invalid option values are rejected; nothing but optionPosition is accepted', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    const q = qids(test)[0];
    for (const body of [{ optionPosition: 4 }, { optionPosition: -1 }, { optionPosition: '1' }, { optionPosition: 1.5 }, {}]) {
      assert.equal(await code(async () => await attempts.saveAnswer(st1, attempt.id, q, body)), 'INVALID_OPTION', JSON.stringify(body));
    }
    assert.equal(await code(async () => await attempts.saveAnswer(st1, attempt.id, q, { optionPosition: 1, isCorrect: true })), 'VALIDATION_FAILED');
    assert.equal(await code(async () => await attempts.saveAnswer(st1, attempt.id, q, { optionPosition: 1, assessmentId: 9 })), 'VALIDATION_FAILED');
    assert.equal(await count('aia_attempt_answers'), 0);
  });

  it('9. another student (same or other school) cannot read, answer or submit someone else\'s attempt', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    for (const other of [st2, st3]) {
      assert.equal(await code(async () => await attempts.getAttempt(other, attempt.id)), 'ATTEMPT_NOT_FOUND');
      assert.equal(await code(async () => await attempts.saveAnswer(other, attempt.id, qids(test)[0], { optionPosition: 1 })), 'ATTEMPT_NOT_FOUND');
      assert.equal(await code(async () => await attempts.submit(other, attempt.id)), 'ATTEMPT_NOT_FOUND');
      assert.equal(await code(async () => await attempts.getResult(other, attempt.id)), 'ATTEMPT_NOT_FOUND');
    }
    assert.equal((await attempts.getAttempt(st1, attempt.id)).status, 'in_progress');
    assert.equal(await code(async () => await attempts.getAttempt(t1, attempt.id)), 'FORBIDDEN'); // teachers use the report
  });

  it('10. after the SERVER deadline, saving is refused and the attempt is auto-finalized and graded', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    const [q1, q2] = qids(test);
    await attempts.saveAnswer(st1, attempt.id, q1, { optionPosition: 1 }); // correct
    clock = Date.parse(attempt.deadlineAt) - 1;
    await attempts.saveAnswer(st1, attempt.id, q2, { optionPosition: 0 }); // 1 ms before: still accepted (wrong)
    clock = Date.parse(attempt.deadlineAt); // at the deadline: closed
    assert.equal(await code(async () => await attempts.saveAnswer(st1, attempt.id, q2, { optionPosition: 2 })), 'ATTEMPT_EXPIRED');
    const r = await attempts.getResult(st1, attempt.id);
    assert.equal(r.status, 'expired');
    assert.equal(r.finishedAt, attempt.deadlineAt);
    assert.deepEqual(r.result, { totalQuestions: 3, attempted: 2, correct: 1, incorrect: 1, unattempted: 1, score: 1, percentage: 33.33 });
  });

  it('delayed requests: an expired attempt is finalized by ANY later read, list or report, not just saves', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    clock += 11 * 60000;
    assert.equal((await attempts.withAttemptStatus(st1, await service.listAvailableForStudent(st1)))[0].attempt.status, 'expired');
    assert.equal((await db.get('SELECT status FROM aia_attempts WHERE id = ?', [attempt.id])).status, 'expired');
    assert.equal((await attempts.startAttempt(st1, test.id)).attempt.status, 'expired'); // cannot restart after expiry
  });
});

describe('submit, grading, results (11, 12, 13, 15, 16, 17)', () => {
  it('11/12. grades every question on the server and counts unattempted ones', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    const [q1, q2] = qids(test);
    await attempts.saveAnswer(st1, attempt.id, q1, { optionPosition: 1 }); // correct
    await attempts.saveAnswer(st1, attempt.id, q2, { optionPosition: 0 }); // wrong (correct is 2)
    clock += 5 * 60000;
    const { alreadyFinalized, attempt: done } = await attempts.submit(st1, attempt.id);
    assert.equal(alreadyFinalized, false);
    assert.equal(done.status, 'submitted');
    assert.equal(done.finishedAt, '2026-10-01T10:05:00.000Z');
    assert.deepEqual(done.result, { totalQuestions: 3, attempted: 2, correct: 1, incorrect: 1, unattempted: 1, score: 1, percentage: 33.33 });
    assert.deepEqual(done.questions.map((q) => [q.selectedPosition, q.correctPosition, q.outcome]), [[1, 1, 'correct'], [0, 2, 'incorrect'], [null, 0, 'unattempted']]);
  });

  it('all correct -> 100%, none answered -> 0%', async () => {
    const test = await publishedTest();
    const a = (await attempts.startAttempt(st1, test.id)).attempt;
    for (const [i, p] of [1, 2, 0].entries()) await attempts.saveAnswer(st1, a.id, qids(test)[i], { optionPosition: p });
    assert.equal((await attempts.submit(st1, a.id)).attempt.result.percentage, 100);
    const b = (await attempts.startAttempt(st2, (await publishedTest(t1, IDS.class11)).id)).attempt;
    assert.deepEqual((await attempts.submit(st2, b.id)).attempt.result, { totalQuestions: 3, attempted: 0, correct: 0, incorrect: 0, unattempted: 3, score: 0, percentage: 0 });
  });

  it('15. double submit is idempotent: same stored result, nothing changes', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    await attempts.saveAnswer(st1, attempt.id, qids(test)[0], { optionPosition: 1 });
    const first = (await attempts.submit(st1, attempt.id)).attempt;
    clock += 60000;
    const second = await attempts.submit(st1, attempt.id);
    assert.equal(second.alreadyFinalized, true);
    assert.deepEqual(second.attempt.result, first.result);
    assert.equal(second.attempt.finishedAt, first.finishedAt);
    assert.equal(await count('aia_attempts'), 1);
    assert.equal(await code(async () => await attempts.saveAnswer(st1, attempt.id, qids(test)[1], { optionPosition: 2 })), 'ATTEMPT_SUBMITTED');
    assert.deepEqual((await attempts.getResult(st1, attempt.id)).result, first.result);
  });

  it('16/17. the result is persisted and retrievable later by its owner only', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    assert.equal(await code(async () => await attempts.getResult(st1, attempt.id)), 'ATTEMPT_IN_PROGRESS');
    await attempts.saveAnswer(st1, attempt.id, qids(test)[2], { optionPosition: 0 });
    await attempts.submit(st1, attempt.id);
    const row = { ...await db.get('SELECT status, correct, score, percentage, total_questions FROM aia_attempts WHERE id = ?', [attempt.id]) };
    assert.deepEqual(row, { status: 'submitted', correct: 1, score: 1, percentage: 33.33, total_questions: 3 });
    assert.deepEqual((await db.all('SELECT is_correct FROM aia_attempt_answers WHERE attempt_id = ?', [attempt.id])).map((r) => r.is_correct), [1]);
    // A fresh service instance (e.g. after a server restart) returns the same result.
    const later = await new AttemptService({ adapter, now: () => clock + 86400000 }).getResult(st1, attempt.id);
    assert.equal(later.result.score, 1);
    assert.equal(JSON.stringify(later).includes('explanation'), false); // explanations stay teacher-only
    assert.equal(await code(async () => await attempts.getResult(st2, attempt.id)), 'ATTEMPT_NOT_FOUND');
  });

  it('13. the client cannot influence scoring: only the chosen option per question is ever read', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    // The only client input is optionPosition. Scores/flags in the answer body are refused...
    assert.equal(await code(async () => await attempts.saveAnswer(st1, attempt.id, qids(test)[0], { optionPosition: 0, score: 3, percentage: 100 })), 'VALIDATION_FAILED');
    // ...and submit takes no input at all (the HTTP layer rejects any body, tested in the HTTP suite).
    assert.equal((await attempts.submit(st1, attempt.id)).attempt.result.score, 0);
  });
});

describe('unpublish lock once attempts exist (Step 1 compatibility)', () => {
  it('a test with attempts cannot be unpublished (so graded questions cannot change); tests without attempts still can', async () => {
    const used = await publishedTest();
    await attempts.startAttempt(st1, used.id);
    assert.equal(await code(async () => await service.unpublish(t1, used.id)), 'ASSESSMENT_HAS_ATTEMPTS');
    const unused = await publishedTest(t1, IDS.class10, { title: 'Unused' });
    assert.equal((await service.unpublish(t1, unused.id)).status, 'draft');
  });
});

describe('teacher report (18, 19)', () => {
  it('18. per-student results, roster statuses and summary; expired attempts are finalized first', async () => {
    const test = await publishedTest(t1, IDS.class10);
    await db.exec(`INSERT INTO users (id, name, email, password, role, university_id) VALUES (30, 'Aarav Synthetic', 'a30@s1.test', 'x', 'student', 1), (31, 'Zoya Synthetic', 'z31@s1.test', 'x', 'student', 1)`);
    await db.exec(`INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (30, ${IDS.class10}), (31, ${IDS.class10})`);
    const s30 = await adapter.resolveActor(session(30, 1));
    const s31 = await adapter.resolveActor(session(31, 1));

    const a = (await attempts.startAttempt(st1, test.id)).attempt; // Student One: 3/3 in 2 min
    for (const [i, p] of [1, 2, 0].entries()) await attempts.saveAnswer(st1, a.id, qids(test)[i], { optionPosition: p });
    clock += 2 * 60000;
    await attempts.submit(st1, a.id);
    const b = (await attempts.startAttempt(s30, test.id)).attempt; // Aarav: 1 correct, then time runs out
    await attempts.saveAnswer(s30, b.id, qids(test)[0], { optionPosition: 1 });
    clock += 20 * 60000; // past Aarav's deadline; nobody touched it since

    const { assessment, summary, students } = await attempts.report(t1, test.id);
    assert.equal(assessment.title, 'Unit test');
    assert.deepEqual(students.map((s) => [s.studentName, s.status, s.score ?? null, s.percentage ?? null]), [
      ['Aarav Synthetic', 'expired', 1, 33.33],
      ['Student One', 'submitted', 3, 100],
      ['Zoya Synthetic', 'not_started', null, null],
    ]);
    assert.equal(students[1].timeTakenSeconds, 120);
    assert.equal(students[0].timeTakenSeconds, 600); // capped at the deadline
    assert.deepEqual(summary, {
      studentsInClass: 3, studentsAttempted: 2, totalSubmissions: 2, inProgress: 0,
      averageScore: 2, averagePercentage: 66.67, highestScore: 3, lowestScore: 1, highestPercentage: 100, lowestPercentage: 33.33,
    });
    assert.equal(s31.kind, 'student');
    assert.equal(JSON.stringify(students).includes('rank'), false);
  });

  it('19. other teachers and other schools cannot see the report; students cannot use it', async () => {
    const test = await publishedTest();
    assert.equal(await code(async () => await attempts.report(t2, test.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await attempts.report(t3, test.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await attempts.report(st1, test.id)), 'FORBIDDEN');
  });

  it('an empty report has null statistics, not zeros', async () => {
    const { summary } = await attempts.report(t1, (await publishedTest()).id);
    assert.deepEqual([summary.totalSubmissions, summary.averageScore, summary.highestScore], [0, null, null]);
  });
});

describe('migration 003', () => {
  it('no foreign key into an LMS table; the adapter is not ready without 003', async () => {
    const references = await db.all(`SELECT tc.table_name AS t, ccu.table_name AS target FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name IN ('aia_attempts', 'aia_attempt_answers')`);
    for (const fk of references) assert.ok(fk.target.startsWith('aia_'), `${fk.t} -> ${fk.target}`);
    assert.equal((await createLmsTestDb({ withStep3: false })).adapter().isReady(), false);
  });

  it('the database enforces status/finished_at consistency and valid option positions', async () => {
    const test = await publishedTest();
    const { attempt } = await attempts.startAttempt(st1, test.id);
    await assert.rejects(async () => await db.run("UPDATE aia_attempts SET status = 'submitted' WHERE id = ?", [attempt.id]), /check constraint/);
    await assert.rejects(async () => await db.run('INSERT INTO aia_attempt_answers (attempt_id, question_id, option_position) VALUES (?, ?, 7)', [attempt.id, qids(test)[0]]), /check constraint/);
  });
});
