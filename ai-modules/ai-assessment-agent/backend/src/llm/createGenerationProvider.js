const { QuestionGenerationProvider, LlmProviderError } = require('./QuestionGenerationProvider');
const { GeminiGenerationProvider } = require('./providers/gemini/GeminiGenerationProvider');
const { HuggingFaceProvider } = require('./HuggingFaceProvider');
const { GroqGenerationProvider } = require('./providers/groq/GroqGenerationProvider');

/** Stand-in when AI is disabled or not configured: never calls anything. */
class NotConfiguredProvider extends QuestionGenerationProvider {
  constructor(reason) {
    super('not-configured');
    this.reason = reason;
  }

  isConfigured() {
    return false;
  }

  async generateJson() {
    throw new LlmProviderError('AI generation is not configured.', { code: 'NOT_CONFIGURED' });
  }
}

/**
 * Picks the provider from loadGenerationConfig(). Adding a provider means one
 * new class under providers/ and one branch here; the core does not change.
 */
function createGenerationProvider(config, { fetchImpl } = {}) {
  if (!config || !config.configured) return new NotConfiguredProvider(config ? config.reason : 'PROVIDER_MISSING');
  if (config.provider === 'gemini') {
    return new GeminiGenerationProvider({ apiKey: config.apiKey, model: config.model, ...(fetchImpl ? { fetchImpl } : {}) });
  }
  if (config.provider === 'huggingface') {
    return new HuggingFaceProvider({ token: config.apiKey, model: config.model, ...(fetchImpl ? { fetchImpl } : {}) });
  }
  if (config.provider === 'groq') {
    return new GroqGenerationProvider({ apiKey: config.apiKey, model: config.model || 'openai/gpt-oss-120b', ...(fetchImpl ? { fetchImpl } : {}) });
  }
  return new NotConfiguredProvider('PROVIDER_UNSUPPORTED');
}

module.exports = { createGenerationProvider, NotConfiguredProvider };
