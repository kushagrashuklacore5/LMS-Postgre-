const { AssessmentError } = require('../errors');
const { validateQuestionInput } = require('../assessmentValidation');
const { buildGenerationPrompt } = require('./generationPrompt');
const { parseGeneratedOutput } = require('./generatedOutput');
const { guardGeneratedQuestions } = require('./contentGuard');

/**
 * Turns a validated teacher request into a REVIEWABLE PROPOSAL. It never saves.
 *
 *   request -> prompt -> provider.generateJson (timeout) -> raw text
 *           -> parseGeneratedOutput (strict structure, count, duplicates)
 *           -> guardGeneratedQuestions (injection, meta text, gibberish, answer leaks, markup)
 *           -> validateQuestionInput (the same Step 1 guard every saved question passes)
 *           -> { questions } returned to the teacher for review/editing
 *
 * All-or-nothing: if any problem is found, the whole response is rejected
 * (AI_OUTPUT_REJECTED, codes and locations only). A generator has a provider
 * and nothing else. It holds no adapter, service or database handle, so the
 * model's output cannot reach persistence except through a teacher's
 * explicit save (AssessmentService.createAssessmentWithQuestions).
 */
const PROVIDER_ERRORS = Object.freeze({
  NOT_CONFIGURED: [503, 'AI_NOT_CONFIGURED', 'AI generation is not available. You can still create tests manually.'],
  AUTH_FAILED: [502, 'AI_CONFIGURATION_REJECTED', 'The AI service rejected the server configuration. Please contact an administrator. You can still create tests manually.'],
  MODEL_NOT_FOUND: [502, 'AI_MODEL_UNAVAILABLE', 'The configured AI model is not available. Please contact an administrator.'],
  RATE_LIMITED: [429, 'AI_RATE_LIMITED', 'The AI service is busy. Please try again in a minute.'],
  QUOTA_EXCEEDED: [503, 'AI_QUOTA_EXCEEDED', 'The AI service usage limit has been reached. Please contact an administrator. You can still create tests manually.'],
  UNAVAILABLE: [503, 'AI_UNAVAILABLE', 'The AI service is unavailable right now. Please try again later.'],
  NETWORK_ERROR: [503, 'AI_UNAVAILABLE', 'The AI service is unavailable right now. Please try again later.'],
  BAD_RESPONSE: [502, 'AI_BAD_RESPONSE', 'The AI service returned an unusable response. Please try again.'],
  BLOCKED: [422, 'AI_BLOCKED', 'The AI service declined this request. Try a different topic or instructions.'],
  BAD_REQUEST: [502, 'AI_REQUEST_REJECTED', 'The AI service could not process this request.'],
});

class AssessmentGenerator {
  constructor({ provider, timeoutMs = 60000, enabled = true, log = (m) => console.warn(m) }) {
    if (!provider || typeof provider.generateJson !== 'function') throw new TypeError('AssessmentGenerator requires a provider.');
    this.provider = provider;
    this.timeoutMs = timeoutMs;
    this.enabled = enabled;
    this.log = log;
  }

  /** Safe for the UI: whether generation can be offered. No config values. */
  status() {
    if (!this.enabled) return { available: false, reason: 'AI_DISABLED' };
    if (!this.provider.isConfigured()) return { available: false, reason: 'AI_NOT_CONFIGURED' };
    return { available: true, reason: null };
  }

  async generate(request, target) {
    const status = this.status();
    if (!status.available) {
      const [statusCode, code, message] = status.reason === 'AI_DISABLED'
        ? [503, 'AI_DISABLED', 'AI generation is turned off. You can still create tests manually.']
        : PROVIDER_ERRORS.NOT_CONFIGURED;
      throw new AssessmentError(code, message, { statusCode });
    }

    const raw = await this.callProvider(buildGenerationPrompt(request, target));

    const { questions, problems } = parseGeneratedOutput(raw, {
      count: request.count,
      avoidQuestions: request.avoidQuestions,
      questionType: request.questionType || 'single_mcq',
      numericFormat: request.numericFormat || null,
    });
    if (problems.length === 0) problems.push(...guardGeneratedQuestions(questions));
    if (problems.length === 0) {
      questions.forEach((q, i) => {
        try {
          validateQuestionInput(q);
        } catch (err) {
          problems.push({ field: `questions[${i}]`, code: 'FAILED_QUESTION_RULES' });
        }
      });
    }
    if (problems.length > 0) {
      this.log(`[ai-assessment-agent] generated output rejected: ${[...new Set(problems.map((p) => p.code))].join(', ')}`);
      throw new AssessmentError('AI_OUTPUT_REJECTED', 'The AI response did not pass the quality checks, so nothing was shown. Please try again or adjust the request.', {
        statusCode: 422,
        details: problems,
      });
    }
    return { questions, provider: this.provider.name };
  }

  async callProvider(prompt) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    try {
      return await this.provider.generateJson({ ...prompt, signal: controller.signal });
    } catch (err) {
      if (timedOut || (err && err.name === 'AbortError')) {
        this.log('[ai-assessment-agent] generation failed: TIMEOUT');
        throw new AssessmentError('AI_TIMEOUT', 'The AI service took too long to answer. Please try again, perhaps with fewer questions.', { statusCode: 504 });
      }
      const code = err && err.name === 'LlmProviderError' && PROVIDER_ERRORS[err.code] ? err.code : 'UNAVAILABLE';
      // Code and HTTP status only: never the message body, headers or key.
      this.log(`[ai-assessment-agent] generation failed: ${code}${err && err.status ? ` (HTTP ${err.status})` : ''}`);
      const [statusCode, publicCode, message] = PROVIDER_ERRORS[code];
      throw new AssessmentError(publicCode, message, { statusCode });
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { AssessmentGenerator };
