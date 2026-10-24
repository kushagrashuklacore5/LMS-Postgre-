// Uses only throw-away PostgreSQL databases (fixtures/lmsTestDatabase.js). The school database is never opened.
const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { loadStudentSchema } = require('../src/validation/studentSchema');
const { PostgresLmsAdapter, openPostgresLmsAdapter } = require('../src/adapters/lms/PostgresLmsAdapter');
const { LmsAdapterError, createLmsFacade } = require('../src/adapters/lms/LmsAdapter');
const { createLmsTestDatabase, counts } = require('./fixtures/lmsTestDatabase');

globalThis.fetch = () => { throw new Error('Network access is not allowed in tests'); };
afterEach(() => mock.restoreAll());

const schema = loadStudentSchema();
const ADMIN_S1 = { userId: 1, role: 'admin', universityId: 1 };
const student = (email, extra = {}) => ({ fullName: 'Rahul Sharma', email, parentName: null, phone: '+91 98765 43210', dob: '2010-05-17', admissionDate: null, bloodGroup: 'AB+', address: null, ...extra });
const adapterFor = (db, actor = ADMIN_S1, opts = {}) => new PostgresLmsAdapter({ sql: db.sql, actor, schema, ...opts });
const SAFE_CODES = new Set(['TENANT_INVALID', 'ACTOR_NOT_AUTHORIZED', 'STUDENT_ALREADY_EXISTS', 'QUOTA_EXCEEDED', 'STUDENT_NOT_FOUND', 'STUDENT_AMBIGUOUS',
  'IDEMPOTENCY_KEY_CONFLICT', 'INVALID_REQUEST', 'LMS_NOT_READY', 'LMS_BUSY', 'LMS_UNAVAILABLE']);
/** BEFORE/AFTER trigger on a table running `body` (PL/pgSQL), to simulate a failure inside the adapter's transaction. */
const addTrigger = async (db, name, when, table, body) => await db.exec(
  `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${body} RETURN NEW; END $$;
   CREATE TRIGGER ${name} ${when} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}();`);
const dropTrigger = async (db, name, table) => await db.exec(`DROP TRIGGER ${name} ON ${table}; DROP FUNCTION ${name}();`);
async function rejectsSafely(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof LmsAdapterError, `not an LmsAdapterError: ${err && err.message}`);
    assert.equal(err.code, code);
    assert.ok(SAFE_CODES.has(err.code));
    assert.ok(!/SELECT|INSERT|UPDATE|sqlite|constraint|soa_idempotency|lms_permanent|\bat\s|\.js/i.test(err.message), `unsafe message: ${err.message}`);
    return true;
  });
}

describe('construction and tenant validation', () => {
  it('rejects an actor that is not a verified admin, or has no valid tenant', async () => {
    const db = await createLmsTestDatabase();
    for (const [actor, code] of [[null, 'ACTOR_NOT_AUTHORIZED'], [{ userId: 3, role: 'mentor', universityId: 1 }, 'ACTOR_NOT_AUTHORIZED'],
      [{ userId: '1', role: 'admin', universityId: 1 }, 'ACTOR_NOT_AUTHORIZED'], [{ userId: 1, role: 'admin' }, 'TENANT_INVALID'],
      [{ userId: 1, role: 'admin', universityId: 0 }, 'TENANT_INVALID'], [{ userId: 1, role: 'admin', universityId: '1' }, 'TENANT_INVALID']]) {
      assert.throws(() => adapterFor(db, actor), (e) => e.code === code, JSON.stringify(actor));
    }
    assert.throws(() => new PostgresLmsAdapter({ actor: ADMIN_S1, schema }), TypeError);
  });

  it('re-verifies the actor against the LMS and writes nothing when it does not match', async () => {
    const db = await createLmsTestDatabase();
    const before = await counts(db);
    const cases = [
      [{ userId: 1, role: 'admin', universityId: 2 }, 'TENANT_INVALID'], // admin of school 1 claiming school 2
      [{ userId: 4, role: 'admin', universityId: 1 }, 'TENANT_INVALID'], // admin with NULL school: the LMS "|| 1" default
      [{ userId: 3, role: 'admin', universityId: 1 }, 'ACTOR_NOT_AUTHORIZED'], // a mentor whose token claims admin
      [{ userId: 99, role: 'admin', universityId: 1 }, 'ACTOR_NOT_AUTHORIZED'], // no such user
    ];
    for (const [actor, code] of cases) {
      await rejectsSafely(adapterFor(db, actor).createStudent({ idempotencyKey: 'k1', student: student('a@x.test') }), code);
      await rejectsSafely(adapterFor(db, actor).assignStudentToClassroom({ idempotencyKey: 'k2', studentEmail: 'a@x.test', className: '10', section: 'A' }), code);
    }
    await db.exec('DELETE FROM universities WHERE id = 3');
    await rejectsSafely(adapterFor(db, { userId: 5, role: 'admin', universityId: 3 }).createStudent({ idempotencyKey: 'k3', student: student('b@x.test') }), 'TENANT_INVALID');
    assert.deepEqual(await counts(db), before);
  });

  it('exposes exactly the two interface methods and no connection', async () => {
    const adapter = adapterFor(await createLmsTestDatabase());
    assert.deepEqual(Object.getOwnPropertyNames(PostgresLmsAdapter.prototype).sort(), ['assignStudentToClassroom', 'constructor', 'createStudent']);
    assert.deepEqual(Object.keys(adapter), ['name']);
    for (const m of ['query', 'execute', 'exec', 'update', 'delete', 'prepare', 'connection', 'db']) assert.equal(adapter[m], undefined, m);
    assert.deepEqual(Object.keys(createLmsFacade(adapter)), ['createStudent', 'assignStudentToClassroom']);
  });
});

