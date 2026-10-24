const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { InMemoryImportJobStore } = require('../src/import/ImportJobStore');
const { canTransition, TRANSITIONS, JOB_STATES } = require('../src/import/importJobStates');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };

const newJob = (jobId = 'job-1', extra = {}) => ({ jobId, state: 'received', rows: [{ rowNumber: 2, values: { A: 'x' } }], ...extra });

describe('state machine', () => {
  it('allows only the documented transitions', () => {
    const allowed = [];
    for (const from of JOB_STATES) for (const to of JOB_STATES) if (canTransition(from, to)) allowed.push(`${from}->${to}`);
    assert.deepEqual(allowed, [
      'received->parsed', 'received->failed', 'parsed->mapped', 'mapped->needs_review', 'mapped->validated',
      'needs_review->mapped', 'validated->mapped', 'validated->approved',
    ]);
    assert.deepEqual(TRANSITIONS.approved, []);
    assert.deepEqual(TRANSITIONS.failed, []);
    assert.equal(canTransition('received', 'approved'), false);
    assert.equal(canTransition('needs_review', 'approved'), false);
    assert.equal(canTransition('__proto__', 'x'), false);
  });
});

describe('InMemoryImportJobStore', () => {
  it('creates and retrieves a job as independent copies', async () => {
    const store = new InMemoryImportJobStore();
    const input = newJob();
    const created = await store.create(input);
    assert.equal(created.version, 1);
    input.rows[0].values.A = 'mutated input';
    created.rows[0].values.A = 'mutated output';
    const got = await store.get('job-1');
    assert.equal(got.rows[0].values.A, 'x', 'neither the input nor a returned object is shared with the store');
    got.state = 'approved';
    assert.equal((await store.get('job-1')).state, 'received');
  });

  it('returns null for a job that does not exist', async () => {
    const store = new InMemoryImportJobStore();
    assert.equal(await store.get('nope'), null);
    assert.equal(await store.get(undefined), null);
    await assert.rejects(store.update('nope', newJob('nope'), { expectedVersion: 1 }), { code: 'JOB_NOT_FOUND' });
  });

  it('applies valid transitions and bumps the version', async () => {
    const store = new InMemoryImportJobStore();
    let job = await store.create(newJob());
    job = await store.update('job-1', { ...job, state: 'parsed' }, { expectedVersion: 1 });
    assert.equal(job.version, 2);
    assert.equal(job.state, 'parsed');
  });

  it('hands out frozen jobs: writes through a returned reference change nothing', async () => {
    'use strict';
    const store = new InMemoryImportJobStore();
    const job = await store.create(newJob());
    assert.ok(Object.isFrozen(job) && Object.isFrozen(job.rows) && Object.isFrozen(job.rows[0].values));
    assert.throws(() => { job.state = 'approved'; }, TypeError);
    assert.throws(() => { job.rows[0].values.A = 'x2'; }, TypeError);
    assert.throws(() => { job.rows.push({}); }, TypeError);
    assert.equal((await store.get('job-1')).state, 'received');
  });

  it('shares unchanged parts between versions instead of copying them', async () => {
    const store = new InMemoryImportJobStore();
    const v1 = await store.create(newJob());
    const v2 = await store.update('job-1', { ...v1, state: 'parsed' }, { expectedVersion: 1 });
    assert.equal(v2.rows, v1.rows, 'same frozen rows array, no deep copy');
    assert.equal(await store.get('job-1'), v2, 'get() returns the stored frozen object itself');
  });

  it('deep-freezes a shallow-frozen input too', async () => {
    const store = new InMemoryImportJobStore();
    const rows = Object.freeze([{ rowNumber: 2, values: { A: 'x' } }]); // frozen array, mutable children
    const job = await store.create(newJob('job-1', { rows }));
    assert.ok(Object.isFrozen(job.rows[0]) && Object.isFrozen(job.rows[0].values));
  });

  it('rejects invalid transitions (e.g. received -> approved)', async () => {
    const store = new InMemoryImportJobStore();
    const job = await store.create(newJob());
    await assert.rejects(store.update('job-1', { ...job, state: 'approved' }, { expectedVersion: 1 }), { code: 'INVALID_STATE_TRANSITION', statusCode: 409 });
    await assert.rejects(store.update('job-1', { ...job, state: 'validated' }, { expectedVersion: 1 }), { code: 'INVALID_STATE_TRANSITION' });
    assert.equal((await store.get('job-1')).state, 'received');
  });

  it('rejects a stale version (lost update protection)', async () => {
    const store = new InMemoryImportJobStore();
    const job = await store.create(newJob());
    await store.update('job-1', { ...job, state: 'parsed' }, { expectedVersion: 1 });
    await assert.rejects(store.update('job-1', { ...job, state: 'parsed' }, { expectedVersion: 1 }), { code: 'JOB_CONFLICT' });
  });

  it('makes an approved job immutable at the storage level', async () => {
    const store = new InMemoryImportJobStore();
    let job = await store.create(newJob());
    for (const state of ['parsed', 'mapped', 'validated', 'approved']) {
      job = await store.update('job-1', { ...job, state }, { expectedVersion: job.version });
    }
    await assert.rejects(store.update('job-1', { ...job, rows: [] }, { expectedVersion: job.version }), { code: 'JOB_APPROVED_IMMUTABLE' });
    await assert.rejects(store.update('job-1', { ...job, state: 'mapped' }, { expectedVersion: job.version }), { code: 'JOB_APPROVED_IMMUTABLE' });
    assert.equal((await store.get('job-1')).rows.length, 1);
  });

  it('refuses to change a jobId or create duplicates', async () => {
    const store = new InMemoryImportJobStore();
    const job = await store.create(newJob());
    await assert.rejects(store.create(newJob()), /already exists/);
    await assert.rejects(store.update('job-1', { ...job, jobId: 'other' }, { expectedVersion: 1 }), /cannot be changed/);
  });

  it('expires jobs after the TTL and caps the number of jobs', async () => {
    let clock = 1000;
    const store = new InMemoryImportJobStore({ maxJobs: 2, ttlMs: 500, now: () => clock });
    await store.create(newJob('a'));
    await store.create(newJob('b'));
    await assert.rejects(store.create(newJob('c')), { code: 'JOB_STORE_FULL', statusCode: 503 });
    clock += 500;
    assert.equal(await store.get('a'), null, 'expired');
    await store.create(newJob('c'));
  });
});
