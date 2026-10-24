// Gemini provider + configuration (requirements 1, 9-12). A fake fetch is used: NO real Gemini calls.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGenerationConfig } = require('../../backend/src/llm/generationConfig');
const { createGenerationProvider, NotConfiguredProvider } = require('../../backend/src/llm/createGenerationProvider');
const { GeminiGenerationProvider } = require('../../backend/src/llm/providers/gemini/GeminiGenerationProvider');

const KEY = 'test-key-SHOULD-NEVER-LEAK-1234567890';
const ENV = { SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'gemini-test-model', SOA_GEMINI_API_KEY: KEY };

function fakeFetch(respond) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  fn.calls = calls;
  return fn;
}
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const geminiText = (text) => jsonResponse(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });

async function codeOf(promise) {
  try { await promise; } catch (err) { return err; }
  assert.fail('expected an error');
}

describe('1/12. generation configuration (shared SOA_* variables, no new key variable)', () => {
  it('is configured from SOA_LLM_PROVIDER / SOA_LLM_MODEL / SOA_GEMINI_API_KEY', () => {
    const c = loadGenerationConfig(ENV);
    assert.equal(c.configured, true);
    assert.equal(c.provider, 'gemini');
    assert.equal(c.model, 'gemini-test-model');
    assert.equal(c.apiKey, KEY);
    assert.equal(c.timeoutMs, 60000);
  });

  it('never exposes the key when serialized or spread', () => {
    const c = loadGenerationConfig(ENV);
    assert.equal(JSON.stringify(c).includes(KEY), false);
    assert.equal(JSON.stringify({ ...c }).includes(KEY), false);
    const p = createGenerationProvider(c, { fetchImpl: async () => {} });
    assert.equal(JSON.stringify(p).includes(KEY), false);
    assert.equal(Object.keys(p).includes('apiKey'), false);
  });

  it('reports why it is not configured (and never throws)', () => {
    assert.equal(loadGenerationConfig({}).reason, 'PROVIDER_MISSING');
    assert.equal(loadGenerationConfig({ ...ENV, SOA_LLM_PROVIDER: 'openai' }).reason, 'PROVIDER_UNSUPPORTED');
    assert.equal(loadGenerationConfig({ ...ENV, SOA_LLM_MODEL: ' ' }).reason, 'MODEL_MISSING');
    assert.equal(loadGenerationConfig({ ...ENV, SOA_GEMINI_API_KEY: '' }).reason, 'API_KEY_MISSING');
    assert.equal(loadGenerationConfig({ ...ENV, AIA_AI_GENERATION_ENABLED: 'false' }).reason, 'DISABLED');
  });

  it('ignores any AIA_* key variable (there is no second key)', () => {
    assert.equal(loadGenerationConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'm', AIA_GEMINI_API_KEY: 'x' }).reason, 'API_KEY_MISSING');
  });

  it('accepts a bounded AIA_LLM_TIMEOUT_MS and falls back otherwise', () => {
    assert.equal(loadGenerationConfig({ ...ENV, AIA_LLM_TIMEOUT_MS: '20000' }).timeoutMs, 20000);
    assert.equal(loadGenerationConfig({ ...ENV, AIA_LLM_TIMEOUT_MS: '10' }).timeoutMs, 60000);
    assert.equal(loadGenerationConfig({ ...ENV, AIA_LLM_TIMEOUT_MS: 'abc' }).timeoutMs, 60000);
  });

  it('12. missing configuration gives a provider that never calls anything', async () => {
    const p = createGenerationProvider(loadGenerationConfig({}));
    assert.ok(p instanceof NotConfiguredProvider);
    assert.equal(p.isConfigured(), false);
    assert.equal((await codeOf(p.generateJson({}))).code, 'NOT_CONFIGURED');
  });

  it('builds a Gemini provider when configured', () => {
    assert.ok(createGenerationProvider(loadGenerationConfig(ENV), { fetchImpl: async () => {} }) instanceof GeminiGenerationProvider);
  });
});

describe('GeminiGenerationProvider (fake fetch)', () => {
  const make = (fetchImpl) => new GeminiGenerationProvider({ apiKey: KEY, model: 'gemini-test-model', fetchImpl });
  const req = { systemInstruction: 'SYS', prompt: 'PROMPT', jsonSchema: { type: 'OBJECT' } };

  it('sends the key only in the x-goog-api-key header and asks for JSON with the schema', async () => {
    const fetch = fakeFetch(() => geminiText('{"questions":[]}'));
    assert.equal(await make(fetch).generateJson(req), '{"questions":[]}');
    const { url, init } = fetch.calls[0];
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
    assert.equal(url.includes(KEY), false);
    assert.equal(init.headers['x-goog-api-key'], KEY);
    const body = JSON.parse(init.body);
    assert.equal(body.systemInstruction.parts[0].text, 'SYS');
    assert.equal(body.contents[0].parts[0].text, 'PROMPT');
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(body.generationConfig.responseSchema, { type: 'OBJECT' });
    assert.equal(init.body.includes(KEY), false);
  });

  for (const [status, code] of [[429, 'RATE_LIMITED'], [503, 'UNAVAILABLE'], [500, 'UNAVAILABLE'], [401, 'AUTH_FAILED'], [403, 'AUTH_FAILED'], [404, 'MODEL_NOT_FOUND'], [400, 'BAD_REQUEST']]) {
    it(`10/11. HTTP ${status} -> ${code}, message without key or body`, async () => {
      const err = await codeOf(make(fakeFetch(() => jsonResponse(status, { error: { message: `echo ${KEY}` } }))).generateJson(req));
      assert.equal(err.code, code);
      assert.equal(err.status, status);
      assert.equal(err.message.includes(KEY), false);
      assert.equal(err.message.includes('echo'), false);
    });
  }

  it('invalid API key reported as HTTP 400 API_KEY_INVALID -> AUTH_FAILED', async () => {
    const err = await codeOf(make(fakeFetch(() => jsonResponse(400, { error: { details: [{ reason: 'API_KEY_INVALID' }] } }))).generateJson(req));
    assert.equal(err.code, 'AUTH_FAILED');
  });

  it('network failure -> NETWORK_ERROR; abort (timeout) is passed through as AbortError', async () => {
    assert.equal((await codeOf(make(async () => { throw new TypeError('fetch failed'); }).generateJson(req))).code, 'NETWORK_ERROR');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    assert.equal((await codeOf(make(async () => { throw abort; }).generateJson(req))).name, 'AbortError');
  });

  it('malformed envelope, empty text and safety blocks', async () => {
    const notJson = { ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } };
    assert.equal((await codeOf(make(fakeFetch(() => notJson)).generateJson(req))).code, 'BAD_RESPONSE');
    assert.equal((await codeOf(make(fakeFetch(() => jsonResponse(200, { candidates: [] }))).generateJson(req))).code, 'BAD_RESPONSE');
    assert.equal((await codeOf(make(fakeFetch(() => jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' } }))).generateJson(req))).code, 'BLOCKED');
    assert.equal((await codeOf(make(fakeFetch(() => jsonResponse(200, { candidates: [{ finishReason: 'SAFETY' }] }))).generateJson(req))).code, 'BLOCKED');
  });

  it('refuses to construct without key/model', () => {
    assert.throws(() => new GeminiGenerationProvider({ apiKey: '', model: 'm', fetchImpl: async () => {} }), /API key/);
    assert.throws(() => new GeminiGenerationProvider({ apiKey: 'k', model: 'bad model/../x', fetchImpl: async () => {} }), /model/);
  });
});
