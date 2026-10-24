/**
 * Deterministic review of an import job: what a human must look at, and
 * what blocks approval. Built on demand from the job (never stored), so it
 * always matches the job's current mapping and validation. It references the
 * job's frozen parts instead of copying them. One pass over the rows: O(rows + issues).
 *
 * Blocking rules (no new business rules; the schema and validator decide
 * row validity):
 *   column status   mapped                     -> not blocking
 *                   unmapped, decided by human -> not blocking (information)
 *                   unmapped, proposed by LLM  -> BLOCKING until a human confirms (data could be lost silently)
 *                   suggested (AI proposal, not approved yet)  -> BLOCKING until an admin approves or changes it
 *                   ambiguous / rejected / pending (no mapping yet) -> BLOCKING
 *   validator       row or batch error         -> BLOCKING
 *                   warning                    -> not blocking
 *   guard warning   REQUIRED_FIELD_UNMAPPED    -> not blocking itself; the resulting
 *                                                 REQUIRED_FIELD_MISSING row errors block
 *   file warnings, representation notes        -> not blocking
 */

const COLUMN_ISSUES = {
  ambiguous: ['AMBIGUOUS_COLUMN', 'The column could mean more than one field. Choose a field or mark it unmapped.'],
  rejected: ['REJECTED_MAPPING', 'The proposed mapping for this column broke the mapping rules. Choose a field or mark it unmapped.'],
  pending: ['COLUMN_NOT_MAPPED', 'No mapping has been proposed for this column. Choose a field or mark it unmapped.'],
  suggested: ['AI_SUGGESTION_NOT_APPROVED', 'The AI suggested a field for this column. It is not used until an admin approves it (or chooses another field).'],
  unmappedLlm: ['UNCONFIRMED_UNMAPPED_COLUMN', 'The column was left unmapped by the automatic mapping, so its data will not be imported. Confirm it as unmapped or choose a field.'],
  unmappedHuman: ['UNMAPPED_COLUMN', 'The column was marked unmapped by a reviewer; its data will not be imported.'],
};

function columnBlocks(column) {
  if (column.status === 'mapped') return false;
  if (column.status === 'unmapped') return column.decidedBy !== 'human';
  return true; // suggested, ambiguous, rejected, pending
}

function issue(category, code, severity, blocking, message, { rowNumber = null, sourceColumn = null, targetField = null, details } = {}) {
  const out = { category, code, severity, blocking, rowNumber, sourceColumn, targetField, message };
  if (details !== undefined) out.details = details;
  return out;
}

/** All issues of a job, in a fixed order: file, mapping, batch, then rows in row order. */
function collectIssues(job) {
  const issues = [];
  for (const w of job.parseWarnings || []) issues.push(issue('file', w.code, 'warning', false, w.message));

  const mapping = job.mapping;
  if (mapping) {
    if (mapping.llm && mapping.llm.error) {
      issues.push(issue('mapping', 'AUTOMATIC_MAPPING_UNAVAILABLE', 'warning', false,
        `Automatic column mapping was not available (${mapping.llm.error.code}). Map the columns manually.`));
    }
    for (const c of mapping.columns) {
      if (c.status === 'mapped') continue;
      const key = c.status === 'unmapped' ? (c.decidedBy === 'human' ? 'unmappedHuman' : 'unmappedLlm') : c.status;
      const [code, message] = COLUMN_ISSUES[key];
      const blocking = columnBlocks(c);
      issues.push(issue('mapping', code, blocking ? 'error' : 'info', blocking, message, {
        sourceColumn: c.sourceColumn,
        details: c.errors && c.errors.length ? c.errors.map((e) => e.code) : undefined,
      }));
    }
    for (const w of mapping.warnings || []) {
      issues.push(issue('mapping', w.code, 'warning', false, w.message, { targetField: w.targetField || null }));
    }
  }

  const validation = job.validation;
  if (validation) {
    for (const e of validation.errors) issues.push(issue('schema', e.code, 'error', true, e.message));

    const sourceOf = new Map((mapping ? mapping.columns : []).filter((c) => c.status === 'mapped').map((c) => [c.targetField, c.sourceColumn]));
    const notesByRow = new Map();
    for (const n of job.canonicalizationIssues || []) {
      if (!notesByRow.has(n.rowNumber)) notesByRow.set(n.rowNumber, []);
      notesByRow.get(n.rowNumber).push(n);
    }
    for (const row of validation.rows) {
      for (const n of notesByRow.get(row.rowNumber) || []) {
        issues.push(issue('representation', n.code, 'info', false, n.message, { rowNumber: n.rowNumber, sourceColumn: n.sourceColumn, targetField: n.targetField }));
      }
      for (const e of row.errors) {
        const category = e.code === 'DUPLICATE_EMAIL' ? 'duplicate' : e.code === 'REQUIRED_FIELD_MISSING' ? 'missing_required' : 'invalid_field';
        issues.push(issue(category, e.code, 'error', true, e.message, {
          rowNumber: row.rowNumber,
          sourceColumn: e.field ? sourceOf.get(e.field) || null : null,
          targetField: e.field,
          details: e.relatedRows ? { relatedRows: e.relatedRows, relatedRowCount: e.relatedRowCount } : undefined,
        }));
      }
      for (const w of row.warnings) {
        issues.push(issue('row_warning', w.code, 'warning', false, w.message, { rowNumber: row.rowNumber, targetField: w.field }));
      }
    }
  }
  return issues;
}

