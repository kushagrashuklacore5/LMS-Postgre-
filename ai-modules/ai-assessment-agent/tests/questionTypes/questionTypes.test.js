// Question types: number normalization, per-type validation and grading rules (pure; no database).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeNumber, isAnswerCorrect, studentQuestionView } = require('../../backend/src/core/questionTypes');
const { validateQuestionInput } = require('../../backend/src/core/assessmentValidation');
const { multi, numerical, mcq } = require('../helpers/lmsTestDb');

const codes = (fn) => { try { fn(); } catch (err) { return err.details.map((d) => `${d.field}:${d.code}`); } assert.fail('expected a validation error'); };

describe('normalizeNumber (canonical decimal text, never floats)', () => {
  it('canonicalizes equivalent spellings', () => {
    for (const [raw, fmt, out] of [
      ['42', 'integer', '42'], [' 042 ', 'integer', '42'], ['+7', 'integer', '7'], ['-0', 'integer', '0'], [-15, 'integer', '-15'],
      ['2.50', 'decimal', '2.5'], ['02.500', 'decimal', '2.5'], ['.5', 'decimal', '0.5'], ['-0.0', 'decimal', '0'], ['3', 'decimal', '3'],
      ['-12.125', 'decimal', '-12.125'], [0.1, 'decimal', '0.1'], ['5.', 'decimal', '5'],
    ]) assert.deepEqual(normalizeNumber(raw, fmt), { value: out }, `${raw} (${fmt})`);
  });

  it('refuses non-numbers, units, separators, fractions, exponents and over-long values', () => {
    for (const raw of ['', ' ', 'abc', '5 m', '1,000', '1/2', '1e3', '0x10', '--1', '1.2.3', '.', '+', 'NaN', 'Infinity', null, true, [], {}, Infinity, 1e21]) {
      assert.equal(normalizeNumber(raw, 'decimal').code, 'INVALID_NUMBER', JSON.stringify(raw));
    }
    assert.equal(normalizeNumber('3.0', 'integer').code, 'NOT_AN_INTEGER'); // exact integer: never rounded
    assert.equal(normalizeNumber('2.1234567', 'decimal').code, 'TOO_MANY_DECIMALS');
    assert.equal(normalizeNumber('1234567890123456', 'integer').code, 'TOO_MANY_DIGITS');
  });
});

describe('validateQuestionInput per type', () => {
  it('a question without a type is a single-answer MCQ, exactly as before', () => {
    const q = validateQuestionInput(mcq());
    assert.equal(q.type, 'single_mcq');
    assert.equal(q.numericAnswer, null);
    assert.equal(q.options.filter((o) => o.isCorrect).length, 1);
  });

  it('multiple-select: 4 distinct options, 2 or more correct', () => {
    assert.deepEqual(validateQuestionInput(multi()).options.map((o) => o.isCorrect), [false, true, false, true]);
    assert.equal(validateQuestionInput(multi('Which are numbers?', [0, 1, 2, 3])).options.every((o) => o.isCorrect), true);
    assert.deepEqual(codes(() => validateQuestionInput(multi('Which are even?', [1]))), ['options:TOO_FEW_CORRECT_OPTIONS']);
    assert.deepEqual(codes(() => validateQuestionInput(multi('Which are even?', []))), ['options:NO_CORRECT_OPTION']);
    const dup = multi(); dup.options[2].text = '4';
    assert.deepEqual(codes(() => validateQuestionInput(dup)), ['options:DUPLICATE_OPTIONS']);
    const three = multi(); three.options.pop();
    assert.deepEqual(codes(() => validateQuestionInput(three)), ['options:WRONG_OPTION_COUNT']);
    const flag = multi(); flag.options[0].isCorrect = 'true';
    assert.deepEqual(codes(() => validateQuestionInput(flag)), ['options[0].isCorrect:MUST_BE_BOOLEAN']);
    assert.deepEqual(codes(() => validateQuestionInput({ ...multi(), numericAnswer: { format: 'integer', value: '4' } })), ['numericAnswer:NOT_ALLOWED_FOR_TYPE']);
  });

  it('single MCQ keeps rejecting two correct options', () => {
    const two = mcq(); two.options[0].isCorrect = true;
    assert.deepEqual(codes(() => validateQuestionInput({ ...two, type: 'single_mcq' })), ['options:MULTIPLE_CORRECT_OPTIONS']);
  });

  it('numerical: no options; a valid integer or decimal answer key, stored canonically', () => {
    assert.deepEqual(validateQuestionInput(numerical()).numericAnswer, { format: 'integer', value: '42' });
    assert.deepEqual(validateQuestionInput(numerical('Area in m^2?', '12.50', 'decimal')).numericAnswer, { format: 'decimal', value: '12.5' });
    assert.deepEqual(validateQuestionInput(numerical()).options, []);
    assert.deepEqual(codes(() => validateQuestionInput(numerical('q?', 'forty-two'))), ['numericAnswer.value:INVALID_NUMBER']);
    assert.deepEqual(codes(() => validateQuestionInput(numerical('q?', '4.5', 'integer'))), ['numericAnswer.value:NOT_AN_INTEGER']);
    assert.deepEqual(codes(() => validateQuestionInput(numerical('q?', '4', 'fraction'))), ['numericAnswer.format:INVALID_NUMBER_FORMAT']);
    assert.deepEqual(codes(() => validateQuestionInput({ type: 'numerical', text: 'q?' })), ['numericAnswer:REQUIRED']);
    assert.deepEqual(codes(() => validateQuestionInput({ ...numerical(), options: mcq().options })), ['options:NOT_ALLOWED_FOR_TYPE']);
    assert.deepEqual(codes(() => validateQuestionInput({ ...numerical(), numericAnswer: { format: 'integer', value: '4', tolerance: 1 } })), ['numericAnswer.tolerance:UNKNOWN_FIELD']);
  });

  it('rejects unknown types and extra fields', () => {
    assert.deepEqual(codes(() => validateQuestionInput({ ...mcq(), type: 'essay' })), ['type:INVALID_QUESTION_TYPE']);
    assert.deepEqual(codes(() => validateQuestionInput({ ...multi(), correctAnswers: ['4'] })), ['correctAnswers:UNKNOWN_FIELD']);
  });
});

