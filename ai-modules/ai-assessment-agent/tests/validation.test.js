const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateAssessmentInput, validateQuestionInput, LIMITS } = require('../backend/src/core/assessmentValidation');
const { mcq } = require('./helpers/lmsTestDb');

/** Returns the { field, code } details of the thrown VALIDATION_FAILED error. */
function problems(fn) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.code, 'VALIDATION_FAILED');
    assert.equal(err.statusCode, 400);
    return err.details.map((d) => `${d.field}:${d.code}`);
  }
  assert.fail('expected a validation error');
}

describe('validateQuestionInput - MCQ rules', () => {
  it('accepts 4 options with exactly one correct and trims text', () => {
    const q = validateQuestionInput({ text: '  Capital of France? ', options: [
      { text: ' Paris ', isCorrect: true }, { text: 'Rome', isCorrect: false },
      { text: 'Berlin', isCorrect: false }, { text: 'Madrid', isCorrect: false },
    ] });
    assert.equal(q.text, 'Capital of France?');
    assert.deepEqual(q.options.map((o) => o.text), ['Paris', 'Rome', 'Berlin', 'Madrid']);
    assert.deepEqual(q.options.map((o) => o.isCorrect), [true, false, false, false]);
  });

  it('rejects zero correct options', () => {
    const body = mcq();
    body.options.forEach((o) => { o.isCorrect = false; });
    assert.deepEqual(problems(() => validateQuestionInput(body)), ['options:NO_CORRECT_OPTION']);
  });

  it('rejects more than one correct option', () => {
    const body = mcq();
    body.options[0].isCorrect = true;
    assert.deepEqual(problems(() => validateQuestionInput(body)), ['options:MULTIPLE_CORRECT_OPTIONS']);
  });

  it('rejects 3 or 5 options', () => {
    const three = mcq(); three.options.pop();
    const five = mcq(); five.options.push({ text: 'x', isCorrect: false });
    assert.deepEqual(problems(() => validateQuestionInput(three)), ['options:WRONG_OPTION_COUNT']);
    assert.deepEqual(problems(() => validateQuestionInput(five)), ['options:WRONG_OPTION_COUNT']);
  });

  it('requires a strict boolean isCorrect (not "true" or 1)', () => {
    const body = mcq();
    body.options[1].isCorrect = 'true';
    body.options[2].isCorrect = 1;
    assert.deepEqual(problems(() => validateQuestionInput(body)), ['options[1].isCorrect:MUST_BE_BOOLEAN', 'options[2].isCorrect:MUST_BE_BOOLEAN']);
  });

  it('rejects empty/blank question and option text', () => {
    const body = mcq('   ');
    body.options[3].text = '';
    assert.deepEqual(problems(() => validateQuestionInput(body)), ['text:REQUIRED', 'options[3].text:REQUIRED']);
  });

  it('rejects duplicate options (case-insensitive)', () => {
    const body = mcq();
    body.options[2].text = '4 ';
    assert.deepEqual(problems(() => validateQuestionInput(body)), ['options:DUPLICATE_OPTIONS']);
  });

  it('rejects over-long text', () => {
    const body = mcq('q'.repeat(LIMITS.questionTextMax + 1));
    body.options[0].text = 'o'.repeat(LIMITS.optionTextMax + 1);
    assert.deepEqual(problems(() => validateQuestionInput(body)), ['text:TOO_LONG', 'options[0].text:TOO_LONG']);
  });

  it('rejects unknown fields on the question and options (e.g. ids, a correct index)', () => {
    const body = { ...mcq(), assessmentId: 5, correctOptionIndex: 0 };
    body.options[0].id = 3;
    assert.deepEqual(problems(() => validateQuestionInput(body)), ['assessmentId:UNKNOWN_FIELD', 'correctOptionIndex:UNKNOWN_FIELD', 'options[0].id:UNKNOWN_FIELD']);
  });

  it('rejects non-object input and non-list options', () => {
    assert.deepEqual(problems(() => validateQuestionInput(null)), [':MUST_BE_OBJECT']);
    assert.deepEqual(problems(() => validateQuestionInput([])), [':MUST_BE_OBJECT']);
    assert.deepEqual(problems(() => validateQuestionInput({ text: 'q', options: 'abcd' })), ['options:MUST_BE_LIST']);
    assert.deepEqual(problems(() => validateQuestionInput({ text: 'q' })), ['options:REQUIRED']);
  });
});

describe('validateAssessmentInput', () => {
  it('requires title and subject on create and fills defaults', () => {
    assert.deepEqual(problems(() => validateAssessmentInput({})), ['title:REQUIRED', 'subject:REQUIRED']);
    assert.deepEqual(validateAssessmentInput({ title: ' Unit 1 ', subject: 'Maths' }), {
      title: 'Unit 1', subject: 'Maths', description: '', classroomId: null, durationMinutes: null,
    });
  });

  it('rejects server-owned fields sent by the client', () => {
    const codes = problems(() => validateAssessmentInput({ title: 't', subject: 's', universityId: 2, teacherId: 9, status: 'published', role: 'mentor', id: 1 }));
    assert.deepEqual(codes, ['universityId:UNKNOWN_FIELD', 'teacherId:UNKNOWN_FIELD', 'status:UNKNOWN_FIELD', 'role:UNKNOWN_FIELD', 'id:UNKNOWN_FIELD']);
  });

  it('checks duration range and classroom id type', () => {
    assert.deepEqual(problems(() => validateAssessmentInput({ title: 't', subject: 's', durationMinutes: 0, classroomId: '10' })), [
      'classroomId:INVALID_ID', 'durationMinutes:OUT_OF_RANGE',
    ]);
    assert.deepEqual(problems(() => validateAssessmentInput({ title: 't', subject: 's', durationMinutes: 601 })), ['durationMinutes:OUT_OF_RANGE']);
    assert.equal(validateAssessmentInput({ title: 't', subject: 's', durationMinutes: 45, classroomId: 10 }).durationMinutes, 45);
  });

  it('partial: validates only sent fields, allows clearing, refuses empty edits', () => {
    assert.deepEqual(validateAssessmentInput({ classroomId: null, durationMinutes: null }, { partial: true }), { classroomId: null, durationMinutes: null });
    assert.deepEqual(validateAssessmentInput({ description: null }, { partial: true }), { description: '' });
    assert.deepEqual(problems(() => validateAssessmentInput({}, { partial: true })), [':NOTHING_TO_UPDATE']);
    assert.deepEqual(problems(() => validateAssessmentInput({ title: '' }, { partial: true })), ['title:REQUIRED']);
  });
});
