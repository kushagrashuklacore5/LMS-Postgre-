/**
 * APPROXIMATE prompt-cost estimation for the three AI flows, with NO network and NO tokenizer dependency.
 * tokens ~= characters / 4 (English prose; JSON punctuation tokenizes a little denser, so treat results
 * as +-20%). Real counts come only from a provider's usage metadata (see tests/manual/realAssignmentEvalCheck.js).
 *
 * representativePrompts() builds each flow's prompt with the REAL builders from typical synthetic input:
 *   question generation   10 questions, a template, instructions, 9 questions to avoid (regenerate case)
 *   performance report    8 finished assessments, 3 subjects, 3 difficulties, 10 question samples
 *   assignment evaluation 3 questions, ~1,800-character answer
 * Input cost = system instruction + user prompt + JSON schema (sent as response_format).
 */
const { buildGenerationPrompt } = require('../../backend/src/core/ai/generationPrompt');
const { validateGenerationRequest } = require('../../backend/src/core/ai/generationRequest');
const { buildReportPrompt, SYSTEM_INSTRUCTION: REPORT_SYSTEM } = require('../../backend/src/core/ai/PerformanceAnalyst');
const { ANALYSIS_SCHEMA } = require('../../backend/src/core/ai/analysisSchema');
const { AssignmentEvaluator, SYSTEM_INSTRUCTION: EVAL_SYSTEM } = require('../../backend/src/assignments/AssignmentEvaluator');
const { EVALUATION_SCHEMA } = require('../../backend/src/assignments/evaluationSchema');
const { toJsonSchema } = require('../../backend/src/llm/HuggingFaceProvider');

const estimateTokens = (text) => Math.ceil(String(text).length / 4);

function generationCase() {
  const req = validateGenerationRequest({
    classroomId: 10, topic: 'Motion', subject: 'Physics', count: 10, difficulty: 'medium', template: 'concept_mastery', instructions: 'Use real-life examples.',
    avoidQuestions: Array.from({ length: 9 }, (_, i) => `An existing question number ${i} about velocity and acceleration in everyday situations?`),
  });
  const p = buildGenerationPrompt(req, { grade: '9' });
  return { flow: 'question generation', system: p.systemInstruction, prompt: p.prompt, schema: p.jsonSchema };
}

function reportCase() {
  const subjects = ['Maths', 'Physics', 'Chemistry'];
  const history = Array.from({ length: 8 }, (_, i) => ({
    label: `A${i + 1}`, subject: subjects[i % 3], state: 'finished', attemptStatus: 'submitted', totalQuestions: 10, score: 6, correct: 6, incorrect: 3,
    unattempted: 1, percentage: 60, classAveragePercentage: 64.5, timeUsedPercent: 71.2, attemptNumber: 1, previousAttempts: [],
  }));
  const response = {
    dataSufficiency: { level: 'adequate' }, scope: { assessments: 8, subjects },
    metrics: {
      counts: { assigned: 8, attempted: 8, inProgress: 0, missed: 0, pending: 0, upcoming: 0 }, completionRate: 100,
      scores: { average: 60, median: 60, best: 80, worst: 40, lastThreeAverage: 63.33 }, trend: { label: 'stable', slopePerAssessment: 1.2 },
      consistency: { label: 'moderate', standardDeviation: 12.4 },
      bySubject: subjects.map((s) => ({ subject: s, assessments: 3, questions: 30, correct: 18, percentage: 60, averageAssessmentPercentage: 60 })),
      byDifficulty: ['easy', 'medium', 'hard'].map((d) => ({ difficulty: d, questions: 26, answered: 25, correct: 16, percentage: 61.54 })),
      timing: { unansweredRate: 10, timedOutRate: 0, averageTimeUsedPercent: 71.2, timedAssessments: 8 },
      retakes: { count: 0, assessmentsRetaken: 0, firstVsLatest: [], averageChange: null }, history,
    },
  };
  const evidence = {
    records: history.map((h) => ({
      label: h.label, state: 'finished',
      questions: Array.from({ length: 2 }, (_, q) => ({ position: q + 1, type: 'single_mcq', difficulty: 'hard', outcome: q ? 'correct' : 'incorrect', text: 'A sample question of typical length about a concept the student found difficult in this assessment?' })),
    })),
    studentName: 'Synthetic Learner', classNames: [], titles: [],
  };
  const p = buildReportPrompt(response, evidence, { focus: 'overall_progress', instructions: '' });
  return { flow: 'performance report', system: REPORT_SYSTEM, prompt: p.prompt, schema: ANALYSIS_SCHEMA };
}

function evaluationCase() {
  const ev = new AssignmentEvaluator({ generator: { callProvider() {}, status: () => ({ available: true }) } });
  const { prompt } = ev.buildPrompt({
    instructions: 'Answer each question in full sentences.', totalMarks: 10,
    questions: [1, 2, 3].map((i) => ({ position: i, text: `A typical descriptive question of moderate length, number ${i}, asking the student to explain a concept?`, maxMarks: i === 3 ? 4 : 3 })),
    redactions: { studentName: 'Synthetic Learner', classNames: [], otherNames: [] },
  }, 'answer text '.repeat(150));
  return { flow: 'assignment evaluation', system: EVAL_SYSTEM, prompt, schema: EVALUATION_SCHEMA };
}

/** [{ flow, systemTokens, promptTokens, schemaTokens, inputTokens }] - approximate. */
function representativePrompts() {
  return [generationCase(), reportCase(), evaluationCase()].map((c) => {
    const schemaText = JSON.stringify(toJsonSchema(c.schema));
    const systemTokens = estimateTokens(c.system);
    const promptTokens = estimateTokens(c.prompt);
    const schemaTokens = estimateTokens(schemaText);
    return { flow: c.flow, prompt: c.prompt, systemTokens, promptTokens, schemaTokens, inputTokens: systemTokens + promptTokens + schemaTokens };
  });
}

module.exports = { estimateTokens, representativePrompts };
