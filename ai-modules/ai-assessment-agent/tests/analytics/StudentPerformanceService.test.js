// Student Performance Analyst: factual service (access, scope, states, retakes, class average). Temp DB, fake clock.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AssessmentService } = require('../../backend/src/core/AssessmentService');
const { AttemptService } = require('../../backend/src/core/AttemptService');
const { StudentPerformanceService } = require('../../backend/src/core/analytics/StudentPerformanceService');
const { IDS, createLmsTestDb, mcq } = require('../helpers/lmsTestDb');

const T0 = Date.parse('2026-10-20T08:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const session = (userId, universityId) => ({ userId, universityId, role: 'x' });
const code = async (fn) => { try { await fn(); } catch (e) { return e.code; } assert.fail('expected an error'); };

let db, adapter, service, attempts, perf, clock, t1, t2, t3, st1, st2;
beforeEach(async () => {
  clock = T0;
  db = await createLmsTestDb();
  // Class 10 memberships were created "now" (real clock); pin them before T0 for deterministic join dates.
  await db.exec("UPDATE student_classroom_assignment SET createdAt = '2026-10-01 00:00:00'");
  adapter = db.adapter();
  const now = () => clock;
  service = new AssessmentService({ adapter, now });
  attempts = new AttemptService({ adapter, now });
  perf = new StudentPerformanceService({ adapter, now });
  const r = async (id, school) => await adapter.resolveActor(session(id, school));
  [t1, t2, t3, st1, st2] = [await r(IDS.teacher1, 1), await r(IDS.teacher2, 1), await r(IDS.teacher3, 2), await r(IDS.student1, 1), await r(IDS.student2, 1)];
});

/** Published 4-question test by `teacher` for `classroomId`; correct position 1 everywhere. difficulties per question. */
async function published(teacher, { classroomId = IDS.class10, subject = 'Biology', durationMinutes = 20, window = {}, difficulties = ['easy', 'easy', 'hard', null] } = {}) {
  const a = await service.createAssessment(teacher, { title: `Test ${Math.random()}`, subject, classroomId, durationMinutes, ...window });
  for (const [i, d] of difficulties.entries()) await service.addQuestion(teacher, a.id, { ...mcq(`Q${i + 1} of ${a.id}?`, 1), difficulty: d });
  return await service.publish(teacher, a.id);
}
/** Student answers: array of optionPosition|null per question (1 = correct). Submits after `minutes`. */
async function take(student, test, answers, minutes = 5) {
  const { attempt } = await attempts.startAttempt(student, test.id);
  for (const [i, p] of answers.entries()) { if (p !== null) await attempts.saveAnswer(student, attempt.id, attempt.questions[i].id, { optionPosition: p }); }
  clock += minutes * 60000;
  return (await attempts.submit(student, attempt.id)).attempt;
}

describe('access and scope', () => {
  it('teacher gets facts for a student linked to their tests; the response has no question texts', async () => {
    const a = await published(t1);
    await take(st1, a, [1, 1, 0, null]);
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.deepEqual([r.student.id, r.student.name, r.scope.owner, r.scope.assessments], [IDS.student1, 'Student One', 'requesting_teacher', 1]);
    assert.deepEqual(r.student.classes.map((c) => c.id), [IDS.class10]);
    assert.equal(JSON.stringify(r).includes(`Q1 of ${a.id}`), false);
  });

  it('students and non-teachers are refused (FORBIDDEN)', async () => {
    await published(t1);
    assert.equal(await code(async () => await perf.getPerformance(st1, IDS.student1)), 'FORBIDDEN');
    assert.equal(await code(async () => await perf.getPerformance(undefined, IDS.student1)), 'FORBIDDEN');
  });

  it('student of another school, a non-student user, or a bad id -> 404', async () => {
    await published(t1);
    assert.equal(await code(async () => await perf.getPerformance(t1, IDS.student3)), 'STUDENT_NOT_FOUND'); // school 2
    assert.equal(await code(async () => await perf.getPerformance(t1, IDS.teacher2)), 'STUDENT_NOT_FOUND'); // not a student
    assert.equal(await code(async () => await perf.getPerformance(t1, 'abc')), 'STUDENT_NOT_FOUND');
  });

  it('teacher of another school -> 404 (the student is not in their school)', async () => {
    await published(t1);
    assert.equal(await code(async () => await perf.getPerformance(t3, IDS.student1)), 'STUDENT_NOT_FOUND');
  });

  it('same-school teacher with no link to the student -> 404; other teachers\' tests are excluded', async () => {
    await published(t1); // t1 targets class 10 (student1)
    assert.equal(await code(async () => await perf.getPerformance(t2, IDS.student1)), 'STUDENT_NOT_FOUND');
    const theirs = await published(t2); // t2 now also targets class 10
    await take(st1, theirs, [1, 1, 1, 1]);
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.equal(r.scope.assessments, 1); // only t1's test
    assert.equal(r.metrics.counts.attempted, 0); // t2's finished test is not in t1's scope
  });

  it('drafts are never in scope; a same-school student in no targeted class -> 404', async () => {
    await service.createAssessment(t1, { title: 'Draft', subject: 'S', classroomId: IDS.class10 });
    assert.equal(await code(async () => await perf.getPerformance(t1, IDS.student1)), 'STUDENT_NOT_FOUND');
    await published(t1);
    assert.equal(await code(async () => await perf.getPerformance(t1, IDS.studentNoClass)), 'STUDENT_NOT_FOUND');
  });
});

describe('states, windows, join date, timing', () => {
  it('finished / in progress / pending / upcoming / missed are classified by the server clock', async () => {
    const done = await published(t1);
    await take(st1, done, [1, 1, 1, 1]);
    const running = await published(t1, { durationMinutes: 120 }); // still running when the clock moves to +31 min
    await attempts.startAttempt(st1, running.id);
    await published(t1); // open, not started -> pending
    await published(t1, { window: { opensAt: at(600) } }); // upcoming
    const closing = await published(t1, { window: { closesAt: at(30) } });
    clock = Date.parse(at(31)); // closing has closed without an attempt -> missed
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.deepEqual(r.metrics.counts, { assigned: 5, attempted: 1, inProgress: 1, missed: 1, pending: 1, upcoming: 1 });
    assert.equal(r.metrics.history.find((h) => h.assessmentId === closing.id).state, 'missed');
    assert.equal(r.metrics.completionRate, 50);
  });

  it('a test that closed BEFORE the student joined the class is not counted (not missed, not assigned)', async () => {
    await published(t1, { window: { closesAt: at(10) } });
    const open = await published(t1);
    clock = Date.parse(at(20));
    await db.exec("UPDATE student_classroom_assignment SET createdAt = '2026-10-20 08:15:00' WHERE studentId = 4"); // joined at +15 min, after +10 close
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.deepEqual([r.metrics.counts.assigned, r.metrics.counts.missed, r.metrics.history[0].assessmentId], [1, 0, open.id]);
  });

  it('manual close: a student who never started counts as missed', async () => {
    const a = await published(t1);
    await attempts.closeAssessment(t1, a.id);
    assert.equal((await perf.getPerformance(t1, IDS.student1)).metrics.counts.missed, 1);
  });

  it('an in-progress attempt past its deadline is finalized (timed out) before metrics', async () => {
    const a = await published(t1, { durationMinutes: 10 });
    await attempts.startAttempt(st1, a.id);
    clock += 11 * 60000;
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.deepEqual([r.metrics.counts.attempted, r.metrics.history[0].attemptStatus, r.metrics.timing.timedOutRate, r.metrics.history[0].timeUsedPercent], [1, 'expired', 100, 100]);
  });

  it('per-question outcomes feed the difficulty breakdown (null difficulty = unspecified)', async () => {
    await take(st1, await published(t1), [1, 0, 1, null]); // easy ok, easy wrong, hard ok, unspecified skipped
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.deepEqual(r.metrics.byDifficulty.map((d) => [d.difficulty, d.questions, d.answered, d.correct]), [['easy', 2, 2, 1], ['hard', 1, 1, 1], ['unspecified', 1, 0, 0]]);
    assert.equal(r.metrics.timing.unansweredRate, 25);
  });
});

describe('retakes, class average, sufficiency', () => {
  it('archived attempts are history; the current attempt is the performance; first vs latest reported', async () => {
    const a = await published(t1);
    await take(st1, a, [0, 0, 1, 1]); // 50
    await attempts.resetAttempt(t1, a.id, IDS.student1);
    await take(st1, a, [1, 1, 1, 1]); // 100
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.equal(r.metrics.scores.average, 100);
    assert.deepEqual(r.metrics.retakes.firstVsLatest.map((x) => [x.firstPercentage, x.latestPercentage, x.change]), [[50, 100, 50]]);
    assert.deepEqual([r.metrics.history[0].attemptNumber, r.metrics.history[0].previousAttempts.length], [2, 1]);
  });

  it('a reset attempt not retaken before the window closes is missed, with its history kept', async () => {
    const a = await published(t1, { window: { closesAt: at(60) } });
    await take(st1, a, [1, 1, 1, 1]);
    await attempts.resetAttempt(t1, a.id, IDS.student1);
    clock = Date.parse(at(61));
    const h = (await perf.getPerformance(t1, IDS.student1)).metrics.history[0];
    assert.deepEqual([h.state, h.previousAttempts.length], ['missed', 1]);
  });

  it('class average aggregates all finished current attempts of that test', async () => {
    const a = await published(t1, { classroomId: IDS.class10 });
    // student2 moves into class 10 (a student belongs to one classroom at a time)
    await db.exec(`UPDATE student_classroom_assignment SET classroomId = ${IDS.class10}, createdAt = '2026-10-01 00:00:00' WHERE studentId = ${IDS.student2}`);
    await take(st1, a, [1, 1, 1, 1]); // 100
    await take(st2, a, [1, 0, 0, 0]); // 25
    const h = (await perf.getPerformance(t1, IDS.student1)).metrics.history[0];
    assert.deepEqual([h.percentage, h.classAveragePercentage, h.classFinishedCount], [100, 62.5, 2]);
  });

  it('data sufficiency: 0 -> none, 1-2 -> limited, 3+ -> adequate', async () => {
    const tests = [await published(t1), await published(t1), await published(t1)];
    assert.equal((await perf.getPerformance(t1, IDS.student1)).dataSufficiency.level, 'none');
    await take(st1, tests[0], [1, 1, 1, 1]);
    assert.equal((await perf.getPerformance(t1, IDS.student1)).dataSufficiency.level, 'limited');
    await take(st1, tests[1], [1, 1, 0, 0]);
    assert.equal((await perf.getPerformance(t1, IDS.student1)).dataSufficiency.level, 'limited');
    await take(st1, tests[2], [1, 0, 0, 0]);
    const r = await perf.getPerformance(t1, IDS.student1);
    assert.deepEqual([r.dataSufficiency.level, r.metrics.trend.label, r.metrics.scores.lastThreeAverage], ['adequate', 'declining', 58.33]);
  });

  it('computing facts never changes the test, questions or attempts (read-only apart from lazy expiry)', async () => {
    const a = await published(t1);
    await take(st1, a, [1, 1, 1, 1]);
    const snap = async () => JSON.stringify([await db.all('SELECT * FROM aia_assessments'), await db.all('SELECT * FROM aia_questions'), await db.all('SELECT * FROM aia_attempts')]);
    const before = await snap();
    await perf.getPerformance(t1, IDS.student1);
    assert.equal(await snap(), before);
  });
});