describe('createStudent', () => {
  it('creates users + students rows in one transaction with system values from the adapter', async () => {
    const db = await createLmsTestDatabase();
    const result = await adapterFor(db).createStudent({ idempotencyKey: 'job-1:2:createStudent', student: student(' rahul@example.com ') });
    assert.deepEqual(Object.keys(result), ['studentRef', 'created']);
    assert.equal(result.created, true);
    assert.match(result.studentRef, /^lms-student:2026\d{6}$/);
    const u = await db.get("SELECT * FROM users WHERE email = 'rahul@example.com'");
    assert.deepEqual([u.name, u.role, u.isApproved, u.university_id, u.created_by, u.classroom_id], ['Rahul Sharma', 'student', 1, 1, 1, null]);
    const s = await db.get('SELECT * FROM students WHERE userId = ?', [u.id]);
    assert.equal(`lms-student:${s.studentId}`, result.studentRef);
    assert.deepEqual([s.grade, s.rollNumber, s.totalFees, s.feesPaid, s.pendingFees], ['', null, 0, 0, 0]);
    const k = await db.get('SELECT * FROM soa_idempotency_keys');
    assert.deepEqual([k.university_id, k.idempotency_key, k.operation, k.created_by], [1, 'job-1:2:createStudent', 'createStudent', 1]);
    assert.deepEqual(JSON.parse(k.result_json), { studentRef: result.studentRef });
  });

  it('stores only an unusable bcrypt-format password and never returns it', async () => {
    const db = await createLmsTestDatabase();
    const result = await adapterFor(db).createStudent({ idempotencyKey: 'k1', student: student('a@x.test') });
    await adapterFor(db).createStudent({ idempotencyKey: 'k2', student: student('b@x.test') });
    const [h1, h2] = (await db.all("SELECT password FROM users WHERE role = 'student' ORDER BY id")).map((r) => r.password);
    assert.match(h1, /^\$2a\$10\$[./A-Za-z0-9]{53}$/);
    assert.notEqual(h1, h2, 'unique per student');
    assert.equal(bcrypt.getRounds(h1), 10);
    for (const guess of ['', 'a@x.test', 'Rahul Sharma', 'password', '2026000000']) assert.equal(bcrypt.compareSync(guess, h1), false);
    assert.ok(!JSON.stringify(result).includes('$2a$') && !/password/i.test(JSON.stringify(result)));
  });

  it('generates studentIds with crypto.randomInt and retries on collision', async () => {
    const db = await createLmsTestDatabase();
    await db.exec("INSERT INTO users (id, name, email, password, role, university_id) VALUES (50, 'X', 'x@x.test', 'x', 'student', 2)");
    await db.exec("INSERT INTO students (userId, studentId) VALUES (50, '2026000007')");
    const seq = [7, 7, 42];
    const spy = mock.method(crypto, 'randomInt', () => seq.shift());
    const result = await adapterFor(db).createStudent({ idempotencyKey: 'k1', student: student('a@x.test') });
    assert.equal(result.studentRef, 'lms-student:2026000042');
    assert.equal(spy.mock.callCount(), 3);
  });

  it('refuses an email that exists in any school, ignoring case', async () => {
    const db = await createLmsTestDatabase();
    await adapterFor(db).createStudent({ idempotencyKey: 'k1', student: student('Rahul@Example.com') });
    const before = await counts(db);
    await rejectsSafely(adapterFor(db).createStudent({ idempotencyKey: 'k2', student: student('rahul@example.COM') }), 'STUDENT_ALREADY_EXISTS');
    await rejectsSafely(adapterFor(db, { userId: 2, role: 'admin', universityId: 2 }).createStudent({ idempotencyKey: 'k3', student: student('RAHUL@example.com') }), 'STUDENT_ALREADY_EXISTS');
    await rejectsSafely(adapterFor(db).createStudent({ idempotencyKey: 'k4', student: student('ADMIN@s1.test') }), 'STUDENT_ALREADY_EXISTS');
    assert.deepEqual(await counts(db), before);
  });

  it('rolls back everything when any insert fails (no orphan user, no idempotency record)', async () => {
    const db = await createLmsTestDatabase();
    await addTrigger(db, 'fail_students', 'BEFORE INSERT', 'students', "RAISE EXCEPTION 'internal detail /srv/secret.db';");
    const before = await counts(db);
    await rejectsSafely(adapterFor(db).createStudent({ idempotencyKey: 'k1', student: student('a@x.test') }), 'LMS_UNAVAILABLE');
    assert.deepEqual(await counts(db), before);
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM users WHERE email = 'a@x.test'")).n, 0);
    assert.equal((await db.get('SELECT 1 AS ok')).ok, 1, 'transaction closed, the database is usable');
  });

  it('enforces the plan quota inside the transaction', async () => {
    const db = await createLmsTestDatabase();
    const a = adapterFor(db); // school 1: free plan, 10 students
    for (let i = 0; i < 10; i++) await a.createStudent({ idempotencyKey: `k${i}`, student: student(`s${i}@x.test`) });
    await rejectsSafely(a.createStudent({ idempotencyKey: 'k10', student: student('s10@x.test') }), 'QUOTA_EXCEEDED');
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND university_id = 1")).n, 10);
    const pro = adapterFor(db, { userId: 5, role: 'admin', universityId: 3 }); // professional: no limit
    for (let i = 0; i < 12; i++) await pro.createStudent({ idempotencyKey: `p${i}`, student: student(`p${i}@x.test`) });
    const custom = adapterFor(db, ADMIN_S1, { studentLimits: { free: 11 } });
    await custom.createStudent({ idempotencyKey: 'k10', student: student('s10@x.test') });
  });

  it('is durably idempotent: same key -> same result, no duplicate, even from a new adapter', async () => {
    const db = await createLmsTestDatabase();
    const first = await adapterFor(db).createStudent({ idempotencyKey: 'job-1:2:createStudent', student: student('a@x.test') });
    const after = await counts(db);
    const again = await adapterFor(db).createStudent({ idempotencyKey: 'job-1:2:createStudent', student: student('a@x.test') });
    assert.deepEqual(again, { studentRef: first.studentRef, created: false });
    assert.deepEqual(await counts(db), after);
    await rejectsSafely(adapterFor(db).assignStudentToClassroom({ idempotencyKey: 'job-1:2:createStudent', studentEmail: 'a@x.test', className: '10', section: 'A' }), 'IDEMPOTENCY_KEY_CONFLICT');
    // keys are per school: the same key in school 2 is a separate operation
    const other = await adapterFor(db, { userId: 2, role: 'admin', universityId: 2 }).createStudent({ idempotencyKey: 'job-1:2:createStudent', student: student('b@x.test') });
    assert.equal(other.created, true);
  });

  it('accepts only canonical creation fields; system fields are refused before any write', async () => {
    const db = await createLmsTestDatabase();
    const before = await counts(db);
    for (const extra of [{ password: 'x' }, { role: 'admin' }, { universityId: 2 }, { studentId: '1' }, { classroomId: 1 }, { isApproved: 0 }, { className: '10' }]) {
      await rejectsSafely(adapterFor(db).createStudent({ idempotencyKey: 'k1', student: student('a@x.test', extra) }), 'INVALID_REQUEST');
    }
    for (const bad of [null, { student: student('a@x.test') }, { idempotencyKey: 'k1', student: student('a@x.test'), approved: true },
      { idempotencyKey: 'job:2:create@student', student: student('a@x.test') },
      { idempotencyKey: 'bad key!', student: student('a@x.test') }, { idempotencyKey: 'k1', student: student('not-an-email') }]) {
      await rejectsSafely(adapterFor(db).createStudent(bad), 'INVALID_REQUEST');
    }
    assert.deepEqual(await counts(db), before);
  });
});

