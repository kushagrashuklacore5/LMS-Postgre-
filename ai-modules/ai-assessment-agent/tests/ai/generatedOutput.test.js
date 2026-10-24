// Strict structural validation of model output (requirements 3-8 + strictness extras).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseGeneratedOutput } = require('../../backend/src/core/ai/generatedOutput');
const { genOutput, genQuestion } = require('../helpers/mockProvider');

const codes = (raw, count = 2, opts = {}) => parseGeneratedOutput(raw, { count, ...opts }).problems.map((p) => `${p.field}:${p.code}`);

describe('parseGeneratedOutput', () => {
  it('accepts well-formed output and converts correctAnswer into exactly one isCorrect option', () => {
    const { questions, problems } = parseGeneratedOutput(genOutput(2), { count: 2 });
    assert.deepEqual(problems, []);
    assert.equal(questions.length, 2);
    assert.deepEqual(questions[0].options.map((o) => o.isCorrect), [false, true, false, false]);
    assert.equal(questions[0].explanation, 'Planet beta 0 is correct because of fact 0.');
    assert.equal(questions[0].difficulty, 'medium');
  });

  it('safe normalization only: trims whitespace, strips one ```json fence, matches answer case/spacing-insensitively', () => {
    const raw = '```json\n' + genOutput(1, (q) => { q[0].question = '  ' + q[0].question + '  '; q[0].correctAnswer = '  planet   BETA 0 '; }) + '\n```';
    const { questions, problems } = parseGeneratedOutput(raw, { count: 1 });
    assert.deepEqual(problems, []);
    assert.equal(questions[0].text.startsWith('Which'), true);
    assert.equal(questions[0].options[1].text, 'Planet beta 0'); // option text kept as the model wrote it
  });

  it('3. invalid JSON / empty / non-object output', () => {
    assert.deepEqual(codes('Here are your questions: {"questions": ['), [':INVALID_JSON']);
    assert.deepEqual(codes(''), [':EMPTY_OUTPUT']);
    assert.deepEqual(codes('[1,2]'), [':NOT_AN_OBJECT']);
    assert.deepEqual(codes('{"items": []}'), ['items:UNEXPECTED_FIELD', 'questions:MISSING_QUESTIONS']);
  });

  it('4. missing or empty question fields', () => {
    const raw = genOutput(2, (q) => { delete q[0].explanation; q[1].question = '   '; delete q[1].difficulty; });
    assert.deepEqual(codes(raw), [
      'questions[0].explanation:MISSING_FIELD',
      'questions[1].question:EMPTY', 'questions[1].difficulty:MISSING_FIELD',
    ]);
  });

  it('5. wrong number of options (3 or 5) and non-string options', () => {
    const raw = genOutput(2, (q) => { q[0].options.pop(); q[1].options.push('Planet epsilon'); });
    assert.deepEqual(codes(raw), ['questions[0].options:WRONG_OPTION_COUNT', 'questions[1].options:WRONG_OPTION_COUNT']);
    assert.deepEqual(codes(genOutput(1, (q) => { q[0].options[2] = 7; }), 1), ['questions[0].options[2]:WRONG_TYPE']);
  });

  it('6. multiple correct answers', () => {
    const raw = genOutput(1, (q) => { q[0].correctAnswer = ['Planet beta 0', 'Planet gamma 0']; });
    assert.deepEqual(codes(raw, 1), ['questions[0].correctAnswer:MULTIPLE_CORRECT_ANSWERS']);
  });

  it('7. correct answer missing or not matching one of the options (no guessing from letters/indexes)', () => {
    assert.deepEqual(codes(genOutput(1, (q) => { q[0].correctAnswer = 'Planet zeta'; }), 1), ['questions[0].correctAnswer:CORRECT_ANSWER_NOT_IN_OPTIONS']);
    assert.deepEqual(codes(genOutput(1, (q) => { q[0].correctAnswer = 'B'; }), 1), ['questions[0].correctAnswer:CORRECT_ANSWER_NOT_IN_OPTIONS']);
    assert.deepEqual(codes(genOutput(1, (q) => { q[0].correctAnswer = 1; }), 1), ['questions[0].correctAnswer:WRONG_TYPE']);
    assert.deepEqual(codes(genOutput(1, (q) => { delete q[0].correctAnswer; }), 1), ['questions[0].correctAnswer:MISSING_CORRECT_ANSWER']);
  });

  it('duplicate options are rejected', () => {
    assert.deepEqual(codes(genOutput(1, (q) => { q[0].options[3] = ' planet ALPHA 0 '; }), 1), ['questions[0].options:DUPLICATE_OPTIONS']);
  });

  it('8. duplicate questions (ignoring case/punctuation) and repeats of the teacher\'s existing questions', () => {
    const raw = genOutput(2, (q) => { q[1] = genQuestion(0, { question: q[0].question.toUpperCase().replace('?', '') }); });
    assert.deepEqual(codes(raw), ['questions[1].question:DUPLICATE_QUESTION']);
    const again = codes(genOutput(1), 1, { avoidQuestions: [genQuestion(0).question] });
    assert.deepEqual(again, ['questions[0].question:DUPLICATE_OF_EXISTING_QUESTION']);
  });

  it('requested question count must be satisfied exactly', () => {
    assert.deepEqual(codes(genOutput(3), 5), ['questions:WRONG_QUESTION_COUNT']);
    assert.deepEqual(codes(genOutput(3), 2), ['questions:WRONG_QUESTION_COUNT']);
  });

  it('unexpected fields violate the structure (top-level and per question)', () => {
    const raw = JSON.stringify({ questions: [genQuestion(0, { isCorrect: true, correctOptionIndex: 1 })], note: 'hi' });
    assert.deepEqual(codes(raw, 1), ['note:UNEXPECTED_FIELD', 'questions[0].isCorrect:UNEXPECTED_FIELD', 'questions[0].correctOptionIndex:UNEXPECTED_FIELD']);
  });

  it('wrong difficulty value and wrong types', () => {
    assert.deepEqual(codes(genOutput(1, (q) => { q[0].difficulty = 'expert'; q[0].question = 5; }), 1), [
      'questions[0].question:WRONG_TYPE', 'questions[0].difficulty:INVALID_DIFFICULTY',
    ]);
  });

  it('problems carry codes and locations only, never model text', () => {
    const raw = genOutput(1, (q) => { q[0].correctAnswer = 'SECRET-MODEL-TEXT'; });
    const { problems } = parseGeneratedOutput(raw, { count: 1 });
    assert.equal(JSON.stringify(problems).includes('SECRET-MODEL-TEXT'), false);
  });
});
