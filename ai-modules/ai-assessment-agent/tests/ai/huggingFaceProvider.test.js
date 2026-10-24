// Hugging Face provider + configuration. A fake fetch is used: NO real Hugging Face calls.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { HuggingFaceProvider, toJsonSchema } = require('../../backend/src/llm/HuggingFaceProvider');
const { loadGenerationConfig } = require('../../backend/src/llm/generationConfig');
const { createGenerationProvider, NotConfiguredProvider } = require('../../backend/src/llm/createGenerationProvider');
const { AssessmentGenerator } = require('../../backend/src/core/ai/AssessmentGenerator');
const { validateGenerationRequest } = require('../../backend/src/core/ai/generationRequest');
const { buildGenerationPrompt, RESPONSE_SCHEMA } = require('../../backend/src/core/ai/generationPrompt');
const { genOutput } = require('../helpers/mockProvider');

const TOKEN = 'hf_' + 'T'.repeat(34); // synthetic, correctly shaped, fake
const MODEL = 'Qwen/Qwen3-Next-80B-A3B-Instruct:deepinfra';
const HF_ENV = { AIA_LLM_PROVIDER: 'huggingface', AIA_LLM_MODEL: MODEL, HF_TOKEN: TOKEN };

function fakeFetch(respond) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return respond(url, init); };
  fn.calls = calls;
  return fn;
}
const reply = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});
const chat = (content, extra = {}) => reply(200, { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', ...extra }] }, { 'x-inference-provider': 'deepinfra' });
const make = (fetchImpl) => new HuggingFaceProvider({ token: TOKEN, model: MODEL, fetchImpl });
const req = () => buildGenerationPrompt(validateGenerationRequest({ classroomId: 10, topic: 'Photosynthesis', subject: 'Biology', count: 1, difficulty: 'easy' }), { grade: '8' });
async function errorOf(p) { try { await p; } catch (e) { return e; } assert.fail('expected an error'); }

describe('HuggingFaceProvider request', () => {
  it('calls the routed OpenAI-compatible endpoint with the token only in the Authorization header', async () => {
    const fetch = fakeFetch(() => chat('{"questions":[]}'));
    const p = make(fetch);
    assert.equal(await p.generateJson(req()), '{"questions":[]}');
    const { url, init } = fetch.calls[0];
    assert.equal(url, 'https://router.huggingface.co/v1/chat/completions');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.equal(url.includes(TOKEN) || init.body.includes(TOKEN), false);
    const body = JSON.parse(init.body);
    assert.equal(body.model, MODEL);
    assert.deepEqual(body.messages.map((m) => m.role), ['system', 'user']);
    assert.match(body.messages[0].content, /EXACTLY ONE correct option/);
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(p.lastCall, { status: 200, backend: 'deepinfra' });
  });

  it('converts the agent schema to standard JSON Schema without changing its shape', () => {
    const s = toJsonSchema(RESPONSE_SCHEMA);
    assert.equal(s.type, 'object');
    assert.equal(s.additionalProperties, false);
    assert.deepEqual(s.required, ['questions']);
    const q = s.properties.questions.items;
    assert.equal(q.type, 'object');
    assert.equal(q.additionalProperties, false);
    assert.deepEqual(q.required, ['question', 'options', 'correctAnswer', 'explanation', 'difficulty']);
    assert.deepEqual(q.properties.options, { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 });
    assert.deepEqual(q.properties.difficulty, { type: 'string', enum: ['easy', 'medium', 'hard'] });
    assert.equal(JSON.stringify(s).includes('propertyOrdering'), false);
    assert.equal(JSON.stringify(s).includes('"OBJECT"'), false);
  });

  it('never exposes the token when serialized', () => {
    const p = make(async () => chat('x'));
    assert.equal(JSON.stringify(p).includes(TOKEN), false);
    assert.equal(Object.keys(p).includes('token'), false);
  });
});

describe('HuggingFaceProvider errors (safe codes, no token or body in messages)', () => {
  for (const [status, code] of [[401, 'AUTH_FAILED'], [403, 'AUTH_FAILED'], [402, 'QUOTA_EXCEEDED'], [404, 'MODEL_NOT_FOUND'], [429, 'RATE_LIMITED'], [503, 'UNAVAILABLE'], [500, 'UNAVAILABLE'], [400, 'BAD_REQUEST'], [422, 'BAD_REQUEST']]) {
    it(`HTTP ${status} -> ${code}`, async () => {
      const err = await errorOf(make(fakeFetch(() => reply(status, { error: `echo ${TOKEN}` }))).generateJson(req()));
      assert.equal(err.code, code);
      assert.equal(err.status, status);
      assert.equal(err.message.includes(TOKEN) || err.message.includes('echo'), false);
    });
  }

  it('network failure, abort passthrough, unreadable/empty/refused responses', async () => {
    assert.equal((await errorOf(make(async () => { throw new TypeError('fetch failed'); }).generateJson(req()))).code, 'NETWORK_ERROR');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    assert.equal((await errorOf(make(async () => { throw abort; }).generateJson(req()))).name, 'AbortError');
    const notJson = { ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError('x'); } };
    assert.equal((await errorOf(make(async () => notJson).generateJson(req()))).code, 'BAD_RESPONSE');
    assert.equal((await errorOf(make(async () => reply(200, { choices: [] })).generateJson(req()))).code, 'BAD_RESPONSE');
    assert.equal((await errorOf(make(async () => chat('   ')).generateJson(req()))).code, 'BAD_RESPONSE');
    assert.equal((await errorOf(make(async () => chat('x', { finish_reason: 'content_filter' })).generateJson(req()))).code, 'BLOCKED');
  });

  it('refuses to construct without a token or with a malformed model id', () => {
    assert.throws(() => new HuggingFaceProvider({ token: '', model: MODEL, fetchImpl: async () => {} }), /token/);
    assert.throws(() => new HuggingFaceProvider({ token: TOKEN, model: 'not a model', fetchImpl: async () => {} }), /model id/);
  });
});

describe('configuration: assessment-only override, onboarding config untouched', () => {
  it('AIA_LLM_PROVIDER=huggingface selects HF with HF_TOKEN and AIA_LLM_MODEL', () => {
    const c = loadGenerationConfig({ ...HF_ENV, SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'gemini-x', SOA_GEMINI_API_KEY: 'g-key' });
    assert.deepEqual([c.configured, c.provider, c.model, c.source], [true, 'huggingface', MODEL, 'AIA_LLM_*']);
    assert.equal(c.apiKey, TOKEN);
    assert.ok(createGenerationProvider(c, { fetchImpl: async () => {} }) instanceof HuggingFaceProvider);
  });

  it('never borrows the shared (Gemini) SOA_LLM_MODEL when the override is set', () => {
    const c = loadGenerationConfig({ AIA_LLM_PROVIDER: 'huggingface', HF_TOKEN: TOKEN, SOA_LLM_MODEL: 'gemini-x' });
    assert.equal(c.reason, 'MODEL_MISSING');
  });

  it('without the override, SOA_* is used exactly as before (Gemini)', () => {
    const c = loadGenerationConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'gemini-x', SOA_GEMINI_API_KEY: 'g-key', HF_TOKEN: TOKEN });
    assert.deepEqual([c.provider, c.model, c.source, c.configured], ['gemini', 'gemini-x', 'SOA_LLM_*', true]);
    assert.equal(c.apiKey, 'g-key');
  });

  it('a placeholder or malformed HF token is "not configured": nothing will be called', async () => {
    for (const bad of ['abcdefghijk', 'hf_short', 'Bearer hf_' + 'x'.repeat(30)]) {
      const c = loadGenerationConfig({ ...HF_ENV, HF_TOKEN: bad });
      assert.equal(c.reason, 'API_KEY_INVALID_FORMAT', bad);
      assert.ok(createGenerationProvider(c) instanceof NotConfiguredProvider);
    }
    assert.equal(loadGenerationConfig({ ...HF_ENV, HF_TOKEN: '' }).reason, 'API_KEY_MISSING');
  });

  it('never exposes the HF token when the config is serialized', () => {
    assert.equal(JSON.stringify(loadGenerationConfig(HF_ENV)).includes(TOKEN), false);
  });
});

