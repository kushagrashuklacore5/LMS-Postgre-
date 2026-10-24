const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { LLMProvider } = require('../src/llm/LLMProvider');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');
const { InMemoryImportJobStore } = require('../src/import/ImportJobStore');
const { ImportJobService } = require('../src/import/ImportJobService');
const { FakeLmsAdapter } = require('../src/adapters/lms/FakeLmsAdapter');
const { createApprovedImportExecutor, ApprovedImportExecutor, InMemoryExecutionStore } = require('../src/execution/ApprovedImportExecutor');
const { createOnboardingToolRegistry } = require('../src/tools/onboarding');
const { ToolExecutor } = require('../src/tools/ToolExecutor');
const { StudentOnboardingAgent } = require('../src/agent/StudentOnboardingAgent');

let networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw new Error('Network access is not allowed in tests'); };

const schema = loadStudentSchema();
const HEADERS = ['Name', 'Email', 'Class', 'Div', 'Mobile', 'Remarks'];
const MAPPINGS = [
  { sourceColumn: 'Name', status: 'mapped', targetField: 'fullName', confidence: 0.9 },
  { sourceColumn: 'Email', status: 'mapped', targetField: 'email', confidence: 0.9 },
  { sourceColumn: 'Class', status: 'mapped', targetField: 'className', confidence: 0.9 },
  { sourceColumn: 'Div', status: 'mapped', targetField: 'section', confidence: 0.9 },
  { sourceColumn: 'Mobile', status: 'mapped', targetField: 'phone', confidence: 0.9 },
  { sourceColumn: 'Remarks', status: 'unmapped' },
];
// AI suggestions are not used until an admin approves them: these are the admin's approvals.
const APPROVE_AI = MAPPINGS.filter((x) => x.status === 'mapped').map((x) => ({ sourceColumn: x.sourceColumn, action: 'map', targetField: x.targetField }));
const row = (n, name, email, cls = 10, div = 'A', mobile = 9876500000 + n) => ({ rowNumber: n, values: { Name: name, Email: email, Class: cls, Div: div, Mobile: mobile, Remarks: null } });
const DEFAULT_ROWS = () => [row(2, 'Rahul Sharma', 'rahul@example.com'), row(3, 'Asha Rao', 'asha@example.com', 11, 'B'), row(4, 'Vik Das', 'vik@example.com', 12, 'C'), row(5, 'Meera Nair', 'meera@example.com', null, null)];

class FakeProvider extends LLMProvider {
  constructor() { super('fake'); this.prompts = []; }
  async generate(prompt) { this.prompts.push(prompt); return JSON.stringify({ mappings: MAPPINGS }); }
}

let logged;
const saved = {};
beforeEach(() => { logged = []; for (const k of ['log', 'info', 'warn', 'error', 'debug']) { saved[k] = console[k]; console[k] = (...a) => logged.push(a); } });
afterEach(() => { for (const k of Object.keys(saved)) console[k] = saved[k]; });

/** A real Step 7 job service with a fake parser and fake LLM, plus the Step 8 executor and fake LMS. */
function setup({ rows = DEFAULT_ROWS, adapterOptions } = {}) {
  const provider = new FakeProvider();
  const jobService = new ImportJobService({
    schema,
    store: new InMemoryImportJobStore(),
    importService: { parse: async () => ({ fileName: 's.xlsx', sheetName: 'S', sheetNames: ['S'], headerRowNumber: 1, headers: [...HEADERS], rows: rows(), rowCount: rows().length, columnCount: 6, skippedBlankRows: 0, warnings: [] }) },
    mappingService: new ColumnMappingService({ schema, llmProvider: provider }),
  });
  const adapter = new FakeLmsAdapter({ classrooms: [{ className: '10', section: 'A' }, { className: '11', section: 'B' }, { className: '11', section: 'B' }], ...adapterOptions });
  const executor = createApprovedImportExecutor({ schema, jobService, lmsAdapter: adapter });
  return { jobService, adapter, executor, provider };
}
async function approvedJob(ctx) {
  const { jobId } = await ctx.jobService.startJob(Buffer.from('x'));
  await ctx.jobService.applyMappingDecision(jobId, { decisions: [...APPROVE_AI, { sourceColumn: 'Remarks', action: 'unmap' }] });
  await ctx.jobService.approveImport(jobId);
  return jobId;
}

