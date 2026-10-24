const ExcelJS = require('exceljs');
const { exactHeaderProposal, normalize } = require('../mapping/ExactHeaderMatcher');

/**
 * Downloadable student-import template (.xlsx), generated from the canonical schema so its headers
 * are exactly the ones ExactHeaderMatcher recognizes (a filled template maps with no LLM).
 *
 *   Sheet 1 "Students"      header row only (this is the sheet that is imported)
 *   Sheet 2 "Instructions"  what each column means, required/optional, format, and ONE clearly
 *                           labelled synthetic example row. It is on its own sheet so an example can
 *                           never be imported by accident (only the first worksheet is imported).
 */

/** Header per field: the schema's own column name that matches the field name, else its first listed name. */
function templateHeaders(schema) {
  return schema.fields.map((f) => {
    const hints = Array.isArray(f.mappingHints) ? f.mappingHints : [];
    const header = hints.find((h) => normalize(h) === normalize(f.name)) || hints[0] || f.name;
    return { field: f.name, header, required: f.required === true, type: f.type, format: f.format || null, allowedValues: f.allowedValues || null, description: f.description || '' };
  });
}

const EXAMPLE = {
  fullName: 'Example Student (delete me)',
  email: 'example.student@example.com',
  className: '10',
  section: 'A',
  parentName: 'Example Parent',
  phone: '5550100000',
  dob: '2010-01-31',
  admissionDate: '2024-04-01',
  bloodGroup: 'O+',
  address: '1 Example Street, Example City',
};

function formatHint(col) {
  if (col.allowedValues) return `One of: ${col.allowedValues.join(', ')}`;
  if (col.type === 'date') return 'Date (YYYY-MM-DD)';
  if (col.format === 'email') return 'Email address (must be unique)';
  if (col.format === 'phone') return 'Phone number as text';
  if (col.field === 'className') return 'Class/grade as written, e.g. 10';
  if (col.field === 'section') return 'Section, e.g. A';
  return 'Text';
}

async function buildImportTemplate(schema) {
  const columns = templateHeaders(schema);
  // Guarantee the template is recognized deterministically (no LLM) — fail loudly otherwise.
  if (!exactHeaderProposal(schema, columns.map((c) => c.header))) {
    throw new Error('Template headers are not all recognized by ExactHeaderMatcher.');
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Student Onboarding Agent';

  const ws = wb.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.field, width: Math.max(16, c.header.length + 6) }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? 'FF1D4ED8' : 'FF475569' } };
    cell.note = `${c.required ? 'REQUIRED' : 'Optional'} — ${formatHint(c)}. Do not rename this header.`;
    const col = ws.getColumn(i + 1);
    if (c.type === 'date') col.numFmt = 'yyyy-mm-dd';
    if (['phone', 'className', 'section'].includes(c.field)) col.numFmt = '@'; // keep as text (leading zeros, "10")
    if (c.allowedValues) {
      const letter = col.letter;
      ws.dataValidations.add(`${letter}2:${letter}1001`, {
        type: 'list', allowBlank: true, formulae: [`"${c.allowedValues.join(',')}"`],
        showErrorMessage: true, errorTitle: 'Invalid value', error: `Use one of: ${c.allowedValues.join(', ')}`,
      });
    }
  });

  const info = wb.addWorksheet('Instructions');
  info.columns = [{ width: 22 }, { width: 12 }, { width: 40 }, { width: 34 }];
  info.addRow(['Student import template']).font = { bold: true, size: 14 };
  for (const line of [
    'Fill in the "Students" sheet: one student per row, starting on row 2.',
    'Do not rename, reorder or add header columns. Blue headers are required; grey headers are optional.',
    'Only the "Students" sheet is imported. This sheet is for reference only.',
    'Every email must be unique. Students are matched to an existing classroom by Class + Section.',
  ]) info.addRow([line]);
  info.addRow([]);
  info.addRow(['Column', 'Required', 'Format', 'EXAMPLE (synthetic — do not import)']).font = { bold: true };
  for (const c of columns) info.addRow([c.header, c.required ? 'Yes' : 'No', formatHint(c), EXAMPLE[c.field] ?? '']);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { templateHeaders, buildImportTemplate, TEMPLATE_FILE_NAME: 'student-import-template.xlsx' };
