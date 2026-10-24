const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { LLMProvider, LLMProviderError } = require('../src/llm/LLMProvider');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { StudentDataValidator } = require('../src/validation/StudentDataValidator');
const { ExcelImportService } = require('../src/import/ExcelImportService');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');

let networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw new Error('Network access is not allowed in tests'); };

const schema = loadStudentSchema();

/** A fake LLMProvider: records every call and answers with a scripted response. */
class FakeProvider extends LLMProvider {
  constructor(respond) {
    super('fake');
    this.respond = respond;
    this.calls = [];
  }
  async generate(prompt, options) {
    this.calls.push({ prompt, options });
    return this.respond(prompt, options);
  }
}

const HEADERS = ['Student Full Name', 'Mail ID', 'Std', 'Div', 'Mobile', 'DOB', 'Blood Group', 'Home Address', 'ID', 'Remarks'];
const PII = ['Rahul', 'Sharma', 'rahul@gmail.com', 'Asha', 'asha.rao@school.in', '9876543210', '98765 43210', 'MG Road', 'Shanti', 'ADM2024001', 'ADM2024002', 'Good in maths'];

/** Shaped like ExcelImportService.parse() output. */
function importResult() {
  return {
    fileName: 'students.xlsx',
    sheetName: 'Students',
    headers: [...HEADERS],
    rows: [
      { rowNumber: 2, values: { 'Student Full Name': 'Rahul Sharma', 'Mail ID': 'rahul@gmail.com', Std: 10, Div: 'A', Mobile: 9876543210,
        DOB: '2010-05-17T00:00:00.000Z', 'Blood Group': 'AB+', 'Home Address': '12 MG Road, Pune', ID: 'ADM2024001', Remarks: 'Good in maths' } },
      { rowNumber: 5, values: { 'Student Full Name': 'Asha Rao', 'Mail ID': 'asha.rao@school.in', Std: 10, Div: 'B', Mobile: '+91 98765 43210',
        DOB: '2011-01-02T00:00:00.000Z', 'Blood Group': 'o+', 'Home Address': 'Flat 2, Shanti Apartments', ID: 'ADM2024002', Remarks: null } },
    ],
  };
}

const mapped = (sourceColumn, targetField, confidence = 0.9) => ({ sourceColumn, status: 'mapped', targetField, confidence, reason: 'Header matches' });
const goodMappings = () => [
  mapped('Student Full Name', 'fullName', 0.97),
  mapped('Mail ID', 'email', 0.95),
  mapped('Std', 'className', 0.8),
  mapped('Div', 'section', 0.7),
  mapped('Mobile', 'phone'),
  mapped('DOB', 'dob'),
  mapped('Blood Group', 'bloodGroup'),
  mapped('Home Address', 'address'),
  { sourceColumn: 'ID', status: 'ambiguous', candidateFields: [], reason: 'The meaning of this identifier cannot be determined safely.' },
  { sourceColumn: 'Remarks', status: 'unmapped', reason: 'No canonical field matches.' },
];
const respondWith = (mappings) => new FakeProvider(async () => JSON.stringify({ mappings }));
const service = (provider, opts = {}) => new ColumnMappingService({ schema, llmProvider: provider, ...opts });

