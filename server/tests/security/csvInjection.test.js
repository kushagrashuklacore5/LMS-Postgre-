// CSV exports never hand a spreadsheet a formula to run (CSV / formula injection), and stay valid CSV.
const { it } = require('node:test');
const assert = require('node:assert/strict');
const { csvCell } = require('../../helpers/csv');

it('values that would run as formulas are written as text', () => {
  for (const value of ['=HYPERLINK("http://evil.example","click")', '+1+1', '-2+3', '@SUM(A1:A9)', '\t=1', '\r=1']) {
    const cell = csvCell(value);
    assert.ok(cell.startsWith("'") || cell.startsWith(`"'`), `${JSON.stringify(value)} -> ${cell}`);
  }
});

it('numbers, ordinary text and empty values are unchanged; CSV quoting still applies', () => {
  assert.equal(csvCell(-250), '-250');
  assert.equal(csvCell('-250'), '-250');
  assert.equal(csvCell('12.5'), '12.5');
  assert.equal(csvCell('Riya Sharma'), 'Riya Sharma');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvCell('=1,2'), `"'=1,2"`);
});
