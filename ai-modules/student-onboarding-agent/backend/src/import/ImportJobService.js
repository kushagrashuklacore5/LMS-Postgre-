const { randomUUID } = require('crypto');
const { ValidationError } = require('../errors');
const { ColumnMappingGuard } = require('../mapping/ColumnMappingGuard');
const { buildCanonicalRows } = require('../mapping/CanonicalRowBuilder');
const { StudentDataValidator } = require('../validation/StudentDataValidator');
const { buildReview, assessReadiness, columnBlocks } = require('./ImportReview');
const { samplesContradict } = require('../mapping/SampleShapeCheck');
const { loadMappingConfig } = require('../config');

/** The existing confidence rule (SOA_MAPPING_MIN_CONFIDENCE, default 0.7): below it an AI mapping is never applied. */
const DEFAULT_MIN_LLM_CONFIDENCE = loadMappingConfig({}).minConfidence;
const { isCustomTarget, customTarget } = require('../customFields/CustomFieldRules');
const { applyCustomValues } = require('../customFields/customImportValues');
const { jobNotFound, deepFreeze } = require('./ImportJobStore');

const DECISION_ACTIONS = ['map', 'unmap', 'unresolve'];
const DECISION_KEYS = ['sourceColumn', 'action', 'targetField'];
const HUMAN_CONFIDENCE = 1; // the contract requires a confidence on mapped entries; for humans it carries no meaning

/**
 * Step 7: the import review and approval boundary. The only way to change an
 * import job. Service-level only (no HTTP routes; see import/README.md).
 *
 *   startJob(buffer, { fileName })             parse -> LLM mapping -> guard -> canonical rows -> validation
 *   getReview(jobId)                           deterministic review of the current state
 *   applyMappingDecision(jobId, { decisions }) human decisions, checked by the same ColumnMappingGuard
 *   runFinalValidation(jobId)                  rebuild canonical rows from the raw rows + validate again
 *   approveNewField(jobId, { sourceColumn, field })  admin approved an AI new-field idea AND the field exists
 *                                              (created by the caller in the LMS DB); maps the column to it
 *   rejectNewField(jobId, { sourceColumn })    admin rejected it: nothing is created; the column is not imported
 *   approveImport(jobId)                       only when approval-ready; freezes the job for good
 *   getApprovedImport(jobId)                   frozen canonical data for Step 8
 *
 * Jobs are read-only values (see ImportJobStore): every change builds a new
 * job object and saves it; nothing loaded is modified in place, and large
 * parts (raw rows) are shared between versions rather than copied.
 *
 * Trust boundary: Excel values, LLM output and human decisions are all
 * untrusted. Callers cannot supply state, canonical rows, validation results
 * or approval flags; the server derives them. Nothing here touches the LMS or
 * a database, creates students, sends email, or logs anything.
 */
class ImportJobService {
  constructor({ schema, store, importService, mappingService, idGenerator = randomUUID, now = () => Date.now(), minLlmConfidence = DEFAULT_MIN_LLM_CONFIDENCE }) {
    if (!schema || !Array.isArray(schema.fields)) throw new TypeError('ImportJobService requires a compiled schema.');
    if (typeof minLlmConfidence !== 'number' || !(minLlmConfidence >= 0 && minLlmConfidence <= 1)) throw new TypeError('minLlmConfidence must be a number between 0 and 1.');
    this.minLlmConfidence = minLlmConfidence;
    for (const [name, dep, method] of [['store', store, 'update'], ['importService', importService, 'parse'], ['mappingService', mappingService, 'mapImport']]) {
      if (!dep || typeof dep[method] !== 'function') throw new TypeError(`ImportJobService requires ${name}.${method}().`);
    }
    this.schema = schema;
    this.store = store;
    this.importService = importService;
    this.mappingService = mappingService;
    this.idGenerator = idGenerator;
    this.now = now;
    this.guard = new ColumnMappingGuard(schema);
    this.validator = new StudentDataValidator(schema);
  }

