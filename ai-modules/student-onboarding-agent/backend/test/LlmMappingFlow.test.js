'use strict';
/**
 * LLM reasoning layer, end to end inside the module (no network, mocked LLM):
 *   messy XLSX -> ExcelImportService -> masked samples + prompt -> MOCK LLMProvider
 *   -> strict JSON -> ColumnMappingGuard -> confidence rule -> review -> admin decisions -> approval.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LLMProvider } = require('../src/llm/LLMProvider');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { ExcelImportService } = require('../src/import/ExcelImportService');
const { InMemoryImportJobStore } = require('../src/import/ImportJobStore');
const { ImportJobService } = require('../src/import/ImportJobService');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');
const { isSensitiveHeader } = require('../src/mapping/SampleMasker');
const { createLLMProvider } = require('../src/llm/createLLMProvider');
const { loadLlmConfig, loadMappingConfig } = require('../src/config');
const { HEADERS, MESSY_LLM_RESPONSE, EXPECTED_REVIEW, NEVER_SENT, buildMessyWorkbook, approveSuggestions } = require('./fixtures/messyStudentWorkbook');

/** Mock provider: records every call; answers with a canned text or behaviour. No network. */
class MockLLM extends LLMProvider {
  constructor(answer) {
    super('mock-llm');
    this.answer = answer;
    this.calls = [];
  }
  async generate(prompt, options) {
    this.calls.push({ prompt, optionKeys: Object.keys(options).sort() });
    return typeof this.answer === 'function' ? this.answer(prompt, options) : this.answer;
  }
}

const schema = loadStudentSchema();
function service(provider, { timeoutMs = 2000, minLlmConfidence = loadMappingConfig({}).minConfidence } = {}) {
  return new ImportJobService({
    schema,
    store: new InMemoryImportJobStore({ maxJobs: 10, ttlMs: 60000 }),
    importService: new ExcelImportService({ maxRows: 100 }),
    mappingService: new ColumnMappingService({ schema, llmProvider: provider, samplesPerColumn: 3, timeoutMs }),
    minLlmConfidence,
  });
}
const byColumn = (review) => Object.fromEntries(review.columns.map((c) => [c.sourceColumn, [c.status, c.targetField, c.candidateFields]]));

