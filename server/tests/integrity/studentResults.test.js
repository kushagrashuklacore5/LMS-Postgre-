// A student's results include their teacher-evaluated AI-module assignments (the query used to order by a
// column that does not exist, so the error was swallowed and evaluated assignments never appeared).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('student results', () => {
  let ctx;
  before(async () => {
    ctx = await startTestApp();
    const { ids, db } = ctx;
    const { lastID: assignmentId } = await db.run(
      "INSERT INTO aia_assignments (university_id, teacher_id, classroom_id, title, max_marks, status) VALUES (?, ?, ?, 'Essay on plants', 20, 'published')",
      [ids.schoolA, ids.users.mentorA, ids.classroomA]);
    const submission = (studentId, key, evaluated) => db.run(
      `INSERT INTO aia_assignment_submissions (university_id, assignment_id, student_id, status, storage_key, original_filename, file_size, sha256,
         submitted_at, final_marks, teacher_feedback, evaluated_at, evaluated_by)
       VALUES (?, ?, ?, ?, ?, 'essay.pdf', 1000, 'x', '2026-10-01T10:00:00Z', ?, ?, ?, ?)`,
      [ids.schoolA, assignmentId, studentId, evaluated ? 'evaluated' : 'submitted', key,
        evaluated ? 15 : null, evaluated ? 'Well argued.' : null, evaluated ? '2026-10-02T09:00:00Z' : null, evaluated ? ids.users.mentorA : null]);
    await submission(ids.users.studentA, 'k-a', true);
    await submission(ids.users.studentA2, 'k-a2', false);
  });
  after(async () => { await ctx.stop(); });

  it('lists an evaluated assignment with the teacher\'s final marks and feedback', async () => {
    const response = await ctx.api('GET', '/api/results/my-results', { as: 'studentA' });
    assert.equal(response.status, 200);
    const assignments = response.body.filter((r) => r.type === 'assignment');
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].term, 'Essay on plants');
    assert.equal(assignments[0].overallPercentage, 75);
    assert.equal(assignments[0].comments, 'Well argued.');
    assert.equal(assignments[0].createdAt, '2026-10-02T09:00:00Z');
  });

  it('does not list a submission the teacher has not evaluated, nor another student\'s', async () => {
    const response = await ctx.api('GET', '/api/results/my-results', { as: 'studentA2' });
    assert.equal(response.status, 200);
    assert.equal(response.body.filter((r) => r.type === 'assignment').length, 0);
  });
});
