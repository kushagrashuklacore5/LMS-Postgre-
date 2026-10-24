const { ValidationError } = require('../errors');
const { JOB_STATES, assertTransition } = require('./importJobStates');

/**
 * Import job storage.
 *
 * Contract (what ImportJobService relies on; a persistent or queue-backed
 * store can replace this class by implementing the same async methods):
 *
 *   create(job)                              -> the stored job (version 1)
 *   get(jobId)                               -> the stored job, or null
 *   update(jobId, job, { expectedVersion })  -> the stored job (version + 1)
 *
 * Stored jobs are READ-ONLY values: callers build a new object for every
 * change (`{ ...job, state }`) and pass it to update(). This in-memory store
 * deep-freezes each job on write and hands out the frozen object itself, so:
 * - no caller can change a stored job through a returned reference (writes to
 *   frozen objects are ignored, or throw in strict mode);
 * - nothing is deep-copied: unchanged parts (e.g. the raw rows) are shared
 *   between versions and frozen only once.
 * Note: objects passed to create()/update() become frozen.
 *
 * Enforced by the store itself, not only by callers: update() rejects a stale
 * expectedVersion (JOB_CONFLICT), an invalid state transition
 * (INVALID_STATE_TRANSITION), and any change to an approved job
 * (JOB_APPROVED_IMMUTABLE).
 *
 * InMemoryImportJobStore is for standalone development: jobs live in process
 * memory, are lost on restart, expire after `ttlMs`, and at most `maxJobs`
 * are kept.
 */
class InMemoryImportJobStore {
  constructor({ maxJobs = 50, ttlMs = 2 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    if (!Number.isInteger(maxJobs) || maxJobs < 1) throw new TypeError('maxJobs must be a positive integer.');
    if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new TypeError('ttlMs must be a positive integer.');
    this.maxJobs = maxJobs;
    this.ttlMs = ttlMs;
    this.now = now;
    this.jobs = new Map(); // jobId -> { job, expiresAt }
  }

  async create(job) {
    this.purgeExpired();
    if (!job || typeof job.jobId !== 'string' || job.jobId === '') throw new TypeError('A job needs a string jobId.');
    if (!JOB_STATES.includes(job.state)) throw new TypeError(`Unknown job state "${job.state}".`);
    if (this.jobs.has(job.jobId)) throw new TypeError(`Job ${job.jobId} already exists.`);
    if (this.jobs.size >= this.maxJobs) {
      throw new ValidationError('Too many import jobs are open. Try again later.', [], { code: 'JOB_STORE_FULL', statusCode: 503 });
    }
    const timestamp = new Date(this.now()).toISOString();
    const stored = deepFreeze({ ...job, version: 1, createdAt: timestamp, updatedAt: timestamp });
    this.jobs.set(job.jobId, { job: stored, expiresAt: this.now() + this.ttlMs });
    return stored;
  }

  async get(jobId) {
    this.purgeExpired();
    const entry = typeof jobId === 'string' ? this.jobs.get(jobId) : undefined;
    return entry ? entry.job : null;
  }

  async update(jobId, job, { expectedVersion } = {}) {
    this.purgeExpired();
    const entry = typeof jobId === 'string' ? this.jobs.get(jobId) : undefined;
    if (!entry) throw jobNotFound();
    const current = entry.job;
    if (current.state === 'approved') {
      throw new ValidationError('This import has been approved and can no longer be changed.', [], {
        code: 'JOB_APPROVED_IMMUTABLE',
        statusCode: 409,
      });
    }
    if (expectedVersion !== current.version) {
      throw new ValidationError('The import job was changed by another request. Reload it and try again.', [], {
        code: 'JOB_CONFLICT',
        statusCode: 409,
      });
    }
    if (!job || job.jobId !== jobId) throw new TypeError('jobId cannot be changed.');
    if (job.state !== current.state) assertTransition(current.state, job.state);

    const stored = deepFreeze({
      ...job,
      version: current.version + 1,
      createdAt: current.createdAt,
      updatedAt: new Date(this.now()).toISOString(),
    });
    entry.job = stored;
    return stored;
  }

  purgeExpired() {
    const now = this.now();
    for (const [id, entry] of this.jobs) if (entry.expiresAt <= now) this.jobs.delete(id);
  }
}

// Objects this module has frozen together with everything below them.
const deeplyFrozen = new WeakSet();

/**
 * Freezes an object graph. Subtrees already deep-frozen here (shared with
 * older job versions) are skipped, so each object is visited once. A merely
 * shallow-frozen object from elsewhere is still walked.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || deeplyFrozen.has(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  deeplyFrozen.add(value);
  return value;
}

function jobNotFound() {
  return new ValidationError('Import job not found (it may have expired).', [], { code: 'JOB_NOT_FOUND', statusCode: 404 });
}

module.exports = { InMemoryImportJobStore, jobNotFound, deepFreeze };