describe('assignStudentToClassroom', () => {
  async function withStudent(email = 'rahul@example.com', actor = ADMIN_S1) {
    const db = await createLmsTestDatabase();
    await adapterFor(db, actor).createStudent({ idempotencyKey: 'job-1:2:createStudent', student: student(email) });
    return db;
  }
  const assign = (db, extra = {}, actor = ADMIN_S1) => adapterFor(db, actor).assignStudentToClassroom({
    idempotencyKey: 'job-1:2:assignStudentToClassroom', studentEmail: 'rahul@example.com', className: '10', section: 'A', ...extra,
  });

  it('assigns through the junction table only (case-insensitive match, no users.classroom_id, no rollNumber)', async () => {
    const db = await withStudent();
    const result = await assign(db, { studentEmail: 'RAHUL@example.com', className: ' 10 ', section: 'a' });
    assert.deepEqual(result, { outcome: 'assigned', assignmentRef: 'lms-assignment:1', replayed: false });
    const row = await db.get('SELECT * FROM student_classroom_assignment');
    const u = await db.get("SELECT id, classroom_id FROM users WHERE email = 'rahul@example.com'");
    assert.deepEqual([row.studentId, row.classroomId], [u.id, 1]);
    assert.equal(u.classroom_id, null, 'users.classroom_id untouched');
    assert.equal((await db.get('SELECT rollNumber FROM students WHERE userId = ?', [u.id])).rollNumber, null, 'section never written to rollNumber');
    assert.equal((await db.get('SELECT studentCount FROM classrooms WHERE id = 1')).studentCount, 1, 'displayed counter maintained');
  });

  it('reports a missing classroom and an ambiguous one without writing', async () => {
    const db = await withStudent();
    const before = await counts(db);
    assert.deepEqual(await assign(db, { className: '9', section: 'A' }), { outcome: 'classroom_not_found', assignmentRef: null, replayed: false });
    assert.deepEqual(await assign(db, { className: '10', section: 'Z' }), { outcome: 'classroom_not_found', assignmentRef: null, replayed: false });
    assert.deepEqual(await assign(db, { className: '12', section: 'C' }), { outcome: 'classroom_ambiguous', assignmentRef: null, replayed: false });
    assert.deepEqual(await counts(db), before, 'not assigned, not recorded (a retry is evaluated afresh)');
  });

  it('treats an existing assignment as assigned (no duplicate row) and replays by key', async () => {
    const db = await withStudent();
    const u = await db.get("SELECT id FROM users WHERE email = 'rahul@example.com'");
    await db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, 1)', [u.id]);
    const first = await assign(db);
    assert.deepEqual(first, { outcome: 'assigned', assignmentRef: 'lms-assignment:1', replayed: false });
    assert.equal((await counts(db)).assignments, 1);
    assert.deepEqual(await assign(db), { outcome: 'assigned', assignmentRef: 'lms-assignment:1', replayed: true });
  });

  it('isolates tenants: students and classrooms of another school are invisible', async () => {
    const db = await withStudent('other@example.com', { userId: 2, role: 'admin', universityId: 2 });
    await rejectsSafely(assign(db, { studentEmail: 'other@example.com' }), 'STUDENT_NOT_FOUND');
    const s1 = await withStudent();
    // school 2 admin cannot see school 1's student, even though classroom 10/A exists in school 2
    await rejectsSafely(assign(s1, {}, { userId: 2, role: 'admin', universityId: 2 }), 'STUDENT_NOT_FOUND');
    assert.equal((await counts(s1)).assignments, 0);
  });

  it('never assigns a non-student user', async () => {
    const db = await createLmsTestDatabase();
    await rejectsSafely(assign(db, { studentEmail: 'mentor@s1.test' }), 'STUDENT_NOT_FOUND');
    await rejectsSafely(assign(db, { studentEmail: 'admin@s1.test' }), 'STUDENT_NOT_FOUND');
  });

  it('refuses IDs and unknown fields', async () => {
    const db = await withStudent();
    for (const extra of [{ classroomId: 1 }, { studentId: 5 }, { universityId: 2 }, { table: 'classrooms' }]) {
      await rejectsSafely(assign(db, extra), 'INVALID_REQUEST');
    }
    await rejectsSafely(assign(db, { section: '' }), 'INVALID_REQUEST');
    assert.equal((await counts(db)).assignments, 0);
  });
});

