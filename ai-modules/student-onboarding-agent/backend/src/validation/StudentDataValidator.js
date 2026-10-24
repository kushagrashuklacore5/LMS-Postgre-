const { ValidationError } = require('../errors');
const { isValidEmail, isValidPhone, parseDate, NUMERIC_WITH_FULL_YEAR } = require('./formats');
const { systemKey } = require('./studentSchema');

const MAX_RELATED_ROWS = 20;

/**
 * Deterministic validation of canonical student rows (the output of the
 * future LLM column-mapping step). All field rules come from the compiled
 * config/studentSchema.json; nothing about fields is hard-coded here.
 *
 * Input:  [{ rowNumber, values: { <canonical field>: value } }]
 *         rowNumber is the original Excel row from the import step.
 * Output: see validate(). Row problems are reported, never thrown; every
 *         input row appears in the output, in input order.
 *
 * No LLM, database, LMS or network access. Same input + same schema =
 * same output (no timestamps, no randomness).
 */
class StudentDataValidator {
  constructor(schema) {
    if (!schema || !Array.isArray(schema.fields)) {
      throw new TypeError('StudentDataValidator requires a compiled schema (see loadStudentSchema()).');
    }
    this.schema = schema;
  }

  validate(rows) {
    if (!Array.isArray(rows)) {
      throw new ValidationError('Rows to validate must be an array.', [], { code: 'INVALID_ROWS' });
    }

    const dayFirstFields = this.dayFirstDateFields(rows);
    const results = rows.map((row, index) => this.validateRow(row, index, dayFirstFields));
    this.flagDuplicates(results);

    const batchErrors = [];
    if (results.length === 0) {
      batchErrors.push({ code: 'NO_ROWS', severity: 'error', message: 'There are no student rows to validate.' });
    }

    for (const r of results) r.status = r.errors.length > 0 ? 'invalid' : 'valid';
    const invalidRows = results.filter((r) => r.status === 'invalid').length;
    const summary = {
      totalRows: results.length,
      validRows: results.length - invalidRows,
      invalidRows,
      rowsWithWarnings: results.filter((r) => r.warnings.length > 0).length,
      errorCount: results.reduce((n, r) => n + r.errors.length, 0),
      warningCount: results.reduce((n, r) => n + r.warnings.length, 0),
    };

    return {
      valid: batchErrors.length === 0 && invalidRows === 0,
      schemaVersion: this.schema.version,
      summary,
      errors: batchErrors,
      rows: results.map(({ duplicateKeys, ...row }) => row), // drop internal bookkeeping
    };
  }

  /**
   * Date fields whose column proves a day-first order (DD-MM-YYYY): at least one value has a
   * first part above 12 and none has a second part above 12. Only then is numeric date text
   * read as day/month/year; any other column keeps reporting AMBIGUOUS_DATE (never guessed).
   */
  dayFirstDateFields(rows) {
    const proven = new Set();
    for (const field of this.schema.fields) {
      if (field.format !== 'date') continue;
      let dayFirst = false;
      for (const row of rows) {
        const v = isPlainObject(row) && isPlainObject(row.values) ? row.values[field.name] : null;
        const m = typeof v === 'string' ? NUMERIC_WITH_FULL_YEAR.exec(v.trim()) : null;
        if (!m) continue;
        if (Number(m[2]) > 12) { dayFirst = false; break; }
        if (Number(m[1]) > 12) dayFirst = true;
      }
      if (dayFirst) proven.add(field.name);
    }
    return proven;
  }

