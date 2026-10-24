const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { AssessmentService } = require('../backend/src/core/AssessmentService');
const { IDS, createLmsTestDb, mcq } = require('./helpers/lmsTestDb');

// Session users exactly as the LMS authMiddleware builds req.user.
const session = (userId, universityId, role = 'mentor') => ({ userId, universityId, role, email: 'x', name: 'x' });

let db, adapter, service, t1, t2, t3, st1, st2, st3, stNoClass;
beforeEach(async () => {
  db = await createLmsTestDb();
  adapter = db.adapter();
  service = new AssessmentService({ adapter });
  t1 = await adapter.resolveActor(session(IDS.teacher1, IDS.school1));
  t2 = await adapter.resolveActor(session(IDS.teacher2, IDS.school1));
  t3 = await adapter.resolveActor(session(IDS.teacher3, IDS.school2));
  st1 = await adapter.resolveActor(session(IDS.student1, IDS.school1, 'student'));
  st2 = await adapter.resolveActor(session(IDS.student2, IDS.school1, 'student'));
  st3 = await adapter.resolveActor(session(IDS.student3, IDS.school2, 'student'));
  stNoClass = await adapter.resolveActor(session(IDS.studentNoClass, IDS.school1, 'student'));
});

const count = async (table) => (await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n;
const code = async (fn) => { try { await fn(); } catch (err) { return err.code; } assert.fail('expected an error'); };

async function publishedFor(teacher, classroomId, title = 'Published test') {
  const a = await service.createAssessment(teacher, { title, subject: 'Maths', classroomId });
  await service.addQuestion(teacher, a.id, mcq());
  return await service.publish(teacher, a.id);
}

describe('teacher creates and retrieves drafts', () => {
  it('creates a draft owned by the session teacher in the session school', async () => {
    const a = await service.createAssessment(t1, { title: 'Algebra quiz', description: 'Ch. 3', subject: 'Maths', classroomId: IDS.class10, durationMinutes: 30 });
    assert.equal(a.status, 'draft');
    assert.equal(a.questionCount, 0);
    assert.deepEqual(a.classroom, { id: IDS.class10, name: 'Grade 10 - A', grade: '10', section: 'A' });
    const row = await db.get('SELECT university_id, teacher_id, source FROM aia_assessments WHERE id = ?', [a.id]);
    assert.deepEqual({ ...row }, { university_id: IDS.school1, teacher_id: IDS.teacher1, source: 'manual' });
  });

  it('lists only the teacher\'s own assessments and returns a draft with its questions and answers', async () => {
    const mine = await service.createAssessment(t1, { title: 'Mine', subject: 'Maths' });
    await service.createAssessment(t2, { title: 'Colleague', subject: 'Maths' });
    await service.addQuestion(t1, mine.id, mcq('Q1', 0));
    await service.addQuestion(t1, mine.id, mcq('Q2', 3));

    assert.deepEqual((await service.listOwnAssessments(t1)).map((a) => a.title), ['Mine']);
    const draft = await service.getOwnAssessment(t1, String(mine.id)); // ids arrive as URL strings
    assert.equal(draft.questionCount, 2);
    assert.deepEqual(draft.questions.map((q) => [q.position, q.text]), [[1, 'Q1'], [2, 'Q2']]);
    assert.deepEqual(draft.questions[1].options.map((o) => o.isCorrect), [false, false, false, true]);
  });

  it('a user with LMS role "teacher" is also a teacher', async () => {
    const tr = await adapter.resolveActor(session(IDS.teacherRole, IDS.school1, 'teacher'));
    assert.equal((await service.createAssessment(tr, { title: 'T', subject: 'S' })).status, 'draft');
  });

  it('edits details, updates and deletes questions (positions close up)', async () => {
    const a = await service.createAssessment(t1, { title: 'Old', subject: 'Maths' });
    const q1 = (await service.addQuestion(t1, a.id, mcq('Q1'))).questions[0];
    await service.addQuestion(t1, a.id, mcq('Q2'));
    await service.addQuestion(t1, a.id, mcq('Q3'));

    assert.equal((await service.updateAssessment(t1, a.id, { title: 'New', durationMinutes: 20 })).title, 'New');
    const updated = await service.updateQuestion(t1, a.id, q1.id, mcq('Q1 edited', 2));
    assert.equal(updated.questions[0].text, 'Q1 edited');
    assert.deepEqual(updated.questions[0].options.map((o) => o.isCorrect), [false, false, true, false]);

    const after = await service.deleteQuestion(t1, a.id, q1.id);
    assert.deepEqual(after.questions.map((q) => [q.position, q.text]), [[1, 'Q2'], [2, 'Q3']]);
    assert.equal(await count('aia_options'), 8); // the deleted question's 4 options are gone too
  });

  it('an invalid question writes nothing', async () => {
    const a = await service.createAssessment(t1, { title: 'T', subject: 'S' });
    const bad = mcq(); bad.options[0].isCorrect = true; // two correct
    assert.equal(await code(async () => await service.addQuestion(t1, a.id, bad)), 'VALIDATION_FAILED');
    assert.equal(await count('aia_questions'), 0);
    assert.equal(await count('aia_options'), 0);
  });

  // (The PostgreSQL schema always includes migration 006, so the pre-006 unique index on aia_options
  // never exists; the rule is enforced by validation, below.)
  it('with migration 006 (index dropped for multiple-select), validation still refuses a second correct option on a single MCQ', async () => {
    const a = await service.createAssessment(t1, { title: 'T', subject: 'S' });
    const q = (await service.addQuestion(t1, a.id, mcq())).questions[0];
    const two = mcq(); two.options[0].isCorrect = true;
    assert.equal(await code(async () => await service.updateQuestion(t1, a.id, q.id, two)), 'VALIDATION_FAILED');
    assert.equal(await code(async () => await service.addQuestion(t1, a.id, { ...two, type: 'single_mcq' })), 'VALIDATION_FAILED');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_options WHERE is_correct = 1')).n, 1);
  });
});

describe('only teachers can create or change assessments', () => {
  it('students cannot create, list, read, edit, add questions, publish or see classrooms', async () => {
    const a = await service.createAssessment(t1, { title: 'T', subject: 'S', classroomId: IDS.class10 });
    const before = [await count('aia_assessments'), await count('aia_questions')];
    for (const fn of [
      async () => await service.createAssessment(st1, { title: 'Hack', subject: 'S' }),
      async () => await service.listOwnAssessments(st1),
      async () => await service.getOwnAssessment(st1, a.id),
      async () => await service.updateAssessment(st1, a.id, { title: 'Hack' }),
      async () => await service.addQuestion(st1, a.id, mcq()),
      async () => await service.publish(st1, a.id),
      async () => await service.listClassrooms(st1),
    ]) assert.equal(await code(fn), 'FORBIDDEN');
    assert.deepEqual([await count('aia_assessments'), await count('aia_questions')], before);
  });

  it('LMS admins and other roles are refused by the adapter', async () => {
    assert.equal(await code(async () => await adapter.resolveActor(session(IDS.admin1, IDS.school1, 'admin'))), 'FORBIDDEN');
  });

  it('teachers cannot use the student endpoints', async () => {
    assert.equal(await code(async () => await service.listAvailableForStudent(t1)), 'FORBIDDEN');
  });

  it('a missing actor is refused', async () => {
    assert.equal(await code(async () => await service.createAssessment(undefined, { title: 'T', subject: 'S' })), 'FORBIDDEN');
  });
});

describe('ownership and tenant isolation', () => {
  it('another teacher in the same school gets NOT_FOUND for every action', async () => {
    const a = await service.createAssessment(t1, { title: 'Private', subject: 'S', classroomId: IDS.class10 });
    const q = (await service.addQuestion(t1, a.id, mcq())).questions[0];
    for (const fn of [
      async () => await service.getOwnAssessment(t2, a.id),
      async () => await service.updateAssessment(t2, a.id, { title: 'x' }),
      async () => await service.addQuestion(t2, a.id, mcq()),
      async () => await service.updateQuestion(t2, a.id, q.id, mcq()),
      async () => await service.deleteQuestion(t2, a.id, q.id),
      async () => await service.publish(t2, a.id),
    ]) assert.equal(await code(fn), 'NOT_FOUND');
    assert.equal((await service.getOwnAssessment(t1, a.id)).title, 'Private');
  });

  it('a teacher in another school cannot see or touch it', async () => {
    const a = await service.createAssessment(t1, { title: 'School 1 only', subject: 'S' });
    assert.equal(await code(async () => await service.getOwnAssessment(t3, a.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await service.updateAssessment(t3, a.id, { title: 'x' })), 'NOT_FOUND');
    assert.deepEqual(await service.listOwnAssessments(t3), []);
  });

  it('the adapter never returns another school\'s assessment even for the same teacher id', async () => {
    const a = await service.createAssessment(t1, { title: 'T', subject: 'S' });
    assert.equal(await adapter.findAssessment(IDS.school2, a.id), null);
  });

  it('a classroom from another school cannot be targeted', async () => {
    assert.equal(await code(async () => await service.createAssessment(t1, { title: 'T', subject: 'S', classroomId: IDS.class20 })), 'VALIDATION_FAILED');
    const a = await service.createAssessment(t1, { title: 'T', subject: 'S' });
    assert.equal(await code(async () => await service.updateAssessment(t1, a.id, { classroomId: IDS.class20 })), 'VALIDATION_FAILED');
    assert.equal(await code(async () => await service.updateAssessment(t1, a.id, { classroomId: 99999 })), 'VALIDATION_FAILED');
    assert.equal(await count('aia_assessments'), 1);
  });

  it('the classroom list is limited to the teacher\'s school', async () => {
    assert.deepEqual((await service.listClassrooms(t1)).map((c) => c.id), [IDS.class10, IDS.class11]);
    assert.deepEqual((await service.listClassrooms(t3)).map((c) => c.id), [IDS.class20]);
  });

  it('a question id from another assessment is QUESTION_NOT_FOUND', async () => {
    const a = await service.createAssessment(t1, { title: 'A', subject: 'S' });
    const b = await service.createAssessment(t1, { title: 'B', subject: 'S' });
    const qOfA = (await service.addQuestion(t1, a.id, mcq())).questions[0];
    assert.equal(await code(async () => await service.updateQuestion(t1, b.id, qOfA.id, mcq())), 'QUESTION_NOT_FOUND');
    assert.equal(await code(async () => await service.deleteQuestion(t1, b.id, qOfA.id)), 'QUESTION_NOT_FOUND');
    assert.equal(await code(async () => await service.deleteQuestion(t1, a.id, 'abc')), 'QUESTION_NOT_FOUND');
  });

  it('malformed assessment ids are NOT_FOUND', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '', '1; DROP TABLE users']) {
      assert.equal(await code(async () => await service.getOwnAssessment(t1, id)), 'NOT_FOUND');
    }
  });
});