describe('classrooms.studentCount (the counter the LMS displays)', () => {
  const allCounts = async (db) => (await db.all('SELECT id, studentCount FROM classrooms ORDER BY id')).map((r) => [r.id, r.studentCount]);
  const countOf = async (db, id) => (await db.get('SELECT studentCount FROM classrooms WHERE id = ?', [id])).studentCount;
  async function schoolWithStudents(emails) {
    const db = await createLmsTestDatabase();
    for (const [i, email] of emails.entries()) await adapterFor(db).createStudent({ idempotencyKey: `job-1:${i + 2}:createStudent`, student: student(email) });
    return db;
  }
  const assign = (db, email, key, extra = {}) => adapterFor(db).assignStudentToClassroom({ idempotencyKey: key, studentEmail: email, className: '10', section: 'A', ...extra });

  it('the first assignment increments exactly once; each new student adds one', async () => {
    const db = await schoolWithStudents(['a@x.test', 'b@x.test']);
    const before = await allCounts(db);
    await assign(db, 'a@x.test', 'job-1:2:assignStudentToClassroom');
    assert.equal(await countOf(db, 1), 1);
    await assign(db, 'b@x.test', 'job-1:3:assignStudentToClassroom');
    assert.equal(await countOf(db, 1), 2);
    assert.deepEqual((await allCounts(db)).filter(([id]) => id !== 1), before.filter(([id]) => id !== 1), 'other classrooms and schools untouched');
  });

  it('a replayed or already-existing assignment does not increment', async () => {
    const db = await schoolWithStudents(['a@x.test']);
    await assign(db, 'a@x.test', 'job-1:2:assignStudentToClassroom');
    assert.equal(await countOf(db, 1), 1);
    assert.equal((await assign(db, 'a@x.test', 'job-1:2:assignStudentToClassroom')).replayed, true); // same key
    assert.equal(await countOf(db, 1), 1);
    assert.equal((await assign(db, 'a@x.test', 'job-2:2:assignStudentToClassroom')).outcome, 'assigned'); // new key, row exists
    assert.equal(await countOf(db, 1), 1);
    const pre = await schoolWithStudents(['p@x.test']);
    const u = await pre.get("SELECT id FROM users WHERE email = 'p@x.test'");
    await pre.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, 1)', [u.id]); // assigned by the LMS earlier
    await assign(pre, 'p@x.test', 'job-1:2:assignStudentToClassroom');
    assert.equal(await countOf(pre, 1), 0, 'the LMS row was not created by us, so the counter is not touched');
  });

  it('a failed assignment does not increment (and a failing increment undoes the assignment)', async () => {
    const db = await schoolWithStudents(['a@x.test']);
    await addTrigger(db, 'fail_assign', 'BEFORE INSERT', 'student_classroom_assignment', "RAISE EXCEPTION 'x';");
    await rejectsSafely(assign(db, 'a@x.test', 'job-1:2:assignStudentToClassroom'), 'LMS_UNAVAILABLE');
    assert.equal(await countOf(db, 1), 0);
    await dropTrigger(db, 'fail_assign', 'student_classroom_assignment');
    await addTrigger(db, 'fail_count', 'BEFORE UPDATE OF studentCount', 'classrooms', "RAISE EXCEPTION 'x';");
    await rejectsSafely(assign(db, 'a@x.test', 'job-1:2:assignStudentToClassroom'), 'LMS_UNAVAILABLE');
    assert.equal(await countOf(db, 1), 0);
    assert.equal((await counts(db)).assignments, 0, 'same transaction: the assignment row was rolled back with the counter');
    await rejectsSafely(assign(db, 'nobody@x.test', 'job-1:3:assignStudentToClassroom'), 'STUDENT_NOT_FOUND');
    assert.equal(await countOf(db, 1), 0);
  });

  it('the counter update is tenant-scoped and must hit exactly one row, or the assignment rolls back', async () => {
    const db = await schoolWithStudents(['a@x.test']);
    // Simulates the classroom leaving the tenant mid-operation: the scoped UPDATE then matches 0 rows.
    await addTrigger(db, 'move_room', 'AFTER INSERT', 'student_classroom_assignment', 'UPDATE classrooms SET university_id = 2 WHERE id = NEW.classroomId;');
    await rejectsSafely(assign(db, 'a@x.test', 'job-1:2:assignStudentToClassroom'), 'LMS_UNAVAILABLE');
    const room = await db.get('SELECT studentCount, university_id FROM classrooms WHERE id = 1');
    assert.deepEqual([room.studentCount, room.university_id], [0, 1], 'no counter change; the whole transaction was undone');
    assert.equal((await counts(db)).assignments, 0);
  });

  it('not-found and ambiguous classrooms change no counter', async () => {
    const db = await schoolWithStudents(['a@x.test']);
    const before = await allCounts(db);
    await assign(db, 'a@x.test', 'k1', { className: '9' });
    await assign(db, 'a@x.test', 'k2', { className: '12', section: 'C' });
    assert.deepEqual(await allCounts(db), before);
  });
});

