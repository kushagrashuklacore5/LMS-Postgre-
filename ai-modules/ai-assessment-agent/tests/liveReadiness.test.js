// Readiness by schema state: with an adapter that sees only migrations 001-005 (neither 006 nor 007),
// the old single-MCQ flow works and the new features are unavailable (safe 503s); with the full LMS
// schema (server/database/postgres/migrations) both features work.
// Plus: the AI write path can never touch the teacher's final marks.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { IDS, createLmsTestDb, mcq, multi } = require('./helpers/lmsTestDb');
const { AssessmentService } = require('../backend/src/core/AssessmentService');
const { AttemptService } = require('../backend/src/core/AttemptService');
const { AssignmentService } = require('../backend/src/assignments/AssignmentService');

const T1 = { userId: IDS.teacher1, universityId: IDS.school1, kind: 'teacher' };
const S1 = { userId: IDS.student1, universityId: IDS.school1, kind: 'student' };
const code = async (fn) => { try { await fn(); } catch (e) { return e.code; } return 'ok'; };

describe('readiness by schema state', () => {
  it('001-005 only: single-MCQ assessments work; new question types and assignments are unavailable (safe 503s)', async () => {
    const db = await createLmsTestDb({ withQuestionTypes: false, withAssignments: false });
    const adapter = db.adapter();
    assert.deepEqual([adapter.isReady(), adapter.supportsQuestionTypes(), adapter.supportsAssignments()], [true, false, false]);
    const svc = new AssessmentService({ adapter });
    const att = new AttemptService({ adapter });
    const a = await svc.createAssessment(T1, { title: 'Pre-006 test', subject: 'Maths', classroomId: IDS.class10 });
    assert.equal(await code(async () => await svc.addQuestion(T1, a.id, multi())), 'QUESTION_TYPES_NOT_READY');
    await svc.addQuestion(T1, a.id, mcq());
    await svc.publish(T1, a.id);
    const { attempt } = await att.startAttempt(S1, a.id);
    await att.saveAnswer(S1, attempt.id, attempt.questions[0].id, { optionPosition: 1 });
    assert.equal((await att.submit(S1, attempt.id)).attempt.result.score, 1);
    assert.throws(() => new AssignmentService({ adapter }), (e) => e.code === 'ASSIGNMENTS_NOT_READY' && e.statusCode === 503);
    // written as before 006: every question is a single-answer MCQ
    assert.deepEqual(await db.all('SELECT DISTINCT question_type, numeric_answer FROM aia_questions'), [{ question_type: 'single_mcq', numeric_answer: null }]);
  });

  it('the full schema: both features work', async () => {
    const db = await createLmsTestDb();
    const adapter = db.adapter();
    assert.deepEqual([adapter.isReady(), adapter.supportsQuestionTypes(), adapter.supportsAssignments()], [true, true, true]);
    const svc = new AssessmentService({ adapter });
    const a = await svc.createAssessment(T1, { title: 'Post-006', subject: 'Maths' });
    assert.equal((await svc.addQuestion(T1, a.id, multi())).questions[0].type, 'multi_select');
    assert.equal((await new AssignmentService({ adapter }).create(T1, { title: 'Post-007', classroomId: IDS.class10, maxMarks: 5 })).status, 'draft');
  });
});

describe('AI can never write the teacher\'s final evaluation', () => {
  it('the only AI write (setSubmissionAiEvaluation) updates ai_* columns only', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../backend/src/adapters/lms/pgAssignmentStore.js'), 'utf8');
    const fn = src.slice(src.indexOf('setSubmissionAiEvaluation('), src.indexOf('getRedactionNames('));
    const setClause = /SET([\s\S]*?)WHERE/.exec(fn)[1];
    const columns = setClause.split(',').map((c) => c.trim().split(/\s*=/)[0]).filter(Boolean);
    assert.deepEqual(columns, ['ai_marks', 'ai_feedback', 'ai_question_marks_json', 'ai_limitations_json', 'ai_evaluated_at', 'updated_at']);
    for (const forbidden of ['final_marks', 'final_question_marks_json', 'teacher_feedback', 'evaluated_by', 'evaluated_at', 'status']) {
      assert.equal(columns.includes(forbidden), false, forbidden);
    }
  });
});
