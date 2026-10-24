// Student Performance Analyst: deterministic metric calculations (pure, hand-built records).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeMetrics, dataSufficiency, trendOf, consistencyOf, median } = require('../../backend/src/core/analytics/performanceMetrics');

const at = (min) => new Date(Date.parse('2026-10-01T09:00:00Z') + min * 60000).toISOString();
let n = 0;
/** A finished record: pct from correct/total; questions with difficulty/outcome. */
function finished({ subject = 'Biology', correct, total, finishedMin, startedMin, duration = 10, expired = false, qs, previous = [], classPct = null }) {
  n += 1;
  const unattempted = qs ? qs.filter((q) => q[1] === 'unattempted').length : 0;
  return {
    assessmentId: n, label: `A${n}`, title: `T${n}`, subject, publishedAt: at(n), durationMinutes: duration, state: 'finished',
    attempt: { status: expired ? 'expired' : 'submitted', startedAt: at(startedMin ?? finishedMin - 5), finishedAt: at(finishedMin), totalQuestions: total, attempted: total - unattempted, correct, incorrect: total - unattempted - correct, unattempted, score: correct, percentage: Math.round((correct / total) * 10000) / 100 },
    attemptNumber: previous.length + 1, previousAttempts: previous,
    questions: (qs || []).map(([difficulty, outcome]) => ({ difficulty, outcome, text: 'q' })),
    classAverage: { percentage: classPct, finishedCount: classPct === null ? 0 : 3 },
  };
}
const other = (state) => { n += 1; return { assessmentId: n, label: `A${n}`, title: `T${n}`, subject: 'Biology', publishedAt: at(n), durationMinutes: 10, state, attempt: null, attemptNumber: null, previousAttempts: [], questions: [], classAverage: { percentage: null, finishedCount: 0 } }; };

describe('scores', () => {
  it('average, median, best, worst, last three (ordered by finish time)', () => {
    const recs = [
      finished({ correct: 2, total: 4, finishedMin: 100 }), // 50
      finished({ correct: 3, total: 4, finishedMin: 300 }), // 75
      finished({ correct: 4, total: 4, finishedMin: 200 }), // 100
      finished({ correct: 1, total: 4, finishedMin: 400 }), // 25
    ];
    const m = computeMetrics(recs);
    assert.deepEqual(m.scores, { average: 62.5, median: 62.5, best: 100, worst: 25, lastThreeAverage: 66.67 }); // last 3 by time: 100, 75, 25
    assert.equal(median([1, 2, 3]), 2);
  });

  it('no finished tests -> null scores, not zeros', () => {
    const m = computeMetrics([other('pending'), other('missed')]);
    assert.deepEqual(m.scores, { average: null, median: null, best: null, worst: null, lastThreeAverage: null });
    assert.equal(m.completionRate, 0); // 0 finished of 1 (finished + missed)
  });
});

describe('trend and consistency', () => {
  it('improving / declining / stable thresholds (±5 points per assessment)', () => {
    assert.equal(trendOf([40, 50, 60]).label, 'improving');
    assert.deepEqual(trendOf([80, 70, 60]), { label: 'declining', slopePerAssessment: -10 });
    assert.equal(trendOf([60, 64, 62]).label, 'stable');
    assert.equal(trendOf([60, 70]).label, 'insufficient_data');
  });

  it('consistency by standard deviation (<=10 consistent, <=20 moderate, else variable)', () => {
    assert.deepEqual(consistencyOf([60, 65, 70]), { label: 'consistent', standardDeviation: 4.08 });
    assert.equal(consistencyOf([40, 60, 75]).label, 'moderate');
    assert.equal(consistencyOf([10, 90, 50]).label, 'variable');
    assert.equal(consistencyOf([50]).label, 'insufficient_data');
  });
});

