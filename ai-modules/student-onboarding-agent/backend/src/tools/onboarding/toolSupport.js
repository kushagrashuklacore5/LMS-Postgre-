const { ValidationError } = require('../../errors');
const { systemKey } = require('../../validation/studentSchema');

/** Shared, deterministic argument checks for the onboarding tools. */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidArguments(tool, details) {
  return new ValidationError(`Invalid arguments for ${tool}.`, details, { code: 'INVALID_TOOL_ARGUMENTS' });
}

function detail(field, code, message) {
  return { field, code, message };
}

/**
 * Classifies every key not in `allowed`: system-controlled (schema names and
 * aliases, any spelling) -> FORBIDDEN_SYSTEM_FIELD; a canonical field that
 * belongs to another tool -> FIELD_NOT_ALLOWED_FOR_TOOL; else UNKNOWN_FIELD.
 * Nothing is silently dropped.
 */
function checkKeys(schema, obj, allowed, where, otherToolFields = []) {
  const details = [];
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) continue;
    const system = schema.systemLookup.get(systemKey(key));
    if (system) details.push(detail(key, 'FORBIDDEN_SYSTEM_FIELD', `${where}: "${key}" is system-controlled (${system}) and can never be supplied.`));
    else if (otherToolFields.includes(key)) details.push(detail(key, 'FIELD_NOT_ALLOWED_FOR_TOOL', `${where}: "${key}" is not accepted by this tool.`));
    else details.push(detail(key, 'UNKNOWN_FIELD', `${where}: "${key}" is not an accepted argument.`));
  }
  return details;
}

function checkRowNumber(value) {
  return Number.isInteger(value) && value >= 1 ? [] : [detail('rowNumber', 'INVALID_ROW_NUMBER', 'rowNumber must be the positive integer Excel row of the approved import.')];
}

/** The approved row the arguments refer to; tools only act on approved data. */
function approvedRowOrThrow(context, rowNumber) {
  const row = context.approvedRow(rowNumber);
  if (!row) {
    throw new ValidationError('The row is not part of the approved import.', [], { code: 'ROW_NOT_IN_APPROVED_IMPORT' });
  }
  return row;
}

/** Arguments must equal the approved data exactly; field names only in the error, never values. */
function assertMatchesApproved(values, approved, fields) {
  const differing = fields.filter((f) => (values[f] ?? null) !== (approved[f] ?? null));
  if (differing.length > 0) {
    throw new ValidationError('The arguments do not match the approved import.', differing.map((f) => detail(f, 'APPROVED_DATA_MISMATCH', `"${f}" differs from the approved value.`)), {
      code: 'APPROVED_DATA_MISMATCH',
    });
  }
}

module.exports = { isPlainObject, invalidArguments, detail, checkKeys, checkRowNumber, approvedRowOrThrow, assertMatchesApproved };
