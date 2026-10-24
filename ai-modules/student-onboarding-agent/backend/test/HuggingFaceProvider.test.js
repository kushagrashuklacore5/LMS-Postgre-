'use strict';
/**
 * Onboarding Hugging Face provider: fake fetch only (NO network, no real Hugging Face call).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { HuggingFaceProvider } = require('../src/llm/providers/huggingface/HuggingFaceProvider');
const { GeminiProvider } = require('../src/llm/providers/gemini/GeminiProvider');
const { createLLMProvider } = require('../src/llm/createLLMProvider');
const { LLMProviderError } = require('../src/llm/LLMProvider');
const { loadLlmConfig } = require('../src/config');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');
const { InMemoryImportJobStore } = require('../src/import/ImportJobStore');
const { ImportJobService } = require('../src/import/ImportJobService');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };
const TOKEN = `hf_${'Abc123'.repeat(6)}`; // fake, well-formed
const MODEL = 'Qwen/Qwen3-Next-80B-A3B-Instruct:deepinfra';
const schema = loadStudentSchema();

/** A fake fetch that records calls and answers with `respond(url, init)`. */
function fakeFetch(respond) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return respond(url, init); };
  f.calls = calls;
  return f;
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const chat = (content, finish = 'stop') => json(200, { choices: [{ index: 0, finish_reason: finish, message: { role: 'assistant', content } }] });
const env = (extra = {}) => ({ SOA_LLM_PROVIDER: 'huggingface', SOA_HUGGINGFACE_MODEL: MODEL, ...extra });

describe('configuration and selection', () => {
  it('1/2/4. SOA_LLM_PROVIDER=huggingface selects the HF provider; token and model come from the environment', () => {
    const viaOwnKey = createLLMProvider(loadLlmConfig(env({ SOA_HUGGINGFACE_API_KEY: TOKEN })));
    assert.ok(viaOwnKey.provider instanceof HuggingFaceProvider);
    assert.equal(viaOwnKey.provider.model, MODEL);
    assert.equal(viaOwnKey.provider.name, 'huggingface');
    const viaShared = createLLMProvider(loadLlmConfig(env({ HF_TOKEN: TOKEN })));
    assert.ok(viaShared.provider instanceof HuggingFaceProvider, 'falls back to HF_TOKEN from the same .env');
    assert.equal(loadLlmConfig(env({ SOA_HUGGINGFACE_API_KEY: TOKEN, HF_TOKEN: 'hf_other' })).hfToken, TOKEN, 'the module key wins');
  });

  it('missing or malformed settings -> not configured (manual mapping), and the reason never contains the token', () => {
    const cases = [[env(), /No Hugging Face token/], [env({ HF_TOKEN: 'not-a-token' }), /does not look like/],
      [{ SOA_LLM_PROVIDER: 'huggingface', HF_TOKEN: TOKEN }, /SOA_HUGGINGFACE_MODEL is not set/],
      [env({ HF_TOKEN: TOKEN, SOA_HUGGINGFACE_MODEL: 'gemini-3.8-flash' }), /must look like/]];
    for (const [e, re] of cases) {
      const r = createLLMProvider(loadLlmConfig(e));
      assert.equal(r.provider, null);
      assert.match(r.reason, re);
      assert.ok(!r.reason.includes(TOKEN) && !r.reason.includes('not-a-token'));
    }
  });

  it('the token is never serialized with the provider', () => {
    const p = new HuggingFaceProvider({ token: TOKEN, model: MODEL, fetchImpl: fakeFetch(() => chat('{}')) });
    assert.ok(!JSON.stringify(p).includes(TOKEN));
    assert.ok(!Object.keys(p).includes('token'));
  });
});

