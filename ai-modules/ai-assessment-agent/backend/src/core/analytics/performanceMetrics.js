/**
 * Student Performance Analyst - deterministic, pure metric calculations.
 * No database, no clock, no LLM. The backend is authoritative for EVERY number shown
 * to the teacher; the AI only interprets these values later.
 *
 * Input: per-assessment records built by StudentPerformanceService (one per test in scope):
 *   { assessmentId, label, title, subject, publishedAt, durationMinutes,
 *     state: 'finished' | 'in_progress' | 'missed' | 'pending' | 'upcoming',
 *     attempt: null | { status, startedAt, finishedAt, totalQuestions, attempted, correct, incorrect, unattempted, score, percentage },
 *     attemptNumber, previousAttempts: [{ status, score, totalQuestions, percentage, finishedAt }],   // archived = history only
 *     questions: [{ difficulty, outcome: 'correct' | 'incorrect' | 'unattempted', text }],              // finished current attempt only
 *     classAverage: { percentage, finishedCount } }
 */
const TREND_THRESHOLD = 5;       // percentage points per assessment
const CONSISTENT_SD = 10;        // standard deviation (percentage points)
const MODERATE_SD = 20;
const DIFFICULTIES = ['easy', 'medium', 'hard', 'unspecified'];

const round2 = (x) => Math.round(x * 100) / 100;
const pct = (num, den) => (den > 0 ? round2((num / den) * 100) : null);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const mean = (xs) => (xs.length ? round2(sum(xs) / xs.length) : null);
const toMs = (iso) => (iso ? Date.parse(iso) : NaN);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

/** Least-squares slope of y over x = 0..n-1 (percentage points per assessment). */
function slope(ys) {
  const n = ys.length;
  const xm = (n - 1) / 2;
  const ym = sum(ys) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  return den === 0 ? 0 : num / den;
}

function standardDeviation(xs) {
  const m = sum(xs) / xs.length;
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length); // population SD
}

/** 0 finished -> none; 1-2 -> limited; 3+ -> adequate. */
function dataSufficiency(finishedCount) {
  const level = finishedCount === 0 ? 'none' : finishedCount < 3 ? 'limited' : 'adequate';
  return { level, finishedAssessments: finishedCount, trendAvailable: finishedCount >= 3, consistencyAvailable: finishedCount >= 3, lastThreeAvailable: finishedCount >= 3 };
}

function trendOf(percentagesInTimeOrder) {
  if (percentagesInTimeOrder.length < 3) return { label: 'insufficient_data', slopePerAssessment: null };
  const s = round2(slope(percentagesInTimeOrder));
  return { label: s > TREND_THRESHOLD ? 'improving' : s < -TREND_THRESHOLD ? 'declining' : 'stable', slopePerAssessment: s };
}

function consistencyOf(percentages) {
  if (percentages.length < 3) return { label: 'insufficient_data', standardDeviation: null };
  const sd = round2(standardDeviation(percentages));
  return { label: sd <= CONSISTENT_SD ? 'consistent' : sd <= MODERATE_SD ? 'moderate' : 'variable', standardDeviation: sd };
}

