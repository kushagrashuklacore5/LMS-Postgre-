/**
 * AI generation settings, read from the environment the host LMS already has
 * (server/.env).
 *
 * Provider and model:
 *   AIA_LLM_PROVIDER / AIA_LLM_MODEL  assessment-agent-only override (optional). When
 *                                     AIA_LLM_PROVIDER is set, the model comes ONLY from
 *                                     AIA_LLM_MODEL, never from the shared SOA_LLM_MODEL.
 *   SOA_LLM_PROVIDER / SOA_LLM_MODEL  shared with the Student Onboarding Agent (fallback).
 * The override exists so the assessment agent can use Hugging Face while onboarding
 * keeps using Gemini (onboarding does not support "huggingface").
 *
 * Credentials (one per provider, never duplicated):
 *   gemini       SOA_GEMINI_API_KEY (shared)
 *   huggingface  HF_TOKEN (must look like a Hugging Face user token, "hf_..."; anything
 *                else, e.g. a placeholder, is reported as not configured and nothing is called)
 *
 * Non-secret assessment-agent settings:
 *   AIA_AI_GENERATION_ENABLED  "false" turns AI generation off (default: on when configured)
 *   AIA_LLM_TIMEOUT_MS         per-request timeout for generation (default 60000; 5000-120000)
 *
 * Never throws: a missing or unsupported setting yields configured: false plus a
 * reason code. The credential is kept off enumerable properties.
 */
const SUPPORTED_PROVIDERS = Object.freeze(['gemini', 'huggingface']);
const DEFAULT_TIMEOUT_MS = 60000;
const HF_TOKEN_FORMAT = /^hf_[A-Za-z0-9]{20,}$/;

function readText(env, name) {
  const v = env[name];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function loadGenerationConfig(env = process.env) {
  const enabled = readText(env, 'AIA_AI_GENERATION_ENABLED') !== 'false';
  const override = readText(env, 'AIA_LLM_PROVIDER');
  const provider = (override || readText(env, 'SOA_LLM_PROVIDER') || '').toLowerCase() || null;
  const model = override ? readText(env, 'AIA_LLM_MODEL') : readText(env, 'SOA_LLM_MODEL');
  const source = override ? 'AIA_LLM_*' : 'SOA_LLM_*';
  const apiKey = provider === 'huggingface' ? readText(env, 'HF_TOKEN') : readText(env, 'SOA_GEMINI_API_KEY');
  const rawTimeout = Number(readText(env, 'AIA_LLM_TIMEOUT_MS'));
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout >= 5000 && rawTimeout <= 120000 ? Math.floor(rawTimeout) : DEFAULT_TIMEOUT_MS;

  let reason = null;
  if (!enabled) reason = 'DISABLED';
  else if (!provider) reason = 'PROVIDER_MISSING';
  else if (!SUPPORTED_PROVIDERS.includes(provider)) reason = 'PROVIDER_UNSUPPORTED';
  else if (!model) reason = 'MODEL_MISSING';
  else if (!apiKey) reason = 'API_KEY_MISSING';
  else if (provider === 'huggingface' && !HF_TOKEN_FORMAT.test(apiKey)) reason = 'API_KEY_INVALID_FORMAT';

  const config = { enabled, provider, model, source, timeoutMs, configured: reason === null, reason };
  Object.defineProperty(config, 'apiKey', { value: apiKey, enumerable: false });
  return Object.freeze(config);
}

module.exports = { loadGenerationConfig, SUPPORTED_PROVIDERS, DEFAULT_TIMEOUT_MS };
