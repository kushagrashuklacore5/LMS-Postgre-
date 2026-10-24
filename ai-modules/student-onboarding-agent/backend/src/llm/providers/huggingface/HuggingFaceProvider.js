const { LLMProvider, LLMProviderError } = require('../../LLMProvider');

const DEFAULT_URL = 'https://router.huggingface.co/v1/chat/completions';
// "<org>/<model>" with an optional ":<inference provider or policy>" suffix, e.g. "Qwen/Qwen3-Next-80B-A3B-Instruct:deepinfra".
const MODEL_ID = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(:[A-Za-z0-9._-]+)?$/;

/**
 * Hugging Face Inference Providers (OpenAI-compatible chat completions router) for the Student
 * Onboarding Agent's column mapping. The module's OWN small adapter behind its LLMProvider contract;
 * it shares nothing with any other module's code. Built-in fetch, no SDK.
 *
 * - The token is sent only in the Authorization header. It is kept non-enumerable (never serialized)
 *   and never appears in errors, which carry fixed texts and the HTTP status only (the response body,
 *   which may echo the request, is never read on an error).
 * - The model comes from configuration (SOA_HUGGINGFACE_MODEL); nothing is hard-coded here.
 * - One request per call: no retries, no background work, no database access.
 * - The returned text is NOT trusted: ColumnMappingService parses it strictly and ColumnMappingGuard,
 *   the confidence rule and SampleShapeCheck decide what (if anything) is used.
 * - JSON is requested through the prompt (it asks for a bare JSON object); no response_format is sent,
 *   so the request works with every routed inference provider. Anything else fails the strict parse.
 *
 * Not exercised against the live API by the test suite; tests inject a fake fetch.
 */
class HuggingFaceProvider extends LLMProvider {
  constructor({ token, model, url = DEFAULT_URL, fetchImpl = globalThis.fetch, maxTokens = 4096 } = {}) {
    super('huggingface');
    if (typeof token !== 'string' || token.trim() === '') throw new TypeError('HuggingFaceProvider requires a token.');
    if (typeof model !== 'string' || !MODEL_ID.test(model)) {
      throw new TypeError('HuggingFaceProvider requires a model id like "org/model" or "org/model:provider" (SOA_HUGGINGFACE_MODEL).');
    }
    if (typeof fetchImpl !== 'function') throw new TypeError('HuggingFaceProvider requires fetch (Node 18+).');
    if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new TypeError('maxTokens must be a positive integer.');
    this.model = model;
    this.url = url;
    this.maxTokens = maxTokens;
    Object.defineProperty(this, 'token', { value: token, enumerable: false });
    Object.defineProperty(this, 'fetchImpl', { value: fetchImpl, enumerable: false });
  }

  async generate(prompt, { temperature, signal } = {}) {
    if (typeof prompt !== 'string' || prompt === '') throw new TypeError('generate() needs a prompt.');
    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: typeof temperature === 'number' ? temperature : 0,
          max_tokens: this.maxTokens,
          stream: false,
        }),
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err; // the caller's timeout/abort (becomes LLM_TIMEOUT)
      throw new LLMProviderError('Could not reach the Hugging Face API.', { code: 'NETWORK_ERROR' });
    }

    if (!response.ok) {
      const status = response.status;
      const why = status === 401 || status === 403 ? 'the token was refused'
        : status === 404 ? 'the configured model was not found'
          : status === 429 ? 'the rate limit or quota was reached'
            : status >= 500 ? 'the service is unavailable' : 'the request was not accepted';
      throw new LLMProviderError(`The Hugging Face API returned HTTP ${status} (${why}).`, { code: 'HTTP_ERROR', status });
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new LLMProviderError('The Hugging Face API returned a response that is not JSON.', { code: 'BAD_RESPONSE' });
    }
    const choice = Array.isArray(body && body.choices) ? body.choices[0] : null;
    if (choice && choice.finish_reason === 'length') {
      throw new LLMProviderError('The Hugging Face answer was cut off (token limit).', { code: 'TRUNCATED_RESPONSE' });
    }
    const content = choice && choice.message ? choice.message.content : null;
    const text = typeof content === 'string' ? content
      : Array.isArray(content) ? content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('') : '';
    if (text.trim() === '') throw new LLMProviderError('The Hugging Face API returned no text.', { code: 'EMPTY_RESPONSE' });
    return text;
  }
}

module.exports = { HuggingFaceProvider, HF_MODEL_ID: MODEL_ID };