  validateRow(row, index, dayFirstFields = new Set()) {
    const result = { index, rowNumber: null, status: null, data: null, errors: [], warnings: [], duplicateKeys: {} };

    if (!isPlainObject(row)) {
      result.errors.push(issue(null, 'INVALID_ROW', 'Row must be an object of the form { rowNumber, values }.'));
      return result;
    }
    if (Number.isInteger(row.rowNumber) && row.rowNumber >= 1) {
      result.rowNumber = row.rowNumber;
    } else {
      result.errors.push(issue(null, 'INVALID_ROW_NUMBER', 'rowNumber must be the positive integer Excel row number.'));
    }
    if (!isPlainObject(row.values)) {
      result.errors.push(issue(null, 'INVALID_ROW', 'Row "values" must be an object of canonical student fields.'));
      return result;
    }

    const { values } = row;
    for (const key of Object.keys(values)) {
      if (this.schema.fieldNames.has(key)) continue;
      const systemName = this.schema.systemLookup.get(systemKey(key));
      if (systemName) {
        result.errors.push(
          issue(key, 'FORBIDDEN_SYSTEM_FIELD', `"${key}" is system-controlled (${systemName}) and cannot be imported.`)
        );
      } else {
        result.warnings.push(
          issue(key, 'UNKNOWN_FIELD', `"${key}" is not a canonical student field and was ignored.`, 'warning')
        );
      }
    }

    result.data = {};
    for (const field of this.schema.fields) {
      result.data[field.name] = this.validateField(field, values[field.name], result, dayFirstFields.has(field.name));
    }
    return result;
  }

  /** Returns the normalized value; records problems on `result`. */
  validateField(field, input, result, dayFirst = false) {
    const fail = (code, message) => result.errors.push(issue(field.name, code, message));

    if (input === undefined || input === null) {
      if (field.required) fail('REQUIRED_FIELD_MISSING', `"${field.name}" is required.`);
      return null;
    }
    if (typeof input !== 'string') {
      fail('INVALID_FIELD_TYPE', `"${field.name}" must be text (${field.type}), got ${describeType(input)}.`);
      return input;
    }

    let value = field.trim ? input.trim() : input;
    if (value === '') {
      if (field.required) {
        fail('REQUIRED_FIELD_MISSING', `"${field.name}" is required but empty.`);
        return value;
      }
      if (field.emptyToNull) return null;
    }

    if (field.format === 'email' && !isValidEmail(value)) {
      fail('INVALID_EMAIL', `"${value}" is not a valid email address.`);
    } else if (field.format === 'phone' && !isValidPhone(value)) {
      fail('INVALID_PHONE', `"${value}" is not a valid phone number (optional +, then 7-15 digits).`);
    } else if (field.format === 'date') {
      const parsed = parseDate(value, { dayFirst });
      if (parsed.code) fail(parsed.code, parsed.message);
      else value = parsed.value;
    }

    if (field.allowed) {
      const canonical = field.allowed.get(field.allowedCaseInsensitive ? value.toLowerCase() : value);
      if (canonical === undefined) {
        fail(field.errorCode, `"${value}" is not allowed for "${field.name}". Allowed: ${field.allowedValues.join(', ')}.`);
      } else {
        value = canonical;
      }
    }

    if (field.unique) {
      result.duplicateKeys[field.name] = this.schema.caseInsensitiveUnique ? value.toLowerCase() : value;
    }
    return value;
  }

  /**
   * Flags every row that shares a unique value with another row. No row is dropped.
   * Each error lists at most MAX_RELATED_ROWS other rows (relatedRowCount has the
   * full number), so a file where thousands of rows share one value stays linear.
   */
  flagDuplicates(results) {
    for (const fieldName of this.schema.uniqueFields) {
      const groups = new Map();
      for (const r of results) {
        const key = r.duplicateKeys[fieldName];
        if (key === undefined || key === '') continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      const code = `DUPLICATE_${toUpperSnake(fieldName)}`;
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const head = group.slice(0, MAX_RELATED_ROWS + 1); // enough to list MAX others for any member
        for (const r of group) {
          const others = head.filter((o) => o !== r).slice(0, MAX_RELATED_ROWS);
          const more = group.length - 1 - others.length;
          const listed = others.map((o) => o.rowNumber ?? `index ${o.index}`).join(', ') + (more > 0 ? ` and ${more} more` : '');
          r.errors.push({
            ...issue(
              fieldName,
              code,
              `"${r.data[fieldName]}" also appears in row(s) ${listed}` +
                (this.schema.caseInsensitiveUnique ? ' (compared ignoring case).' : '.')
            ),
            relatedRows: others.map((o) => o.rowNumber),
            relatedRowCount: group.length - 1,
          });
        }
      }
    }
  }
}

function issue(field, code, message, severity = 'error') {
  return { field, code, severity, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeType(value) {
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

function toUpperSnake(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

module.exports = { StudentDataValidator };