describe('LLM mapping of a messy spreadsheet (mocked provider)', () => {
  it('produces the expected mapping after the deterministic guard and confidence rule', async () => {
    const llm = new MockLLM(JSON.stringify(MESSY_LLM_RESPONSE));
    const review = await service(llm).startJob(await buildMessyWorkbook(), { fileName: 'messy.xlsx' });

    assert.equal(llm.calls.length, 1);
    assert.deepEqual(review.columns.map((c) => c.sourceColumn), HEADERS, 'headers trimmed, order kept');
    assert.deepEqual(byColumn(review), EXPECTED_REVIEW);
    assert.equal(review.automaticMapping.status, 'proposed');
    assert.equal(review.automaticMapping.provider, 'mock-llm');

    const col = (h) => review.columns.find((c) => c.sourceColumn === h);
    assert.equal(col('Stu. Name').confidence, 0.97);
    assert.equal(col('Stu. Name').decidedBy, 'llm');
    assert.ok(col('Admsn Dt').errors.some((e) => e.code === 'LOW_CONFIDENCE_MAPPING'), 'uncertain mapping flagged');
    assert.ok(col('Password').errors.length > 0, 'forbidden target recorded');
    assert.equal(review.approvalReady, false, 'unresolved columns block approval');
    const unresolved = review.columns.filter((c) => ['ambiguous', 'rejected', 'pending'].includes(c.status)).map((c) => c.sourceColumn);
    assert.deepEqual(unresolved, ['Admsn Dt', 'Password', 'Gurdian/Contact']);
    assert.ok(review.columns.filter((c) => c.status === 'suggested').every((c) => c.blocking && c.targetField === null), 'suggestions are not used before approval');
  });

  it('sends only headers + masked samples: no student data, no credentials, no secrets', async () => {
    process.env.JWT_SECRET = 'jwt-secret-must-not-leak-0123456789abcdef';
    process.env.SOA_GEMINI_API_KEY = 'gemini-key-must-not-leak';
    process.env.EMAIL_PASS = 'smtp-pass-must-not-leak';
    try {
      const llm = new MockLLM(JSON.stringify(MESSY_LLM_RESPONSE));
      await service(llm).startJob(await buildMessyWorkbook(), { fileName: 'messy.xlsx' });
      const { prompt, optionKeys } = llm.calls[0];
      for (const h of HEADERS) assert.ok(prompt.includes(JSON.stringify(h)), `header ${h} sent`);
      for (const v of NEVER_SENT) assert.ok(!prompt.includes(v), `student value leaked: ${v}`);
      for (const secret of ['jwt-secret-must-not-leak', 'gemini-key-must-not-leak', 'smtp-pass-must-not-leak']) assert.ok(!prompt.includes(secret));
      assert.doesNotMatch(prompt, /\$2[aby]\$|lms_permanent|sqlite|SELECT /i, 'no DB contents or hashes');
      const columns = JSON.parse(prompt.slice(prompt.indexOf('COLUMNS\n') + 8, prompt.indexOf('\n\nOUTPUT FORMAT')));
      assert.deepEqual(columns.find((c) => c.sourceColumn === 'Password').samples, [], 'no samples at all for a credentials column');
      assert.deepEqual(columns.find((c) => c.sourceColumn === 'Stu. Name').samples, ['<NAME>']);
      assert.deepEqual(columns.find((c) => c.sourceColumn === 'E-mail Addr').samples, ['<EMAIL>']);
      assert.deepEqual(optionKeys, ['responseFormat', 'signal', 'temperature'], 'prompt text only: no tools, no DB handle');
    } finally {
      delete process.env.JWT_SECRET; delete process.env.SOA_GEMINI_API_KEY; delete process.env.EMAIL_PASS;
    }
  });

  it('sensitive-looking headers never get samples', () => {
    for (const h of ['Password', 'Pwd', 'PIN', 'OTP', 'Login Token', 'API Key', 'Aadhaar No', 'Bank Account No', 'SMTP pass'])
      assert.equal(isSensitiveHeader(h), true, h);
    for (const h of ['Stu. Name', 'E-mail Addr', 'Std', 'Sec/Div', 'D.O.B', 'Mob. No.', 'Roll No', 'Remarks'])
      assert.equal(isSensitiveHeader(h), false, h);
  });

  it('the admin approves the AI suggestions and resolves the rest; then the import can be approved (LLM never approves)', async () => {
    const svc = service(new MockLLM(JSON.stringify(MESSY_LLM_RESPONSE)));
    const review = await svc.startJob(await buildMessyWorkbook(), { fileName: 'messy.xlsx' });
    await assert.rejects(svc.approveImport(review.jobId), { code: 'APPROVAL_BLOCKED' }, 'nothing can be imported from unapproved suggestions');
    const after = await svc.applyMappingDecision(review.jobId, { decisions: [
      ...approveSuggestions(review), // the admin's explicit approval of the AI suggestions
      { sourceColumn: 'Admsn Dt', action: 'map', targetField: 'admissionDate' },
      { sourceColumn: 'Password', action: 'unmap' },
      { sourceColumn: 'Gurdian/Contact', action: 'unmap' },
      // columns the LLM left unmapped must still be confirmed by the admin (never silently dropped)
      { sourceColumn: 'Roll No', action: 'unmap' },
      { sourceColumn: 'Remarks', action: 'unmap' },
    ] });
    assert.equal(after.approvalReady, true, JSON.stringify(after.issues.filter((i) => i.blocking)));
    await svc.approveImport(review.jobId);
    const approved = await svc.getApprovedImport(review.jobId);
    assert.equal(approved.rows.length, 3);
    assert.deepEqual(Object.keys(approved.rows[0].data).sort(), ['address', 'admissionDate', 'bloodGroup', 'className', 'dob', 'email', 'fullName', 'parentName', 'phone', 'section'].sort());
    assert.equal(approved.rows[0].data.fullName, 'Aarav Mehta');
    assert.ok(!('password' in approved.rows[0].data));
  });
});