describe('executing an approved import', () => {
  it('creates students and assigns classrooms through the tools, with a PII-free result', async () => {
    const ctx = setup();
    const jobId = await approvedJob(ctx);
    const result = await ctx.executor.executeApprovedImport(jobId);
    assert.equal(result.status, 'completed_with_issues');
    assert.equal(result.repeated, false);
    assert.deepEqual(result.rows.map((r) => [r.rowNumber, r.student.status, r.student.studentRef, r.classroom.status, r.classroom.assignmentRef]), [
      [2, 'created', 'fake-student-1', 'assigned', 'fake-assignment-1'],
      [3, 'created', 'fake-student-2', 'classroom_ambiguous', null],
      [4, 'created', 'fake-student-3', 'classroom_not_found', null],
      [5, 'created', 'fake-student-4', 'not_requested', null],
    ]);
    assert.deepEqual(result.totals, { rows: 4, created: 4, alreadyCreated: 0, failed: 0, assigned: 1, classroomNotFound: 1, classroomAmbiguous: 1, classroomSkipped: 0, classroomFailed: 0, needsAttention: 2 });
    const text = JSON.stringify(result);
    for (const pii of ['Rahul', 'rahul@example.com', '98765']) assert.ok(!text.includes(pii), pii);
  });

  it('the adapter receives only validated, business-level data and only its two methods', async () => {
    const ctx = setup();
    await ctx.executor.executeApprovedImport(await approvedJob(ctx));
    assert.deepEqual([...new Set(ctx.adapter.calls.map((c) => c.method))], ['createStudent', 'assignStudentToClassroom']);
    const create = ctx.adapter.calls[0].request;
    assert.deepEqual(create, {
      idempotencyKey: `${create.idempotencyKey.split(':')[0]}:2:createStudent`,
      student: { fullName: 'Rahul Sharma', email: 'rahul@example.com', parentName: null, phone: '9876500002', dob: null, admissionDate: null, bloodGroup: null, address: null },
    });
    const forbidden = /"(id|userId|studentId|password|role|isApproved|universityId|classroomId|fees|status|createdAt|updatedAt)"/;
    for (const c of ctx.adapter.calls) assert.ok(!forbidden.test(JSON.stringify(c.request)), JSON.stringify(c.request));
    const assign = ctx.adapter.calls.find((c) => c.method === 'assignStudentToClassroom').request;
    assert.deepEqual(Object.keys(assign), ['idempotencyKey', 'studentEmail', 'className', 'section']);
  });

  it('keeps going when one row fails, records only codes, and skips that row\'s classroom', async () => {
    const ctx = setup({ adapterOptions: { failOnEmails: ['asha@example.com'], existingEmails: ['vik@example.com'] } });
    const result = await ctx.executor.executeApprovedImport(await approvedJob(ctx));
    assert.deepEqual(result.rows.map((r) => [r.rowNumber, r.student.status, r.student.error, r.classroom.status]), [
      [2, 'created', null, 'assigned'],
      [3, 'failed', { code: 'ADAPTER_FAILURE', reasons: ['SIMULATED_FAILURE'] }, 'skipped_student_not_created'],
      [4, 'failed', { code: 'ADAPTER_FAILURE', reasons: ['STUDENT_ALREADY_EXISTS'] }, 'skipped_student_not_created'],
      [5, 'created', null, 'not_requested'],
    ]);
    assert.equal(result.totals.failed, 2);
  });

  it('reports a half-filled classroom (className without section) instead of guessing', async () => {
    const ctx = setup({ rows: () => [row(2, 'Rahul Sharma', 'rahul@example.com', 10, null)] });
    const result = await ctx.executor.executeApprovedImport(await approvedJob(ctx));
    assert.equal(result.rows[0].classroom.status, 'skipped_incomplete_classroom');
    assert.equal(ctx.adapter.calls.filter((c) => c.method === 'assignStudentToClassroom').length, 0);
  });
});

