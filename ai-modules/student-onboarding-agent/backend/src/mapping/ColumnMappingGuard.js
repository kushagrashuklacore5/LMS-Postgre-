const { systemKey } = require('../validation/studentSchema');
const {
  PROPOSAL_STATUSES,
  RESULT_STATUSES,
  PROPOSAL_KEYS,
  MAPPING_KEYS,
  MAX_REASON_LENGTH,
} = require('./ColumnMappingContract');
const { screenProposalText, checkNewFieldSuggestions } = require('./ProposalSafety');

/**
 * Deterministic guardrails for a column-mapping proposal (see
 * ColumnMappingContract.js). Checks structure and targets only. It never
 * repairs a proposal, never trusts confidence, and never modifies its input.
 *
 * guard.validate(proposal, { headers }) -> result
 *   headers: the Excel headers from ExcelImportService (the columns the
 *   proposal must describe, exactly once each).
 *
 * Problems in the proposal are reported, not thrown. Only a caller error
 * (bad headers argument) throws.
 *
 * Acceptance is per column: a proposal-level error (malformed, a header left
 * out, unexpected top-level property) rejects the whole proposal; otherwise
 * each column that passes its own checks is accepted, and the rest are
 * listed in unresolvedColumns for review.
 *
 * No LLM, database, LMS or network access.
 */
class ColumnMappingGuard {
  constructor(schema) {
    if (!schema || !Array.isArray(schema.fields) || !Array.isArray(schema.systemFields)) {
      throw new TypeError('ColumnMappingGuard requires a compiled schema (see loadStudentSchema()).');
    }
    this.schema = schema;
  }

  /**
   * customTargets: "custom:<key>" targets of custom fields an ADMIN approved for this import (migration 003).
   * Never taken from the proposal itself: the AI cannot make a custom field a valid target.
   */
  validate(proposal, { headers, customTargets = [] } = {}) {
    assertHeaders(headers);
    this.customTargets = new Set(customTargets); // read by checkTarget during this synchronous call

    const result = {
      valid: false,
      structurallyValid: false,
      reviewRequired: true,
      schemaVersion: this.schema.version,
      summary: null,
      errors: [],
      warnings: [],
      columns: [],
      mapping: null,
      unresolvedColumns: [],
      suggestedNewFields: [], // display-only ideas (ProposalSafety); never applied
      newFieldSuggestionErrors: [],
    };

    if (!isPlainObject(proposal)) {
      result.errors.push(issue('MALFORMED_PROPOSAL', 'Proposal must be an object of the form { mappings: [...] }.'));
      return finish(result, headers);
    }
    for (const key of Object.keys(proposal)) {
      if (!PROPOSAL_KEYS.includes(key)) {
        result.errors.push(issue('UNEXPECTED_PROPERTY', `Unexpected proposal property ${quote(key)}. Allowed: ${PROPOSAL_KEYS.join(', ')}.`));
      }
    }
    if (!Array.isArray(proposal.mappings)) {
      result.errors.push(issue('MALFORMED_PROPOSAL', '"mappings" must be an array.'));
      return finish(result, headers);
    }
    // Instructions, SQL, code or markup anywhere in the model's own text: the whole proposal is rejected.
    result.errors.push(...screenProposalText(proposal));

    const headerSet = new Set(headers);
    result.columns = proposal.mappings.map((entry, index) => this.checkEntry(entry, index, headerSet));

    flagDuplicateSources(result.columns);
    flagDuplicateTargets(result.columns);

    const addressed = new Set(result.columns.map((c) => c.sourceColumn).filter((s) => headerSet.has(s)));
    for (const header of headers) {
      if (!addressed.has(header)) {
        result.errors.push({
          ...issue('COLUMN_NOT_ADDRESSED', `Excel column ${quote(header)} is missing from the proposal; every column must be listed (use status "unmapped" if it has no target).`),
          sourceColumn: header,
        });
      }
    }

    for (const column of result.columns) {
      column.status = column.errors.length > 0 ? 'rejected' : column.proposedStatus;
    }
    const unmapped = new Set(result.columns.filter((c) => c.status === 'unmapped').map((c) => c.sourceColumn));
    const suggestions = checkNewFieldSuggestions(proposal.suggestedNewFields, { schema: this.schema, unmappedColumns: unmapped, existingCustomKeys: [...this.customTargets].map((t) => t.slice(7)) });
    result.suggestedNewFields = suggestions.accepted;
    result.newFieldSuggestionErrors = suggestions.errors;
    return finish(result, headers, this.schema);
  }