describe('breakdowns', () => {
  it('subject breakdown from correct/questions of finished tests', () => {
    const m = computeMetrics([
      finished({ subject: 'Biology', correct: 3, total: 4, finishedMin: 10 }),
      finished({ subject: 'Biology', correct: 1, total: 4, finishedMin: 20 }),
      finished({ subject: 'Chemistry', correct: 2, total: 2, finishedMin: 30 }),
    ]);
    assert.deepEqual(m.bySubject.map((s) => [s.subject, s.assessments, s.questions, s.correct, s.percentage, s.averageAssessmentPercentage]), [
      ['Biology', 2, 8, 4, 50, 50], ['Chemistry', 1, 2, 2, 100, 100],
    ]);
  });

  it('difficulty breakdown per question, incl. unspecified; empty levels omitted', () => {
    const m = computeMetrics([finished({ correct: 2, total: 5, finishedMin: 10, qs: [['easy', 'correct'], ['easy', 'incorrect'], ['hard', 'correct'], ['hard', 'unattempted'], ['unspecified', 'incorrect']] })]);
    assert.deepEqual(m.byDifficulty, [
      { difficulty: 'easy', questions: 2, answered: 2, correct: 1, percentage: 50 },
      { difficulty: 'hard', questions: 2, answered: 1, correct: 1, percentage: 50 },
      { difficulty: 'unspecified', questions: 1, answered: 1, correct: 0, percentage: 0 },
    ]);
  });
});

describe('counts, completion, timing, retakes, class average, history', () => {
  it('counts and completion rate = finished / (finished + missed)', () => {
    const m = computeMetrics([finished({ correct: 1, total: 1, finishedMin: 5 }), other('missed'), other('pending'), other('upcoming'), other('in_progress')]);
    assert.deepEqual(m.counts, { assigned: 5, attempted: 1, inProgress: 1, missed: 1, pending: 1, upcoming: 1 });
    assert.equal(m.completionRate, 50);
  });

  it('unanswered rate, timed-out rate, time used vs allowed', () => {
    const m = computeMetrics([
      finished({ correct: 1, total: 4, finishedMin: 10, startedMin: 5, duration: 10, qs: [['easy', 'correct'], ['easy', 'unattempted'], ['easy', 'unattempted'], ['easy', 'incorrect']] }), // 5 of 10 min
      finished({ correct: 2, total: 4, finishedMin: 30, startedMin: 20, duration: 10, expired: true }), // 10 of 10 min, timed out
    ]);
    assert.deepEqual(m.timing, { unansweredRate: 25, timedOutRate: 50, averageTimeUsedPercent: 75, timedAssessments: 2 });
    assert.deepEqual(m.history.map((h) => [h.timeUsedSeconds, h.allowedSeconds, h.timeUsedPercent]), [[300, 600, 50], [600, 600, 100]]);
  });

  it('retakes: archived attempts are history; first vs latest uses the CURRENT attempt', () => {
    const prev = [{ status: 'submitted', score: 1, totalQuestions: 4, percentage: 25, finishedAt: at(1) }, { status: 'submitted', score: 2, totalQuestions: 4, percentage: 50, finishedAt: at(2) }];
    const rec = finished({ correct: 4, total: 4, finishedMin: 30, previous: prev });
    const m = computeMetrics([rec]);
    assert.deepEqual(m.retakes, { count: 2, assessmentsRetaken: 1, firstVsLatest: [{ label: rec.label, firstPercentage: 25, latestPercentage: 100, change: 75 }], averageChange: 75 });
    assert.equal(m.scores.average, 100); // archived results never count as current performance
    assert.equal(m.history[0].attemptNumber, 3);
  });

  it('history carries the aggregate class average', () => {
    const m = computeMetrics([finished({ correct: 1, total: 2, finishedMin: 5, classPct: 62.5 })]);
    assert.deepEqual([m.history[0].classAveragePercentage, m.history[0].classFinishedCount], [62.5, 3]);
  });
});

describe('data sufficiency', () => {
  it('0 -> none, 1-2 -> limited, 3+ -> adequate', () => {
    assert.deepEqual(dataSufficiency(0), { level: 'none', finishedAssessments: 0, trendAvailable: false, consistencyAvailable: false, lastThreeAvailable: false });
    assert.equal(dataSufficiency(1).level, 'limited');
    assert.equal(dataSufficiency(2).level, 'limited');
    assert.deepEqual(dataSufficiency(3), { level: 'adequate', finishedAssessments: 3, trendAvailable: true, consistencyAvailable: true, lastThreeAvailable: true });
  });
});
