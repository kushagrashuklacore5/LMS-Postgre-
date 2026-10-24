const { LLMProvider, LLMProviderError } = require('../../LLMProvider');

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Google Gemini via its REST API (generateContent), using the built-in
 * fetch: no SDK dependency. The API key is sent in the x-goog-api-key
 * header, never in the URL, and never appears in errors.
 *
 * Not exercised against the live API by the test suite; tests inject a
 * fake fetch. See backend/scripts/manual-mapping-check.js for an opt-in run.
 */
class GeminiProvider extends LLMProvider {
  constructor({ apiKey, model, baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
    super('gemini');
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new TypeError('GeminiProvider requires an API key.');
    }
    if (typeof model !== 'string' || !MODEL_NAME.test(model)) {
      throw new TypeError('GeminiProvider requires a model name such as the one in SOA_LLM_MODEL.');
    }
    if (typeof fetchImpl !== 'function') {
      throw new TypeError('GeminiProvider requires fetch (Node 18+).');
    }
    this.model = model;
    // Kept off enumerable properties so the key is not serialized or logged by accident.
    Object.defineProperty(this, 'apiKey', { value: apiKey, enumerable: false });
    Object.defineProperty(this, 'fetchImpl', { value: fetchImpl, enumerable: false });
    this.url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
  }

  async generate(prompt, { responseFormat, temperature, signal } = {}) {
    const generationConfig = {};
    if (responseFormat === 'json') generationConfig.responseMimeType = 'application/json';
    if (typeof temperature === 'number') generationConfig.temperature = temperature;

    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err; // caller's timeout/abort
      throw new LLMProviderError('Could not reach the Gemini API.', { code: 'NETWORK_ERROR' });
    }

    if (!response.ok) {
      // Status only: the body may echo the request.
      throw new LLMProviderError(`The Gemini API returned HTTP ${response.status}.`, {
        code: 'HTTP_ERROR',
        status: response.status,
      });
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new LLMProviderError('The Gemini API returned a response that is not JSON.', { code: 'BAD_RESPONSE' });
    }
    const parts = body?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
    if (text === '') {
      throw new LLMProviderError('The Gemini API returned no text (the response may have been blocked).', {
        code: 'EMPTY_RESPONSE',
      });
    }
    return text;
  }
}

module.exports = { GeminiProvider };
