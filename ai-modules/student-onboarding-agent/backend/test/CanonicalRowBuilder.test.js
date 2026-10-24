const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { buildCanonicalRows } = require('../src/mapping/CanonicalRowBuilder');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };

const schema = loadStudentSchema();
const mapping = [
  { sourceColumn: 'Student Name', targetField: 'fullName' },
  { sourceColumn: 'Class', targetField: 'className' },
  { sourceColumn: 'Mobile', targetField: 'phone' },
  { sourceColumn: 'DOB', targetField: 'dob' },
];
const row = (rowNumber, values) => ({ rowNumber, values });

describe('buildCanonicalRows', () => {
  it('copies only mapped columns into canonical fields, keeping rowNumber', () => {
    const { rows, issues } = buildCanonicalRows(
      [row(7, { 'Student Name': '  Rahul Sharma ', Class: '10', Mobile: '+91 98765 43210', DOB: '2010-05-17T00:00:00.000Z', Remarks: 'x', ID: 'ADM1' })],
      mapping,
      schema
    );
    assert.deepEqual(rows, [{ rowNumber: 7, values: { fullName: 'Rahul Sharma', className: '10', phone: '+91 98765 43210', dob: '2010-05-17T00:00:00.000Z' } }]);
    assert.deepEqual(issues, []);
  });

  it('turns safe whole numbers into digit strings for text fields', () => {
    const { rows, issues } = buildCanonicalRows([row(2, { 'Student Name': 'A', Class: 10, Mobile: 9876543210, DOB: null })], mapping, schema);
    assert.equal(rows[0].values.className, '10');
    assert.equal(rows[0].values.phone, '9876543210');
    assert.equal(rows[0].values.dob, null);
    assert.deepEqual(issues, []);
  });

  it('rejects decimals, booleans and unsafe integers for text fields (value left for the validator, no value in the message)', () => {
    const { rows, issues } = buildCanonicalRows(
      [row(3, { 'Student Name': true, Class: 98.76, Mobile: 12345678901234567890, DOB: '2010-01-01' })],
      mapping,
      schema
    );
    assert.deepEqual(issues.map((i) => [i.rowNumber, i.targetField, i.code]), [
      [3, 'fullName', 'BOOLEAN_NOT_TEXT'], [3, 'className', 'DECIMAL_NOT_TEXT'], [3, 'phone', 'UNSAFE_INTEGER'],
    ]);
    assert.equal(rows[0].values.className, 98.76, 'not converted');
    for (const i of issues) assert.ok(!i.message.includes('98.76') && !i.message.includes('true'), i.message);
  });

  it('never treats a number as an Excel serial date', () => {
    const { rows, issues } = buildCanonicalRows([row(4, { 'Student Name': 'A', Class: null, Mobile: null, DOB: 40179 })], mapping, schema);
    assert.equal(rows[0].values.dob, 40179);
    assert.deepEqual(issues.map((i) => i.code), ['NOT_A_DATE_VALUE']);
  });

  it('keeps date text exactly as written (ambiguous dates are not guessed)', () => {
    const { rows } = buildCanonicalRows([row(5, { 'Student Name': 'A', DOB: ' 03/04/2010 ' })], mapping, schema);
    assert.equal(rows[0].values.dob, ' 03/04/2010 ');
  });

  it('does not invent missing values and does not modify the raw rows', () => {
    const raw = [row(6, { 'Student Name': 'A' })];
    const copy = structuredClone(raw);
    const { rows } = buildCanonicalRows(raw, mapping, schema);
    assert.deepEqual(rows[0].values, { fullName: 'A', className: null, phone: null, dob: null });
    assert.deepEqual(raw, copy);
  });

  it('refuses a mapping target that is not canonical (e.g. a system field)', () => {
    assert.throws(() => buildCanonicalRows([], [{ sourceColumn: 'X', targetField: 'role' }], schema), /not a canonical field/);
  });

  it('is deterministic', () => {
    const input = [row(2, { 'Student Name': ' A ', Class: 9, Mobile: 1.5, DOB: '2010-01-01' })];
    assert.deepEqual(buildCanonicalRows(structuredClone(input), mapping, schema), buildCanonicalRows(input, mapping, schema));
  });
});
