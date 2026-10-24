const { QuestionGenerationProvider, LlmProviderError } = require('../../QuestionGenerationProvider');

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Google Gemini via the REST generateContent API and the built-in fetch (no SDK).
 * The Student Onboarding Agent has its own small Gemini client. This module
 * keeps a separate one on purpose, so either module can be removed without
 * breaking the other. Both read the same SOA_* configuration.
 *
 * - The key goes in the x-goog-api-key header: never in the URL, errors or logs,
 *   and it is not an enumerable property.
 * - JSON output is requested (responseMimeType + responseSchema). The caller
 *   still validates everything.
 * - Errors carry the HTTP status and a code only. Provider response bodies are
 *   never forwarded, except for the machine-readable reason used to tell an
 *   invalid key apart from another 400.
 */
class GeminiGenerationProvider extends QuestionGenerationProvider {
  constructor({ apiKey, model, baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch, temperature = 0.4 } = {}) {
    super('gemini');
    if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new TypeError('GeminiGenerationProvider requires an API key.');
    if (typeof model !== 'string' || !MODEL_NAME.test(model)) throw new TypeError('GeminiGenerationProvider requires a valid model name.');
    if (typeof fetchImpl !== 'function') throw new TypeError('GeminiGenerationProvider requires fetch.');
    this.model = model;
    this.temperature = temperature;
    Object.defineProperty(this, 'apiKey', { value: apiKey, enumerable: false });
    Object.defineProperty(this, 'fetchImpl', { value: fetchImpl, enumerable: false });
    this.url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
  }

  async generateJson({ systemInstruction, prompt, jsonSchema, signal } = {}) {
    const generationConfig = { responseMimeType: 'application/json', temperature: this.temperature };
    if (jsonSchema) generationConfig.responseSchema = jsonSchema;

    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err; // the caller's timeout
      throw new LlmProviderError('Could not reach the AI service.', { code: 'NETWORK_ERROR' });
    }

    if (!response.ok) throw await httpError(response);

    let body;
    try {
      body = await response.json();
    } catch {
      throw new LlmProviderError('The AI service returned an unreadable response.', { code: 'BAD_RESPONSE', status: response.status });
    }
    if (body?.promptFeedback?.blockReason) {
      throw new LlmProviderError('The AI service blocked this request.', { code: 'BLOCKED' });
    }
    const candidate = body?.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
      throw new LlmProviderError('The AI service blocked the generated content.', { code: 'BLOCKED' });
    }
    const parts = candidate?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '';
    if (text.trim() === '') throw new LlmProviderError('The AI service returned no content.', { code: 'BAD_RESPONSE' });
    return text;
  }
}

async function httpError(response) {
  const status = response.status;
  if (status === 429) return new LlmProviderError('The AI service is rate limiting requests.', { code: 'RATE_LIMITED', status });
  if (status >= 500) return new LlmProviderError('The AI service is unavailable.', { code: 'UNAVAILABLE', status });
  if (status === 401 || status === 403) return new LlmProviderError('The AI service rejected the configured credentials.', { code: 'AUTH_FAILED', status });
  if (status === 404) return new LlmProviderError('The configured AI model was not found.', { code: 'MODEL_NOT_FOUND', status });
  // Google reports an invalid key as 400 with reason API_KEY_INVALID. Read only that reason.
  let reason = '';
  try {
    const body = await response.json();
    const details = Array.isArray(body?.error?.details) ? body.error.details : [];
    reason = details.map((d) => (typeof d?.reason === 'string' ? d.reason : '')).join(' ');
  } catch { /* body is not needed */ }
  if (/API_KEY_INVALID|API_KEY/.test(reason)) return new LlmProviderError('The AI service rejected the configured credentials.', { code: 'AUTH_FAILED', status });
  return new LlmProviderError('The AI service rejected the request.', { code: 'BAD_REQUEST', status });
}

module.exports = { GeminiGenerationProvider };
