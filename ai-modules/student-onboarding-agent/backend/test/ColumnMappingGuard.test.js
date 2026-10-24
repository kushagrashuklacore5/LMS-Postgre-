// Run with: npm test   (Node's built-in test runner; no dependencies)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadStudentSchema, compileStudentSchema, DEFAULT_SCHEMA_PATH } = require('../src/validation/studentSchema');
const { ColumnMappingGuard } = require('../src/mapping/ColumnMappingGuard');
const {
  describeMappingContract,
  getMappingTargets,
  getForbiddenTargets,
  RESULT_STATUSES,
} = require('../src/mapping/ColumnMappingContract');

const schema = loadStudentSchema();
const guard = new ColumnMappingGuard(schema);

const HEADERS = ['Student Name', 'Mail ID', 'Std', 'ID', 'Remarks'];
const mapped = (sourceColumn, targetField, confidence = 0.9, extra = {}) => ({ sourceColumn, status: 'mapped', targetField, confidence, ...extra });
const unmapped = (sourceColumn, extra = {}) => ({ sourceColumn, status: 'unmapped', ...extra });
const ambiguous = (sourceColumn, extra = {}) => ({ sourceColumn, status: 'ambiguous', ...extra });

/** A complete, valid proposal for HEADERS. */
const goodProposal = () => ({
  mappings: [
    mapped('Student Name', 'fullName', 0.97, { reason: 'Contains full names' }),
    mapped('Mail ID', 'email', 0.95),
    mapped('Std', 'className', 0.6, { reason: 'Std usually means standard/class' }),
    ambiguous('ID', { candidateFields: [], reason: 'Could be a roll number, admission number or an internal id' }),
    unmapped('Remarks', { reason: 'Free text with no canonical field' }),
  ],
});

const run = (proposal, headers = HEADERS) => guard.validate(proposal, { headers });
const columnCodes = (result, i) => result.columns[i].errors.map((e) => e.code);

describe('contract is derived from the schema', () => {
  it('targets are exactly the schema import fields, in schema order', () => {
    const raw = JSON.parse(fs.readFileSync(DEFAULT_SCHEMA_PATH, 'utf8'));
    assert.deepEqual(getMappingTargets(schema).map((t) => t.field), Object.keys(raw.importFields));
    const email = getMappingTargets(schema).find((t) => t.field === 'email');
    assert.equal(email.required, true);
    assert.deepEqual(email.mappingHints, raw.importFields.email.mappingHints);
  });

  it('forbidden targets are the system-controlled names plus their aliases', () => {
    const forbidden = getForbiddenTargets(schema);
    for (const name of ['id', 'password', 'role', 'isApproved', 'universityId', 'studentId', 'classroomId', 'userId',
      'fees', 'subscriptionPlan', 'status', 'createdAt', 'updatedAt', 'totalFees', 'feesPaid', 'pendingFees']) {
      assert.ok(forbidden.includes(name), name);
    }
    for (const t of getMappingTargets(schema)) assert.ok(!forbidden.includes(t.field));
  });

  it('describeMappingContract() is plain JSON and deterministic', () => {
    const a = describeMappingContract(schema);
    const b = describeMappingContract(loadStudentSchema());
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
    assert.deepEqual(b, a);
    assert.deepEqual(a.statuses, ['mapped', 'unmapped', 'ambiguous']);
  });

  it('a new schema field becomes a valid target without code changes', () => {
    const raw = JSON.parse(fs.readFileSync(DEFAULT_SCHEMA_PATH, 'utf8'));
    raw.importFields.nickname = { ...raw.importFields.address, description: 'Nickname' };
    const g = new ColumnMappingGuard(compileStudentSchema(raw));
    const r = g.validate({ mappings: [mapped('Nick', 'nickname')] }, { headers: ['Nick'] });
    assert.equal(r.columns[0].status, 'mapped');
  });
});

