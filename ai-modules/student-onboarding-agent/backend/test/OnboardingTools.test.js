const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { createOnboardingToolRegistry } = require('../src/tools/onboarding');
const { ToolExecutor } = require('../src/tools/ToolExecutor');
const { ToolRegistry } = require('../src/tools/ToolRegistry');
const { FakeLmsAdapter } = require('../src/adapters/lms/FakeLmsAdapter');
const { createLmsFacade } = require('../src/adapters/lms/LmsAdapter');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };

const schema = loadStudentSchema();
const registry = createOnboardingToolRegistry(schema);
const executor = new ToolExecutor({ registry });

/** Approved rows as Step 7 freezes them: every canonical field, normalized. */
const approvedData = (extra = {}) => Object.freeze({
  fullName: 'Rahul Sharma', email: 'rahul@example.com', className: '10', section: 'A', parentName: null,
  phone: '+91 98765 43210', dob: '2010-05-17', admissionDate: null, bloodGroup: 'AB+', address: null, ...extra,
});
function context({ rows = { 2: approvedData() }, adapter = new FakeLmsAdapter({ classrooms: [{ className: '10', section: 'A' }] }) } = {}) {
  return {
    adapter,
    ctx: Object.freeze({
      jobId: 'job-1',
      approvedRow: (n) => rows[n] || null,
      idempotencyKey: (tool, n) => `job-1:${n}:${tool}`,
      lms: createLmsFacade(adapter),
    }),
  };
}
const studentArgs = (student = {}, rowNumber = 2) => ({
  rowNumber,
  student: { fullName: 'Rahul Sharma', email: 'rahul@example.com', phone: '+91 98765 43210', dob: '2010-05-17', bloodGroup: 'AB+', ...student },
});
const codesOf = (err) => err.details.map((d) => d.code);
async function rejects(promise, code, detailCodes) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code);
    if (detailCodes) assert.deepEqual(codesOf(err), detailCodes);
    return true;
  });
}