describe('approved-import boundary', () => {
  it('refuses every non-approved state', async () => {
    const ctx = setup();
    const { jobId: reviewJob } = await ctx.jobService.startJob(Buffer.from('x')); // needs_review
    await assert.rejects(ctx.executor.executeApprovedImport(reviewJob), (e) => e.code === 'IMPORT_NOT_APPROVED' && e.details[0] === 'STATE_NEEDS_REVIEW');
    await ctx.jobService.applyMappingDecision(reviewJob, { decisions: [...APPROVE_AI, { sourceColumn: 'Remarks', action: 'unmap' }] }); // validated
    await assert.rejects(ctx.executor.executeApprovedImport(reviewJob), (e) => e.code === 'IMPORT_NOT_APPROVED' && e.details[0] === 'STATE_VALIDATED');

    const failing = new ImportJobService({ schema, store: new InMemoryImportJobStore(), importService: { parse: async () => { throw new Error('bad'); } },
      mappingService: new ColumnMappingService({ schema, llmProvider: null }) });
    const failedExec = createApprovedImportExecutor({ schema, jobService: failing, lmsAdapter: new FakeLmsAdapter() });
    const { jobId: failedJob } = await failing.startJob(Buffer.from('x'));
    await assert.rejects(failedExec.executeApprovedImport(failedJob), (e) => e.code === 'IMPORT_NOT_APPROVED' && e.details[0] === 'STATE_FAILED');
    await assert.rejects(ctx.executor.executeApprovedImport('no-such-job'), { code: 'JOB_NOT_FOUND' });
    await assert.rejects(ctx.executor.executeApprovedImport({ jobId: reviewJob }), { code: 'JOB_NOT_FOUND' });
    assert.equal(ctx.adapter.calls.length, 0, 'nothing reached the LMS');
  });

  it('a caller cannot force approval or inject rows', async () => {
    const ctx = setup();
    const { jobId } = await ctx.jobService.startJob(Buffer.from('x'));
    for (const opts of [{ approved: true }, { status: 'approved' }, { state: 'approved' }, { rows: [] }, { canonicalRows: [{ rowNumber: 2, values: { fullName: 'X', email: 'x@x.com' } }] }, 'approved', []]) {
      await assert.rejects(ctx.executor.executeApprovedImport(jobId, opts), { code: 'INVALID_REQUEST' }, JSON.stringify(opts));
    }
    await assert.rejects(ctx.executor.executeApprovedImport(jobId, {}), { code: 'IMPORT_NOT_APPROVED' });
    assert.equal(ctx.adapter.calls.length, 0);
  });

  it('raw canonical rows cannot bypass the approved job: tools only act on approved rows', async () => {
    const ctx = setup();
    const jobId = await approvedJob(ctx);
    const approved = await ctx.jobService.getApprovedImport(jobId);
    const toolExecutor = new ToolExecutor({ registry: createOnboardingToolRegistry(schema) });
    const index = new Map(approved.rows.map((r) => [r.rowNumber, r.data]));
    const { createLmsFacade } = require('../src/adapters/lms/LmsAdapter');
    const context = Object.freeze({ jobId, approvedRow: (n) => index.get(n) || null, idempotencyKey: (t, n) => `${jobId}:${n}:${t}`, lms: createLmsFacade(ctx.adapter) });
    const injected = { rowNumber: 99, student: { fullName: 'Injected Person', email: 'inject@example.com' } };
    await assert.rejects(toolExecutor.run('createStudent', injected, context), { code: 'ROW_NOT_IN_APPROVED_IMPORT' });
    await assert.rejects(toolExecutor.run('createStudent', { ...injected, rowNumber: 2 }, context), { code: 'APPROVED_DATA_MISMATCH' });
    assert.equal(ctx.adapter.calls.length, 0);
  });

  it('refuses an approved import that is no longer frozen or valid', async () => {
    const ctx = setup();
    const jobId = await approvedJob(ctx);
    const good = await ctx.jobService.getApprovedImport(jobId);
    const tampered = { getJobState: async () => 'approved', getApprovedImport: async () => ({ ...good, rows: good.rows.map((r) => ({ ...r })) }) };
    const e1 = createApprovedImportExecutor({ schema, jobService: tampered, lmsAdapter: ctx.adapter });
    await assert.rejects(e1.executeApprovedImport(jobId), { code: 'IMMUTABLE_IMPORT_VIOLATION' });
    const invalid = { getJobState: async () => 'approved', getApprovedImport: async () => Object.freeze({ rows: Object.freeze([Object.freeze({ rowNumber: 2, data: Object.freeze({ ...good.rows[0].data, email: 'broken' }) })]) }) };
    const e2 = createApprovedImportExecutor({ schema, jobService: invalid, lmsAdapter: ctx.adapter });
    await assert.rejects(e2.executeApprovedImport(jobId), { code: 'APPROVED_IMPORT_INVALID' });
    assert.equal(ctx.adapter.calls.length, 0);
    await e1.executeApprovedImport(jobId).catch(() => {}); // the claim was released: a retry is not "in progress"
    await assert.rejects(e1.executeApprovedImport(jobId), { code: 'IMMUTABLE_IMPORT_VIOLATION' });
  });

  it('the approved job stays immutable during and after execution', async () => {
    const ctx = setup();
    const jobId = await approvedJob(ctx);
    await ctx.executor.executeApprovedImport(jobId);
    await assert.rejects(ctx.jobService.applyMappingDecision(jobId, { decisions: [{ sourceColumn: 'Remarks', action: 'map', targetField: 'address' }] }), { code: 'JOB_APPROVED_IMMUTABLE' });
    assert.equal(await ctx.jobService.getJobState(jobId), 'approved');
  });
});

