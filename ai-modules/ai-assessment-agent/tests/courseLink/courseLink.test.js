// Migration 010: a test belongs to a class AND a course of that class.
// Real AssessmentService + PostgreSQL adapter, throw-away LMS database (migrations 001-010) with the
// LMS enrolment tables (course_students, course_classrooms) that the adapter reads.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { createLmsTestDb, IDS, mcq } = require('../helpers/lmsTestDb');
const { AssessmentService } = require('../../backend/src/core/AssessmentService');

const T1 = { userId: IDS.teacher1, universityId: IDS.school1, kind: 'teacher' };
const T2 = { userId: IDS.teacher2, universityId: IDS.school1, kind: 'teacher' };
const T3 = { userId: IDS.teacher3, universityId: IDS.school2, kind: 'teacher' };
const student = (id, school = IDS.school1) => ({ userId: id, universityId: school, kind: 'student' });
const failure = async (fn) => { try { await fn(); } catch (e) { return { code: e.code, details: (e.details || []).map((d) => `${d.field}:${d.code}`) }; } return { code: 'ok', details: [] }; };

// Courses: 100 Maths (teacher1, home class 10); 101 Science (teacher2, home class 10);
// 102 History (teacher1, home class 11, also assigned to class 10).
// Class 10: student1 (enrolled in Maths) and student 30 (enrolled in History only).
async function buildDb({ withCourseLink = true } = {}) {
  const db = await createLmsTestDb({ withCourseLink, withCourseClasses: true });
  await db.exec(`INSERT INTO users (id, name, email, password, role, university_id) VALUES (30, 'Student Thirty', 'st30@s1.test', 'x', 'student', 1);
           INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (30, 10);
           INSERT INTO courses (id, title, mentorId, classroomId, university_id) VALUES (100, 'Maths', 1, 10, 1), (101, 'Science', 2, 10, 1), (102, 'History', 1, 11, 1);
           INSERT INTO course_classrooms (courseId, classroomId, enrollAll) VALUES (100, 10, 1), (101, 10, 1), (102, 11, 1), (102, 10, 0);
           INSERT INTO course_students (courseId, studentId) VALUES (100, 4), (102, 30);`);
  return db;
}

describe('AI assessments belong to a course of their class (migration 010)', () => {
  let svc;
  let db;
  before(async () => {
    db = await buildDb();
    svc = new AssessmentService({ adapter: db.adapter() });
  });

  it('a new test needs a class and one of the teacher\'s courses taught to that class', async () => {
    assert.deepEqual(await failure(async () => await svc.createAssessment(T1, { title: 'No course', subject: 'Maths', classroomId: IDS.class10 })), { code: 'VALIDATION_FAILED', details: ['courseId:REQUIRED'] });
    assert.deepEqual(await failure(async () => await svc.createAssessment(T1, { title: 'No class', subject: 'Maths', courseId: 100 })), { code: 'VALIDATION_FAILED', details: ['classroomId:REQUIRED'] });
    assert.deepEqual(await failure(async () => await svc.createAssessment(T1, { title: 'Not mine', subject: 'Science', classroomId: IDS.class10, courseId: 101 })), { code: 'VALIDATION_FAILED', details: ['courseId:COURSE_NOT_FOUND'] }, 'another teacher\'s course');
    assert.deepEqual(await failure(async () => await svc.createAssessment(T1, { title: 'Wrong class', subject: 'Maths', classroomId: IDS.class11, courseId: 100 })), { code: 'VALIDATION_FAILED', details: ['courseId:COURSE_NOT_FOUND'] }, 'Maths is not taught to class 11');
    assert.deepEqual(await failure(async () => await svc.createAssessment(T3, { title: 'Other school', subject: 'Maths', classroomId: IDS.class20, courseId: 100 })), { code: 'VALIDATION_FAILED', details: ['courseId:COURSE_NOT_FOUND'] });
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM aia_assessments')).n, 0, 'nothing was saved');

    const maths = await svc.createAssessment(T1, { title: 'Fractions', subject: 'Maths', classroomId: IDS.class10, courseId: 100 });
    assert.deepEqual([maths.courseId, maths.course, maths.legacy], [100, { id: 100, title: 'Maths' }, false]);
    assert.equal((await db.get('SELECT course_id FROM aia_assessments WHERE id = ?', [maths.id])).course_id, 100, 'stored with the test');
    const history = await svc.createAssessment(T1, { title: 'Kings', subject: 'History', classroomId: IDS.class10, courseId: 102 });
    assert.equal(history.course.title, 'History', 'a course assigned to the class (not its home class) is valid too');

    // the AI review -> save path has the same rule
    assert.deepEqual(await failure(async () => await svc.createAssessmentWithQuestions(T1, { assessment: { title: 'Reviewed', subject: 'Maths', classroomId: IDS.class10 }, questions: [mcq()] })),
      { code: 'VALIDATION_FAILED', details: ['assessment.courseId:REQUIRED'] });
  });
});