describe('valid proposals', () => {
  it('accepts a complete proposal with mapped, ambiguous and unmapped columns', () => {
    const r = run(goodProposal());
    assert.equal(r.valid, true, JSON.stringify(r.errors.concat(...r.columns.map((c) => c.errors))));
    assert.deepEqual(r.columns.map((c) => c.status), ['mapped', 'mapped', 'mapped', 'ambiguous', 'unmapped']);
    assert.deepEqual(r.mapping, [
      { sourceColumn: 'Student Name', targetField: 'fullName' },
      { sourceColumn: 'Mail ID', targetField: 'email' },
      { sourceColumn: 'Std', targetField: 'className' },
    ]);
    assert.deepEqual(r.summary, { headers: 5, entries: 5, mapped: 3, unmapped: 1, ambiguous: 1, rejected: 0 });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  it('keeps multiple valid mappings with their advisory confidence and reason', () => {
    const r = run(goodProposal());
    assert.equal(r.columns[0].confidence, 0.97);
    assert.equal(r.columns[0].reason, 'Contains full names');
    assert.equal(r.columns[2].confidence, 0.6, 'low confidence is not rejected: it is advisory only');
  });

  it('accepts confidence at the bounds 0 and 1, and null for optional properties', () => {
    const r = run({
      mappings: [mapped('Student Name', 'fullName', 0), mapped('Mail ID', 'email', 1),
        unmapped('Std', { targetField: null, confidence: null, reason: null }), unmapped('ID'), unmapped('Remarks')],
    });
    assert.equal(r.valid, true);
  });

  it('never forces a column into a field: unmapped and ambiguous columns carry no target', () => {
    const r = run(goodProposal());
    assert.equal(r.columns[3].targetField, null);
    assert.equal(r.columns[4].targetField, null);
    assert.ok(!r.mapping.some((m) => m.sourceColumn === 'ID' || m.sourceColumn === 'Remarks'));
  });

  it('accepts ambiguous columns with valid candidate fields', () => {
    const p = goodProposal();
    p.mappings[3] = ambiguous('ID', { candidateFields: ['phone', 'address'], confidence: 0.2 });
    const r = run(p);
    assert.equal(r.columns[3].status, 'ambiguous');
    assert.deepEqual(r.columns[3].candidateFields, ['phone', 'address']);
  });

  it('warns (but stays valid) when a required field has no column', () => {
    const r = run({ mappings: [mapped('Student Name', 'fullName'), unmapped('Mail ID'), unmapped('Std'), unmapped('ID'), unmapped('Remarks')] });
    assert.equal(r.valid, true);
    assert.deepEqual(r.warnings.map((w) => [w.code, w.targetField, w.severity]), [['REQUIRED_FIELD_UNMAPPED', 'email', 'warning']]);
  });
});

describe('target field guardrails', () => {
  const withEntry = (i, entry) => { const p = goodProposal(); p.mappings[i] = entry; return p; };

  it('rejects an unknown target field (no case repair)', () => {
    for (const bad of ['firstName', 'Email', 'rollNumber', 'studentName']) {
      const r = run(withEntry(1, mapped('Mail ID', bad)));
      assert.equal(r.valid, false);
      assert.equal(r.columns[1].status, 'rejected');
      assert.deepEqual(columnCodes(r, 1), ['UNKNOWN_TARGET_FIELD'], bad);
      assert.equal(r.structurallyValid, true);
      assert.deepEqual(r.mapping.map((m) => m.sourceColumn), ['Student Name', 'Std'], 'other columns still accepted; the bad one is not repaired');
      assert.deepEqual(r.unresolvedColumns.map((c) => [c.sourceColumn, c.status]), [['Mail ID', 'rejected'], ['ID', 'ambiguous'], ['Remarks', 'unmapped']]);
      assert.equal(r.reviewRequired, true);
    }
  });

  it('rejects every system-controlled target, however it is spelled', () => {
    for (const bad of ['id', 'password', 'role', 'isApproved', 'universityId', 'university_id', 'studentId', 'ClassroomID',
      'userId', 'fees', 'subscriptionPlan', 'status', 'createdAt', 'updated_at']) {
      const r = run(withEntry(3, mapped('ID', bad)));
      assert.deepEqual(columnCodes(r, 3), ['FORBIDDEN_TARGET_FIELD'], bad);
      assert.equal(r.columns[3].status, 'rejected');
    }
  });

  it('rejects forbidden fee aliases', () => {
    for (const bad of ['totalFees', 'feesPaid', 'pending_fees']) {
      assert.deepEqual(columnCodes(run(withEntry(4, mapped('Remarks', bad))), 4), ['FORBIDDEN_TARGET_FIELD'], bad);
    }
  });

  it('rejects forbidden or unknown candidate fields on ambiguous columns', () => {
    const r = run(withEntry(3, ambiguous('ID', { candidateFields: ['studentId', 'rollNumber', 'phone', 'phone'] })));
    assert.deepEqual(columnCodes(r, 3), ['FORBIDDEN_TARGET_FIELD', 'UNKNOWN_TARGET_FIELD', 'INVALID_CANDIDATE_FIELDS']);
  });

  it('rejects a target on unmapped/ambiguous columns and a missing target on mapped ones', () => {
    assert.deepEqual(columnCodes(run(withEntry(4, unmapped('Remarks', { targetField: 'address' }))), 4), ['UNEXPECTED_TARGET_FIELD']);
    assert.deepEqual(columnCodes(run(withEntry(3, ambiguous('ID', { targetField: 'phone' }))), 3), ['UNEXPECTED_TARGET_FIELD']);
    assert.deepEqual(columnCodes(run(withEntry(1, { sourceColumn: 'Mail ID', status: 'mapped', confidence: 0.9 })), 1), ['MISSING_TARGET_FIELD']);
    assert.deepEqual(columnCodes(run(withEntry(4, unmapped('Remarks', { candidateFields: ['address'] }))), 4), ['UNEXPECTED_CANDIDATE_FIELDS']);
  });
});

describe('source column guardrails', () => {
  it('rejects a missing or non-string sourceColumn', () => {
    const p = goodProposal();
    p.mappings.push({ status: 'unmapped' }, { sourceColumn: '', status: 'unmapped' }, { sourceColumn: 5, status: 'unmapped' });
    const r = run(p);
    assert.deepEqual([5, 6, 7].map((i) => columnCodes(r, i)), [['MISSING_SOURCE_COLUMN'], ['MISSING_SOURCE_COLUMN'], ['INVALID_SOURCE_COLUMN']]);
  });

  it('rejects a column that is not in the workbook (exact names only)', () => {
    const p = goodProposal();
    p.mappings[0] = mapped('student name', 'fullName');
    const r = run(p);
    assert.deepEqual(columnCodes(r, 0), ['UNKNOWN_SOURCE_COLUMN']);
    assert.deepEqual(r.errors.map((e) => [e.code, e.sourceColumn]), [['COLUMN_NOT_ADDRESSED', 'Student Name']]);
  });

  it('rejects every entry of a duplicated source column (one column, one target)', () => {
    const p = goodProposal();
    p.mappings.push(mapped('Mail ID', 'parentName'));
    const r = run(p);
    assert.deepEqual(columnCodes(r, 1), ['DUPLICATE_SOURCE_COLUMN']);
    assert.deepEqual(columnCodes(r, 5), ['DUPLICATE_SOURCE_COLUMN']);
    assert.deepEqual(r.columns[1].errors[0].relatedIndexes, [5]);
    assert.equal(r.valid, false);
  });

  it('reports every column the proposal left out', () => {
    const r = run({ mappings: [mapped('Student Name', 'fullName'), mapped('Mail ID', 'email')] });
    assert.equal(r.valid, false);
    assert.deepEqual(r.errors.map((e) => e.sourceColumn), ['Std', 'ID', 'Remarks']);
    assert.ok(r.errors.every((e) => e.code === 'COLUMN_NOT_ADDRESSED'));
  });
});

describe('duplicate targets', () => {
  it('rejects all columns that map to the same field instead of choosing one', () => {
    const r = run({ mappings: [mapped('Student Name', 'fullName'), mapped('Email', 'email', 0.99), mapped('Email Address', 'email', 0.7)] },
      ['Student Name', 'Email', 'Email Address']);
    assert.equal(r.valid, false);
    assert.deepEqual(r.columns.map((c) => c.status), ['mapped', 'rejected', 'rejected']);
    assert.deepEqual(columnCodes(r, 1), ['DUPLICATE_TARGET_FIELD']);
    assert.deepEqual(r.columns[1].errors[0].relatedColumns, ['Email Address']);
    assert.deepEqual(r.columns[2].errors[0].relatedColumns, ['Email']);
    assert.deepEqual(r.mapping, [{ sourceColumn: 'Student Name', targetField: 'fullName' }], 'neither email column is chosen');
    assert.deepEqual(r.warnings.map((w) => w.code), ['REQUIRED_FIELD_UNMAPPED']);
  });

  it('rejects the whole proposal when a header is missing (structural error)', () => {
    const r = run({ mappings: [mapped('Student Name', 'fullName'), mapped('Mail ID', 'email')] });
    assert.equal(r.structurallyValid, false);
    assert.equal(r.mapping, null);
    assert.deepEqual(r.warnings, [], 'no field warnings on a structurally invalid proposal');
  });
});

describe('confidence and reason', () => {
  const withConfidence = (confidence) => run({ mappings: [mapped('A', 'fullName', confidence)] }, ['A']);

  it('rejects confidence below 0 or above 1', () => {
    assert.deepEqual(columnCodes(withConfidence(-0.01), 0), ['INVALID_CONFIDENCE']);
    assert.deepEqual(columnCodes(withConfidence(1.01), 0), ['INVALID_CONFIDENCE']);
  });

  it('rejects non-numeric confidence and requires it for mapped columns', () => {
    for (const bad of ['0.9', NaN, Infinity, true, [0.9]]) assert.deepEqual(columnCodes(withConfidence(bad), 0), ['INVALID_CONFIDENCE'], String(bad));
    const r = run({ mappings: [{ sourceColumn: 'A', status: 'mapped', targetField: 'fullName' }] }, ['A']);
    assert.deepEqual(columnCodes(r, 0), ['MISSING_CONFIDENCE']);
  });

  it('bounds the reason text', () => {
    const r = run({ mappings: [mapped('A', 'fullName', 0.9, { reason: 'x'.repeat(501) })] }, ['A']);
    assert.deepEqual(columnCodes(r, 0), ['INVALID_REASON']);
    assert.deepEqual(columnCodes(run({ mappings: [mapped('A', 'fullName', 0.9, { reason: 42 })] }, ['A']), 0), ['INVALID_REASON']);
  });
});

describe('malformed proposals', () => {
  it('reports a malformed proposal without throwing', () => {
    for (const bad of [null, 'text', [], 42, {}, { mappings: {} }, { mappings: 'x' }]) {
      const r = run(bad);
      assert.equal(r.valid, false);
      assert.ok(r.errors.some((e) => e.code === 'MALFORMED_PROPOSAL'), JSON.stringify(bad));
      assert.equal(r.mapping, null);
    }
  });

  it('rejects malformed entries, invalid statuses and unexpected properties', () => {
    const p = goodProposal();
    p.extra = true;
    p.mappings.push(null, 'Remarks', { sourceColumn: 'X', status: 'rejected' }, { sourceColumn: 'Y', status: 'maybe' });
    p.mappings[0] = { ...p.mappings[0], isApproved: true };
    const r = run(p);
    assert.deepEqual(r.errors.map((e) => e.code), ['UNEXPECTED_PROPERTY']);
    assert.deepEqual(columnCodes(r, 0), ['UNEXPECTED_PROPERTY']);
    assert.deepEqual(columnCodes(r, 5), ['MALFORMED_MAPPING']);
    assert.deepEqual(columnCodes(r, 6), ['MALFORMED_MAPPING']);
    assert.deepEqual(columnCodes(r, 7), ['UNKNOWN_SOURCE_COLUMN', 'INVALID_STATUS'], '"rejected" is guard-only');
    assert.deepEqual(columnCodes(r, 8), ['UNKNOWN_SOURCE_COLUMN', 'INVALID_STATUS']);
    assert.ok(r.columns.every((c) => RESULT_STATUSES.includes(c.status)));
  });

  it('throws only for a caller error in headers', () => {
    assert.throws(() => guard.validate(goodProposal()), TypeError);
    assert.throws(() => guard.validate(goodProposal(), { headers: ['A', 'A'] }), /unique/);
    assert.throws(() => guard.validate(goodProposal(), { headers: ['A', ''] }), TypeError);
  });
});

describe('purity and determinism', () => {
  it('does not mutate the proposal or the headers', () => {
    const p = goodProposal();
    p.mappings[3].candidateFields = ['phone'];
    p.mappings.push(mapped('Mail ID', 'role', 7));
    const pCopy = structuredClone(p);
    const headers = [...HEADERS];
    const r = run(p, headers);
    assert.deepEqual(p, pCopy);
    assert.deepEqual(headers, HEADERS);
    r.columns[3].candidateFields.push('address');
    assert.deepEqual(p.mappings[3].candidateFields, ['phone'], 'result does not share arrays with the input');
  });

  it('returns identical output for identical input', () => {
    const messy = () => ({ mappings: [...goodProposal().mappings, mapped('Mail ID', 'totalFees', 2), mapped('Std', 'email')] });
    const a = run(messy());
    const b = new ColumnMappingGuard(loadStudentSchema()).validate(messy(), { headers: [...HEADERS] });
    assert.deepEqual(b, a);
    assert.equal(JSON.stringify(b), JSON.stringify(a));
  });

  it('does not let a "__proto__" column pollute objects', () => {
    const r = guard.validate({ mappings: [mapped('__proto__', 'fullName'), mapped('E', 'email')] }, { headers: ['__proto__', 'E'] });
    assert.equal(r.valid, true);
    assert.deepEqual(r.mapping[0], { sourceColumn: '__proto__', targetField: 'fullName' });
    assert.equal({}.targetField, undefined);
  });
});