  /** Creates a job from an uploaded .xlsx buffer and runs it up to review. */
  /**
   * existingCustomFields: this school's ACTIVE custom fields [{ id, key, label, dataType }] loaded by the
   * server for the verified admin's school (never client input). Offered to the mapper and to the admin.
   */
  async startJob(buffer, { fileName, existingCustomFields = [] } = {}) {
    const existing = readExistingFields(existingCustomFields);
    let job = await this.store.create({
      jobId: this.idGenerator(),
      state: 'received',
      file: { name: null },
      parseWarnings: [],
      headers: [],
      rows: [],
      mapping: null,
      canonicalizationIssues: [],
      validation: null,
      approval: null,
      error: null,
    });

    let parsed;
    try {
      parsed = await this.importService.parse(buffer, { fileName });
    } catch (err) {
      const error = err instanceof ValidationError
        ? { code: err.code, message: err.message, details: err.details }
        : { code: 'PARSE_FAILED', message: 'The file could not be processed.', details: [] };
      return buildReview(await this.save({ ...job, state: 'failed', error }));
    }

    job = await this.save({
      ...job,
      state: 'parsed',
      file: {
        name: parsed.fileName,
        sheetName: parsed.sheetName,
        sheetNames: parsed.sheetNames,
        headerRowNumber: parsed.headerRowNumber,
        rowCount: parsed.rowCount,
        columnCount: parsed.columnCount,
        skippedBlankRows: parsed.skippedBlankRows,
      },
      parseWarnings: parsed.warnings,
      headers: parsed.headers,
      rows: parsed.rows, // raw parsed rows: frozen by the store, never modified, shared by later versions
    });

    const automatic = await this.mappingService.mapImport({ headers: job.headers, rows: job.rows, customFields: existing });
    const mapping = mappingFromAutomaticResult(automatic, job.headers, this.minLlmConfidence, this.schema, existing);
    job = await this.save({ ...job, state: 'mapped', mapping: { ...mapping, customFields: existing } });

    return buildReview(await this.save(this.evaluate(job)));
  }

  async getReview(jobId) {
    return buildReview(await this.load(jobId));
  }

  /** The job's current state only (cheap; used by the Step 8 execution boundary). */
  async getJobState(jobId) {
    return (await this.load(jobId)).state;
  }

  /**
   * decision: { decisions: [{ sourceColumn, action: 'map'|'unmap'|'unresolve', targetField? }] }
   * Columns not listed keep their current state ("leave unresolved" = do not list it,
   * or use 'unresolve' to set it back to undecided).
   * The whole decision is refused, and the job left unchanged, if the guard
   * rejects any decided column.
   */
  async applyMappingDecision(jobId, decision, options) {
    const { expectedVersion } = readOptions(options);
    let job = await this.load(jobId, { expectedVersion });
    this.assertEditable(job);
    const decisions = readDecision(decision);

    const headerSet = new Set(job.headers);
    const byHeader = new Map(); // header -> its decisions
    const strays = []; // decisions naming something that is not a header
    for (const d of decisions) {
      if (typeof d.sourceColumn === 'string' && headerSet.has(d.sourceColumn)) {
        if (!byHeader.has(d.sourceColumn)) byHeader.set(d.sourceColumn, []);
        byHeader.get(d.sourceColumn).push(d);
      } else {
        strays.push(d);
      }
    }

    // The full mapping (current state + decisions) goes to the guard, so a
    // decision is judged together with every other column.
    const entries = [];
    const decidedIndexes = new Set();
    for (const column of job.mapping.columns) {
      const own = byHeader.get(column.sourceColumn);
      if (!own) {
        entries.push(currentEntry(column));
        continue;
      }
      for (const d of own) {
        decidedIndexes.add(entries.length);
        entries.push(toContractEntry(d));
      }
    }
    for (const d of strays) { // still sent to the guard, which rejects them
      decidedIndexes.add(entries.length);
      entries.push(toContractEntry(d));
    }

    const guard = this.guard.validate({ mappings: entries }, { headers: job.headers, customTargets: customTargetsOf(job) });
    const refused = guard.columns.filter((c) => decidedIndexes.has(c.index) && c.status === 'rejected');
    if (!guard.structurallyValid || refused.length > 0) {
      throw new ValidationError('The mapping decision was rejected by the mapping rules; nothing was changed.', [
        ...guard.errors.map((e) => ({ sourceColumn: e.sourceColumn || null, code: e.code, message: e.message })),
        ...refused.flatMap((c) => c.errors.map((e) => ({ sourceColumn: c.sourceColumn, code: e.code, message: e.message }))),
      ], { code: 'MAPPING_DECISION_REJECTED' });
    }

    const guardByHeader = new Map(guard.columns.map((c) => [c.sourceColumn, c]));
    const columns = job.mapping.columns.map((column) => {
      if (!byHeader.has(column.sourceColumn)) return column; // unchanged record, shared
      const g = guardByHeader.get(column.sourceColumn);
      return {
        sourceColumn: column.sourceColumn,
        status: g.status,
        targetField: g.targetField,
        candidateFields: null,
        confidence: null,
        reason: null,
        decidedBy: 'human',
        errors: [],
      };
    });
    const logged = decisions.map((d, i) => ({
      sequence: job.mapping.decisions.length + i + 1,
      sourceColumn: d.sourceColumn,
      action: d.action,
      targetField: d.action === 'map' ? d.targetField : null,
    }));

    job = await this.save({
      ...job,
      state: 'mapped',
      mapping: { ...job.mapping, columns, warnings: guard.warnings, decisions: [...job.mapping.decisions, ...logged] },
    });
    return buildReview(await this.save(this.evaluate(job)));
  }