describe('safe fallback to the manual (deterministic) flow', () => {
  const cases = [
    ['provider throws', () => { throw new Error('upstream 500 with api key=abc'); }, 'LLM_PROVIDER_ERROR'],
    ['times out', () => new Promise(() => {}), 'LLM_TIMEOUT'],
    ['invalid JSON', 'Sure! Here is the mapping: {columns: [...]}', 'LLM_INVALID_JSON'],
    ['JSON in code fences', '```json\n' + JSON.stringify(MESSY_LLM_RESPONSE) + '\n```', 'LLM_INVALID_JSON'],
    ['empty answer', '   ', 'LLM_MALFORMED_RESPONSE'],
    ['wrong shape', JSON.stringify({ mapping: { a: 'b' } }), 'MAPPING_PROPOSAL_INVALID'],
    ['missing columns', JSON.stringify({ mappings: MESSY_LLM_RESPONSE.mappings.slice(0, 3) }), 'MAPPING_PROPOSAL_INVALID'],
  ];
  for (const [name, answer, code] of cases) {
    it(`${name} -> all columns pending, admin maps manually, approval still works`, async () => {
      const svc = service(new MockLLM(answer), { timeoutMs: 50 });
      const review = await svc.startJob(await buildMessyWorkbook(), { fileName: 'messy.xlsx' });
      assert.equal(review.state, 'needs_review');
      assert.equal(review.automaticMapping.status, 'unavailable');
      assert.equal(review.automaticMapping.error.code, code);
      assert.ok(review.columns.every((c) => c.status === 'pending' && c.targetField === null));
      assert.doesNotMatch(JSON.stringify(review.automaticMapping), /api key=abc/);
      const map = { 'Stu. Name': 'fullName', 'E-mail Addr': 'email', Std: 'className', 'Sec/Div': 'section' };
      const after = await svc.applyMappingDecision(review.jobId, { decisions: HEADERS.map((h) => (map[h] ? { sourceColumn: h, action: 'map', targetField: map[h] } : { sourceColumn: h, action: 'unmap' })) });
      assert.equal(after.approvalReady, true);
    });
  }

  it('the LLM cannot smuggle system fields or duplicate targets past the guard', async () => {
    const bad = { mappings: MESSY_LLM_RESPONSE.mappings.map((c) =>
      c.sourceColumn === 'Roll No' ? { sourceColumn: 'Roll No', status: 'mapped', targetField: 'universityId', confidence: 1 }
        : c.sourceColumn === 'Remarks' ? { sourceColumn: 'Remarks', status: 'mapped', targetField: 'email', confidence: 1 } : c) };
    const review = await service(new MockLLM(JSON.stringify(bad))).startJob(await buildMessyWorkbook(), { fileName: 'messy.xlsx' });
    const cols = byColumn(review);
    assert.notEqual(cols['Roll No'][0], 'mapped');
    assert.ok(!review.columns.some((c) => c.status === 'mapped' && ['universityId', 'password', 'role'].includes(c.targetField)));
    assert.ok(review.columns.filter((c) => c.status === 'mapped' && c.targetField === 'email').length <= 1);
    assert.equal(review.approvalReady, false);
  });
});

describe('provider configuration', () => {
  it('uses only the configured provider; with nothing configured there is no provider (manual flow)', () => {
    assert.deepEqual(createLLMProvider(loadLlmConfig({})), { provider: null, reason: 'SOA_LLM_PROVIDER is not set.' });
    assert.equal(createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'm' })).provider, null, 'no key -> no provider');
    const p = createLLMProvider(loadLlmConfig({ SOA_LLM_PROVIDER: 'gemini', SOA_LLM_MODEL: 'm', SOA_GEMINI_API_KEY: 'k' }), { fetchImpl: async () => { throw new Error('no network in tests'); } }).provider;
    assert.equal(p.name, 'gemini');
    assert.equal(loadMappingConfig({}).minConfidence, 0.7);
    assert.throws(() => loadMappingConfig({ SOA_MAPPING_MIN_CONFIDENCE: '1.5' }));
  });
});
