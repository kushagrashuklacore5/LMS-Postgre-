// Run with: npm test   (Node's built-in test runner; no dependencies)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadStudentSchema, compileStudentSchema, DEFAULT_SCHEMA_PATH } = require('../src/validation/studentSchema');
const { StudentDataValidator } = require('../src/validation/StudentDataValidator');

const schema = loadStudentSchema();
const validator = new StudentDataValidator(schema);

const row = (rowNumber, values) => ({ rowNumber, values });
const base = (extra = {}) => ({ fullName: 'Rahul Sharma', email: 'rahul@example.com', ...extra });
const validateOne = (values, rowNumber = 2) => validator.validate([row(rowNumber, values)]).rows[0];
const codes = (r) => r.errors.map((e) => e.code);

describe('required fields', () => {
  it('accepts a student with only the required fields', () => {
    const r = validateOne(base());
    assert.equal(r.status, 'valid');
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.data.fullName, 'Rahul Sharma');
    assert.equal(r.data.email, 'rahul@example.com');
  });

  it('flags a missing fullName', () => {
    const r = validateOne({ email: 'a@example.com' });
    assert.equal(r.status, 'invalid');
    assert.deepEqual(r.errors, [
      { field: 'fullName', code: 'REQUIRED_FIELD_MISSING', severity: 'error', message: '"fullName" is required.' },
    ]);
  });

  it('flags a missing email', () => {
    const r = validateOne({ fullName: 'A' });
    assert.deepEqual(codes(r), ['REQUIRED_FIELD_MISSING']);
    assert.equal(r.errors[0].field, 'email');
  });

  it('treats whitespace-only and null required values as missing', () => {
    assert.deepEqual(codes(validateOne(base({ fullName: '   ' }))), ['REQUIRED_FIELD_MISSING']);
    assert.deepEqual(codes(validateOne(base({ email: null }))), ['REQUIRED_FIELD_MISSING']);
  });

  it('trims text values', () => {
    const r = validateOne(base({ fullName: '  Rahul Sharma  ', email: ' rahul@example.com ' }));
    assert.equal(r.status, 'valid');
    assert.equal(r.data.fullName, 'Rahul Sharma');
    assert.equal(r.data.email, 'rahul@example.com');
  });
});

describe('email', () => {
  it('flags invalid email syntax', () => {
    for (const bad of ['rahul', 'rahul@', '@example.com', 'rahul@example', 'ra hul@example.com', 'a@b@c.com', 'a@.com', 'a@b..com']) {
      assert.deepEqual(codes(validateOne(base({ email: bad }))), ['INVALID_EMAIL'], bad);
    }
  });

  it('accepts ordinary addresses', () => {
    for (const ok of ['a@b.co', 'first.last+tag@school.edu.in', 'A.B@Example.COM']) {
      assert.equal(validateOne(base({ email: ok })).status, 'valid', ok);
    }
  });

  it('keeps the email as written (not lower-cased)', () => {
    assert.equal(validateOne(base({ email: 'Rahul@Example.com' })).data.email, 'Rahul@Example.com');
  });
});

describe('duplicate emails (within the batch, ignoring case)', () => {
  it('flags both rows when emails differ only by case, keeping their Excel row numbers', () => {
    const result = validator.validate([
      row(12, base({ email: 'student@example.com' })),
      row(13, base({ email: 'other@example.com' })),
      row(27, base({ email: '  STUDENT@Example.com ' })),
    ]);
    const [a, b, c] = result.rows;
    assert.equal(a.rowNumber, 12);
    assert.equal(c.rowNumber, 27);
    assert.deepEqual(codes(a), ['DUPLICATE_EMAIL']);
    assert.deepEqual(codes(c), ['DUPLICATE_EMAIL']);
    assert.deepEqual(a.errors[0].relatedRows, [27]);
    assert.deepEqual(c.errors[0].relatedRows, [12]);
    assert.match(a.errors[0].message, /row\(s\) 27/);
    assert.equal(b.status, 'valid');
    assert.equal(result.rows.length, 3, 'no row dropped or merged');
  });

  it('flags all members of a group of three', () => {
    const rows = validator.validate([2, 3, 4].map((n) => row(n, base({ email: 'x@example.com' })))).rows;
    assert.deepEqual(rows.map((r) => r.errors[0].relatedRows), [[3, 4], [2, 4], [2, 3]]);
    assert.deepEqual(rows.map((r) => r.errors[0].relatedRowCount), [2, 2, 2]);
  });

  it('lists at most 20 related rows per error, with the full count, so large groups stay linear', () => {
    const rows = validator.validate(Array.from({ length: 1000 }, (_, i) => row(i + 2, base({ email: 'same@example.com' })))).rows;
    assert.ok(rows.every((r) => r.errors[0].code === 'DUPLICATE_EMAIL'), 'every row flagged');
    assert.deepEqual(rows[0].errors[0].relatedRows, Array.from({ length: 20 }, (_, i) => i + 3));
    assert.deepEqual(rows[5].errors[0].relatedRows, [2, 3, 4, 5, 6, ...Array.from({ length: 15 }, (_, i) => i + 8)], 'never lists itself');
    assert.ok(rows.every((r) => r.errors[0].relatedRows.length === 20 && r.errors[0].relatedRowCount === 999));
    assert.match(rows[0].errors[0].message, /and 979 more/);
  });
});