  /** Rebuilds canonical rows from the raw parsed rows and validates them again. */
  async runFinalValidation(jobId, options) {
    const { expectedVersion } = readOptions(options);
    let job = await this.load(jobId, { expectedVersion });
    this.assertEditable(job);
    if (job.state !== 'mapped') job = await this.save({ ...job, state: 'mapped' });
    return buildReview(await this.save(this.evaluate(job)));
  }

  /**
   * The admin approved an AI new-field idea. `field` ({ id, key, label, dataType }) is the field that NOW
   * EXISTS in the LMS database (the caller created or found it, server-side, for this school) - never
   * client or AI input. The column is mapped to it (a human decision) and the job re-validated.
   * Called only after the field exists, so the job can never say "approved" for a field that is not there.
   */
  async approveNewField(jobId, { sourceColumn, field } = {}, options) {
    const { expectedVersion } = readOptions(options);
    let job = await this.load(jobId, { expectedVersion });
    this.assertEditable(job);
    const idea = typeof sourceColumn === 'string' ? (job.mapping.newFields || []).find((f) => f.sourceColumn === sourceColumn) : null;
    if (idea && idea.status === 'approved') throw new ValidationError('This new field has already been approved.', [], { code: 'NEW_FIELD_ALREADY_APPROVED', statusCode: 409 });
    if (!field || !Number.isInteger(field.id) || typeof field.key !== 'string') throw new TypeError('approveNewField needs the created field.');
    const target = customTarget(field.key);
    const customFields = [...(job.mapping.customFields || []).filter((f) => f.key !== field.key),
      { id: field.id, key: field.key, label: field.label, dataType: field.dataType, source: 'new' }];
    // Same check as any decision: the full mapping with this column -> custom field goes through the guard.
    const entries = job.mapping.columns.map((c) => (c.sourceColumn === sourceColumn
      ? { sourceColumn, status: 'mapped', targetField: target, confidence: HUMAN_CONFIDENCE } : currentEntry(c)));
    const guard = this.guard.validate({ mappings: entries }, { headers: job.headers, customTargets: customFields.map((f) => customTarget(f.key)) });
    const refused = guard.columns.filter((c) => c.sourceColumn === sourceColumn && c.status === 'rejected');
    if (!guard.structurallyValid || refused.length > 0) {
      throw new ValidationError('The new field cannot be used for this column; nothing was changed.',
        refused.flatMap((c) => c.errors.map((e) => ({ sourceColumn, code: e.code, message: e.message }))), { code: 'MAPPING_DECISION_REJECTED' });
    }
    const columns = job.mapping.columns.map((c) => (c.sourceColumn !== sourceColumn ? c : {
      sourceColumn, status: 'mapped', targetField: target, candidateFields: null, confidence: null, reason: null, decidedBy: 'human', errors: [],
    }));
    let newFields = job.mapping.newFields || [];
    if (idea) {
      newFields = newFields.map((f) => (f !== idea ? f : { ...f, status: 'approved', key: field.key, label: field.label, dataType: field.dataType, fieldId: field.id }));
    } else {
      newFields = [...newFields, { sourceColumn, key: field.key, label: field.label, dataType: field.dataType, fieldId: field.id, status: 'approved' }];
    }
    const decisions = [...job.mapping.decisions, { sequence: job.mapping.decisions.length + 1, sourceColumn, action: 'approve_new_field', targetField: target }];
    job = await this.save({ ...job, state: 'mapped', mapping: { ...job.mapping, columns, newFields, customFields, warnings: guard.warnings, decisions } });
    return buildReview(await this.save(this.evaluate(job)));
  }

