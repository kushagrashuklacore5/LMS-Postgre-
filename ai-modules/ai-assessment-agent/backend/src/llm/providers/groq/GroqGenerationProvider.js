const { QuestionGenerationProvider, LlmProviderError } = require('../../QuestionGenerationProvider');

class GroqGenerationProvider extends QuestionGenerationProvider {
  constructor({ apiKey, model = 'openai/gpt-oss-120b', url = 'https://api.groq.com/openai/v1/chat/completions', fetchImpl = globalThis.fetch, temperature = 0.3 } = {}) {
    super('groq');
    if (!apiKey) throw new TypeError('GroqGenerationProvider requires an API key.');
    this.apiKey = apiKey;
    this.model = model;
    this.url = url;
    this.fetchImpl = fetchImpl;
    this.temperature = temperature;
    Object.defineProperty(this, 'apiKey', { value: apiKey, enumerable: false });
  }

  async generateJson({ systemInstruction, prompt, signal } = {}) {
    try {
      const messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: this.temperature,
          response_format: { type: 'json_object' }
        }),
        signal
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new LlmProviderError(`Groq returned HTTP ${response.status}: ${errText}`, { code: 'BAD_STATUS', status: response.status });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new LlmProviderError('Groq returned empty text response.', { code: 'EMPTY_RESPONSE' });
      }
      return content;
    } catch (err) {
      if (err instanceof LlmProviderError) throw err;
      if (err && err.name === 'AbortError') throw err;
      throw new LlmProviderError(err.message || 'Could not reach Groq API.', { code: 'NETWORK_ERROR' });
    }
  }
}

module.exports = { GroqGenerationProvider };