  checkEntry(entry, index, headerSet) {
    const column = {
      index,
      sourceColumn: null,
      proposedStatus: null,
      status: null,
      targetField: null,
      candidateFields: null,
      confidence: null,
      reason: null,
      errors: [],
    };
    const fail = (code, message, extra = {}) => column.errors.push({ ...issue(code, message), ...extra });

    if (!isPlainObject(entry)) {
      fail('MALFORMED_MAPPING', `mappings[${index}] must be an object.`);
      return column;
    }
    for (const key of Object.keys(entry)) {
      if (!MAPPING_KEYS.includes(key)) {
        fail('UNEXPECTED_PROPERTY', `Unexpected property ${quote(key)}. Allowed: ${MAPPING_KEYS.join(', ')}.`);
      }
    }

    // sourceColumn
    const { sourceColumn } = entry;
    if (sourceColumn === undefined || sourceColumn === null || sourceColumn === '') {
      fail('MISSING_SOURCE_COLUMN', `mappings[${index}] has no sourceColumn.`);
    } else if (typeof sourceColumn !== 'string') {
      fail('INVALID_SOURCE_COLUMN', `mappings[${index}].sourceColumn must be a string.`);
    } else {
      column.sourceColumn = sourceColumn;
      if (!headerSet.has(sourceColumn)) {
        fail('UNKNOWN_SOURCE_COLUMN', `${quote(sourceColumn)} is not a column of this workbook (names must match exactly).`);
      }
    }

    // status
    if (PROPOSAL_STATUSES.includes(entry.status)) {
      column.proposedStatus = entry.status;
    } else {
      fail('INVALID_STATUS', `status must be one of ${PROPOSAL_STATUSES.join(', ')}; got ${describe(entry.status)}.`);
    }
    const status = column.proposedStatus;

    // targetField: required for "mapped", not allowed otherwise. null counts as absent.
    const target = absentIfNull(entry.targetField);
    if (target === undefined) {
      if (status === 'mapped') fail('MISSING_TARGET_FIELD', 'A mapped column needs a targetField.');
    } else {
      if (status === 'unmapped' || status === 'ambiguous') {
        fail('UNEXPECTED_TARGET_FIELD', `A column with status "${status}" must not have a targetField.`);
      }
      if (this.checkTarget(target, 'targetField', fail)) column.targetField = target;
    }

    // candidateFields: only for "ambiguous".
    const candidates = absentIfNull(entry.candidateFields);
    if (candidates !== undefined) {
      if (status !== 'ambiguous') {
        fail('UNEXPECTED_CANDIDATE_FIELDS', 'candidateFields is only allowed with status "ambiguous".');
      }
      if (!Array.isArray(candidates)) {
        fail('INVALID_CANDIDATE_FIELDS', 'candidateFields must be an array of target fields.');
      } else {
        const ok = candidates.map((c, i) => this.checkTarget(c, `candidateFields[${i}]`, fail));
        if (new Set(candidates).size !== candidates.length) {
          fail('INVALID_CANDIDATE_FIELDS', 'candidateFields contains duplicates.');
        }
        if (ok.every(Boolean)) column.candidateFields = [...candidates];
      }
    }

    // confidence: advisory only. Required for "mapped"; must be a number in [0, 1].
    const confidence = absentIfNull(entry.confidence);
    if (confidence === undefined) {
      if (status === 'mapped') fail('MISSING_CONFIDENCE', 'A mapped column needs a confidence between 0 and 1.');
    } else if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      fail('INVALID_CONFIDENCE', `confidence must be a number between 0 and 1; got ${describe(confidence)}.`);
    } else {
      column.confidence = confidence;
    }

    // reason: optional, bounded plain text.
    const reason = absentIfNull(entry.reason);
    if (reason !== undefined) {
      if (typeof reason !== 'string' || reason.length > MAX_REASON_LENGTH) {
        fail('INVALID_REASON', `reason must be a string of at most ${MAX_REASON_LENGTH} characters.`);
      } else {
        column.reason = reason;
      }
    }