  /** The admin rejected an AI new-field idea: nothing is created; the column is confirmed as not imported. */
  async rejectNewField(jobId, { sourceColumn } = {}, options) {
    const { expectedVersion } = readOptions(options);
    let job = await this.load(jobId, { expectedVersion });
    this.assertEditable(job);
    const idea = typeof sourceColumn === 'string' ? (job.mapping.newFields || []).find((f) => f.sourceColumn === sourceColumn) : null;
    const columns = job.mapping.columns.map((c) => (c.sourceColumn !== sourceColumn ? c : {
      sourceColumn, status: 'unmapped', targetField: null, candidateFields: null, confidence: null, reason: null, decidedBy: 'human', errors: [],
    }));
    let newFields = job.mapping.newFields || [];
    if (idea) {
      newFields = newFields.map((f) => (f !== idea ? f : { ...f, status: 'rejected' }));
    } else {
      newFields = [...newFields, { sourceColumn, status: 'rejected' }];
    }
    const decisions = [...job.mapping.decisions, { sequence: job.mapping.decisions.length + 1, sourceColumn, action: 'reject_new_field', targetField: null }];
    job = await this.save({ ...job, state: 'mapped', mapping: { ...job.mapping, columns, newFields, decisions } });
    return buildReview(await this.save(this.evaluate(job)));
  }

  /** The AI's new-field idea for a column (for the caller to validate + create the field). */
  async getNewFieldIdea(jobId, sourceColumn) {
    const job = await this.load(jobId);
    this.assertEditable(job);
    const idea = findIdea(job, sourceColumn);
    return { sourceColumn: idea.sourceColumn, key: idea.key, label: idea.label, dataType: idea.dataType, status: idea.status };
  }

  async approveImport(jobId, options) {
    const { expectedVersion } = readOptions(options);
    const job = await this.load(jobId, { expectedVersion });
    if (job.state === 'approved') throw immutable();
    if (!['validated', 'needs_review', 'mapped'].includes(job.state)) {
      throw new ValidationError(`An import in state "${job.state}" cannot be approved.`, [], { code: 'INVALID_JOB_STATE', statusCode: 409 });
    }

    // Re-check everything from the stored data instead of trusting the state alone.
    const structure = this.guard.validate({ mappings: job.mapping.columns.map(currentEntry) }, { headers: job.headers, customTargets: customTargetsOf(job) });
    const readiness = assessReadiness(job);
    const review = buildReview(job);
    const blocking = review.issues.filter((i) => i.blocking);
    if (job.state !== 'validated' || !structure.valid || !readiness.ready || blocking.length > 0) {
      throw new ValidationError('The import is not ready for approval.', [
        ...(job.state !== 'validated' ? [`STATE_${job.state.toUpperCase()}`] : []),
        ...readiness.reasons,
        ...(structure.valid ? [] : ['MAPPING_INVALID']),
        ...summarizeCodes(blocking),
      ], { code: 'APPROVAL_BLOCKED', statusCode: 409 });
    }

    const mapping = acceptedMapping(job);
    const approved = await this.save({
      ...job,
      state: 'approved',
      approval: {
        approvedAt: new Date(this.now()).toISOString(),
        schemaVersion: this.schema.version,
        mapping,
        rowCount: job.validation.summary.totalRows,
      },
    });
    return {
      jobId: approved.jobId,
      state: approved.state,
      approvedAt: approved.approval.approvedAt,
      file: { name: approved.file.name, sheetName: approved.file.sheetName },
      rowCount: approved.approval.rowCount,
      mapping,
      warningCount: review.issues.filter((i) => i.severity === 'warning').length,
    };
  }

  /** The frozen, validated canonical data of an approved job: the input for Step 8. */
  async getApprovedImport(jobId) {
    const job = await this.load(jobId);
    if (job.state !== 'approved') {
      throw new ValidationError('Only an approved import can be read for onboarding.', [], { code: 'INVALID_JOB_STATE', statusCode: 409 });
    }
    return deepFreeze({
      jobId: job.jobId,
      approvedAt: job.approval.approvedAt,
      schemaVersion: job.approval.schemaVersion,
      file: { name: job.file.name, sheetName: job.file.sheetName },
      mapping: job.approval.mapping,
      rows: job.validation.rows.map((r) => ({ rowNumber: r.rowNumber, data: r.data, custom: r.custom || EMPTY })), // frozen stored objects
      customFields: (job.mapping.customFields || []).map((f) => ({ key: f.key, label: f.label, dataType: f.dataType })),
    });
  }