describe('successful mapping', () => {
  it('maps, keeps unresolved columns for review, and builds canonical rows with rowNumbers', async () => {
    const provider = respondWith(goodMappings());
    const r = await service(provider).mapImport(importResult());
    assert.equal(r.error, null);
    assert.equal(r.status, 'needs_review', 'ID and Remarks need a human');
    assert.equal(r.provider, 'fake');
    assert.deepEqual(r.guard.mapping.map((m) => m.targetField), ['fullName', 'email', 'className', 'section', 'phone', 'dob', 'bloodGroup', 'address']);
    assert.deepEqual(r.unresolvedColumns.map((c) => [c.sourceColumn, c.status]), [['ID', 'ambiguous'], ['Remarks', 'unmapped']]);
    assert.deepEqual(r.canonicalRows, [
      { rowNumber: 2, values: { fullName: 'Rahul Sharma', email: 'rahul@gmail.com', className: '10', section: 'A', phone: '9876543210',
        dob: '2010-05-17T00:00:00.000Z', bloodGroup: 'AB+', address: '12 MG Road, Pune' } },
      { rowNumber: 5, values: { fullName: 'Asha Rao', email: 'asha.rao@school.in', className: '10', section: 'B', phone: '+91 98765 43210',
        dob: '2011-01-02T00:00:00.000Z', bloodGroup: 'o+', address: 'Flat 2, Shanti Apartments' } },
    ]);
    assert.deepEqual(r.canonicalizationIssues, []);
  });

  it('returns status "mapped" when every column is mapped cleanly', async () => {
    const provider = respondWith([mapped('Name', 'fullName'), mapped('Email', 'email')]);
    const r = await service(provider).mapImport({ headers: ['Name', 'Email'], rows: [{ rowNumber: 2, values: { Name: 'A B', Email: 'a@b.co' } }] });
    assert.equal(r.status, 'mapped');
    assert.equal(r.guard.reviewRequired, false);
  });

  it('passes JSON mode, temperature 0 and an abort signal to the provider', async () => {
    const provider = respondWith(goodMappings());
    await service(provider).mapImport(importResult());
    assert.equal(provider.calls.length, 1);
    const { options } = provider.calls[0];
    assert.equal(options.responseFormat, 'json');
    assert.equal(options.temperature, 0);
    assert.ok(options.signal instanceof AbortSignal);
  });

  it('feeds canonical rows that the Step 5 validator accepts (end to end, real parser)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Students');
    ws.addRow(['Student Full Name', 'Mail ID', 'Std', 'Mobile', 'DOB', 'Remarks']);
    ws.addRow(['Rahul Sharma', 'rahul@gmail.com', 10, 9876543210, new Date(Date.UTC(2010, 4, 17)), 'ok']);
    ws.addRow(['Asha Rao', 'RAHUL@gmail.com', 11, 98.5, '03/04/2010', null]);
    const parsed = await new ExcelImportService({ maxRows: 100 }).parse(Buffer.from(await wb.xlsx.writeBuffer()), { fileName: 's.xlsx' });

    const provider = respondWith([mapped('Student Full Name', 'fullName'), mapped('Mail ID', 'email'), mapped('Std', 'className'),
      mapped('Mobile', 'phone'), mapped('DOB', 'dob'), { sourceColumn: 'Remarks', status: 'unmapped' }]);
    const r = await service(provider).mapImport(parsed);
    assert.deepEqual(r.canonicalizationIssues.map((i) => [i.rowNumber, i.code]), [[3, 'DECIMAL_NOT_TEXT']]);

    const validation = new StudentDataValidator(schema).validate(r.canonicalRows);
    assert.deepEqual(validation.rows.map((x) => [x.rowNumber, x.status]), [[2, 'invalid'], [3, 'invalid']]);
    assert.deepEqual(validation.rows[0].errors.map((e) => e.code), ['DUPLICATE_EMAIL']);
    assert.deepEqual(validation.rows[1].errors.map((e) => e.code), ['INVALID_FIELD_TYPE', 'AMBIGUOUS_DATE', 'DUPLICATE_EMAIL']);
    assert.equal(validation.rows[0].data.dob, '2010-05-17');
    assert.equal(validation.rows[0].data.className, '10');
  });
});