describe('optional fields', () => {
  const full = {
    className: '10',
    section: 'A',
    parentName: 'Suresh Sharma',
    phone: '+91 98765 43210',
    dob: '2010-05-17',
    admissionDate: '2024-04-01',
    bloodGroup: 'B+',
    address: '12 MG Road, Pune',
  };

  it('accepts valid optional fields', () => {
    const r = validateOne(base(full));
    assert.equal(r.status, 'valid', JSON.stringify(r.errors));
    assert.deepEqual(r.data, { fullName: 'Rahul Sharma', email: 'rahul@example.com', ...full });
  });

  it('normalizes empty optional values to null and fills absent ones with null', () => {
    const r = validateOne(base({ className: '', section: '   ', phone: null }));
    assert.equal(r.status, 'valid');
    for (const f of ['className', 'section', 'phone', 'parentName', 'dob', 'admissionDate', 'bloodGroup', 'address']) {
      assert.equal(r.data[f], null, f);
    }
    assert.deepEqual(Object.keys(r.data), schema.fields.map((f) => f.name), 'every canonical field, in schema order');
  });

  it('does not reinterpret values (no name splitting, no class guessing)', () => {
    const r = validateOne(base({ fullName: 'Rahul Kumar Sharma', className: 'Std X' }));
    assert.equal(r.data.fullName, 'Rahul Kumar Sharma');
    assert.equal(r.data.className, 'Std X');
  });
});

describe('phone (international / E.164-compatible)', () => {
  it('accepts international and national formats', () => {
    for (const ok of ['+14155552671', '+44 20 7946 0958', '+91-98765-43210', '(022) 2345 6789', '9876543210', '+6834002']) {
      const r = validateOne(base({ phone: ok }));
      assert.equal(r.status, 'valid', ok);
      assert.equal(r.data.phone, ok, 'kept as written');
    }
  });

  it('flags invalid phones', () => {
    for (const bad of ['12345', '+0123456789', '98765abcde', '+91 98765 43210 ext 2', '1234567890123456', '++919876543210', '98765+43210']) {
      assert.deepEqual(codes(validateOne(base({ phone: bad }))), ['INVALID_PHONE'], bad);
    }
  });
});

describe('dates', () => {
  it('accepts a real Excel date (as produced by the import step) and normalizes it', () => {
    const r = validateOne(base({ dob: '2010-01-01T00:00:00.000Z' }));
    assert.equal(r.status, 'valid');
    assert.equal(r.data.dob, '2010-01-01');
  });

  it('accepts YYYY-MM-DD, including leap days', () => {
    assert.equal(validateOne(base({ admissionDate: '2024-02-29' })).data.admissionDate, '2024-02-29');
  });

  it('flags ambiguous numeric text dates instead of guessing', () => {
    for (const amb of ['03/04/2010', '3-4-10', '25/12/10', '12.25.2010']) {
      assert.deepEqual(codes(validateOne(base({ dob: amb }))), ['AMBIGUOUS_DATE'], amb);
    }
  });

  it('reads DD-MM-YYYY only when the column proves the day comes first', () => {
    const dobs = (...values) => validator.validate(values.map((dob, i) => row(i + 2, base({ email: `s${i}@example.com`, dob })))).rows;
    assert.deepEqual(dobs('03-04-2010', '25/12/2010').map((r) => r.data.dob), ['2010-04-03', '2010-12-25']);
    assert.deepEqual(dobs('03-04-2010', '05-06-2010').map(codes), [['AMBIGUOUS_DATE'], ['AMBIGUOUS_DATE']]); // no proof
    assert.deepEqual(dobs('25-12-2010', '12-25-2010').map(codes), [['AMBIGUOUS_DATE'], ['AMBIGUOUS_DATE']]); // mixed orders
    assert.deepEqual(dobs('31-02-2010', '2011-05-17').map(codes), [['INVALID_DATE'], []]);
  });

  it('flags invalid dates', () => {
    for (const bad of ['2010-02-30', '2023-02-29', '2010-13-01', 'yesterday', '17 May 2010', '2010/05/17', '2010-05-17T10:30:00.000Z']) {
      assert.deepEqual(codes(validateOne(base({ dob: bad }))), ['INVALID_DATE'], bad);
    }
  });
});

