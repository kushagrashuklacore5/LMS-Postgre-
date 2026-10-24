const { LLMProvider, LLMProviderError } = require('../../LLMProvider');

const DEFAULT_GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

class GroqProvider extends LLMProvider {
  constructor({ apiKey, model = 'openai/gpt-oss-120b', url = DEFAULT_GROQ_URL, fetchImpl = globalThis.fetch, maxTokens = 4096 } = {}) {
    super('groq');
    if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new TypeError('GroqProvider requires an API key.');
    if (typeof fetchImpl !== 'function') throw new TypeError('GroqProvider requires fetch (Node 18+).');
    this.model = model;
    this.url = url;
    this.maxTokens = maxTokens;
    Object.defineProperty(this, 'apiKey', { value: apiKey, enumerable: false });
    Object.defineProperty(this, 'fetchImpl', { value: fetchImpl, enumerable: false });
  }

  async generate(prompt, { temperature, signal } = {}) {
    if (typeof prompt !== 'string' || prompt === '') throw new TypeError('generate() needs a prompt.');
    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: typeof temperature === 'number' ? temperature : 0,
          max_tokens: this.maxTokens,
          stream: false,
          response_format: { type: 'json_object' },
        }),
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new LLMProviderError('Could not reach the Groq API.', { code: 'NETWORK_ERROR' });
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new LLMProviderError(`Groq API returned HTTP ${response.status}: ${errBody}`, { code: 'BAD_STATUS', status: response.status });
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new LLMProviderError('Could not parse response from Groq API.', { code: 'INVALID_JSON' });
    }

    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new LLMProviderError('Groq API returned no text in choices[0].message.content.', { code: 'EMPTY_CHOICES' });
    }
    return content;
  }
}

module.exports = { GroqProvider };
