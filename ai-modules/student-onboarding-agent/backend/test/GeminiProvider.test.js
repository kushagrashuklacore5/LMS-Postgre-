const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GeminiProvider } = require('../src/llm/providers/gemini/GeminiProvider');
const { LLMProviderError } = require('../src/llm/LLMProvider');
const { createLLMProvider } = require('../src/llm/createLLMProvider');
const { loadLlmConfig, loadMappingConfig } = require('../src/config');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };

const KEY = 'test-key-not-real';
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const fakeFetch = (response) => {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return typeof response === 'function' ? response() : response; };
  fn.calls = calls;
  return fn;
};

describe('GeminiProvider (fake fetch; no network)', () => {
  it('sends the prompt in JSON mode with the key in a header, never in the URL', async () => {
    const f = fakeFetch(jsonResponse(200, { candidates: [{ content: { parts: [{ text: '{"mappings":' }, { text: '[]}' }] } }] }));
    const p = new GeminiProvider({ apiKey: KEY, model: 'some-model-1', fetchImpl: f });
    const text = await p.generate('PROMPT', { responseFormat: 'json', temperature: 0 });
    assert.equal(text, '{"mappings":[]}');
    const { url, init } = f.calls[0];
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/some-model-1:generateContent');
    assert.ok(!url.includes(KEY));
    assert.equal(init.headers['x-goog-api-key'], KEY);
    assert.deepEqual(JSON.parse(init.body), {
      contents: [{ role: 'user', parts: [{ text: 'PROMPT' }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
  });

  it('reports HTTP errors with the status only (no body, no key)', async () => {
    const p = new GeminiProvider({ apiKey: KEY, model: 'm', fetchImpl: fakeFetch(jsonResponse(403, { error: { message: 'echo ' + KEY } })) });
    await assert.rejects(p.generate('x'), (err) => {
      assert.ok(err instanceof LLMProviderError);
      assert.equal(err.code, 'HTTP_ERROR');
      assert.equal(err.status, 403);
      assert.ok(!err.message.includes(KEY) && !err.message.includes('echo'));
      return true;
    });
  });

  it('reports network failures, empty/blocked responses and non-JSON bodies safely', async () => {
    const netFail = new GeminiProvider({ apiKey: KEY, model: 'm', fetchImpl: async () => { throw new Error('ECONNRESET ' + KEY); } });
    await assert.rejects(netFail.generate('x'), (e) => e.code === 'NETWORK_ERROR' && !e.message.includes(KEY));
    const blocked = new GeminiProvider({ apiKey: KEY, model: 'm', fetchImpl: fakeFetch(jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })) });
    await assert.rejects(blocked.generate('x'), (e) => e.code === 'EMPTY_RESPONSE');
    const notJson = new GeminiProvider({ apiKey: KEY, model: 'm', fetchImpl: fakeFetch({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) });
    await assert.rejects(notJson.generate('x'), (e) => e.code === 'BAD_RESPONSE');
  });

  it('passes the abort signal through and re-throws an abort', async () => {
    const controller = new AbortController();
    const f = async (url, init) => { assert.equal(init.signal, controller.signal); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    const p = new GeminiProvider({ apiKey: KEY, model: 'm', fetchImpl: f });
    await assert.rejects(p.generate('x', { signal: controller.signal }), { name: 'AbortError' });
  });

  it('does not expose the key when serialized, and rejects unsafe model names', () => {
    const p = new GeminiProvider({ apiKey: KEY, model: 'm', fetchImpl: async () => {} });
    assert.ok(!JSON.stringify(p).includes(KEY));
    assert.throws(() => new GeminiProvider({ apiKey: KEY, model: '../x?y', fetchImpl: async () => {} }), TypeError);
    assert.throws(() => new GeminiProvider({ apiKey: '', model: 'm', fetchImpl: async () => {} }), /API key/);
  });
});

describe('createLLMProvider and config', () => {
  it('returns no provider, with a reason, when not configured', () => {
    assert.deepEqual(createLLMProvider(loadLlmConfig({})), { provider: null, reason: 'SOA_LLM_PROVIDER is not set.' });
    assert.equal(createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'm' })).reason, 'SOA_GEMINI_API_KEY is not set.');
    assert.equal(createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_GEMINI_API_KEY: KEY })).reason, 'SOA_LLM_MODEL is not set.');
    assert.match(createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'openai' })).reason, /not implemented/);
    assert.match(createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'other' })).reason, /Unknown/);
  });

  it('builds a Gemini provider from env without making any request', () => {
    const f = fakeFetch(jsonResponse(200, {}));
    const { provider, reason } = createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'm', SOA_GEMINI_API_KEY: KEY }), { fetchImpl: f });
    assert.equal(reason, null);
    assert.equal(provider.name, 'gemini');
    assert.equal(f.calls.length, 0);
  });

  it('reads timeout and sample limits with safe defaults', () => {
    assert.equal(loadLlmConfig({}).timeoutMs, 30000);
    assert.equal(loadLlmConfig({ SOA_LLM_TIMEOUT_MS: '5000' }).timeoutMs, 5000);
    assert.deepEqual(loadMappingConfig({}), { samplesPerColumn: 3, minConfidence: 0.7 });
    assert.throws(() => loadMappingConfig({ SOA_MAPPING_SAMPLES_PER_COLUMN: '50' }), /at most 10/);
    assert.throws(() => loadLlmConfig({ SOA_LLM_TIMEOUT_MS: 'abc' }), /positive number/);
  });
});