    return column;
  }

  /** Returns true if `value` is an allowed target; records the problem otherwise. */
  checkTarget(value, label, fail) {
    if (typeof value !== 'string' || value === '') {
      fail('UNKNOWN_TARGET_FIELD', `${label} must be a canonical field name; got ${describe(value)}.`);
      return false;
    }
    if (this.customTargets && this.customTargets.has(value)) return true; // an admin-approved custom field
    const systemName = this.schema.systemLookup.get(systemKey(value));
    if (systemName) {
      fail('FORBIDDEN_TARGET_FIELD', `${label} ${quote(value)} is system-controlled (${systemName}) and can never be imported.`, {
        targetField: value,
      });
      return false;
    }
    if (!this.schema.fieldNames.has(value)) {
      fail('UNKNOWN_TARGET_FIELD', `${label} ${quote(value)} is not a canonical field. Allowed: ${[...this.schema.fieldNames].join(', ')}.`, {
        targetField: value,
      });
      return false;
    }
    return true;
  }
}

/** Every entry sharing a sourceColumn is rejected; none is preferred. */
function flagDuplicateSources(columns) {
  for (const group of groupBy(columns.filter((c) => c.sourceColumn !== null), (c) => c.sourceColumn)) {
    for (const c of group) {
      c.errors.push({
        ...issue('DUPLICATE_SOURCE_COLUMN', `Column ${quote(c.sourceColumn)} appears ${group.length} times in the proposal.`),
        relatedIndexes: group.filter((o) => o !== c).map((o) => o.index),
      });
    }
  }
}

/** Every mapped column claiming the same targetField is rejected; none is preferred. */
function flagDuplicateTargets(columns) {
  const mapped = columns.filter((c) => c.proposedStatus === 'mapped' && c.targetField !== null);
  for (const group of groupBy(mapped, (c) => c.targetField)) {
    for (const c of group) {
      const others = group.filter((o) => o !== c);
      c.errors.push({
        ...issue(
          'DUPLICATE_TARGET_FIELD',
          `${quote(c.sourceColumn)} and ${others.map((o) => quote(o.sourceColumn)).join(', ')} map to the same field ${quote(c.targetField)}; only one column may fill a field.`
        ),
        relatedColumns: others.map((o) => o.sourceColumn),
      });
    }
  }
}

function finish(result, headers, schema = null) {
  const counts = Object.fromEntries(RESULT_STATUSES.map((s) => [s, 0]));
  for (const c of result.columns) counts[c.status] = (counts[c.status] || 0) + 1;
  result.summary = { headers: headers.length, entries: result.columns.length, ...counts };

  // structurallyValid: no proposal-level error (every header present exactly
  // once, well-formed). Only then can accepted columns be used.
  // valid: structurally valid AND no rejected column.
  result.structurallyValid = result.errors.length === 0;
  result.valid = result.structurallyValid && counts.rejected === 0;

  if (schema && result.structurallyValid) {
    const accepted = new Set(result.columns.filter((c) => c.status === 'mapped').map((c) => c.targetField));
    for (const f of schema.fields) {
      if (f.required && !accepted.has(f.name)) {
        result.warnings.push({
          ...issue('REQUIRED_FIELD_UNMAPPED', `No column is mapped to required field ${quote(f.name)}; every row will fail validation for it.`, 'warning'),
          targetField: f.name,
        });
      }
    }
  }

  // Partial acceptance: in a structurally valid proposal, every column that
  // passed its own checks is usable. Rejected, ambiguous and unmapped columns
  // are never copied and stay visible in unresolvedColumns for human review.
  // Nothing is repaired: a rejected column is never re-targeted.
  result.mapping = result.structurallyValid
    ? result.columns.filter((c) => c.status === 'mapped').map((c) => ({ sourceColumn: c.sourceColumn, targetField: c.targetField }))
    : null;
  result.unresolvedColumns = result.columns
    .filter((c) => c.status !== 'mapped')
    .map((c) => ({ sourceColumn: c.sourceColumn, status: c.status, reason: c.reason, candidateFields: c.candidateFields, errors: c.errors }));
  result.reviewRequired = !result.valid || result.unresolvedColumns.length > 0 || result.warnings.length > 0;
  return result;
}

function assertHeaders(headers) {
  if (!Array.isArray(headers) || headers.some((h) => typeof h !== 'string' || h === '')) {
    throw new TypeError('validate() needs { headers }: the Excel headers from ExcelImportService (non-empty strings).');
  }
  if (new Set(headers).size !== headers.length) {
    throw new TypeError('headers must be unique (as produced by ExcelImportService).');
  }
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function issue(code, message, severity = 'error') {
  return { code, severity, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function absentIfNull(value) {
  return value === null ? undefined : value;
}

function quote(value) {
  return JSON.stringify(String(value));
}

function describe(value) {
  if (value === undefined) return 'nothing';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return 'an array';
  return value === null ? 'null' : typeof value === 'object' ? 'an object' : typeof value;
}

module.exports = { ColumnMappingGuard };