describe('publish / unpublish', () => {
  it('needs a target classroom and at least one question', async () => {
    const a = await service.createAssessment(t1, { title: 'T', subject: 'S' });
    try {
      await service.publish(t1, a.id);
      assert.fail('should not publish');
    } catch (err) {
      assert.equal(err.code, 'NOT_PUBLISHABLE');
      assert.deepEqual(err.details.map((d) => d.code), ['REQUIRED', 'NO_QUESTIONS']);
    }
  });

  it('publishes, then blocks edits until unpublished', async () => {
    const p = await publishedFor(t1, IDS.class10);
    assert.equal(p.status, 'published');
    assert.ok(p.publishedAt);
    assert.equal(await code(async () => await service.updateAssessment(t1, p.id, { title: 'x' })), 'ASSESSMENT_PUBLISHED');
    assert.equal(await code(async () => await service.addQuestion(t1, p.id, mcq())), 'ASSESSMENT_PUBLISHED');
    assert.equal(await code(async () => await service.deleteQuestion(t1, p.id, p.questions[0].id)), 'ASSESSMENT_PUBLISHED');
    assert.equal(await code(async () => await service.publish(t1, p.id)), 'ALREADY_PUBLISHED');

    const d = await service.unpublish(t1, p.id);
    assert.equal(d.status, 'draft');
    assert.equal(d.publishedAt, null);
    assert.equal(await code(async () => await service.unpublish(t1, p.id)), 'NOT_PUBLISHED');
    assert.equal((await service.updateAssessment(t1, p.id, { title: 'Fixed' })).title, 'Fixed');
  });

  it('re-checks the target classroom at publish time', async () => {
    const a = await service.createAssessment(t1, { title: 'T', subject: 'S', classroomId: IDS.class10 });
    await service.addQuestion(t1, a.id, mcq());
    await db.run('UPDATE classrooms SET university_id = 2 WHERE id = ?', [IDS.class10]); // class moved away
    assert.equal(await code(async () => await service.publish(t1, a.id)), 'NOT_PUBLISHABLE');
  });
});

