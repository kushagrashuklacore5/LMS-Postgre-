const { ValidationError } = require('../errors');
const { StudentDataValidator } = require('../validation/StudentDataValidator');
const { createLmsFacade } = require('../adapters/lms/LmsAdapter');
const { ToolExecutor } = require('../tools/ToolExecutor');
const { createOnboardingToolRegistry } = require('../tools/onboarding');

/**
 * Executions per job (standalone, in memory). Replaceable by a persistent
 * store with the same methods. A real deployment needs a durable, atomic
 * version (see execution/README.md).
 */
class InMemoryExecutionStore {
  constructor() {
    this.records = new Map(); // jobId -> { status: 'running' | 'interrupted' | 'completed', result }
  }
  get(jobId) {
    return this.records.get(jobId) || null;
  }
  set(jobId, record) {
    this.records.set(jobId, Object.freeze(record));
  }
  delete(jobId) {
    this.records.delete(jobId);
  }
}

/**
 * Step 8: the approved-import execution boundary.
 *
 *   executeApprovedImport(jobId)
 *     job exists + state 'approved' (from the job store, never from the caller)
 *     -> approved data still frozen -> still passes StudentDataValidator
 *     -> per row: createStudent, then assignStudentToClassroom (when className + section)
 *        through ToolExecutor (lookup, access, argument validation) -> LMS adapter facade
 *
 * Callers pass a jobId and nothing else: no rows, no status, no approval flag.
 * Idempotency (standalone boundary):
 *   - a second call while one runs          -> EXECUTION_IN_PROGRESS
 *   - a call after completion                -> the stored result, repeated: true (nothing re-created)
 *   - a call after an interrupted run        -> resumes; the adapter's idempotency keys
 *                                               (jobId:rowNumber:tool) prevent duplicates
 * The result holds statuses, codes and opaque LMS refs: no names, emails or other PII.
 */
class ApprovedImportExecutor {
  constructor({ schema, jobService, toolExecutor, lmsAdapter, executionStore = new InMemoryExecutionStore() }) {
    if (!schema || !Array.isArray(schema.fields)) throw new TypeError('ApprovedImportExecutor requires a compiled schema.');
    for (const m of ['getJobState', 'getApprovedImport']) {
      if (!jobService || typeof jobService[m] !== 'function') throw new TypeError(`ApprovedImportExecutor requires jobService.${m}().`);
    }
    if (!(toolExecutor instanceof ToolExecutor)) throw new TypeError('ApprovedImportExecutor requires a ToolExecutor.');
    this.schema = schema;
    this.jobService = jobService;
    this.toolExecutor = toolExecutor;
    this.lms = createLmsFacade(lmsAdapter); // tools only ever see this narrow facade
    this.store = executionStore;
    this.validator = new StudentDataValidator(schema);
    this.creationFields = schema.fields.filter((f) => !f.classroomAssignment).map((f) => f.name);
  }

  async executeApprovedImport(jobId, options) {
    if (options !== undefined && !(isPlainObject(options) && Object.keys(options).length === 0)) {
      throw new ValidationError('executeApprovedImport accepts only a jobId. Approval state and data come from the server.', [], { code: 'INVALID_REQUEST' });
    }
    if (typeof jobId !== 'string' || jobId === '') {
      throw new ValidationError('Import job not found.', [], { code: 'JOB_NOT_FOUND', statusCode: 404 });
    }

    const state = await this.jobService.getJobState(jobId); // JOB_NOT_FOUND if missing
    if (state !== 'approved') {
      throw new ValidationError('Only an approved import can be executed.', [`STATE_${state.toUpperCase()}`], { code: 'IMPORT_NOT_APPROVED', statusCode: 409 });
    }

    // Check-and-claim without an await in between, so two concurrent calls cannot both start.
    const existing = this.store.get(jobId);
    if (existing && existing.status === 'running') {
      throw new ValidationError('This import is already being executed.', [], { code: 'EXECUTION_IN_PROGRESS', statusCode: 409 });
    }
    if (existing && existing.status === 'completed') {
      return { ...existing.result, repeated: true };
    }
    this.store.set(jobId, { status: 'running', result: null });

    let approved;
    try {
      approved = await this.jobService.getApprovedImport(jobId);
      this.assertIntact(approved);
    } catch (err) {
      this.store.delete(jobId); // nothing ran; release the claim
      throw err;
    }

    try {
      const rowIndex = new Map(approved.rows.map((r) => [r.rowNumber, r.data]));
      const customIndex = new Map(approved.rows.map((r) => [r.rowNumber, r.custom || null]));
      const context = Object.freeze({
        jobId,
        approvedRow: (rowNumber) => rowIndex.get(rowNumber) || null, // one row at a time, frozen
        approvedCustom: (rowNumber) => customIndex.get(rowNumber) || null, // admin-approved custom field values
        idempotencyKey: (tool, rowNumber) => `${jobId}:${rowNumber}:${tool}`,
        lms: this.lms,
      });

      const rows = [];
      for (const row of approved.rows) rows.push(Object.freeze(await this.executeRow(row, context)));

      const result = Object.freeze({
        jobId,
        status: rows.some((r) => r.needsAttention) ? 'completed_with_issues' : 'completed',
        totals: Object.freeze(totals(rows)),
        rows: Object.freeze(rows),
        repeated: false,
      });
      this.store.set(jobId, { status: 'completed', result });
      return result;
    } catch (err) {
      this.store.set(jobId, { status: 'interrupted', result: null });
      throw new ValidationError('Execution was interrupted; it can be resumed safely.', [], { code: 'EXECUTION_INTERRUPTED', statusCode: 500 });
    }
  }