describe('idempotency', () => {
  it('a second call returns the same result and creates nothing again', async () => {
    const ctx = setup();
    const jobId = await approvedJob(ctx);
    const first = await ctx.executor.executeApprovedImport(jobId);
    const callsAfterFirst = ctx.adapter.calls.length;
    const second = await ctx.executor.executeApprovedImport(jobId);
    assert.equal(second.repeated, true);
    assert.deepEqual({ ...second, repeated: false }, first);
    assert.equal(ctx.adapter.calls.length, callsAfterFirst, 'the adapter was not called again');
    assert.equal(ctx.adapter.students.length, 4);
  });

  it('a concurrent call while one is running is refused', async () => {
    const ctx = setup();
    const jobId = await approvedJob(ctx);
    const running = ctx.executor.executeApprovedImport(jobId);
    await assert.rejects(ctx.executor.executeApprovedImport(jobId), { code: 'EXECUTION_IN_PROGRESS' });
    await running;
    assert.equal(ctx.adapter.students.length, 4);
  });

  it('an interrupted run can be resumed without duplicate students (adapter idempotency keys)', async () => {
    const ctx = setup();
    const jobId = await approvedJob(ctx);
    const store = new InMemoryExecutionStore();
    const registry = createOnboardingToolRegistry(schema);
    const crashing = new ApprovedImportExecutor({ schema, jobService: ctx.jobService, lmsAdapter: ctx.adapter, executionStore: store, toolExecutor: new ToolExecutor({ registry }) });
    // Tool errors become row failures, so simulate a real crash (e.g. the process dying) at row 3 of the loop itself.
    crashing.executeRow = async function (r, c) { if (r.rowNumber === 3) throw new Error('crash'); return ApprovedImportExecutor.prototype.executeRow.call(this, r, c); };
    await assert.rejects(crashing.executeApprovedImport(jobId), { code: 'EXECUTION_INTERRUPTED' });
    assert.equal(store.get(jobId).status, 'interrupted');
    assert.equal(ctx.adapter.students.length, 1, 'row 2 was created before the crash');

    const resumed = new ApprovedImportExecutor({ schema, jobService: ctx.jobService, lmsAdapter: ctx.adapter, executionStore: store, toolExecutor: new ToolExecutor({ registry }) });
    const result = await resumed.executeApprovedImport(jobId);
    assert.deepEqual(result.rows.map((r) => r.student.status), ['already_created', 'created', 'created', 'created']);
    assert.equal(ctx.adapter.students.length, 4, 'no duplicate for row 2');
    assert.equal(result.rows[0].classroom.status, 'assigned');
  });
});

