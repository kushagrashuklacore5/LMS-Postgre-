const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { assertAssessmentLmsAdapter } = require('../backend/src/adapters/lms/AssessmentLmsAdapter');
const { AssessmentService } = require('../backend/src/core/AssessmentService');
const { IDS, createLmsTestDb } = require('./helpers/lmsTestDb');

const code = async (fn) => { try { await fn(); } catch (err) { return err.code; } assert.fail('expected an error'); };

describe('PostgresAssessmentLmsAdapter.resolveActor (session -> verified actor)', () => {
  let adapter;
  before(async () => { adapter = (await createLmsTestDb()).adapter(); });

  it('builds a frozen actor from the session and the LMS database', async () => {
    const actor = await adapter.resolveActor({ userId: IDS.teacher1, universityId: IDS.school1, role: 'mentor' });
    assert.deepEqual(actor, { userId: IDS.teacher1, universityId: IDS.school1, kind: 'teacher' });
    assert.ok(Object.isFrozen(actor));
    assert.equal((await adapter.resolveActor({ userId: String(IDS.student1), universityId: String(IDS.school1), role: 'student' })).kind, 'student');
  });

  it('refuses a session whose school does not match the user\'s school', async () => {
    assert.equal(await code(async () => await adapter.resolveActor({ userId: IDS.teacher1, universityId: IDS.school2, role: 'mentor' })), 'TENANT_MISMATCH');
  });

  it('refuses unknown users and schools', async () => {
    assert.equal(await code(async () => await adapter.resolveActor({ userId: 999, universityId: IDS.school1, role: 'mentor' })), 'TENANT_MISMATCH');
    assert.equal(await code(async () => await adapter.resolveActor({ userId: IDS.teacher1, universityId: 999, role: 'mentor' })), 'TENANT_MISMATCH');
  });

  it('takes the role from the database, not from the token', async () => {
    // A token still claiming "mentor" for a user who is a student in the LMS.
    assert.equal((await adapter.resolveActor({ userId: IDS.student1, universityId: IDS.school1, role: 'mentor' })).kind, 'student');
  });

  it('refuses missing/invalid ids and non-teacher, non-student roles', async () => {
    for (const s of [undefined, null, {}, { userId: 0, universityId: 1 }, { userId: 'abc', universityId: 1 }, { userId: 1, universityId: null }]) {
      assert.equal(await code(async () => await adapter.resolveActor(s)), 'FORBIDDEN');
    }
    assert.equal(await code(async () => await adapter.resolveActor({ userId: IDS.admin1, universityId: IDS.school1, role: 'admin' })), 'FORBIDDEN');
  });
});

describe('adapter readiness and contract', () => {
  it('isReady is false when the module\'s tables are not in the schema, and the adapter writes nothing', async () => {
    const db = await createLmsTestDb({ withMigration: false });
    const adapter = db.adapter();
    assert.equal(adapter.isReady(), false);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_assessments')).n, 0);
  });

  it('isReady is true with the full schema', async () => {
    assert.equal((await createLmsTestDb()).adapter().isReady(), true);
  });

  it('the service refuses an incomplete adapter', async () => {
    assert.throws(() => new AssessmentService({ adapter: { resolveActor() {} } }), /missing: getClassroom/);
    const adapter = (await createLmsTestDb()).adapter();
    assert.doesNotThrow(() => assertAssessmentLmsAdapter(adapter));
  });

  it('transaction rolls back everything when the callback throws', async () => {
    const db = await createLmsTestDb();
    const adapter = db.adapter();
    await assert.rejects(async () => await adapter.transaction(async () => {
      await adapter.insertAssessment({ universityId: 1, teacherId: 1, title: 't', description: '', subject: 's', classroomId: null, durationMinutes: null });
      throw new Error('boom');
    }), /boom/);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_assessments')).n, 0);
  });

  it('a value that cannot be an id never matches (as in SQLite), it is not an error', async () => {
    const adapter = (await createLmsTestDb()).adapter();
    assert.equal(await adapter.findAssessment(IDS.school1, 'not-a-number'), null);
    assert.equal(await adapter.findAssessment(IDS.school1, '999999999999999999999'), null);
  });
});
