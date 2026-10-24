/**
 * Applies an accepted column mapping to parsed Excel rows, producing
 * canonical rows for StudentDataValidator.
 *
 * Representation normalization only; NOT validation:
 *   text fields (schema type "string"):
 *     string                -> trimmed
 *     null / missing        -> null
 *     safe whole number     -> its decimal digits ("10", "9876543210")
 *     decimal, boolean, object/array, unsafe integer
 *                           -> left as-is and reported; the validator then
 *                              rejects it (INVALID_FIELD_TYPE)
 *   date fields (schema type "date"):
 *     string                -> unchanged (the parser's ISO form or the text as typed)
 *     null / missing        -> null
 *     anything else         -> left as-is and reported (numbers are never
 *                              treated as Excel serial dates)
 *
 * Only mapped target fields are copied; unmapped/ambiguous/rejected columns
 * never are. No value is invented. Raw rows are not modified. Issue messages
 * name the row, column and field but never contain the cell value.
 */
function buildCanonicalRows(rows, mapping, schema) {
  const fieldTypes = new Map(schema.fields.map((f) => [f.name, f.type]));
  for (const { targetField } of mapping) {
    if (!fieldTypes.has(targetField)) {
      throw new TypeError(`Mapping target "${targetField}" is not a canonical field; pass only a guard-accepted mapping.`);
    }
  }

  const issues = [];
  const canonicalRows = rows.map((row) => {
    const values = {};
    for (const { sourceColumn, targetField } of mapping) {
      const raw = row.values && Object.prototype.hasOwnProperty.call(row.values, sourceColumn) ? row.values[sourceColumn] : null;
      const { value, problem } = normalize(raw, fieldTypes.get(targetField));
      values[targetField] = value;
      if (problem) {
        issues.push({
          rowNumber: row.rowNumber,
          sourceColumn,
          targetField,
          code: problem.code,
          severity: 'error',
          message: `Row ${row.rowNumber}, column ${JSON.stringify(sourceColumn)}: ${problem.message} for "${targetField}".`,
        });
      }
    }
    return { rowNumber: row.rowNumber, values };
  });

  return { rows: canonicalRows, issues };
}

function normalize(raw, type) {
  if (raw === null || raw === undefined) return { value: null };
  if (typeof raw === 'string') return { value: type === 'string' ? raw.trim() : raw };

  if (type === 'string') {
    if (typeof raw === 'number' && Number.isSafeInteger(raw)) return { value: String(raw) };
    if (typeof raw === 'number' && Number.isInteger(raw)) {
      return { value: raw, problem: { code: 'UNSAFE_INTEGER', message: 'a number too large to convert exactly cannot be used as text' } };
    }
    if (typeof raw === 'number') {
      return { value: raw, problem: { code: 'DECIMAL_NOT_TEXT', message: 'a decimal number cannot be used as text' } };
    }
    if (typeof raw === 'boolean') {
      return { value: raw, problem: { code: 'BOOLEAN_NOT_TEXT', message: 'a boolean (yes/no) cell cannot be used as text' } };
    }
    return { value: raw, problem: { code: 'UNSUPPORTED_VALUE', message: 'this kind of value cannot be used as text' } };
  }

  // type 'date': only the parser's string form is accepted; nothing is reinterpreted.
  return { value: raw, problem: { code: 'NOT_A_DATE_VALUE', message: 'only a date cell or date text can be used as a date' } };
}

module.exports = { buildCanonicalRows };