describe('student visibility (read-only, no answers)', () => {
  it('a student sees only published tests for their own class in their own school', async () => {
    await publishedFor(t1, IDS.class10, 'For class 10');
    await publishedFor(t2, IDS.class11, 'For class 11');
    await publishedFor(t3, IDS.class20, 'Other school');
    await service.createAssessment(t1, { title: 'Draft for class 10', subject: 'S', classroomId: IDS.class10 });

    assert.deepEqual((await service.listAvailableForStudent(st1)).map((a) => a.title), ['For class 10']);
    assert.deepEqual((await service.listAvailableForStudent(st2)).map((a) => a.title), ['For class 11']);
    assert.deepEqual((await service.listAvailableForStudent(st3)).map((a) => a.title), ['Other school']);
    assert.deepEqual(await service.listAvailableForStudent(stNoClass), []);
  });

  it('never exposes correct answers or teacher-only fields to students', async () => {
    const p = await publishedFor(t1, IDS.class10);
    const view = await service.getAvailableForStudent(st1, p.id);
    const json = JSON.stringify(view);
    assert.equal(json.includes('isCorrect'), false);
    assert.equal(json.includes('teacherId'), false);
    assert.equal(json.includes('status'), false);
    assert.equal(view.questions[0].options.length, 4);
    assert.deepEqual(Object.keys(view.questions[0].options[0]).sort(), ['position', 'text']);
  });

  it('drafts, other classes and other schools are NOT_FOUND for a student', async () => {
    const draft = await service.createAssessment(t1, { title: 'D', subject: 'S', classroomId: IDS.class10 });
    const class11 = await publishedFor(t1, IDS.class11);
    const otherSchool = await publishedFor(t3, IDS.class20);
    assert.equal(await code(async () => await service.getAvailableForStudent(st1, draft.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await service.getAvailableForStudent(st1, class11.id)), 'NOT_FOUND');
    assert.equal(await code(async () => await service.getAvailableForStudent(st1, otherSchool.id)), 'NOT_FOUND');
  });

  it('unpublishing hides a test from students again', async () => {
    const p = await publishedFor(t1, IDS.class10);
    await service.unpublish(t1, p.id);
    assert.deepEqual(await service.listAvailableForStudent(st1), []);
  });
});
