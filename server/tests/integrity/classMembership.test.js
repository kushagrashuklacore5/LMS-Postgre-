// One student belongs to at most one classroom at a time: assigning refuses a second classroom,
// "change class" replaces the membership atomically, concurrent requests cannot create two, and the
// database itself refuses a second row (migration 003).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('one classroom per student', () => {
  let ctx;
  let ids;
  const LOOSE = 30; // a student of School A with no classroom yet
  const LOOSE2 = 31;
  const memberships = async (studentId) =>
    (await ctx.db.all('SELECT classroomId FROM student_classroom_assignment WHERE studentId = ? ORDER BY classroomId', [studentId])).map((r) => Number(r.classroomId));
  const studentCount = async (classroomId) => Number((await ctx.db.get('SELECT studentCount FROM classrooms WHERE id = ?', [classroomId])).studentCount);

  before(async () => {
    ctx = await startTestApp();
    ids = ctx.ids;
    for (const id of [LOOSE, LOOSE2]) {
      await ctx.db.run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, 'x', 'student', ?, 1)", [id, `loose${id}`, `loose${id}@test.invalid`, ids.schoolA]);
      await ctx.db.run("INSERT INTO students (userId, studentId, grade) VALUES (?, ?, '')", [id, `2026${id}`]);
    }
  });
  after(async () => { await ctx.stop(); });

  it('assigning a student who is already in another classroom is refused and changes nothing', async () => {
    const response = await ctx.api('POST', '/api/classrooms/assign-student', { as: 'adminA', body: { classroomId: ids.classroomA2, studentId: ids.users.studentA } });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'STUDENT_IN_OTHER_CLASSROOM');
    assert.match(response.body.message, /Change class/);
    assert.deepEqual(await memberships(ids.users.studentA), [ids.classroomA]);
  });

  it('assigning the same classroom twice keeps one membership', async () => {
    const response = await ctx.api('POST', '/api/classrooms/assign-student', { as: 'adminA', body: { classroomId: ids.classroomA, studentId: ids.users.studentA } });
    assert.equal(response.status, 400);
    assert.deepEqual(await memberships(ids.users.studentA), [ids.classroomA]);
  });

  it('change class replaces the membership and keeps both classroom counts right', async () => {
    const response = await ctx.api('PUT', `/api/admin/students/${ids.users.studentA}/classroom`, { as: 'adminA', body: { classroomId: ids.classroomA2, className: '6', section: 'A' } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(await memberships(ids.users.studentA), [ids.classroomA2]);
    assert.equal(await studentCount(ids.classroomA), (await ctx.db.get('SELECT COUNT(*) n FROM student_classroom_assignment WHERE classroomId = ?', [ids.classroomA])).n * 1);
    assert.equal(await studentCount(ids.classroomA2), 2);
  });

  it('concurrent assignments of one unplaced student to two classrooms place them exactly once', async () => {
    const responses = await Promise.all([ids.classroomA, ids.classroomA2, ids.classroomA, ids.classroomA2].map((classroomId) =>
      ctx.api('POST', '/api/classrooms/assign-student', { as: 'adminA', body: { classroomId, studentId: LOOSE } })));
    assert.equal(responses.filter((r) => r.status === 200).length, 1, responses.map((r) => r.status).join(','));
    assert.ok(responses.every((r) => [200, 400, 409].includes(r.status)));
    assert.equal((await memberships(LOOSE)).length, 1);
  });

  it('concurrent class changes leave exactly one membership', async () => {
    const changes = [[ids.classroomA, '5'], [ids.classroomA2, '6'], [ids.classroomA, '5'], [ids.classroomA2, '6']];
    const responses = await Promise.all(changes.map(([classroomId, className]) =>
      ctx.api('PUT', `/api/admin/students/${LOOSE}/classroom`, { as: 'adminA', body: { classroomId, className, section: 'A' } })));
    assert.ok(responses.every((r) => r.status === 200), responses.map((r) => r.status).join(','));
    assert.equal((await memberships(LOOSE)).length, 1);
  });

  it('creating a classroom with a student who already has one is refused before anything is created', async () => {
    const response = await ctx.api('POST', '/api/classrooms', { as: 'adminA', body: { grade: '9', section: 'Z', classTeacherId: ids.users.mentorA, studentIds: [ids.users.studentA2, LOOSE2] } });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'STUDENT_IN_OTHER_CLASSROOM');
    assert.equal((await ctx.db.get("SELECT COUNT(*) n FROM classrooms WHERE grade = '9' AND section = 'Z'")).n * 1, 0);
    assert.deepEqual(await memberships(LOOSE2), []);
  });

  it('the database refuses a second classroom row for a student, whatever the code path', async () => {
    await assert.rejects(
      ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [ids.users.studentA2, ids.classroomA]),
      (err) => err.code === '23505'
    );
  });
});