  // ---- internals ----

  /** New job with canonical rows rebuilt from the raw rows, validated, and the resulting state. */
  evaluate(job) {
    const accepted = acceptedMapping(job);
    const built = buildCanonicalRows(job.rows, accepted.filter((m) => !isCustomTarget(m.targetField)), this.schema);
    let validation = this.validator.validate(built.rows);
    const custom = accepted.filter((m) => isCustomTarget(m.targetField));
    if (custom.length > 0) validation = applyCustomValues(validation, job.rows, custom, job.mapping.customFields || []);
    const next = { ...job, canonicalizationIssues: built.issues, validation };
    next.state = assessReadiness(next).ready ? 'validated' : 'needs_review';
    return next;
  }

  async load(jobId, { expectedVersion } = {}) {
    const job = await this.store.get(jobId);
    if (!job) throw jobNotFound();
    if (expectedVersion !== undefined && expectedVersion !== job.version) {
      throw new ValidationError('The import job was changed by another request. Reload it and try again.', [], { code: 'JOB_CONFLICT', statusCode: 409 });
    }
    return job;
  }

  save(job) {
    return this.store.update(job.jobId, job, { expectedVersion: job.version });
  }

  assertEditable(job) {
    if (job.state === 'approved') throw immutable();
    if (!['mapped', 'needs_review', 'validated'].includes(job.state)) {
      throw new ValidationError(`This import cannot be changed in state "${job.state}".`, [], { code: 'INVALID_JOB_STATE', statusCode: 409 });
    }
  }
}

/**
 * One column record per header from the automatic mapping result.
 *
 * AUTOMATIC MAPPING (the same "mapped" state a human decision produces, so it takes the one existing
 * application path: acceptedMapping -> canonical rows -> validation -> import approval -> executor):
 *   - an exact header match (deterministic rule, no AI): decidedBy "rule";
 *   - an AI mapping ONLY when ALL hold: the proposal is structurally valid; ColumnMappingGuard accepted
 *     this column (known, non-system, non-duplicate target; valid confidence; no unsafe text); its
 *     confidence >= minConfidence (SOA_MAPPING_MIN_CONFIDENCE); and SampleShapeCheck finds no
 *     contradiction with the masked samples: decidedBy "llm" (AUTO MAPPED).
 * Everything else NEEDS ACTION and is never applied: low confidence or sample mismatch -> "ambiguous"
 * (the field is only a candidate), guard-rejected -> "rejected", AI-unmapped -> "unmapped" (an admin
 * confirms it), AI unavailable/invalid -> every column "pending". Targets can only be built-in fields or
 * this school's existing ACTIVE custom fields (given to the guard by the server); a NEW field is never
 * created here - new-field ideas stay "suggested" until the existing admin approval.
 */