function computeMetrics(records) {
  const finished = records.filter((r) => r.state === 'finished');
  const byFinish = [...finished].sort((a, b) => toMs(a.attempt.finishedAt) - toMs(b.attempt.finishedAt) || a.assessmentId - b.assessmentId);
  const percentages = byFinish.map((r) => r.attempt.percentage);
  const lastThree = percentages.slice(-3);
  const count = (state) => records.filter((r) => r.state === state).length;
  const missed = count('missed');

  // Subject breakdown (finished current attempts only).
  const subjects = new Map();
  for (const r of finished) {
    const s = subjects.get(r.subject) || { subject: r.subject, assessments: 0, questions: 0, correct: 0, percentages: [] };
    s.assessments += 1; s.questions += r.attempt.totalQuestions; s.correct += r.attempt.correct; s.percentages.push(r.attempt.percentage);
    subjects.set(r.subject, s);
  }
  const bySubject = [...subjects.values()]
    .map((s) => ({ subject: s.subject, assessments: s.assessments, questions: s.questions, correct: s.correct, percentage: pct(s.correct, s.questions), averageAssessmentPercentage: mean(s.percentages) }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  // Difficulty breakdown (per question of finished current attempts).
  const byDifficulty = DIFFICULTIES.map((d) => {
    const qs = finished.flatMap((r) => r.questions).filter((q) => (q.difficulty || 'unspecified') === d);
    const answered = qs.filter((q) => q.outcome !== 'unattempted').length;
    const correct = qs.filter((q) => q.outcome === 'correct').length;
    return { difficulty: d, questions: qs.length, answered, correct, percentage: pct(correct, qs.length) };
  }).filter((d) => d.questions > 0);

  // Timing.
  const timed = finished.filter((r) => r.durationMinutes && r.attempt.startedAt && r.attempt.finishedAt);
  const usedPercents = timed.map((r) => ((toMs(r.attempt.finishedAt) - toMs(r.attempt.startedAt)) / 1000 / (r.durationMinutes * 60)) * 100);
  const timing = {
    unansweredRate: pct(sum(finished.map((r) => r.attempt.unattempted)), sum(finished.map((r) => r.attempt.totalQuestions))),
    timedOutRate: pct(finished.filter((r) => r.attempt.status === 'expired').length, finished.length),
    averageTimeUsedPercent: usedPercents.length ? round2(sum(usedPercents) / usedPercents.length) : null,
    timedAssessments: timed.length,
  };

  // Retakes: archived attempts are HISTORY only; "latest" is the finished current attempt.
  const retaken = records.filter((r) => r.previousAttempts.length > 0);
  const firstVsLatest = retaken
    .filter((r) => r.state === 'finished')
    .map((r) => {
      const first = r.previousAttempts[0].percentage;
      return { label: r.label, firstPercentage: first, latestPercentage: r.attempt.percentage, change: round2(r.attempt.percentage - first) };
    });
  const retakes = {
    count: sum(records.map((r) => r.previousAttempts.length)),
    assessmentsRetaken: retaken.length,
    firstVsLatest,
    averageChange: firstVsLatest.length ? round2(sum(firstVsLatest.map((x) => x.change)) / firstVsLatest.length) : null,
  };

  const history = records.map((r) => {
    const a = r.attempt;
    const finishedRow = r.state === 'finished';
    const usedSeconds = finishedRow && a.startedAt && a.finishedAt ? Math.max(0, Math.round((toMs(a.finishedAt) - toMs(a.startedAt)) / 1000)) : null;
    const allowedSeconds = r.durationMinutes ? r.durationMinutes * 60 : null;
    return {
      label: r.label,
      assessmentId: r.assessmentId,
      title: r.title,
      subject: r.subject,
      state: r.state,
      attemptStatus: a ? a.status : null,
      publishedAt: r.publishedAt,
      finishedAt: finishedRow ? a.finishedAt : null,
      score: finishedRow ? a.score : null,
      totalQuestions: finishedRow ? a.totalQuestions : null,
      correct: finishedRow ? a.correct : null,
      incorrect: finishedRow ? a.incorrect : null,
      unattempted: finishedRow ? a.unattempted : null,
      percentage: finishedRow ? a.percentage : null,
      classAveragePercentage: r.classAverage.percentage,
      classFinishedCount: r.classAverage.finishedCount,
      timeUsedSeconds: usedSeconds,
      allowedSeconds,
      timeUsedPercent: usedSeconds !== null && allowedSeconds ? round2((usedSeconds / allowedSeconds) * 100) : null,
      attemptNumber: r.attemptNumber,
      previousAttempts: r.previousAttempts.map((p) => ({ status: p.status, score: p.score, totalQuestions: p.totalQuestions, percentage: p.percentage, finishedAt: p.finishedAt })),
    };
  });

  return {
    counts: { assigned: records.length, attempted: finished.length, inProgress: count('in_progress'), missed, pending: count('pending'), upcoming: count('upcoming') },
    completionRate: pct(finished.length, finished.length + missed),
    scores: {
      average: mean(percentages),
      median: median(percentages),
      best: percentages.length ? Math.max(...percentages) : null,
      worst: percentages.length ? Math.min(...percentages) : null,
      lastThreeAverage: percentages.length >= 3 ? mean(lastThree) : null,
    },
    trend: trendOf(percentages),
    consistency: consistencyOf(percentages),
    bySubject,
    byDifficulty,
    timing,
    retakes,
    history,
  };
}

module.exports = { computeMetrics, dataSufficiency, trendOf, consistencyOf, median, TREND_THRESHOLD, CONSISTENT_SD, MODERATE_SD };