describe('request and response', () => {
  it('5. sends the prompt to the chat-completions router with the bearer token and configured model', async () => {
    const f = fakeFetch(() => chat('{"mappings":[]}'));
    const p = new HuggingFaceProvider({ token: TOKEN, model: MODEL, fetchImpl: f });
    const out = await p.generate('PROMPT TEXT', { responseFormat: 'json', temperature: 0 });
    assert.equal(out, '{"mappings":[]}');
    assert.equal(f.calls.length, 1, 'one request, no retries');
    const { url, init, body } = f.calls[0];
    assert.equal(url, 'https://router.huggingface.co/v1/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(body, { model: MODEL, messages: [{ role: 'user', content: 'PROMPT TEXT' }], temperature: 0, max_tokens: 4096, stream: false });
    assert.ok(!init.body.includes(TOKEN), 'the token is only in the header');
  });

  it('3/9. HTTP and network failures become safe LLMProviderErrors that never contain the token or the response body', async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      const p = new HuggingFaceProvider({ token: TOKEN, model: MODEL, fetchImpl: fakeFetch(() => json(status, { error: `echo ${TOKEN} secret body` })) });
      await assert.rejects(p.generate('x'), (err) => err instanceof LLMProviderError && err.code === 'HTTP_ERROR' && err.status === status
        && !err.message.includes(TOKEN) && !err.message.includes('secret body') && !JSON.stringify(err).includes(TOKEN));
    }
    const down = new HuggingFaceProvider({ token: TOKEN, model: MODEL, fetchImpl: async () => { throw new Error(`connect failed ${TOKEN}`); } });
    await assert.rejects(down.generate('x'), (err) => err.code === 'NETWORK_ERROR' && !err.message.includes(TOKEN));
  });

  it('7. malformed provider output is rejected safely (not JSON, no choices, empty, cut off)', async () => {
    const bad = [
      [{ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }, 'BAD_RESPONSE'],
      [json(200, { nope: true }), 'EMPTY_RESPONSE'],
      [chat('   '), 'EMPTY_RESPONSE'],
      [chat('{"mappings": [', 'length'), 'TRUNCATED_RESPONSE'],
    ];
    for (const [response, code] of bad) {
      const p = new HuggingFaceProvider({ token: TOKEN, model: MODEL, fetchImpl: fakeFetch(() => response) });
      await assert.rejects(p.generate('x'), { code });
    }
  });

  it('10. the Gemini provider is unchanged', async () => {
    const r = createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'gemini-3.8-flash', SOA_GEMINI_API_KEY: 'gk-test' }));
    assert.ok(r.provider instanceof GeminiProvider);
    assert.equal(r.provider.name, 'gemini');
    assert.match(createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'openai' })).reason, /not implemented/);
  });
});