describe('HF output goes through the SAME unweakened parser, validator and guard', () => {
  const gen = (fetchImpl) => new AssessmentGenerator({ provider: make(fetchImpl), log: () => {} });
  const request = validateGenerationRequest({ classroomId: 10, topic: 'Photosynthesis', subject: 'Biology', count: 1, difficulty: 'easy' });

  it('valid structured output -> one validated MCQ proposal', async () => {
    const out = await gen(async () => chat(genOutput(1))).generate(request, { grade: '8' });
    assert.equal(out.questions.length, 1);
    assert.equal(out.questions[0].options.length, 4);
    assert.equal(out.questions[0].options.filter((o) => o.isCorrect).length, 1);
    assert.equal(out.provider, 'huggingface');
  });

  it('bad JSON / wrong option count / answer not in options / 402 are rejected with safe codes', async () => {
    const cases = [
      ['{"questions": [', 'AI_OUTPUT_REJECTED'],
      [genOutput(1, (q) => { q[0].options.pop(); }), 'AI_OUTPUT_REJECTED'],
      [genOutput(1, (q) => { q[0].correctAnswer = 'B'; }), 'AI_OUTPUT_REJECTED'],
    ];
    for (const [content, code] of cases) assert.equal((await errorOf(gen(async () => chat(content)).generate(request))).code, code);
    const quota = await errorOf(gen(async () => reply(402, {})).generate(request));
    assert.deepEqual([quota.code, quota.statusCode], ['AI_QUOTA_EXCEEDED', 503]);
  });
});