describe('createStudent arguments', () => {
  const run = (input) => { const { ctx, adapter } = context(); return { adapter, p: executor.run('createStudent', input, ctx) }; };

  it('accepts a valid student and passes only validated creation fields to the adapter', async () => {
    const { adapter, p } = run(studentArgs());
    assert.deepEqual(await p, { studentRef: 'fake-student-1', created: true });
    assert.deepEqual(adapter.calls, [{ method: 'createStudent', request: {
      idempotencyKey: 'job-1:2:createStudent',
      student: { fullName: 'Rahul Sharma', email: 'rahul@example.com', parentName: null, phone: '+91 98765 43210', dob: '2010-05-17', admissionDate: null, bloodGroup: 'AB+', address: null },
    } }]);
  });

  it('rejects missing, empty or invalid required values', async () => {
    await rejects(run(studentArgs({ fullName: undefined })).p, 'INVALID_TOOL_ARGUMENTS', ['REQUIRED_FIELD_MISSING']);
    await rejects(run(studentArgs({ fullName: '   ' })).p, 'INVALID_TOOL_ARGUMENTS', ['REQUIRED_FIELD_MISSING']);
    await rejects(run(studentArgs({ email: undefined })).p, 'INVALID_TOOL_ARGUMENTS', ['REQUIRED_FIELD_MISSING']);
    await rejects(run(studentArgs({ email: 'not-an-email' })).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_EMAIL']);
    await rejects(run(studentArgs({ phone: '12' })).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_PHONE']);
    await rejects(run(studentArgs({ dob: '03/04/2010' })).p, 'INVALID_TOOL_ARGUMENTS', ['AMBIGUOUS_DATE']);
    await rejects(run(studentArgs({ dob: '2010-02-30' })).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_DATE']);
    await rejects(run(studentArgs({ fullName: 42 })).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_FIELD_TYPE']);
  });

  it('rejects every system-controlled field (not silently dropped)', async () => {
    for (const f of ['id', 'userId', 'studentId', 'password', 'role', 'isApproved', 'universityId', 'university_id', 'classroomId', 'ClassroomID',
      'fees', 'totalFees', 'pendingFees', 'status', 'createdAt', 'updated_at', 'subscriptionPlan']) {
      const { adapter, p } = run(studentArgs({ [f]: 'x' }));
      await rejects(p, 'INVALID_TOOL_ARGUMENTS', ['FORBIDDEN_SYSTEM_FIELD']);
      assert.equal(adapter.calls.length, 0, f);
    }
  });

  it('rejects unknown fields (including databaseId) and classroom fields', async () => {
    await rejects(run(studentArgs({ databaseId: 7 })).p, 'INVALID_TOOL_ARGUMENTS', ['UNKNOWN_FIELD']);
    await rejects(run(studentArgs({ rollNumber: '17' })).p, 'INVALID_TOOL_ARGUMENTS', ['UNKNOWN_FIELD']);
    await rejects(run(studentArgs({ className: '10' })).p, 'INVALID_TOOL_ARGUMENTS', ['FIELD_NOT_ALLOWED_FOR_TOOL']);
    await rejects(run({ ...studentArgs(), approved: true }).p, 'INVALID_TOOL_ARGUMENTS', ['UNKNOWN_FIELD']);
    await rejects(run({ ...studentArgs(), status: 'approved' }).p, 'INVALID_TOOL_ARGUMENTS', ['FORBIDDEN_SYSTEM_FIELD']);
  });

  it('rejects malformed arguments and bad row numbers', async () => {
    for (const bad of [null, 'x', [], { rowNumber: 2 }, { rowNumber: 2, student: [] }]) {
      await rejects(run(bad).p, 'INVALID_TOOL_ARGUMENTS');
    }
    await rejects(run(studentArgs({}, 0)).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_ROW_NUMBER']);
    await rejects(run(studentArgs({}, 2.5)).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_ROW_NUMBER']);
  });

  it('valid arguments that differ from the approved row are refused before the adapter', async () => {
    const { adapter, p } = run(studentArgs({ fullName: 'Someone Else' }));
    await rejects(p, 'APPROVED_DATA_MISMATCH', ['APPROVED_DATA_MISMATCH']);
    assert.equal(adapter.calls.length, 0);
    const other = run(studentArgs({}, 99));
    await rejects(other.p, 'ROW_NOT_IN_APPROVED_IMPORT');
    assert.equal(other.adapter.calls.length, 0);
  });
});

describe('assignStudentToClassroom arguments', () => {
  const args = (extra = {}) => ({ rowNumber: 2, email: 'rahul@example.com', className: '10', section: 'A', ...extra });
  const run = (input, opts) => { const { ctx, adapter } = context(opts); return { adapter, p: executor.run('assignStudentToClassroom', input, ctx) }; };

  it('accepts className + section and lets the adapter resolve the classroom', async () => {
    const { ctx, adapter } = context();
    await executor.run('createStudent', studentArgs(), ctx);
    const r = await executor.run('assignStudentToClassroom', args({ className: ' 10 ' }), ctx);
    assert.deepEqual(r, { outcome: 'assigned', assignmentRef: 'fake-assignment-1', replayed: false });
    assert.deepEqual(adapter.calls[1].request, { idempotencyKey: 'job-1:2:assignStudentToClassroom', studentEmail: 'rahul@example.com', className: '10', section: 'A' });
  });

  it('rejects classroomId, any other ID and unknown fields', async () => {
    for (const [extra, code] of [[{ classroomId: 5 }, 'FORBIDDEN_SYSTEM_FIELD'], [{ id: 5 }, 'FORBIDDEN_SYSTEM_FIELD'], [{ studentId: 'S1' }, 'FORBIDDEN_SYSTEM_FIELD'],
      [{ roomId: 5 }, 'UNKNOWN_FIELD'], [{ table: 'classrooms' }, 'UNKNOWN_FIELD'], [{ sql: 'DROP TABLE' }, 'UNKNOWN_FIELD']]) {
      const { adapter, p } = run(args(extra));
      await rejects(p, 'INVALID_TOOL_ARGUMENTS', [code]);
      assert.equal(adapter.calls.length, 0);
    }
  });

  it('rejects missing, wrong-type or malformed values', async () => {
    await rejects(run(args({ section: undefined })).p, 'INVALID_TOOL_ARGUMENTS', ['REQUIRED_FIELD_MISSING']);
    await rejects(run(args({ className: 10 })).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_FIELD_TYPE']);
    await rejects(run(args({ email: 'x' })).p, 'INVALID_TOOL_ARGUMENTS', ['INVALID_EMAIL']);
  });

  it('refuses a classroom other than the approved one', async () => {
    const { adapter, p } = run(args({ section: 'B' }));
    await rejects(p, 'APPROVED_DATA_MISMATCH', ['APPROVED_DATA_MISMATCH']);
    assert.equal(adapter.calls.length, 0);
  });
});

describe('ToolExecutor', () => {
  it('unknown tools and non-create tools are refused', async () => {
    const { ctx } = context();
    for (const name of ['executeSQL', 'queryDatabase', 'updateStudent', 'deleteStudent', 'createOnboardingToken', undefined, 42]) {
      await rejects(executor.run(name, {}, ctx), 'TOOL_NOT_FOUND');
    }
    const readRegistry = new ToolRegistry().register('listStudents', { description: 'd', access: 'read', inputContract: {}, validateInput: (x) => x, execute: async () => [] });
    await rejects(new ToolExecutor({ registry: readRegistry }).run('listStudents', {}, ctx), 'TOOL_FORBIDDEN');
  });

  it('turns adapter failures into a safe ADAPTER_FAILURE', async () => {
    const { ctx } = context({ adapter: new FakeLmsAdapter({ existingEmails: ['rahul@example.com'] }) });
    await assert.rejects(executor.run('createStudent', studentArgs(), ctx), (err) => {
      assert.equal(err.code, 'ADAPTER_FAILURE');
      assert.deepEqual(err.details, ['STUDENT_ALREADY_EXISTS']);
      assert.ok(!/at |\.js|stack/i.test(err.message));
      return true;
    });
    const broken = { createStudent: async () => { throw new Error('ECONNREFUSED 10.0.0.5:5432 password=secret'); }, assignStudentToClassroom: async () => ({}) };
    const c2 = context({ adapter: broken });
    await assert.rejects(executor.run('createStudent', studentArgs(), c2.ctx), (err) => {
      assert.equal(err.code, 'TOOL_EXECUTION_FAILED');
      assert.ok(!err.message.includes('secret') && !err.message.includes('5432'));
      return true;
    });
    const bad = context({ adapter: { createStudent: async () => ({ studentRef: 7 }), assignStudentToClassroom: async () => ({}) } });
    await assert.rejects(executor.run('createStudent', studentArgs(), bad.ctx), (err) => err.code === 'ADAPTER_FAILURE' && err.details[0] === 'BAD_ADAPTER_RESPONSE');
  });
});