describe('grading rules (server-side, no partial credit)', () => {
  const single = { type: 'single_mcq', options: [0, 1, 2, 3].map((p) => ({ position: p, isCorrect: p === 2 })) };
  const multiQ = { type: 'multi_select', options: [0, 1, 2, 3].map((p) => ({ position: p, isCorrect: p === 1 || p === 3 })) };
  const intQ = { type: 'numerical', options: [], numericAnswer: { format: 'integer', value: '42' } };
  const decQ = { type: 'numerical', options: [], numericAnswer: { format: 'decimal', value: '2.5' } };

  it('single MCQ: correct only for the correct option', () => {
    assert.equal(isAnswerCorrect(single, { optionPosition: 2 }), true);
    assert.equal(isAnswerCorrect(single, { optionPosition: 1 }), false);
  });

  it('multiple-select: correct only for EXACTLY the correct set (order does not matter)', () => {
    assert.equal(isAnswerCorrect(multiQ, { optionPositions: [1, 3] }), true);
    assert.equal(isAnswerCorrect(multiQ, { optionPositions: [3, 1] }), true);
    assert.equal(isAnswerCorrect(multiQ, { optionPositions: [1] }), false); // subset
    assert.equal(isAnswerCorrect(multiQ, { optionPositions: [1, 2, 3] }), false); // superset
    assert.equal(isAnswerCorrect(multiQ, { optionPositions: [0, 2] }), false);
  });

  it('numerical: exact canonical comparison', () => {
    assert.equal(isAnswerCorrect(intQ, { value: '42' }), true);
    assert.equal(isAnswerCorrect(intQ, { value: '43' }), false);
    assert.equal(isAnswerCorrect(decQ, { value: '2.5' }), true);
    assert.equal(isAnswerCorrect(decQ, { value: '2.51' }), false);
  });

  it('the student view of a question never carries an answer key', () => {
    for (const q of [{ ...single, id: 1, position: 1, text: 't' }, { ...multiQ, id: 2, position: 2, text: 't' }, { ...intQ, id: 3, position: 3, text: 't' }]) {
      const json = JSON.stringify(studentQuestionView({ ...q, options: q.options.map((o) => ({ ...o, text: 'x' })), explanation: 'secret' }));
      for (const leak of ['isCorrect', '"42"', 'numericAnswer', 'secret']) assert.equal(json.includes(leak), false, `${q.type}: ${leak}`);
    }
    assert.equal(studentQuestionView({ ...intQ, id: 3, position: 3, text: 't' }).numericFormat, 'integer');
  });
});