function mappingFromAutomaticResult(result, headers, minConfidence = DEFAULT_MIN_LLM_CONFIDENCE, schema = null, existingCustomFields = []) {
  const fieldByName = new Map(schema ? schema.fields.map((f) => [f.name, f]) : []);
  // Existing custom fields are checked against the samples by their type, like built-in fields.
  for (const f of existingCustomFields) fieldByName.set(`custom:${f.key}`, { name: `custom:${f.key}`, type: f.dataType });
  const samplesOf = new Map(((result.sentToLlm && result.sentToLlm.columns) || []).map((c) => [c.sourceColumn, c.samples]));
  const byRule = result.provider === 'exact-header-match';
  const requiredFields = schema ? schema.fields.filter((f) => f.required).map((f) => f.name) : [];
  const headerSet = new Set(headers);
  const llm = {
    provider: result.provider,
    status: result.guard && result.guard.structurallyValid ? 'proposed' : 'unavailable',
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
    proposalErrors: result.guard
      ? [
          ...result.guard.errors.map((e) => ({ code: e.code, message: e.message })),
          // entries naming columns that are not in the workbook: rejected by the guard, recorded here
          ...result.guard.columns
            .filter((c) => !headerSet.has(c.sourceColumn))
            .flatMap((c) => c.errors.map((e) => ({ code: e.code, message: e.message }))),
        ]
      : [],
    sentToLlm: result.sentToLlm, // masked samples only, kept for audit
    // Ideas for fields the LMS does not have (checked by ProposalSafety). Display-only: nothing is created.
    suggestedNewFields: result.guard && result.guard.structurallyValid ? result.guard.suggestedNewFields || [] : [],
  };
  if (llm.status !== 'proposed') {
    return {
      llm,
      columns: headers.map((h) => ({ sourceColumn: h, status: 'pending', targetField: null, candidateFields: null, confidence: null, reason: null, decidedBy: null, errors: [] })),
      warnings: [],
      decisions: [],
      requiredFields,
      newFields: [],
      customFields: [],
    };
  }
  const entriesByHeader = new Map();
  for (const c of result.guard.columns) {
    if (!entriesByHeader.has(c.sourceColumn)) entriesByHeader.set(c.sourceColumn, []);
    entriesByHeader.get(c.sourceColumn).push(c);
  }
  const columns = headers.map((h) => {
    const entries = entriesByHeader.get(h); // structurally valid => every header has >= 1 entry
    const c = entries[0];
    const errors = entries.flatMap((e) => e.errors.map((x) => ({ code: x.code, message: x.message })));
    const lowConfidence = c.status === 'mapped' && typeof c.confidence === 'number' && c.confidence < minConfidence;
    if (lowConfidence) {
      errors.push({ code: 'LOW_CONFIDENCE_MAPPING', message: 'The suggested mapping is uncertain; confirm or change it.' });
    }
    const mismatch = c.status === 'mapped' && !byRule && !lowConfidence && samplesContradict(fieldByName.get(c.targetField), samplesOf.get(h));
    if (mismatch) {
      errors.push({ code: 'SAMPLE_MISMATCH', message: 'The sample values do not look like this field; choose the field yourself.' });
    }
    const noConfidence = c.status === 'mapped' && !byRule && typeof c.confidence !== 'number'; // the guard already rejects this; never auto-apply it
    // AUTO MAPPED: exact rule, or a guard-accepted AI mapping with enough confidence and consistent samples.
    const accepted = c.status === 'mapped' && (byRule || (!lowConfidence && !mismatch && !noConfidence));
    const status = c.status !== 'mapped' ? c.status // unmapped / ambiguous / 'rejected' for all entries of a duplicated header
      : accepted ? 'mapped'
        : 'ambiguous'; // NEEDS ACTION: the AI's field is only a candidate
    return {
      sourceColumn: h,
      status,
      targetField: accepted ? c.targetField : null,
      candidateFields: c.status === 'mapped' && !accepted ? [c.targetField] : c.candidateFields, // a held-back AI field is only a candidate
      confidence: c.confidence,
      reason: c.reason, // model text: display only, never used for decisions
      decidedBy: byRule ? 'rule' : 'llm', // rule = exact header match (no LLM)
      errors,
    };
  });
  // AI new-field ideas: status "suggested" until an admin approves (field created) or rejects (nothing created).
  const newFields = (llm.suggestedNewFields || []).map((f) => ({
    sourceColumn: f.sourceColumn, key: f.name, label: f.label, dataType: f.dataType || 'text', confidence: f.confidence ?? null,
    reason: f.reason, status: 'suggested', fieldId: null,
  }));
  return { llm, columns, warnings: result.guard.warnings, decisions: [], requiredFields, newFields, customFields: [] };
}

/** A column's current state as a contract entry, so the guard re-checks the full mapping. */
function currentEntry(column) {
  if (column.status === 'mapped') {
    return { sourceColumn: column.sourceColumn, status: 'mapped', targetField: column.targetField, confidence: column.confidence ?? HUMAN_CONFIDENCE };
  }
  if (column.status === 'unmapped') return { sourceColumn: column.sourceColumn, status: 'unmapped' };
  return { sourceColumn: column.sourceColumn, status: 'ambiguous' }; // ambiguous, rejected, pending: undecided
}

function toContractEntry(d) {
  if (d.action === 'map') return { sourceColumn: d.sourceColumn, status: 'mapped', targetField: d.targetField, confidence: HUMAN_CONFIDENCE };
  if (d.action === 'unmap') return { sourceColumn: d.sourceColumn, status: 'unmapped' };
  return { sourceColumn: d.sourceColumn, status: 'ambiguous' };
}

const EMPTY = Object.freeze({});

