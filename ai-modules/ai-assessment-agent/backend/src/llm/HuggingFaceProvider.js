const { QuestionGenerationProvider, LlmProviderError } = require('./QuestionGenerationProvider');

const DEFAULT_URL = 'https://router.huggingface.co/v1/chat/completions';
// "<org>/<model>" with an optional ":<provider or policy>" suffix, e.g. "Qwen/Qwen3-Next-80B-A3B-Instruct:deepinfra".
const MODEL_ID = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+(:[A-Za-z0-9._-]+)?$/;

/**
 * Open-weight models through Hugging Face Inference Providers: the routed,
 * OpenAI-compatible chat completions endpoint, called with the built-in fetch
 * (no SDK). Same contract as the Gemini provider: prompt in, RAW TEXT out.
 * It never parses, accepts, saves or authorizes anything. Parsing, validation
 * and the content guard in core/ai decide, exactly as for Gemini.
 *
 * - The HF token is sent only in the Authorization header. It is never put in
 *   the URL, body, errors or logs, and it is not an enumerable property.
 * - Structured output: `response_format: { type: 'json_schema', strict: true }`
 *   with the agent's schema converted to standard JSON Schema. Pin a provider
 *   that supports it with the model suffix (e.g. ":deepinfra"). The output is
 *   still validated in full: the validator is not relaxed for any provider.
 * - Errors carry the HTTP status and a code only; response bodies are never forwarded.
 * - `lastCall` keeps non-sensitive metadata of the last request (HTTP status and
 *   the serving backend reported by the router) for diagnostics.
 */
class HuggingFaceProvider extends QuestionGenerationProvider {
  constructor({ token, model, url = DEFAULT_URL, fetchImpl = globalThis.fetch, temperature = 0.3, maxTokens = 4096 } = {}) {
    super('huggingface');
    if (typeof token !== 'string' || token.trim() === '') throw new TypeError('HuggingFaceProvider requires a Hugging Face token.');
    if (typeof model !== 'string' || !MODEL_ID.test(model)) throw new TypeError('HuggingFaceProvider requires a model id like "org/model" or "org/model:provider".');
    if (typeof fetchImpl !== 'function') throw new TypeError('HuggingFaceProvider requires fetch.');
    this.model = model;
    this.url = url;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.lastCall = null;
    Object.defineProperty(this, 'token', { value: token, enumerable: false });
    Object.defineProperty(this, 'fetchImpl', { value: fetchImpl, enumerable: false });
  }

  async generateJson({ systemInstruction, prompt, jsonSchema, signal } = {}) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false,
      response_format: jsonSchema
        ? { type: 'json_schema', json_schema: { name: 'mcq_questions', schema: toJsonSchema(jsonSchema), strict: true } }
        : { type: 'json_object' },
    };

    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err; // the caller's timeout
      this.lastCall = { status: null, backend: null };
      throw new LlmProviderError('Could not reach the AI service.', { code: 'NETWORK_ERROR' });
    }

    this.lastCall = { status: response.status, backend: servingBackend(response) };
    if (!response.ok) throw httpError(response.status);

    let data;
    try {
      data = await response.json();
    } catch {
      throw new LlmProviderError('The AI service returned an unreadable response.', { code: 'BAD_RESPONSE', status: response.status });
    }
    const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
    if (choice?.finish_reason === 'content_filter' || (typeof choice?.message?.refusal === 'string' && choice.message.refusal.trim() !== '')) {
      throw new LlmProviderError('The AI service declined to generate this content.', { code: 'BLOCKED' });
    }
    const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    if (text.trim() === '') throw new LlmProviderError('The AI service returned no content.', { code: 'BAD_RESPONSE' });
    return text;
  }
}

/** Status -> provider error code. 402 = Hugging Face credits exhausted. */
function httpError(status) {
  if (status === 429) return new LlmProviderError('The AI service is rate limiting requests.', { code: 'RATE_LIMITED', status });
  if (status === 402) return new LlmProviderError('The AI service credits are exhausted.', { code: 'QUOTA_EXCEEDED', status });
  if (status >= 500) return new LlmProviderError('The AI service is unavailable.', { code: 'UNAVAILABLE', status });
  if (status === 401 || status === 403) return new LlmProviderError('The AI service rejected the configured credentials.', { code: 'AUTH_FAILED', status });
  if (status === 404) return new LlmProviderError('The configured AI model was not found.', { code: 'MODEL_NOT_FOUND', status });
  return new LlmProviderError('The AI service rejected the request.', { code: 'BAD_REQUEST', status });
}

/** Which inference backend served the request, as reported by the router (non-sensitive). */
function servingBackend(response) {
  const h = response && response.headers;
  if (!h || typeof h.get !== 'function') return null;
  return h.get('x-inference-provider') || null;
}

/**
 * The agent's schema (core/ai/generationPrompt) uses Gemini's OpenAPI dialect
 * (uppercase types, propertyOrdering). Convert it to standard JSON Schema for
 * OpenAI-compatible structured output: lowercase types, no propertyOrdering,
 * and closed objects (additionalProperties: false, as strict mode expects).
 * The shape and required fields are unchanged.
 */
function toJsonSchema(node) {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'propertyOrdering') continue;
    if (key === 'type' && typeof value === 'string') out.type = value.toLowerCase();
    else if (key === 'properties') out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSchema(v)]));
    else out[key] = toJsonSchema(value);
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

module.exports = { HuggingFaceProvider, toJsonSchema };