describe('agent and LLM boundary', () => {
  function agentSetup() {
    const ctx = setup();
    const registry = createOnboardingToolRegistry(schema);
    const agent = new StudentOnboardingAgent({ llmProvider: ctx.provider, toolRegistry: registry, importExecutor: ctx.executor });
    return { ...ctx, agent, registry };
  }

  it('the agent knows the tools and their arguments as plain data, with no adapter or executor inside', () => {
    const { agent, adapter } = agentSetup();
    const described = agent.describe();
    assert.deepEqual(described.tools.map((t) => [t.name, t.access]), [['createStudent', 'create'], ['assignStudentToClassroom', 'create']]);
    assert.deepEqual(JSON.parse(JSON.stringify(described)), described, 'plain data only: no functions');
    const reachable = [...Object.values(agent), ...Object.values(described)];
    assert.ok(!reachable.includes(adapter));
    assert.ok(!Object.keys(agent).includes('importExecutor'), 'executor is not an enumerable property');
    assert.equal(typeof agent.createStudent, 'undefined');
    assert.equal(typeof agent.query, 'undefined');
  });

  it('the agent executes only through the approved-import boundary', async () => {
    const { agent, jobService, adapter } = agentSetup();
    const { jobId } = await jobService.startJob(Buffer.from('x'));
    await assert.rejects(agent.runApprovedImport(jobId), { code: 'IMPORT_NOT_APPROVED' });
    await jobService.applyMappingDecision(jobId, { decisions: [...APPROVE_AI, { sourceColumn: 'Remarks', action: 'unmap' }] });
    await jobService.approveImport(jobId);
    const result = await agent.runApprovedImport(jobId);
    assert.equal(result.totals.created, 4);
    assert.equal(adapter.students.length, 4);
    await assert.rejects(new StudentOnboardingAgent().runApprovedImport(jobId), { code: 'EXECUTOR_NOT_CONFIGURED' });
  });

  it('LLM-style tool arguments are validated before anything executes', async () => {
    const { registry, adapter, jobService, executor } = agentSetup();
    const jobId = await approvedJob({ jobService });
    const approved = await jobService.getApprovedImport(jobId);
    const { createLmsFacade } = require('../src/adapters/lms/LmsAdapter');
    const index = new Map(approved.rows.map((r) => [r.rowNumber, r.data]));
    const context = Object.freeze({ jobId, approvedRow: (n) => index.get(n) || null, idempotencyKey: (t, n) => `${jobId}:${n}:${t}`, lms: createLmsFacade(adapter) });
    const llmArgs = { rowNumber: 2, student: { fullName: 'Rahul Sharma', email: 'rahul@example.com', role: 'admin', password: 'hunter2', isApproved: true } };
    await assert.rejects(new ToolExecutor({ registry }).run('createStudent', llmArgs, context), (e) => e.code === 'INVALID_TOOL_ARGUMENTS' && e.details.every((d) => d.code === 'FORBIDDEN_SYSTEM_FIELD'));
    assert.equal(adapter.calls.length, 0);
    assert.ok(executor instanceof ApprovedImportExecutor);
  });

  it('no tool definition can be added at runtime, and the LLM only ever receives prompt text', async () => {
    const { registry, provider, jobService } = agentSetup();
    assert.throws(() => registry.register('createAnything', { description: 'x', access: 'create', inputContract: {}, validateInput: (x) => x, execute: async () => {} }), /locked/);
    await jobService.startJob(Buffer.from('x'));
    assert.equal(provider.prompts.length, 1);
    assert.equal(typeof provider.prompts[0], 'string');
    for (const secretish of ['createLmsFacade', 'idempotencyKey', 'fake-student']) assert.ok(!provider.prompts[0].includes(secretish));
  });
});

describe('performance and isolation', () => {
  it('executes 5000 approved rows quickly and exposes only one row per tool call', async () => {
    const big = () => Array.from({ length: 5000 }, (_, i) => row(i + 2, `Student ${i}`, `s${i}@example.com`, 10, 'A', 9876500000 + i));
    const ctx = setup({ rows: big });
    const jobId = await approvedJob(ctx);
    const started = Date.now();
    const result = await ctx.executor.executeApprovedImport(jobId);
    const ms = Date.now() - started;
    assert.equal(result.totals.created, 5000);
    assert.equal(result.totals.assigned, 5000);
    assert.ok(ms < 5000, `took ${ms} ms`);
  });

  it('made no network call and logged nothing', () => {
    assert.equal(networkCalls, 0);
    assert.deepEqual(logged, []);
  });
});
