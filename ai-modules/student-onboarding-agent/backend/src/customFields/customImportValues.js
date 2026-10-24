const { normalizeValue, customKeyOf } = require('./CustomFieldRules');

/**
 * Adds the values of admin-approved custom fields to a StudentDataValidator result.
 *
 *   validation      StudentDataValidator.validate() result for the standard fields (rows in job-row order)
 *   rawRows         the job's raw parsed rows [{ rowNumber, values }]
 *   customMappings  approved mappings whose target is "custom:<key>" [{ sourceColumn, targetField }]
 *   fields          the job's approved custom fields [{ key, dataType, ... }]
 *
 * Every row gets `custom: { <key>: normalized text | null }` (only approved keys). A value that does not
 * fit the field's type is a blocking row error; the message names the row, column and field, never the value.
 * Returns a NEW validation object (the input is not modified).
 */
function applyCustomValues(validation, rawRows, customMappings, fields) {
  const typeOf = new Map(fields.map((f) => [f.key, f.dataType]));
  const rows = validation.rows.map((row, i) => {
    const raw = rawRows[i] && rawRows[i].rowNumber === row.rowNumber ? rawRows[i] : rawRows.find((r) => r.rowNumber === row.rowNumber);
    const custom = {};
    const errors = [...row.errors];
    for (const m of customMappings) {
      const key = customKeyOf(m.targetField);
      if (!typeOf.has(key)) continue; // not approved for this job: never filled
      const out = normalizeValue(typeOf.get(key), raw ? raw.values[m.sourceColumn] : null);
      if (out.error) {
        errors.push({ field: m.targetField, code: out.error, severity: 'error',
          message: `Row ${row.rowNumber}: the value in column "${m.sourceColumn}" is not a valid ${typeOf.get(key)} for custom field "${key}".` });
        custom[key] = null;
      } else {
        custom[key] = out.value;
      }
    }
    return { ...row, custom, errors, status: errors.length > 0 ? 'invalid' : 'valid' };
  });
  const invalidRows = rows.filter((r) => r.status === 'invalid').length;
  return {
    ...validation,
    valid: validation.errors.length === 0 && invalidRows === 0,
    summary: {
      ...validation.summary,
      validRows: rows.length - invalidRows,
      invalidRows,
      errorCount: rows.reduce((n, r) => n + r.errors.length, 0),
    },
    rows,
  };
}

module.exports = { applyCustomValues };
