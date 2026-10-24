const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LmsAdapter, createLmsFacade, LMS_ADAPTER_METHODS } = require('../src/adapters/lms/LmsAdapter');
const { FakeLmsAdapter } = require('../src/adapters/lms/FakeLmsAdapter');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };

const student = (email) => ({ fullName: 'A', email, parentName: null, phone: null, dob: null, admissionDate: null, bloodGroup: null, address: null });

describe('adapter interface and facade', () => {
  it('defines exactly createStudent and assignStudentToClassroom; nothing generic', () => {
    assert.deepEqual(LMS_ADAPTER_METHODS, ['createStudent', 'assignStudentToClassroom']);
    const own = Object.getOwnPropertyNames(LmsAdapter.prototype).filter((n) => n !== 'constructor');
    assert.deepEqual(own.sort(), ['assignStudentToClassroom', 'createStudent']);
    assert.throws(() => new LmsAdapter('x'), /abstract/);
  });

  it('tools only see a frozen facade with the two methods, even if the adapter has more', async () => {
    const adapter = new FakeLmsAdapter();
    adapter.query = async () => 'rows';
    adapter.execute = async () => 'done';
    adapter.update = async () => 'updated';
    adapter.delete = async () => 'deleted';
    adapter.db = { secret: 'connection' };
    const facade = createLmsFacade(adapter);
    assert.deepEqual(Object.keys(facade), ['createStudent', 'assignStudentToClassroom']);
    for (const m of ['query', 'execute', 'update', 'delete', 'db', 'calls', 'students', 'byEmail']) assert.equal(facade[m], undefined, m);
    assert.ok(Object.isFrozen(facade));
    assert.equal(Reflect.set(facade, 'query', () => {}), false);
    assert.equal((await facade.createStudent({ idempotencyKey: 'k', student: student('a@x.com') })).studentRef, 'fake-student-1');
  });

  it('refuses an adapter that lacks a required method', () => {
    assert.throws(() => createLmsFacade({ createStudent: async () => ({}) }), /assignStudentToClassroom/);
    assert.throws(() => createLmsFacade(null), /required/);
  });
});

describe('FakeLmsAdapter', () => {
  it('creates deterministic refs and records requests', async () => {
    const a = new FakeLmsAdapter();
    assert.deepEqual(await a.createStudent({ idempotencyKey: 'k1', student: student('a@x.com') }), { studentRef: 'fake-student-1', created: true });
    assert.deepEqual(await a.createStudent({ idempotencyKey: 'k2', student: student('b@x.com') }), { studentRef: 'fake-student-2', created: true });
    assert.deepEqual(a.calls.map((c) => c.method), ['createStudent', 'createStudent']);
  });

  it('replays the same idempotency key without creating a duplicate', async () => {
    const a = new FakeLmsAdapter();
    await a.createStudent({ idempotencyKey: 'k1', student: student('a@x.com') });
    assert.deepEqual(await a.createStudent({ idempotencyKey: 'k1', student: student('a@x.com') }), { studentRef: 'fake-student-1', created: false });
    assert.equal(a.students.length, 1);
  });

  it('refuses an existing email under a different key (case-insensitive)', async () => {
    const a = new FakeLmsAdapter({ existingEmails: ['Taken@x.com'] });
    await assert.rejects(a.createStudent({ idempotencyKey: 'k', student: student('taken@X.com') }), { code: 'STUDENT_ALREADY_EXISTS' });
  });

  it('resolves classrooms by className + section, reporting none or several matches', async () => {
    const a = new FakeLmsAdapter({ classrooms: [{ className: '10', section: 'A' }, { className: '11', section: 'B' }, { className: '11', section: 'b ' }] });
    await a.createStudent({ idempotencyKey: 's', student: student('a@x.com') });
    const req = (key, className, section) => a.assignStudentToClassroom({ idempotencyKey: key, studentEmail: 'A@x.com', className, section });
    assert.deepEqual(await req('1', ' 10', 'a'), { outcome: 'assigned', assignmentRef: 'fake-assignment-1', replayed: false });
    assert.deepEqual(await req('2', '12', 'A'), { outcome: 'classroom_not_found', assignmentRef: null, replayed: false });
    assert.deepEqual(await req('3', '11', 'B'), { outcome: 'classroom_ambiguous', assignmentRef: null, replayed: false });
    assert.deepEqual(await req('1', '10', 'A'), { outcome: 'assigned', assignmentRef: 'fake-assignment-1', replayed: true });
    assert.equal(a.assignments.length, 1);
    await assert.rejects(a.assignStudentToClassroom({ idempotencyKey: '4', studentEmail: 'nobody@x.com', className: '10', section: 'A' }), { code: 'STUDENT_NOT_FOUND' });
  });
});