describe('blood group', () => {
  it('accepts the 8 standard values, ignoring case, stored in standard spelling', () => {
    for (const g of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
      assert.equal(validateOne(base({ bloodGroup: g })).data.bloodGroup, g);
    }
    assert.equal(validateOne(base({ bloodGroup: ' ab+ ' })).data.bloodGroup, 'AB+');
  });

  it('flags anything else', () => {
    for (const bad of ['A', 'O positive', 'AB +', 'C+', '0+']) {
      assert.deepEqual(codes(validateOne(base({ bloodGroup: bad }))), ['INVALID_BLOOD_GROUP'], bad);
    }
  });
});

describe('types and forbidden fields', () => {
  it('flags wrong field types without coercing', () => {
    const r = validateOne(base({ phone: 9876543210, className: 10, dob: 40179, section: ['A'], fullName: true }));
    assert.deepEqual(
      r.errors.map((e) => [e.field, e.code]),
      [['fullName', 'INVALID_FIELD_TYPE'], ['className', 'INVALID_FIELD_TYPE'], ['section', 'INVALID_FIELD_TYPE'],
        ['phone', 'INVALID_FIELD_TYPE'], ['dob', 'INVALID_FIELD_TYPE']]
    );
    assert.equal(r.data.phone, 9876543210, 'original value kept for the report');
  });

  it('rejects system-controlled fields, including snake_case and aliases', () => {
    const r = validateOne(base({ password: 'x', role: 'admin', university_id: 3, ClassroomID: 7, totalFees: 0 }));
    assert.equal(r.status, 'invalid');
    assert.deepEqual(
      r.errors.map((e) => [e.field, e.code]),
      [['password', 'FORBIDDEN_SYSTEM_FIELD'], ['role', 'FORBIDDEN_SYSTEM_FIELD'], ['university_id', 'FORBIDDEN_SYSTEM_FIELD'],
        ['ClassroomID', 'FORBIDDEN_SYSTEM_FIELD'], ['totalFees', 'FORBIDDEN_SYSTEM_FIELD']]
    );
    for (const k of ['password', 'role', 'university_id', 'ClassroomID', 'totalFees']) assert.ok(!(k in r.data), k);
  });

  it('warns about (and ignores) unknown fields without failing the row', () => {
    const r = validateOne(base({ rollNumber: '17', 'Mail ID': 'x@y.com' }));
    assert.equal(r.status, 'valid');
    assert.deepEqual(r.warnings.map((w) => [w.field, w.code, w.severity]), [
      ['rollNumber', 'UNKNOWN_FIELD', 'warning'],
      ['Mail ID', 'UNKNOWN_FIELD', 'warning'],
    ]);
    assert.ok(!('rollNumber' in r.data));
  });
});

