const { GeminiProvider } = require('./providers/gemini/GeminiProvider');
const { HuggingFaceProvider, HF_MODEL_ID } = require('./providers/huggingface/HuggingFaceProvider');

const HF_TOKEN_FORMAT = /^hf_[A-Za-z0-9]{20,}$/; // a Hugging Face user access token; never echoed

/**
 * Builds the configured provider from loadLlmConfig() output. The only place
 * that knows provider names; mapping and agent code receive the result by
 * injection.
 *
 * Returns { provider, reason }: provider is null when nothing usable is
 * configured, and reason says why (without revealing any secret).
 */
function createLLMProvider(llmConfig, { fetchImpl } = {}) {
  const { provider, model, geminiApiKey, hfModel, hfToken } = llmConfig;
  if (!provider) {
    return { provider: null, reason: 'SOA_LLM_PROVIDER is not set.' };
  }
  if (provider === 'gemini') {
    if (!geminiApiKey) return { provider: null, reason: 'SOA_GEMINI_API_KEY is not set.' };
    if (!model) return { provider: null, reason: 'SOA_LLM_MODEL is not set.' };
    return { provider: new GeminiProvider({ apiKey: geminiApiKey, model, ...(fetchImpl ? { fetchImpl } : {}) }), reason: null };
  }
  if (provider === 'huggingface') {
    if (!hfToken) return { provider: null, reason: 'No Hugging Face token: set SOA_HUGGINGFACE_API_KEY (or HF_TOKEN).' };
    if (!HF_TOKEN_FORMAT.test(hfToken)) return { provider: null, reason: 'The Hugging Face token does not look like a valid access token.' };
    if (!hfModel) return { provider: null, reason: 'SOA_HUGGINGFACE_MODEL is not set.' };
    if (!HF_MODEL_ID.test(hfModel)) return { provider: null, reason: 'SOA_HUGGINGFACE_MODEL must look like "org/model" or "org/model:provider".' };
    return { provider: new HuggingFaceProvider({ token: hfToken, model: hfModel, ...(fetchImpl ? { fetchImpl } : {}) }), reason: null };
  }
  if (provider === 'openai') {
    return { provider: null, reason: `The "${provider}" provider is not implemented yet.` };
  }
  return { provider: null, reason: `Unknown SOA_LLM_PROVIDER "${provider}".` };
}

module.exports = { createLLMProvider };