  /** The stored execution result of a job, or null. */
  getExecution(jobId) {
    const record = this.store.get(jobId);
    return record ? { status: record.status, result: record.result } : null;
  }

  assertIntact(approved) {
    const frozen = Object.isFrozen(approved) && Object.isFrozen(approved.rows) && approved.rows.every((r) => Object.isFrozen(r) && Object.isFrozen(r.data));
    if (!frozen) {
      throw new ValidationError('The approved import is not immutable.', [], { code: 'IMMUTABLE_IMPORT_VIOLATION', statusCode: 409 });
    }
    const validation = this.validator.validate(approved.rows.map((r) => ({ rowNumber: r.rowNumber, values: r.data })));
    if (!validation.valid) {
      throw new ValidationError('The approved import no longer passes validation.', [], { code: 'APPROVED_IMPORT_INVALID', statusCode: 409 });
    }
  }

  async executeRow(row, context) {
    const out = { rowNumber: row.rowNumber, student: null, classroom: null, needsAttention: false };

    try {
      const student = {};
      for (const f of this.creationFields) student[f] = row.data[f];
      const custom = row.custom && Object.keys(row.custom).length ? { customFields: { ...row.custom } } : {};
      const r = await this.toolExecutor.run('createStudent', { rowNumber: row.rowNumber, student, ...custom }, context);
      out.student = { status: r.created ? 'created' : 'already_created', studentRef: r.studentRef, error: null };
    } catch (err) {
      out.student = { status: 'failed', studentRef: null, error: safeError(err) };
      out.classroom = { status: 'skipped_student_not_created', assignmentRef: null, error: null };
      out.needsAttention = true;
      return out;
    }

    const { email, className, section } = row.data;
    if (className === null && section === null) {
      out.classroom = { status: 'not_requested', assignmentRef: null, error: null };
    } else if (className === null || section === null) {
      out.classroom = { status: 'skipped_incomplete_classroom', assignmentRef: null, error: null };
      out.needsAttention = true;
    } else {
      try {
        const r = await this.toolExecutor.run('assignStudentToClassroom', { rowNumber: row.rowNumber, email, className, section }, context);
        out.classroom = { status: r.outcome, assignmentRef: r.assignmentRef, error: null };
        if (r.outcome !== 'assigned') out.needsAttention = true;
      } catch (err) {
        out.classroom = { status: 'failed', assignmentRef: null, error: safeError(err) };
        out.needsAttention = true;
      }
    }
    return out;
  }
}

/** Codes only: tool/validator messages can contain cell values, so they are not kept. */
function safeError(err) {
  const code = err && typeof err.code === 'string' ? err.code : 'TOOL_EXECUTION_FAILED';
  const reasons = err && Array.isArray(err.details)
    ? err.details.map((d) => (typeof d === 'string' ? d : d && d.code)).filter((c) => typeof c === 'string')
    : [];
  return { code, reasons };
}

function totals(rows) {
  const t = { rows: rows.length, created: 0, alreadyCreated: 0, failed: 0, assigned: 0, classroomNotFound: 0, classroomAmbiguous: 0, classroomSkipped: 0, classroomFailed: 0, needsAttention: 0 };
  for (const r of rows) {
    if (r.student.status === 'created') t.created++;
    else if (r.student.status === 'already_created') t.alreadyCreated++;
    else t.failed++;
    const c = r.classroom.status;
    if (c === 'assigned') t.assigned++;
    else if (c === 'classroom_not_found') t.classroomNotFound++;
    else if (c === 'classroom_ambiguous') t.classroomAmbiguous++;
    else if (c === 'failed') t.classroomFailed++;
    else if (c !== 'not_requested') t.classroomSkipped++;
    if (r.needsAttention) t.needsAttention++;
  }
  return t;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Wires the Step 8 pieces: create-only locked registry -> ToolExecutor -> executor. */
function createApprovedImportExecutor({ schema, jobService, lmsAdapter, executionStore }) {
  const registry = createOnboardingToolRegistry(schema);
  return new ApprovedImportExecutor({
    schema,
    jobService,
    lmsAdapter,
    executionStore,
    toolExecutor: new ToolExecutor({ registry, allowedAccess: ['create'] }),
  });
}

module.exports = { ApprovedImportExecutor, InMemoryExecutionStore, createApprovedImportExecutor };