/** Server-loaded existing custom fields, shape-checked (defence in depth; the store already validated them). */
function readExistingFields(list) {
  if (!Array.isArray(list)) throw new TypeError('existingCustomFields must be an array.');
  const { KEY_PATTERN, DATA_TYPES } = require('../customFields/CustomFieldRules');
  return list.map((f) => {
    if (!f || !Number.isInteger(f.id) || !KEY_PATTERN.test(f.key) || !DATA_TYPES.includes(f.dataType) || typeof f.label !== 'string') {
      throw new TypeError('existingCustomFields entries must be { id, key, label, dataType }.');
    }
    return { id: f.id, key: f.key, label: f.label, dataType: f.dataType, source: 'existing' };
  });
}

/** "custom:<key>" targets of the custom fields an admin approved for this job. */
function customTargetsOf(job) {
  return ((job.mapping && job.mapping.customFields) || []).map((f) => customTarget(f.key));
}

/** The pending/rejected new-field idea of a column, or a 404-style error. */
function findIdea(job, sourceColumn) {
  const idea = typeof sourceColumn === 'string' ? (job.mapping.newFields || []).find((f) => f.sourceColumn === sourceColumn) : null;
  if (!idea) throw new ValidationError('There is no new-field suggestion for this column.', [], { code: 'NEW_FIELD_NOT_FOUND', statusCode: 404 });
  if (idea.status === 'approved') throw new ValidationError('This new field has already been approved.', [], { code: 'NEW_FIELD_ALREADY_APPROVED', statusCode: 409 });
  return idea;
}

function acceptedMapping(job) {
  return job.mapping.columns.filter((c) => c.status === 'mapped').map((c) => ({ sourceColumn: c.sourceColumn, targetField: c.targetField }));
}

/** Strict shape check of untrusted human input; values are judged by the guard. */
function readDecision(decision) {
  const invalid = (msg) => new ValidationError(msg, [], { code: 'INVALID_MAPPING_DECISION' });
  if (!isPlainObject(decision)) throw invalid('A mapping decision must be an object: { decisions: [...] }.');
  const extra = Object.keys(decision).filter((k) => k !== 'decisions');
  if (extra.length > 0) throw invalid(`Unexpected field(s) in the decision: ${extra.join(', ')}. Only "decisions" is accepted.`);
  if (!Array.isArray(decision.decisions) || decision.decisions.length === 0) throw invalid('"decisions" must be a non-empty array.');
  return decision.decisions.map((d, i) => {
    if (!isPlainObject(d)) throw invalid(`decisions[${i}] must be an object.`);
    const unknown = Object.keys(d).filter((k) => !DECISION_KEYS.includes(k));
    if (unknown.length > 0) throw invalid(`decisions[${i}] has unexpected field(s): ${unknown.join(', ')}. Allowed: ${DECISION_KEYS.join(', ')}.`);
    if (!DECISION_ACTIONS.includes(d.action)) throw invalid(`decisions[${i}].action must be one of ${DECISION_ACTIONS.join(', ')}.`);
    if (d.action !== 'map' && d.targetField !== undefined) throw invalid(`decisions[${i}]: targetField is only allowed with action "map".`);
    return { sourceColumn: d.sourceColumn, action: d.action, targetField: d.targetField };
  });
}

/** Only { expectedVersion } is accepted; anything else (state, rows, approval flags) is refused. */
function readOptions(options) {
  if (options === undefined) return {};
  if (!isPlainObject(options)) throw new ValidationError('Options must be an object.', [], { code: 'INVALID_REQUEST' });
  const extra = Object.keys(options).filter((k) => k !== 'expectedVersion');
  if (extra.length > 0) {
    throw new ValidationError(`Unexpected option(s): ${extra.join(', ')}. The server owns job state and data.`, [], { code: 'INVALID_REQUEST' });
  }
  if (options.expectedVersion !== undefined && !Number.isInteger(options.expectedVersion)) {
    throw new ValidationError('expectedVersion must be an integer.', [], { code: 'INVALID_REQUEST' });
  }
  return { expectedVersion: options.expectedVersion };
}

function summarizeCodes(issues) {
  const counts = new Map();
  for (const i of issues) counts.set(i.code, (counts.get(i.code) || 0) + 1);
  return [...counts].map(([code, n]) => `${code} x${n}`);
}

function immutable() {
  return new ValidationError('This import has been approved and can no longer be changed.', [], { code: 'JOB_APPROVED_IMMUTABLE', statusCode: 409 });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

module.exports = { ImportJobService, columnBlocks };
