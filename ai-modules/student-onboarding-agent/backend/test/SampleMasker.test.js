const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { maskSampleValue, buildMaskedSamples } = require('../src/mapping/SampleMasker');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };

describe('maskSampleValue: personal data is masked', () => {
  it('masks names', () => {
    assert.equal(maskSampleValue('Rahul Sharma'), '<NAME>');
    assert.equal(maskSampleValue('Asha K. Rao'), '<NAME>');
    assert.equal(maskSampleValue('Rahul'), '<TEXT>', 'a single word is masked too');
  });

  it('masks emails', () => {
    assert.equal(maskSampleValue('rahul@gmail.com'), '<EMAIL>');
    assert.equal(maskSampleValue('  A.B+tag@school.edu.in '), '<EMAIL>');
  });

  it('masks phones, as text or as numbers', () => {
    for (const p of ['9876543210', '+91 98765 43210', '(022) 2345-6789', '+14155552671']) assert.equal(maskSampleValue(p), '<PHONE>', p);
    assert.equal(maskSampleValue(9876543210), '<PHONE>');
  });

  it('masks addresses', () => {
    assert.equal(maskSampleValue('12 Main Street'), '<ADDRESS>');
    assert.equal(maskSampleValue('Flat 4B, Shanti Apartments, Pune'), '<ADDRESS>');
    assert.equal(maskSampleValue('Near City Mall'), '<ADDRESS>');
  });

  it('masks identifiers, long numbers and free text', () => {
    assert.equal(maskSampleValue('ADM2024001'), '<CODE>');
    assert.equal(maskSampleValue('2024'), '<NUMBER>');
    assert.equal(maskSampleValue(411001), '<NUMBER>');
    assert.equal(maskSampleValue(98.76), '<DECIMAL>');
    assert.equal(maskSampleValue('good in maths'), '<TEXT>');
    assert.equal(maskSampleValue({ any: 'object' }), '<VALUE>');
  });
});

describe('maskSampleValue: useful non-personal values are kept', () => {
  it('keeps class, section, blood group, gender, dates, booleans and small numbers', () => {
    for (const v of ['10', 'A', 'b', '10-A', '9B', 'XII', 'AB+', 'o-', 'Male', 'F', 'yes', '2026-04-12', '2010-05-17T00:00:00.000Z', '03/04/2010']) {
      assert.equal(maskSampleValue(v), v, v);
    }
    assert.equal(maskSampleValue(10), 10);
    assert.equal(maskSampleValue(true), true);
  });

  it('treats blanks as no sample', () => {
    for (const v of [null, undefined, '', '   ']) assert.equal(maskSampleValue(v), undefined);
  });
});

describe('buildMaskedSamples', () => {
  const rows = [
    { rowNumber: 2, values: { Name: 'Rahul Sharma', Class: 10, Notes: null } },
    { rowNumber: 3, values: { Name: 'Asha Rao', Class: 10, Notes: '' } },
    { rowNumber: 4, values: { Name: 'Vikram Singh', Class: 11, Notes: 'Transferred' } },
    { rowNumber: 5, values: { Name: 'Meera Nair', Class: 12, Notes: 'x' } },
  ];

  it('takes at most N distinct masked samples per column, in row order', () => {
    assert.deepEqual(buildMaskedSamples(['Name', 'Class', 'Notes'], rows, 2), [
      { sourceColumn: 'Name', samples: ['<NAME>'] },
      { sourceColumn: 'Class', samples: [10, 11] },
      { sourceColumn: 'Notes', samples: ['<TEXT>', 'x'] },
    ]);
  });

  it('never sends a real value that is not allowlisted', () => {
    const json = JSON.stringify(buildMaskedSamples(['Name', 'Class', 'Notes'], rows, 10));
    for (const secret of ['Rahul', 'Sharma', 'Asha', 'Vikram', 'Meera', 'Transferred']) assert.ok(!json.includes(secret), secret);
  });

  it('is deterministic and does not modify the rows', () => {
    const copy = structuredClone(rows);
    const a = buildMaskedSamples(['Name', 'Class'], rows, 3);
    const b = buildMaskedSamples(['Name', 'Class'], structuredClone(rows), 3);
    assert.deepEqual(a, b);
    assert.deepEqual(rows, copy);
  });

  it('handles a "__proto__" header without reading the prototype', () => {
    assert.deepEqual(buildMaskedSamples(['__proto__'], [{ rowNumber: 2, values: { A: 1 } }], 3), [{ sourceColumn: '__proto__', samples: [] }]);
  });
});
