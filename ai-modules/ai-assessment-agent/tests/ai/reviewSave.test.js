// Teacher review -> explicit save path (service level) + migration 002.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AssessmentService } = require('../../backend/src/core/AssessmentService');
const { IDS, createLmsTestDb } = require('../helpers/lmsTestDb');

const session = (userId, universityId) => ({ userId, universityId, role: 'x' });
const reviewed = (text, correct = 0, explanation = 'Because.') => ({
  text,
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((t, i) => ({ text: t, isCorrect: i === correct })),
  explanation,
  difficulty: 'hard',
});
const code = async (fn) => { try { await fn(); } catch (err) { return err.code; } assert.fail('expected an error'); };

let db, adapter, service, t1, t3, st1;
beforeEach(async () => {
  db = await createLmsTestDb();
  adapter = db.adapter();
  service = new AssessmentService({ adapter });
  t1 = await adapter.resolveActor(session(IDS.teacher1, IDS.school1));
  t3 = await adapter.resolveActor(session(IDS.teacher3, IDS.school2));
  st1 = await adapter.resolveActor(session(IDS.student1, IDS.school1));
});
const count = async (t) => (await db.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;

describe('17. createAssessmentWithQuestions (teacher-reviewed save)', () => {
  it('saves ONE draft with all reviewed questions, explanations and difficulty', async () => {
    const a = await service.createAssessmentWithQuestions(t1, {
      assessment: { title: 'AI Planets', subject: 'Science', classroomId: IDS.class10 },
      questions: [reviewed('Q one?', 1, 'Beta is right.'), reviewed('Q two?', 3)],
    });
    assert.equal(a.status, 'draft');
    assert.equal(a.publishedAt, null);
    assert.equal(a.questionCount, 2);
    assert.deepEqual(a.questions.map((q) => [q.position, q.text, q.explanation, q.difficulty]), [[1, 'Q one?', 'Beta is right.', 'hard'], [2, 'Q two?', 'Because.', 'hard']]);
    assert.deepEqual(a.questions[1].options.map((o) => o.isCorrect), [false, false, false, true]);
  });

  it('16. is never published automatically; students cannot see it until the teacher publishes', async () => {
    const a = await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [reviewed('Q?')] });
    assert.deepEqual(await service.listAvailableForStudent(st1), []);
    await service.publish(t1, a.id); // the normal Step 1 path
    const view = await service.getAvailableForStudent(st1, a.id);
    assert.equal(JSON.stringify(view).includes('explanation'), false); // teacher-only
    assert.equal(JSON.stringify(view).includes('isCorrect'), false);
  });

  it('an invalid question rejects the whole save and writes nothing', async () => {
    const bad = reviewed('Bad?'); bad.options[2].isCorrect = true;
    try {
      await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [reviewed('Good?'), bad] });
      assert.fail('should throw');
    } catch (err) {
      assert.deepEqual(err.details, [{ field: 'questions[1].options', code: 'MULTIPLE_CORRECT_OPTIONS' }]);
    }
    assert.deepEqual([await count('aia_assessments'), await count('aia_questions'), await count('aia_options')], [0, 0, 0]);
  });

  it('requires at least one question and rejects extra top-level fields (status, ids, tenant)', async () => {
    assert.equal(await code(async () => await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [] })), 'VALIDATION_FAILED');
    assert.equal(await code(async () => await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', status: 'published' }, questions: [reviewed('Q?')] })), 'VALIDATION_FAILED');
    assert.equal(await code(async () => await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [reviewed('Q?')], publish: true, universityId: 2 })), 'VALIDATION_FAILED');
    assert.equal(await count('aia_assessments'), 0);
  });

  it('14/13. students (and non-teachers) cannot save', async () => {
    assert.equal(await code(async () => await service.createAssessmentWithQuestions(st1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [reviewed('Q?')] })), 'FORBIDDEN');
    assert.equal(await code(() => service.assertTeacher(st1)), 'FORBIDDEN');
    assert.equal(await count('aia_assessments'), 0);
  });

  it('15. tenant isolation: another school\'s class is refused, and the saved draft is private', async () => {
    assert.equal(await code(async () => await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class20 }, questions: [reviewed('Q?')] })), 'VALIDATION_FAILED');
    assert.equal(await count('aia_assessments'), 0);
    const a = await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [reviewed('Q?')] });
    assert.equal(await code(async () => await service.getOwnAssessment(t3, a.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await service.resolveGenerationTarget(t1, IDS.class20)), 'VALIDATION_FAILED');
    assert.equal((await service.resolveGenerationTarget(t1, IDS.class10)).grade, '10');
  });

  it('Step 1 manual edit keeps working and can edit the explanation', async () => {
    const a = await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [reviewed('Q?')] });
    const updated = await service.updateQuestion(t1, a.id, a.questions[0].id, { ...reviewed('Q edited?', 2, 'New reason.'), difficulty: null });
    assert.deepEqual([updated.questions[0].text, updated.questions[0].explanation, updated.questions[0].difficulty], ['Q edited?', 'New reason.', null]);
  });
});

describe('migration 002 (explanation + difficulty columns)', () => {
  it('the adapter is NOT ready with only migration 001 (writes would fail), and ready with both', async () => {
    assert.equal((await createLmsTestDb({ withStep2: false })).adapter().isReady(), false);
    assert.equal((await createLmsTestDb()).adapter().isReady(), true);
  });

  it('the database refuses an unknown difficulty', async () => {
    const a = await service.createAssessmentWithQuestions(t1, { assessment: { title: 'T', subject: 'S', classroomId: IDS.class10 }, questions: [reviewed('Q?')] });
    await assert.rejects(async () => await db.run("UPDATE aia_questions SET difficulty = 'expert' WHERE assessment_id = ?", [a.id]), /check constraint/);
  });
});
