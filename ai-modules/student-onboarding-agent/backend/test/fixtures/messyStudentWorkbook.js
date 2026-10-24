/**
 * Fixture: a realistic, messy school spreadsheet (abbreviated / misspelled / padded headers, a
 * credentials column, free-text columns) plus the JSON a well-behaved LLM would return for it.
 *
 * The canned LLM answer is deliberately imperfect, to exercise the deterministic layer:
 *   - "Admsn Dt"         mapped with LOW confidence (0.55)  -> must become ambiguous (admin confirms)
 *   - "Gurdian/Contact"  ambiguous between parentName/phone -> stays unresolved
 *   - "Password"         mapped to the forbidden "password" -> guard rejects it
 *   - "Roll No", "Remarks" unmapped (no canonical field / system-controlled)
 */
const path = require('path');
const ExcelJS = require(path.join(__dirname, '../../../node_modules/exceljs'));

const MESSY_HEADERS = [
  '  Stu. Name ', // padded: the parser trims it to "Stu. Name"
  'E-mail Addr',
  'Std',
  'Sec/Div',
  "Father's Nm",
  'Mob. No.',
  'D.O.B',
  'Admsn Dt',
  'Bld Grp',
  'Resi. Addr',
  'Roll No',
  'Password',
  'Remarks',
  'Gurdian/Contact',
];

const MESSY_ROWS = [
  ['Aarav Mehta', 'aarav.mehta@school.example', 10, 'A', 'Rakesh Mehta', '9876543210', '2010-05-14', '2024-04-01', 'B+', '12 MG Road, Pune', 'R-101', '123', 'Good in maths', 'Rakesh 9876500001'],
  ['Diya Sharma', 'diya.sharma@school.example', 10, 'B', 'Anil Sharma', '9876543211', '2010-08-02', '2024-04-01', 'O+', '45 Park Street, Pune', 'R-102', 'abc@123', 'Needs follow-up', 'Anil 9876500002'],
  ['Kabir Singh', 'kabir.singh@school.example', 11, 'A', 'Harpreet Singh', '9876543212', '2009-11-23', '2023-06-15', 'A-', '7 Lake View, Pune', 'R-103', 'pw2024', '', 'Harpreet 9876500003'],
];

/** Trimmed headers, as the parser reports them. */
const HEADERS = MESSY_HEADERS.map((h) => h.trim());

/** What a well-behaved (but imperfect) LLM answers for this sheet. */
const MESSY_LLM_RESPONSE = {
  mappings: [
    { sourceColumn: 'Stu. Name', status: 'mapped', targetField: 'fullName', confidence: 0.97, reason: 'Abbreviated "student name".' },
    { sourceColumn: 'E-mail Addr', status: 'mapped', targetField: 'email', confidence: 0.99 },
    { sourceColumn: 'Std', status: 'mapped', targetField: 'className', confidence: 0.9, reason: '"Std" means standard/class in Indian schools.' },
    { sourceColumn: 'Sec/Div', status: 'mapped', targetField: 'section', confidence: 0.88 },
    { sourceColumn: "Father's Nm", status: 'mapped', targetField: 'parentName', confidence: 0.86 },
    { sourceColumn: 'Mob. No.', status: 'mapped', targetField: 'phone', confidence: 0.93 },
    { sourceColumn: 'D.O.B', status: 'mapped', targetField: 'dob', confidence: 0.95 },
    { sourceColumn: 'Admsn Dt', status: 'mapped', targetField: 'admissionDate', confidence: 0.55, reason: 'Probably admission date.' },
    { sourceColumn: 'Bld Grp', status: 'mapped', targetField: 'bloodGroup', confidence: 0.96 },
    { sourceColumn: 'Resi. Addr', status: 'mapped', targetField: 'address', confidence: 0.9 },
    { sourceColumn: 'Roll No', status: 'unmapped', reason: 'Roll numbers are assigned by the system.' },
    { sourceColumn: 'Password', status: 'mapped', targetField: 'password', confidence: 0.99 }, // must be refused
    { sourceColumn: 'Remarks', status: 'unmapped' },
    { sourceColumn: 'Gurdian/Contact', status: 'ambiguous', candidateFields: ['parentName', 'phone'], reason: 'Mixes a name and a number.' },
  ],
};

/**
 * Expected review after the deterministic layer (guard + confidence rule), per trimmed header:
 * [status, targetField, candidateFields].
 */
// AUTO MAPPED: guard-accepted AI mappings with confidence >= 0.7 and consistent samples are applied directly.
// NEEDS ACTION: low confidence (Admsn Dt 0.55), rejected (Password), ambiguous and AI-unmapped columns.
const EXPECTED_REVIEW = {
  'Stu. Name': ['mapped', 'fullName', null],
  'E-mail Addr': ['mapped', 'email', null],
  Std: ['mapped', 'className', null],
  'Sec/Div': ['mapped', 'section', null],
  "Father's Nm": ['mapped', 'parentName', null],
  'Mob. No.': ['mapped', 'phone', null],
  'D.O.B': ['mapped', 'dob', null],
  'Admsn Dt': ['ambiguous', null, ['admissionDate']],
  'Bld Grp': ['mapped', 'bloodGroup', null],
  'Resi. Addr': ['mapped', 'address', null],
  'Roll No': ['unmapped', null, null],
  Password: ['rejected', null, null],
  Remarks: ['unmapped', null, null],
  'Gurdian/Contact': ['ambiguous', null, ['parentName', 'phone']],
};

/** Values that must never appear in anything sent to the LLM. */
const NEVER_SENT = ['Aarav', 'Mehta', 'Diya', 'Kabir', 'aarav.mehta@school.example', '@school.example', '9876543210', 'MG Road', 'abc@123', 'pw2024', 'R-101', 'Good in maths', 'Rakesh'];

async function buildMessyWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Class 10-11 List');
  ws.addRow(MESSY_HEADERS);
  for (const r of MESSY_ROWS) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Approval decisions for any column still in the old "suggested" state (none since AI mappings are auto-applied). */
const approveSuggestions = (review) => review.columns.filter((c) => c.status === 'suggested')
  .map((c) => ({ sourceColumn: c.sourceColumn, action: 'map', targetField: c.candidateFields[0] }));

module.exports = { MESSY_HEADERS, HEADERS, MESSY_ROWS, MESSY_LLM_RESPONSE, EXPECTED_REVIEW, NEVER_SENT, buildMessyWorkbook, approveSuggestions };