describe('end to end: approved import -> executor -> tools -> PostgresLmsAdapter', () => {
  const { LLMProvider } = require('../src/llm/LLMProvider');
  const { ColumnMappingService } = require('../src/mapping/ColumnMappingService');
  const { InMemoryImportJobStore } = require('../src/import/ImportJobStore');
  const { ImportJobService } = require('../src/import/ImportJobService');
  const { createApprovedImportExecutor } = require('../src/execution/ApprovedImportExecutor');

  class FakeLlm extends LLMProvider {
    constructor() { super('fake'); }
    async generate() {
      return JSON.stringify({ mappings: [
        { sourceColumn: 'Name', status: 'mapped', targetField: 'fullName', confidence: 0.9 },
        { sourceColumn: 'Email', status: 'mapped', targetField: 'email', confidence: 0.9 },
        { sourceColumn: 'Class', status: 'mapped', targetField: 'className', confidence: 0.9 },
        { sourceColumn: 'Div', status: 'mapped', targetField: 'section', confidence: 0.9 },
      ] });
    }
  }
  const rows = [
    { rowNumber: 2, values: { Name: 'Rahul Sharma', Email: 'rahul@example.com', Class: 10, Div: 'A' } },
    { rowNumber: 3, values: { Name: 'Asha Rao', Email: 'asha@example.com', Class: 12, Div: 'C' } },
    { rowNumber: 4, values: { Name: 'Vik Das', Email: 'ADMIN@s1.test', Class: 10, Div: 'A' } },
  ];

  it('creates, assigns, reports per row, and a repeat run creates nothing', async () => {
    const db = await createLmsTestDatabase();
    const jobService = new ImportJobService({
      schema,
      store: new InMemoryImportJobStore(),
      importService: { parse: async () => ({ fileName: 's.xlsx', sheetName: 'S', sheetNames: ['S'], headerRowNumber: 1, headers: ['Name', 'Email', 'Class', 'Div'],
        rows: structuredClone(rows), rowCount: 3, columnCount: 4, skippedBlankRows: 0, warnings: [] }) },
      mappingService: new ColumnMappingService({ schema, llmProvider: new FakeLlm() }),
    });
    const { jobId } = await jobService.startJob(Buffer.from('x'));
    await jobService.approveImport(jobId);

    const executor = createApprovedImportExecutor({ schema, jobService, lmsAdapter: adapterFor(db) });
    const result = await executor.executeApprovedImport(jobId);
    assert.deepEqual(result.rows.map((r) => [r.rowNumber, r.student.status, r.student.error, r.classroom.status]), [
      [2, 'created', null, 'assigned'],
      [3, 'created', null, 'classroom_ambiguous'],
      [4, 'failed', { code: 'ADAPTER_FAILURE', reasons: ['STUDENT_ALREADY_EXISTS'] }, 'skipped_student_not_created'],
    ]);
    const after = await counts(db);
    assert.deepEqual(after, { users: 7, students: 2, assignments: 1, idempotency: 3 });
    assert.ok(!/\$2a\$|password/i.test(JSON.stringify(result)));

    assert.equal((await executor.executeApprovedImport(jobId)).repeated, true);
    // a fresh executor (e.g. after a restart) replays from the durable keys instead of duplicating
    const fresh = await createApprovedImportExecutor({ schema, jobService, lmsAdapter: adapterFor(db) }).executeApprovedImport(jobId);
    assert.deepEqual(fresh.rows.map((r) => r.student.status), ['already_created', 'already_created', 'failed']);
    assert.deepEqual(await counts(db), after);
  });
});

describe('openPostgresLmsAdapter', () => {
  it('needs the LMS database interface; it never opens anything itself', () => {
    assert.throws(() => openPostgresLmsAdapter({ sql: null, actor: ADMIN_S1, schema }), TypeError);
    assert.throws(() => openPostgresLmsAdapter({ sql: { get() {} }, actor: ADMIN_S1, schema }), TypeError);
  });
});
