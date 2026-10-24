'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { exactHeaderProposal } = require('../src/mapping/ExactHeaderMatcher');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');
const { LLMProvider } = require('../src/llm/LLMProvider');

const schema = loadStudentSchema();
const TEMPLATE = ['Full Name', 'Email', 'Class', 'Section', 'Parent Name', 'Phone', 'Date of Birth', 'Admission Date', 'Blood Group', 'Address'];
const FIELDS = ['fullName', 'email', 'className', 'section', 'parentName', 'phone', 'dob', 'admissionDate', 'bloodGroup', 'address'];

class SpyLLM extends LLMProvider {
  constructor() { super('spy'); this.calls = 0; }
  async generate() { this.calls += 1; throw new Error('the LLM must not be called for a formatted sheet'); }
}

describe('exact header recognition (formatted spreadsheets, no LLM)', () => {
  it('maps the standard template headers and field names, ignoring case, spaces and punctuation', () => {
    assert.deepEqual(exactHeaderProposal(schema, TEMPLATE).mappings.map((m) => [m.targetField, m.confidence]), FIELDS.map((f) => [f, 1]));
    assert.deepEqual(exactHeaderProposal(schema, FIELDS).mappings.map((m) => m.targetField), FIELDS);
    for (const variant of [' e-mail ', 'E mail', 'E_MAIL']) {
      assert.deepEqual(exactHeaderProposal(schema, ['FULL NAME', variant, 'class', 'SECTION']).mappings.map((m) => m.targetField), ['fullName', 'email', 'className', 'section'], variant);
    }
    assert.deepEqual(exactHeaderProposal(schema, ['full_name', 'EMAIL', 'class', 'SECTION']).mappings.map((m) => m.targetField), ['fullName', 'email', 'className', 'section']);
  });

  it('returns null (existing flow) for any unknown header, a duplicate field, or no headers', () => {
    assert.equal(exactHeaderProposal(schema, [...TEMPLATE, 'Remarks']), null);
    assert.equal(exactHeaderProposal(schema, ['Full Name', 'Name', 'Email']), null, 'two columns for one field');
    assert.equal(exactHeaderProposal(schema, ['Full Name', 'Password']), null, 'system fields are never recognized');
    assert.equal(exactHeaderProposal(schema, []), null);
  });

  it('ColumnMappingService maps a formatted sheet deterministically without calling the LLM, through the guard', async () => {
    const llm = new SpyLLM();
    const rows = [{ rowNumber: 2, values: Object.fromEntries(TEMPLATE.map((h) => [h, null])) }];
    rows[0].values['Full Name'] = 'Test Student'; rows[0].values.Email = 'test.student@example.com';
    for (const provider of [llm, null]) {
      const r = await new ColumnMappingService({ schema, llmProvider: provider }).mapImport({ headers: TEMPLATE, rows });
      assert.equal(r.provider, 'exact-header-match');
      assert.equal(r.status, 'mapped');
      assert.equal(r.error, null);
      assert.equal(r.sentToLlm, null, 'nothing prepared for an LLM');
      assert.equal(r.guard.structurallyValid, true);
      assert.equal(r.guard.mapping.length, 10);
      assert.equal(r.canonicalRows[0].values.fullName, 'Test Student');
    }
    assert.equal(llm.calls, 0);
  });

  it('a non-formatted sheet still uses the LLM path (unchanged)', async () => {
    const llm = new SpyLLM();
    const r = await new ColumnMappingService({ schema, llmProvider: llm }).mapImport({ headers: ['Stu. Name', 'Email'], rows: [] });
    assert.equal(llm.calls, 1);
    assert.equal(r.error.code, 'LLM_PROVIDER_ERROR');
  });
});