describe('batch behaviour', () => {
  it('reports every problem in a row with several invalid fields', () => {
    const r = validateOne({ fullName: '', email: 'bad', phone: '12', dob: '01/02/2010', bloodGroup: 'Z', role: 'admin' }, 9);
    assert.equal(r.rowNumber, 9);
    assert.deepEqual(codes(r), [
      'FORBIDDEN_SYSTEM_FIELD', 'REQUIRED_FIELD_MISSING', 'INVALID_EMAIL', 'INVALID_PHONE', 'AMBIGUOUS_DATE', 'INVALID_BLOOD_GROUP',
    ]);
  });

  it('never drops a row: malformed rows are reported with their index', () => {
    const input = [row(2, base()), null, 'text', row(5, 'not-an-object'), { values: base({ email: 'z@example.com' }) }, row(7, base({ email: 'bad' }))];
    const result = validator.validate(input);
    assert.equal(result.rows.length, input.length);
    assert.deepEqual(result.rows.map((r) => r.index), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(result.rows.map((r) => r.rowNumber), [2, null, null, 5, null, 7]);
    assert.deepEqual(result.rows.map((r) => r.status), ['valid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
    assert.deepEqual(codes(result.rows[1]), ['INVALID_ROW']);
    assert.deepEqual(codes(result.rows[3]), ['INVALID_ROW']);
    assert.deepEqual(codes(result.rows[4]), ['INVALID_ROW_NUMBER']);
    assert.equal(result.rows[4].data.email, 'z@example.com', 'values still validated');
  });

  it('summarizes mixed valid and invalid rows', () => {
    const result = validator.validate([
      row(2, base({ email: 'a@example.com' })),
      row(3, base({ email: 'bad' })),
      row(4, base({ email: 'c@example.com', extra: 'x' })),
      row(5, { email: 'd@example.com', dob: '1/1/10' }),
    ]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.summary, {
      totalRows: 4, validRows: 2, invalidRows: 2, rowsWithWarnings: 1, errorCount: 3, warningCount: 1,
    });
    assert.deepEqual(result.rows.map((r) => r.rowNumber), [2, 3, 4, 5]);
  });

  it('reports an empty batch as invalid with NO_ROWS', () => {
    const result = validator.validate([]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.map((e) => e.code), ['NO_ROWS']);
    assert.equal(result.summary.totalRows, 0);
  });

  it('throws only for a non-array input (caller error, not row data)', () => {
    assert.throws(() => validator.validate({}), { code: 'INVALID_ROWS' });
  });

  it('is deterministic: identical input gives identical output', () => {
    const input = () => [row(2, base({ dob: '03/04/2010' })), row(3, base({ email: 'RAHUL@example.com', bloodGroup: 'o-' }))];
    const first = validator.validate(input());
    const second = new StudentDataValidator(loadStudentSchema()).validate(input());
    assert.deepEqual(second, first);
    assert.equal(JSON.stringify(second), JSON.stringify(first));
  });

  it('does not modify the input rows', () => {
    const input = [row(2, base({ fullName: '  A  ', bloodGroup: 'ab+' }))];
    const copy = structuredClone(input);
    validator.validate(input);
    assert.deepEqual(input, copy);
  });

  it('validates a large batch (5000 rows, the default import limit) quickly', () => {
    const input = Array.from({ length: 5000 }, (_, i) =>
      row(i + 2, { fullName: `Student ${i}`, email: `s${i}@example.com`, phone: `+91 98765 ${String(i).padStart(5, '0')}`, dob: '2010-01-01T00:00:00.000Z' })
    );
    const started = Date.now();
    const result = validator.validate(input);
    assert.ok(Date.now() - started < 2000, 'under 2 s');
    assert.equal(result.valid, true);
    assert.equal(result.summary.validRows, 5000);
    assert.equal(result.rows[4999].rowNumber, 5001);
  });
});

describe('schema is the source of truth', () => {
  const raw = () => JSON.parse(fs.readFileSync(DEFAULT_SCHEMA_PATH, 'utf8'));

  it('uses required fields and allowed values from the schema, not hard-coded ones', () => {
    const custom = raw();
    custom.importFields.phone.required = true;
    custom.importFields.phone.normalization = ['trim'];
    custom.importFields.bloodGroup.validation.allowedValues = ['A+'];
    const v = new StudentDataValidator(compileStudentSchema(custom));
    const r = v.validate([row(2, base({ bloodGroup: 'B+' }))]).rows[0];
    assert.deepEqual(r.errors.map((e) => [e.field, e.code]), [['phone', 'REQUIRED_FIELD_MISSING'], ['bloodGroup', 'INVALID_BLOOD_GROUP']]);
  });

  it('refuses to load a schema with an unknown rule instead of ignoring it', () => {
    const typo = raw();
    typo.importFields.email.validation = { fromat: 'email' };
    assert.throws(() => compileStudentSchema(typo), /unknown key\(s\): fromat/);
    const clash = raw();
    clash.importFields.role = { ...clash.importFields.address };
    assert.throws(() => compileStudentSchema(clash), /both an import field and system-controlled/);
    const badType = raw();
    badType.importFields.fullName.type = 'number';
    assert.throws(() => compileStudentSchema(badType), /type must be one of/);
  });
});