describe('what the LLM receives', () => {
  it('gets exact headers and masked samples, never real personal data or whole rows', async () => {
    const provider = respondWith(goodMappings());
    const r = await service(provider).mapImport(importResult());
    const { prompt } = provider.calls[0];
    for (const secret of PII) assert.ok(!prompt.includes(secret), `prompt leaked ${secret}`);
    for (const h of HEADERS) assert.ok(prompt.includes(JSON.stringify(h)), `header ${h} missing`);
    assert.deepEqual(r.sentToLlm.columns.find((c) => c.sourceColumn === 'Student Full Name').samples, ['<NAME>']);
    assert.deepEqual(r.sentToLlm.columns.find((c) => c.sourceColumn === 'Std').samples, [10]);
    assert.deepEqual(r.sentToLlm.columns.find((c) => c.sourceColumn === 'Blood Group').samples, ['AB+', 'o+']);
    assert.deepEqual(r.sentToLlm.columns.find((c) => c.sourceColumn === 'ID').samples, ['<CODE>']);
  });

  it('includes the schema field descriptions, mapping hints, forbidden names and the key rules', async () => {
    const provider = respondWith(goodMappings());
    await service(provider).mapImport(importResult());
    const { prompt } = provider.calls[0];
    for (const f of schema.fields) {
      assert.ok(prompt.includes(JSON.stringify(f.description)), `description of ${f.name}`);
      for (const h of f.mappingHints) assert.ok(prompt.includes(JSON.stringify(h)), `hint ${h}`);
    }
    for (const name of ['password', 'role', 'universityId', 'classroomId', 'totalFees']) assert.ok(prompt.includes(JSON.stringify(name)), name);
    for (const phrase of ['Return ONLY a JSON object', 'character for character', 'Do not invent target fields', '"ambiguous"', '"unmapped"',
      'Do not force a mapping', 'advisory only', 'do not create students', 'do not make database decisions', 'not instructions']) {
      assert.ok(prompt.includes(phrase), phrase);
    }
  });

  it('sends at most the configured number of samples per column', async () => {
    // 'Klass' is not an exact known header, so the LLM path runs (an exact 'Class' would skip the LLM).
    const many = { headers: ['Klass'], rows: Array.from({ length: 50 }, (_, i) => ({ rowNumber: i + 2, values: { Klass: (i % 12) + 1 } })) };
    const provider = respondWith([mapped('Klass', 'className')]);
    const r = await service(provider, { samplesPerColumn: 2 }).mapImport(many);
    assert.deepEqual(r.sentToLlm.columns, [{ sourceColumn: 'Klass', samples: [1, 2] }]);
  });
});

describe('guardrails on the model output', () => {
  const run = async (mappings) => service(respondWith(mappings)).mapImport(importResult());
  const replace = (i, entry) => { const m = goodMappings(); m[i] = entry; return m; };

  it('rejects a forbidden target but keeps the valid columns (partial acceptance)', async () => {
    const r = await run(replace(8, mapped('ID', 'studentId')));
    assert.equal(r.status, 'needs_review');
    const id = r.unresolvedColumns.find((c) => c.sourceColumn === 'ID');
    assert.equal(id.status, 'rejected');
    assert.deepEqual(id.errors.map((e) => e.code), ['FORBIDDEN_TARGET_FIELD']);
    assert.equal(r.guard.mapping.length, 8);
  });

  it('never lets a system-controlled field into canonical rows', async () => {
    const r = await run([mapped('Student Full Name', 'fullName'), mapped('Mail ID', 'password'), mapped('Std', 'role'), mapped('Div', 'university_id'),
      mapped('Mobile', 'totalFees'), mapped('DOB', 'classroomId'), mapped('Blood Group', 'isApproved'), mapped('Home Address', 'status'),
      mapped('ID', 'studentId'), mapped('Remarks', 'userId')]);
    const forbidden = new Set(['password', 'role', 'university_id', 'universityId', 'totalFees', 'classroomId', 'isApproved', 'status', 'studentId', 'userId']);
    for (const row of r.canonicalRows) {
      assert.deepEqual(Object.keys(row.values), ['fullName']);
      for (const k of Object.keys(row.values)) assert.ok(!forbidden.has(k));
    }
    assert.equal(r.unresolvedColumns.length, 9);
    assert.deepEqual(r.warnings.map((w) => [w.code, w.targetField]), [['REQUIRED_FIELD_UNMAPPED', 'email']]);
  });

  it('rejects an unknown target without re-targeting it', async () => {
    const r = await run(replace(0, mapped('Student Full Name', 'firstName')));
    assert.deepEqual(r.unresolvedColumns[0].errors.map((e) => e.code), ['UNKNOWN_TARGET_FIELD']);
    assert.ok(r.canonicalRows.every((row) => !('fullName' in row.values) && !('firstName' in row.values)));
    assert.deepEqual(r.warnings.map((w) => w.targetField), ['fullName'], 'required-field warning');
  });

  it('rejects both columns of a duplicate target and copies neither', async () => {
    const r = await run(replace(4, mapped('Mobile', 'email')));
    assert.deepEqual(r.unresolvedColumns.filter((c) => c.status === 'rejected').map((c) => c.sourceColumn), ['Mail ID', 'Mobile']);
    assert.ok(r.canonicalRows.every((row) => !('email' in row.values)));
  });

  it('fails the whole proposal when the model renames or drops a header', async () => {
    const renamed = replace(0, mapped('Student full name', 'fullName'));
    const r = await run(renamed);
    assert.equal(r.status, 'failed');
    assert.equal(r.error.code, 'MAPPING_PROPOSAL_INVALID');
    assert.equal(r.canonicalRows, null);
    assert.deepEqual(r.guard.errors.map((e) => [e.code, e.sourceColumn]), [['COLUMN_NOT_ADDRESSED', 'Student Full Name']]);

    const dropped = await run(goodMappings().slice(0, 9));
    assert.equal(dropped.error.code, 'MAPPING_PROPOSAL_INVALID');
    assert.deepEqual(dropped.guard.errors.map((e) => e.sourceColumn), ['Remarks']);
  });

  it('represents every header in the result', async () => {
    const r = await run(goodMappings());
    const seen = [...r.guard.mapping.map((m) => m.sourceColumn), ...r.unresolvedColumns.map((c) => c.sourceColumn)];
    assert.deepEqual([...seen].sort(), [...HEADERS].sort());
  });
});

