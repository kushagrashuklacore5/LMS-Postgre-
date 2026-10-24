/**
 * A VALID AI Performance Report (professional report schema) for fake-provider tests.
 * Neutral wording, references only to the data the test supplies, no numbers except the suggested
 * question count and the "3 completed assessments" threshold.
 *
 * @param o { labels = ['A1'], subject = 'Biology', difficulty = 'easy', limited = true, focusArea = 'Harder questions' }
 */
function reportFor({ labels = ['A1'], subject = 'Biology', difficulty = 'easy', limited = true, focusArea = 'Harder questions' } = {}) {
  const strength = limited ? 'limited' : 'moderate';
  return {
    executiveSummary: {
      overallStatus: 'on_track',
      observed: `Based on the available assessment history, the student has completed the supplied ${subject} assessments.`,
      interpretation: 'The available data indicates secure recall on the assessed questions; additional assessments would be useful to confirm this.',
    },
    performanceOverview: [
      { metric: 'overall', observed: 'The average score is shown in the metrics above.', interpretation: 'Results on the assessed material look secure.', evidence: ['metric:overall', labels[0]] },
      { metric: 'completion', observed: 'Every assigned assessment in scope was completed.', interpretation: 'Completion does not limit the evidence.', evidence: ['metric:completion'] },
    ],
    strengths: [{ area: `${subject} recall`, observed: `Questions in ${labels[0]} were mostly answered correctly.`, evidenceStrength: strength, evidence: [`Subject: ${subject}`, labels[0]] }],
    focusAreas: [{
      area: focusArea,
      observed: 'Fewer questions were answered correctly at this difficulty level.',
      interpretation: 'This may indicate a gap in the underlying concept.',
      investigate: 'A short diagnostic on this concept would help confirm the pattern.',
      evidenceStrength: strength,
      priority: 'medium',
      evidence: [`Difficulty: ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`],
    }],
    mentorActions: [{ action: 'Assign targeted practice on the concept.', rationale: 'The pattern appears in the supplied assessment.', priority: 'medium', evidence: [labels[labels.length - 1]] }],
    nextAssessment: { objective: `Check concept mastery in ${subject}.`, questionType: 'single_mcq', difficulty: 'medium', questionCount: 10, rationale: 'A short follow-up would confirm the pattern.', evidence: [labels[0]] },
    dataLimitations: limited ? ['Fewer than 3 completed assessments are available, so no trend can be judged.'] : [],
  };
}

module.exports = { reportFor };
