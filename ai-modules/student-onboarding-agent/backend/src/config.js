/**
 * Reads this module's SOA_* settings. server.js loads the module's .env
 * before anything calls this. Invalid values fail fast at startup.
 */
function readPositiveNumber(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[student-onboarding-agent] ${name} must be a positive number, got "${raw}".`);
  }
  return value;
}

function loadImportConfig(env = process.env) {
  const maxFileMb = readPositiveNumber(env, 'SOA_IMPORT_MAX_FILE_MB', 10);
  return {
    maxFileBytes: Math.floor(maxFileMb * 1024 * 1024),
    maxRows: Math.floor(readPositiveNumber(env, 'SOA_IMPORT_MAX_ROWS', 5000)),
  };
}

function readText(env, name) {
  const raw = env[name];
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** LLM provider settings. Missing values are allowed: the provider is then "not configured". */
function loadLlmConfig(env = process.env) {
  return {
    provider: readText(env, 'SOA_LLM_PROVIDER'),
    model: readText(env, 'SOA_LLM_MODEL'),
    geminiApiKey: readText(env, 'SOA_GEMINI_API_KEY'),
    // Hugging Face (SOA_LLM_PROVIDER=huggingface): the module's own model setting; the token is
    // SOA_HUGGINGFACE_API_KEY, or else HF_TOKEN from the same server .env (loaded by server.js into this process).
    hfModel: readText(env, 'SOA_HUGGINGFACE_MODEL'),
    hfToken: readText(env, 'SOA_HUGGINGFACE_API_KEY') || readText(env, 'HF_TOKEN'),
    timeoutMs: Math.floor(readPositiveNumber(env, 'SOA_LLM_TIMEOUT_MS', 30000)),
  };
}

const MAX_SAMPLES_PER_COLUMN = 10;

/** Column-mapping settings: how many masked sample values per column the LLM sees. */
function loadMappingConfig(env = process.env) {
  const samples = Math.floor(readPositiveNumber(env, 'SOA_MAPPING_SAMPLES_PER_COLUMN', 3));
  if (samples > MAX_SAMPLES_PER_COLUMN) {
    throw new Error(`[student-onboarding-agent] SOA_MAPPING_SAMPLES_PER_COLUMN must be at most ${MAX_SAMPLES_PER_COLUMN}.`);
  }
  // LLM "mapped" entries below this confidence are shown as ambiguous and need an admin's decision.
  const minConfidence = readPositiveNumber(env, 'SOA_MAPPING_MIN_CONFIDENCE', 0.7);
  if (minConfidence > 1) {
    throw new Error('[student-onboarding-agent] SOA_MAPPING_MIN_CONFIDENCE must be between 0 and 1.');
  }
  return { samplesPerColumn: samples, minConfidence };
}

/** In-memory import job store limits (standalone development). */
function loadImportJobConfig(env = process.env) {
  return {
    maxJobs: Math.floor(readPositiveNumber(env, 'SOA_IMPORT_MAX_JOBS', 50)),
    ttlMs: Math.floor(readPositiveNumber(env, 'SOA_IMPORT_JOB_TTL_MINUTES', 120) * 60 * 1000),
  };
}

module.exports = { loadImportConfig, loadLlmConfig, loadMappingConfig, loadImportJobConfig, MAX_SAMPLES_PER_COLUMN };