describe('through the existing mapping pipeline (fake HF HTTP layer)', () => {
  const HEADERS = ['Student Full Name', 'Email Address', 'Mobile No', 'XYZ Code', 'Bus Route'];
  const rows = [{ rowNumber: 2, values: { 'Student Full Name': 'Rahul Sharma', 'Email Address': 'rahul@school.example', 'Mobile No': '98765 43210', 'XYZ Code': 'Q1Z9', 'Bus Route': 'Blue' } }];
  const m = (sourceColumn, targetField, confidence) => ({ sourceColumn, status: 'mapped', targetField, confidence });
  const service = (fetchImpl, timeoutMs = 500) => new ImportJobService({
    schema, store: new InMemoryImportJobStore(),
    importService: { parse: async () => ({ fileName: 's.xlsx', sheetName: 'S', sheetNames: ['S'], headerRowNumber: 1, headers: [...HEADERS], rows: structuredClone(rows), rowCount: 1, columnCount: 5, skippedBlankRows: 0, warnings: [] }) },
    mappingService: new ColumnMappingService({ schema, llmProvider: new HuggingFaceProvider({ token: TOKEN, model: MODEL, fetchImpl }), timeoutMs }),
  });

  it('6/11/12. a valid HF answer reaches the parser + guard + confidence + SampleShapeCheck; safe columns auto-map; no field is created', async () => {
    const answer = { mappings: [m('Student Full Name', 'fullName', 0.98), m('Email Address', 'email', 0.99), m('Mobile No', 'email', 0.97) /* duplicate */,
      m('XYZ Code', 'address', 0.48) /* low */, { sourceColumn: 'Bus Route', status: 'unmapped' }],
      suggestedNewFields: [{ sourceColumn: 'Bus Route', name: 'bus_route', label: 'Bus Route', dataType: 'text', confidence: 0.9 }] };
    const f = fakeFetch(() => chat(JSON.stringify(answer)));
    const r = await service(f).startJob(Buffer.from('x'));
    assert.equal(f.calls.length, 1);
    assert.ok(f.calls[0].body.messages[0].content.includes('"sourceColumn":"Student Full Name"'), 'the existing compact prompt is what is sent');
    assert.ok(!f.calls[0].body.messages[0].content.includes('Rahul Sharma'), 'masked samples only');
    const st = (h) => { const c = r.columns.find((x) => x.sourceColumn === h); return [c.status, c.targetField, c.decidedBy]; };
    assert.equal(r.automaticMapping.provider, 'huggingface');
    assert.deepEqual(st('Student Full Name'), ['mapped', 'fullName', 'llm'], 'AUTO MAPPED');
    assert.deepEqual(st('Email Address'), ['rejected', null, 'llm'], 'duplicate target: guard rejects both');
    assert.deepEqual(st('Mobile No'), ['rejected', null, 'llm']);
    assert.deepEqual(st('XYZ Code'), ['ambiguous', null, 'llm'], 'below 0.7: needs action');
    assert.deepEqual(r.newFields.map((x) => x.status), ['suggested'], 'new field stays a suggestion; nothing is created');

    const sample = { mappings: [m('Student Full Name', 'fullName', 0.98), m('Email Address', 'phone', 0.99), m('Mobile No', 'email', 0.99),
      { sourceColumn: 'XYZ Code', status: 'unmapped' }, { sourceColumn: 'Bus Route', status: 'unmapped' }] };
    const r2 = await service(fakeFetch(() => chat(JSON.stringify(sample)))).startJob(Buffer.from('x'));
    assert.deepEqual(r2.columns.filter((c) => c.errors.some((e) => e.code === 'SAMPLE_MISMATCH')).map((c) => c.sourceColumn), ['Email Address', 'Mobile No'], 'SampleShapeCheck still applies');
  });

  it('7. malformed / fenced / unsafe HF answers fall back to manual mapping (nothing guessed)', async () => {
    const unsafe = { mappings: HEADERS.map((h) => ({ sourceColumn: h, status: 'unmapped', reason: 'DROP TABLE users; --' })) };
    for (const [content, code] of [['Sure! {"mappings": []}', 'LLM_INVALID_JSON'], ['```json\n{"mappings":[]}\n```', 'LLM_INVALID_JSON'], [JSON.stringify(unsafe), 'MAPPING_PROPOSAL_INVALID']]) {
      const r = await service(fakeFetch(() => chat(content))).startJob(Buffer.from('x'));
      assert.equal(r.automaticMapping.error.code, code);
      assert.ok(r.columns.every((c) => c.status === 'pending'));
    }
  });

  it('8/9. timeout and HTTP failure become the existing safe errors (LLM_TIMEOUT / LLM_PROVIDER_ERROR), no token in the job', async () => {
    const hang = fakeFetch((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); })));
    const t = await service(hang, 50).startJob(Buffer.from('x'));
    assert.equal(t.automaticMapping.error.code, 'LLM_TIMEOUT');
    assert.equal(hang.calls.length, 1, 'no retry');
    const h = await service(fakeFetch(() => json(401, { error: TOKEN }))).startJob(Buffer.from('x'));
    assert.equal(h.automaticMapping.error.code, 'LLM_PROVIDER_ERROR');
    assert.ok(!JSON.stringify(h).includes(TOKEN));
    assert.ok(h.columns.every((c) => c.status === 'pending'));
  });
});