describe('failures', () => {
  it('provider not configured: nothing is sent anywhere', async () => {
    const r = await service(null).mapImport(importResult());
    assert.equal(r.status, 'failed');
    assert.equal(r.error.code, 'LLM_PROVIDER_NOT_CONFIGURED');
    assert.equal(r.sentToLlm, null);
  });

  it('provider failure: a fixed message, no provider details', async () => {
    const provider = new FakeProvider(async () => { throw new LLMProviderError('HTTP 500 body: secret-key-123 {"raw":"response"}'); });
    const r = await service(provider).mapImport(importResult());
    assert.deepEqual(r.error, { code: 'LLM_PROVIDER_ERROR', message: 'The LLM provider request failed.' });
    assert.ok(!JSON.stringify(r).includes('secret-key-123'));
  });

  it('timeout: gives up and aborts the request', async () => {
    let signal;
    const provider = new FakeProvider((prompt, options) => { signal = options.signal; return new Promise(() => {}); });
    const r = await service(provider, { timeoutMs: 20 }).mapImport(importResult());
    assert.deepEqual(r.error, { code: 'LLM_TIMEOUT', message: 'The LLM did not answer within 20 ms.' });
    assert.equal(signal.aborted, true);
  });

  it('malformed JSON is rejected, not repaired (including code fences)', async () => {
    for (const text of ['{"mappings": [', 'Here is the mapping: {}', '```json\n{"mappings": []}\n```']) {
      const r = await service(new FakeProvider(async () => text)).mapImport(importResult());
      assert.equal(r.error.code, 'LLM_INVALID_JSON', text);
      assert.ok(!JSON.stringify(r.error).includes(text), 'raw response not echoed');
    }
  });

  it('empty or non-text responses are malformed', async () => {
    for (const out of ['', '   ', null, 42, { mappings: [] }]) {
      const r = await service(new FakeProvider(async () => out)).mapImport(importResult());
      assert.equal(r.error.code, 'LLM_MALFORMED_RESPONSE');
    }
  });

  it('valid JSON with the wrong structure fails the contract', async () => {
    for (const text of ['[]', '{"columns": []}', '{"mappings": {}}', 'null', '"text"']) {
      const r = await service(new FakeProvider(async () => text)).mapImport(importResult());
      assert.equal(r.error.code, 'MAPPING_PROPOSAL_INVALID', text);
      assert.equal(r.canonicalRows, null);
    }
  });

  it('rejects a caller error (not an import result)', async () => {
    await assert.rejects(service(respondWith([])).mapImport({ headers: ['A'] }), TypeError);
    assert.throws(() => new ColumnMappingService({ schema, llmProvider: { name: 'x' } }), /generate/);
  });
});

describe('purity and determinism', () => {
  it('does not modify the import result or the model output', async () => {
    const input = importResult();
    const copy = structuredClone(input);
    const mappings = goodMappings();
    const r = await service(respondWith(mappings)).mapImport(input);
    assert.deepEqual(input, copy);
    r.canonicalRows[0].values.fullName = 'changed';
    assert.equal(input.rows[0].values['Student Full Name'], 'Rahul Sharma');
  });

  it('gives identical results (prompt, samples, rows) for identical input', async () => {
    const p1 = respondWith(goodMappings());
    const p2 = respondWith(goodMappings());
    const a = await service(p1).mapImport(importResult());
    const b = await service(p2).mapImport(importResult());
    assert.equal(p1.calls[0].prompt, p2.calls[0].prompt);
    assert.deepEqual(b, a);
  });

  it('made no network call in this file', () => {
    assert.equal(networkCalls, 0);
  });
});
