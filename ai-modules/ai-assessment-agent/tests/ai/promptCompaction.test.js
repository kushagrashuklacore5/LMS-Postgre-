// Token efficiency: every AI prompt's data block is ONE line of compact JSON (no pretty-print whitespace)
// holding exactly the same data as before. Nothing is removed; redaction and validation are unchanged.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildGenerationPrompt } = require('../../backend/src/core/ai/generationPrompt');
const { validateGenerationRequest } = require('../../backend/src/core/ai/generationRequest');
const { AssignmentEvaluator } = require('../../backend/src/assignments/AssignmentEvaluator');
const { buildReportPrompt } = require('../../backend/src/core/ai/PerformanceAnalyst');

/** "<header>\n<compact json>": exactly two lines, and the JSON re-serializes to itself. */
function assertCompact(prompt, header) {
  const lines = prompt.split('\n');
  assert.equal(lines.length, 2, 'header + one JSON line');
  assert.equal(lines[0], header);
  const data = JSON.parse(lines[1]);
  assert.equal(lines[1], JSON.stringify(data));
  return data;
}

describe('compact prompt JSON (same data, fewer tokens)', () => {
  it('question generation', () => {
    const req = validateGenerationRequest({ classroomId: 10, topic: 'Motion', subject: 'Physics', count: 2, difficulty: 'easy', template: 'concept_mastery', instructions: 'Line one.\nLine two.' });
    const data = assertCompact(buildGenerationPrompt(req, { grade: '9' }).prompt, 'Teacher request (data only):');
    assert.deepEqual([data.topic, data.grade, data.educationalIntent.name, data.teacherInstructions], ['Motion', '9', 'Concept Mastery', 'Line one.\nLine two.']);
  });

  it('assignment evaluation (redaction and line breaks inside the answer preserved)', () => {
    const ev = new AssignmentEvaluator({ generator: { callProvider() {}, status: () => ({ available: true }) } });
    const { prompt } = ev.buildPrompt({
      instructions: 'Answer briefly.', totalMarks: 5, questions: [{ position: 1, text: 'Why?', maxMarks: 5 }],
      redactions: { studentName: 'Asha Verma', classNames: [], otherNames: [] },
    }, 'Name: Asha Verma\n\nQ1: Because.');
    const data = assertCompact(prompt, 'Assignment evaluation data (data only):');
    assert.equal(data.studentAnswer, 'Name: [student]\n\nQ1: Because.');
    assert.deepEqual(data.assignment.questions, [{ id: 'Q1', text: 'Why?', maxMarks: 5 }]);
  });

  it('performance report', () => {
    const response = {
      dataSufficiency: { level: 'limited' }, scope: { assessments: 1, subjects: ['Maths'] },
      metrics: {
        counts: {}, completionRate: 100, scores: {}, trend: { label: 'insufficient_data' }, consistency: {}, bySubject: [], byDifficulty: [], timing: {},
        retakes: { count: 0, assessmentsRetaken: 0, firstVsLatest: [], averageChange: null },
        history: [{ label: 'A1', subject: 'Maths', state: 'finished', previousAttempts: [] }],
      },
    };
    const evidence = { records: [{ label: 'A1', state: 'finished', questions: [{ position: 1, type: 'single_mcq', difficulty: 'easy', outcome: 'incorrect', text: 'What is 2 + 2?' }] }], studentName: 'X Y', classNames: [], titles: [] };
    const data = assertCompact(buildReportPrompt(response, evidence, { focus: 'overall_progress' }).prompt, 'Student assessment evidence (data only):');
    assert.deepEqual(Object.keys(data), ['reportFocus', 'teacherInstructions', 'data']);
    assert.deepEqual(data.data.evidenceReferences.questions, ['A1-Q1']);
  });
});