/** Whether a job's current data allows approval (independent of its stored state). */
function assessReadiness(job) {
  const reasons = [];
  if (!job.mapping) reasons.push('NO_MAPPING');
  else if (job.mapping.columns.some(columnBlocks)) reasons.push('UNRESOLVED_COLUMNS');
  if (!job.validation) reasons.push('NOT_VALIDATED');
  else if (!job.validation.valid) reasons.push('VALIDATION_ERRORS');
  return { ready: reasons.length === 0, reasons };
}

function buildReview(job) {
  const issues = collectIssues(job);
  const columns = job.mapping
    ? job.mapping.columns.map((c) => ({ ...c, blocking: columnBlocks(c) })) // stored parts are frozen: shared, not copied
    : job.headers.map((h) => ({ sourceColumn: h, status: 'pending', targetField: null, candidateFields: null, confidence: null, reason: null, decidedBy: null, errors: [], blocking: true }));
  const count = (s) => columns.filter((c) => c.status === s).length;
  const blocking = issues.filter((i) => i.blocking).length;

  return {
    jobId: job.jobId,
    state: job.state,
    version: job.version,
    approvalReady: job.state === 'validated',
    approved: job.state === 'approved',
    file: job.file,
    summary: {
      columns: { total: columns.length, mapped: count('mapped'), suggested: count('suggested'), unmapped: count('unmapped'), ambiguous: count('ambiguous'), rejected: count('rejected'), pending: count('pending') },
      rows: job.validation
        ? { total: job.validation.summary.totalRows, valid: job.validation.summary.validRows, invalid: job.validation.summary.invalidRows }
        : { total: job.rows ? job.rows.length : 0, valid: null, invalid: null },
      blockingIssues: blocking,
      nonBlockingIssues: issues.length - blocking,
    },
    columns,
    issues,
    automaticMapping: job.mapping && job.mapping.llm ? job.mapping.llm : null,
    missingRequiredFields: missingRequired(job, columns),
    newFields: (job.mapping && job.mapping.newFields) || [], // AI ideas: suggested | approved (field exists) | rejected
    customFields: (job.mapping && job.mapping.customFields) || [], // fields approved (and existing) for this import
    decisions: job.mapping ? job.mapping.decisions : [],
    error: job.error || null,
    approval: job.approval || null,
  };
}

/** Required fields that no approved column fills and no pending AI suggestion would fill. */
function missingRequired(job, columns) {
  const required = (job.mapping && job.mapping.requiredFields) || [];
  const covered = new Set();
  for (const c of columns) {
    if (c.status === 'mapped') covered.add(c.targetField);
    if (c.status === 'suggested') for (const f of c.candidateFields || []) covered.add(f);
  }
  return required.filter((f) => !covered.has(f));
}

module.exports = { buildReview, assessReadiness, columnBlocks, collectIssues };
