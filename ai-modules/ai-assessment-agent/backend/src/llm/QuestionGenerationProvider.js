/**
 * The contract every LLM provider implements (Gemini first; others later).
 *
 * A provider is a TEXT GENERATOR only. It receives a prompt and returns the
 * model's raw text. It never parses, validates or accepts that text, and it
 * gets no database handle, LMS adapter or AssessmentService, so it cannot
 * create, save, publish or authorize anything. The core
 * (core/ai/AssessmentGenerator) builds the prompt, and the deterministic
 * validator and guard decide whether the output is usable.
 *
 * Failures are LlmProviderError with a stable `code`. Messages never contain
 * the API key, request headers or the provider's response body.
 */
class QuestionGenerationProvider {
  constructor(name) {
    if (new.target === QuestionGenerationProvider) throw new TypeError('QuestionGenerationProvider is abstract.');
    this.name = name;
  }

  /** false when credentials/model are missing; the agent then reports AI as unavailable. */
  isConfigured() {
    return true;
  }

  /**
   * @param {{ systemInstruction: string, prompt: string, jsonSchema?: object, signal?: AbortSignal }} request
   * @returns {Promise<string>} the model's raw text (expected to be JSON; NOT trusted)
   */
  async generateJson(request) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.name}.generateJson is not implemented.`);
  }
}

/**
 * Provider failure. `code` is one of:
 *   NOT_CONFIGURED   provider/model/key missing or provider unsupported
 *   AUTH_FAILED      key rejected (HTTP 401/403, or 400 with an invalid-key reason)
 *   MODEL_NOT_FOUND  model name unknown to the provider (HTTP 404)
 *   RATE_LIMITED     HTTP 429
 *   QUOTA_EXCEEDED   HTTP 402 (e.g. Hugging Face monthly credits used up)
 *   UNAVAILABLE      HTTP 5xx (incl. 503)
 *   BAD_REQUEST      other HTTP 4xx
 *   NETWORK_ERROR    provider unreachable
 *   BAD_RESPONSE     envelope not JSON / no text
 *   BLOCKED          provider's safety filter blocked the prompt or output
 * `status` is the HTTP status when there was one.
 */
class LlmProviderError extends Error {
  constructor(message, { code, status = null } = {}) {
    super(message);
    this.name = 'LlmProviderError';
    this.code = code;
    this.status = status;
  }
}

module.exports = { QuestionGenerationProvider, LlmProviderError };