describe('who is given a course test', () => {
  let svc;
  let db;
  let maths;
  before(async () => {
    db = await buildDb();
    svc = new AssessmentService({ adapter: db.adapter() });
    maths = await svc.createAssessmentWithQuestions(T1, { assessment: { title: 'Fractions', subject: 'Maths', classroomId: IDS.class10, courseId: 100 }, questions: [mcq()] });
  });

  it('the "assign to" list shows the class\'s students enrolled in the course', async () => {
    assert.deepEqual((await svc.listClassroomStudents(T1, IDS.class10, 100)).map((s) => s.id), [IDS.student1]);
    assert.deepEqual((await svc.listClassroomStudents(T1, IDS.class10, 102)).map((s) => s.id), [30]);
    assert.deepEqual((await svc.listClassroomStudents(T1, IDS.class10)).map((s) => s.id).sort((a, b) => a - b), [IDS.student1, 30], 'without a course: the class');
    assert.equal((await failure(async () => await svc.listClassroomStudents(T1, IDS.class10, 101))).code, 'NOT_FOUND', 'not the teacher\'s course');
  });

  it('published to the whole class, only the enrolled students see it', async () => {
    await svc.publish(T1, maths.id);
    assert.deepEqual((await svc.listAvailableForStudent(student(IDS.student1))).map((a) => a.id), [maths.id]);
    assert.equal((await svc.listAvailableForStudent(student(IDS.student1)))[0].course.title, 'Maths');
    assert.deepEqual(await svc.listAvailableForStudent(student(30)), [], 'in the class but not in the course');
    assert.equal((await failure(async () => await svc.getAvailableForStudent(student(30), maths.id))).code, 'NOT_FOUND');
    assert.deepEqual(await svc.listAvailableForStudent(student(IDS.student2)), [], 'another class');
  });

  it('a selected student must be enrolled in the course', async () => {
    const second = await svc.createAssessmentWithQuestions(T1, { assessment: { title: 'Decimals', subject: 'Maths', classroomId: IDS.class10, courseId: 100 }, questions: [mcq()] });
    assert.deepEqual(await failure(async () => await svc.publish(T1, second.id, { recipientIds: [30] })), { code: 'VALIDATION_FAILED', details: ['recipientIds:NOT_IN_COURSE'] });
    const published = await svc.publish(T1, second.id, { recipientIds: [IDS.student1] });
    assert.equal(published.status, 'published');
  });

  it('edits keep the class and the course together', async () => {
    const draft = await svc.createAssessment(T1, { title: 'Draft', subject: 'Maths', classroomId: IDS.class10, courseId: 100 });
    assert.deepEqual(await failure(async () => await svc.updateAssessment(T1, draft.id, { classroomId: IDS.class11 })), { code: 'VALIDATION_FAILED', details: ['courseId:COURSE_NOT_FOUND'] }, 'Maths is not taught to class 11');
    const moved = await svc.updateAssessment(T1, draft.id, { classroomId: IDS.class11, courseId: 102 });
    assert.deepEqual([moved.classroomId, moved.courseId], [IDS.class11, 102]);
    assert.deepEqual(await failure(async () => await svc.updateAssessment(T1, draft.id, { courseId: null })), { code: 'VALIDATION_FAILED', details: ['courseId:REQUIRED'] });
    assert.deepEqual((await failure(async () => await svc.updateAssessment(T2, draft.id, { title: 'x' }))).code, 'NOT_FOUND', 'another teacher');
  });
});

describe('tests made before migration 010 (legacy)', () => {
  it('stay with their class audience, are marked legacy, and may be given a course later', async () => {
    const db = await buildDb();
    const svc = new AssessmentService({ adapter: db.adapter() });
    // a draft and a published test written before tests had a course
    await db.exec(`INSERT INTO aia_assessments (id, university_id, teacher_id, title, subject, classroom_id, status, published_at) VALUES
             (900, 1, 1, 'Old published', 'Maths', 10, 'published', utc_now_text()), (901, 1, 1, 'Old draft', 'Maths', 10, 'draft', NULL);
             INSERT INTO aia_questions (id, assessment_id, position, text) VALUES (9000, 900, 1, 'Q');`);
    const listed = await svc.listOwnAssessments(T1);
    const old = listed.find((a) => a.id === 900);
    assert.deepEqual([old.courseId, old.course, old.legacy], [null, null, true]);
    assert.deepEqual((await svc.listAvailableForStudent(student(30))).map((a) => a.id), [900], 'the whole class still sees it: no course is guessed');
    const given = await svc.updateAssessment(T1, 901, { courseId: 100 });
    assert.deepEqual([given.courseId, given.legacy], [100, false]);
    assert.equal((await db.get('SELECT course_id FROM aia_assessments WHERE id = 900')).course_id, null, 'the published one is left as it was');
  });

  it('before migration 010 nothing changes: no course is asked for or stored', async () => {
    const db = await buildDb({ withCourseLink: false });
    const svc = new AssessmentService({ adapter: db.adapter() });
    const a = await svc.createAssessment(T1, { title: 'As before', subject: 'Maths', classroomId: IDS.class10, courseId: 100 });
    assert.equal(a.courseId, undefined);
    assert.equal(a.legacy, undefined);
    assert.ok(!db.schema.columns.get('aia_assessments').has('course_id'), 'the adapter does not see the column');
  });
});
