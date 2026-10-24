'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { templateHeaders, buildImportTemplate } = require('../src/import/ImportTemplate');
const { ExcelImportService } = require('../src/import/ExcelImportService');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');
const { exactHeaderProposal } = require('../src/mapping/ExactHeaderMatcher');

const schema = loadStudentSchema();
const EXPECTED_HEADERS = ['Full Name', 'Email', 'Class', 'Section', 'Parent Name', 'Phone', 'DOB', 'Admission Date', 'Blood Group', 'Address'];

describe('student import template', () => {
  it('uses one schema column name per field, in schema order, all recognized exactly', () => {
    const cols = templateHeaders(schema);
    assert.deepEqual(cols.map((c) => c.header), EXPECTED_HEADERS);
    assert.deepEqual(cols.map((c) => c.field), schema.fields.map((f) => f.name), 'no invented fields');
    assert.deepEqual(cols.filter((c) => c.required).map((c) => c.header), ['Full Name', 'Email']);
    assert.deepEqual(exactHeaderProposal(schema, EXPECTED_HEADERS).mappings.map((m) => m.targetField), schema.fields.map((f) => f.name));
  });

  it('is a valid .xlsx: "Students" (header only) first, "Instructions" with a labelled synthetic example second', async () => {
    const buf = await buildImportTemplate(schema);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Students', 'Instructions']);
    const students = wb.getWorksheet('Students');
    assert.deepEqual(students.getRow(1).values.slice(1), EXPECTED_HEADERS);
    assert.equal(students.actualRowCount, 1, 'no example or data rows in the imported sheet');
    const text = JSON.stringify(wb.getWorksheet('Instructions').getSheetValues());
    assert.match(text, /EXAMPLE \(synthetic — do not import\)/);
    assert.match(text, /example\.student@example\.com/);

    const parsed = await new ExcelImportService({ maxRows: 10 }).parse(buf, { fileName: 't.xlsx' });
    assert.equal(parsed.sheetName, 'Students');
    assert.deepEqual(parsed.headers, EXPECTED_HEADERS);
    assert.equal(parsed.rows.length, 0);
  });

  it('a filled template maps deterministically (no LLM) and keeps text columns as text', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildImportTemplate(schema));
    const ws = wb.getWorksheet('Students');
    ws.addRow(['Test Student', 'test.student@example.com', '10', 'A', 'Test Parent', '0555010001', '2010-01-31', '2024-04-01', 'B+', '1 Test Street']);
    const parsed = await new ExcelImportService({ maxRows: 10 }).parse(Buffer.from(await wb.xlsx.writeBuffer()), { fileName: 'filled.xlsx' });
    const r = await new ColumnMappingService({ schema, llmProvider: null }).mapImport(parsed);
    assert.equal(r.provider, 'exact-header-match');
    assert.equal(r.status, 'mapped');
    assert.equal(r.canonicalRows[0].values.phone, '0555010001', 'leading zero kept');
    assert.equal(r.canonicalRows[0].values.email, 'test.student@example.com');
  });
});
