/**
 * Class-first rules, explicit enrolment and what a teacher may see (15 October 2026).
 *
 *  - A student takes a course only when enrolled (course_students); being in a class the course
 *    is taught to is not enough.
 *  - An admin assigns a course to a class for ALL its students or for SELECTED students.
 *  - A teacher sees a class only as its class teacher or as mentor of a course taught to it,
 *    and acts only on the courses they mentor.
 *  - Courses and fee structures need a class first.
 *
 * Fixtures: tests/helpers/testApp.js (School A: classroomA taught by mentorA as class teacher,
 * classroomA2 by mentorA2; courseA by mentorA in A, courseA2 by mentorA2 in A2).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('class-first rules and explicit enrolment', () => {
  let ctx;
  let ids;
  let U;
  const x = {};
  const addUser = async (name, role, school) =>
    (await ctx.db.run('INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, ?, ?, 1)', [name, `${name.toLowerCase().replace(/\s+/g, '.')}@test.invalid`, 'x', role, school])).lastID;
  const as = (userId, role = 'mentor', school = 1) => ({ token: ctx.tokenFor(role === 'student' ? 'studentA' : role === 'admin' ? 'adminA' : 'mentorA', { userId, role, universityId: school }) });
  const enrolled = async (courseId, studentId) => ctx.db.get('SELECT * FROM course_students WHERE courseId = ? AND studentId = ?', [courseId, studentId]);
  const studentCourses = async (studentId) => (await ctx.api('GET', '/api/courses/student', as(studentId, 'student'))).body.map((c) => c.id || c._id);

  before(async () => {
    ctx = await startTestApp();
    ids = ctx.ids;
    U = ids.users;
    // Class 8-C with three students, nobody's class teacher yet
    x.class8C = (await ctx.db.run("INSERT INTO classrooms (university_id, name, grade, section) VALUES (?, 'Grade 8 - C', '8', 'C')", [ids.schoolA])).lastID;
    x.s1 = await addUser('Eight One', 'student', ids.schoolA);
    x.s2 = await addUser('Eight Two', 'student', ids.schoolA);
    x.s3 = await addUser('Eight Three', 'student', ids.schoolA);
    for (const s of [x.s1, x.s2, x.s3]) await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [s, x.class8C]);
    // a teacher with nothing assigned
    x.idle = await addUser('Idle Teacher', 'mentor', ids.schoolA);
  });
  after(async () => { await ctx.stop(); });

  describe('selected students or all students', () => {
    it('"selected" enrols only the chosen students; the others and later joiners are not enrolled', async () => {
      const response = await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'selected', studentIds: [x.s1, x.s2] } });
      assert.equal(response.status, 200, response.text.slice(0, 160));
      assert.deepEqual(response.body.data.map((r) => [r.scope, r.students, r.selected, r.enrolledNow, r.alreadyEnrolled]), [['selected', 3, 2, 2, 0]]);
      assert.ok(await enrolled(ids.courseA2, x.s1));
      assert.ok(await enrolled(ids.courseA2, x.s2));
      assert.equal(await enrolled(ids.courseA2, x.s3), undefined, 'the third student was not chosen');
      assert.ok(!(await studentCourses(x.s3)).includes(ids.courseA2), 'and does not see the course');
      assert.ok((await studentCourses(x.s1)).includes(ids.courseA2));

      const late = await ctx.api('POST', '/api/admin/create-student', { as: 'adminA', body: { fullName: 'Eight Late', email: 'eight.late@test.invalid', classroomId: x.class8C, section: 'C' } });
      assert.equal(late.status, 201, late.text.slice(0, 160));
      x.late = (await ctx.db.get("SELECT id FROM users WHERE email = 'eight.late@test.invalid'")).id;
      assert.equal(await enrolled(ids.courseA2, x.late), undefined, 'a "selected" class does not enrol students who join later');
    });

    it('no duplicates; students outside the class are refused; "selected" needs students', async () => {
      const again = await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'selected', studentIds: [x.s1, x.s1] } });
      assert.equal(again.status, 200);
      assert.deepEqual(again.body.data.map((r) => [r.selected, r.enrolledNow, r.alreadyEnrolled]), [[1, 0, 1]]);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ? AND studentId = ?', [ids.courseA2, x.s1])).n, 1);

      const outsider = await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'selected', studentIds: [U.studentA] } });
      assert.equal(outsider.status, 400, 'studentA is not in 8-C');
      const foreign = await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'selected', studentIds: [U.studentB] } });
      assert.ok([400, 404].includes(foreign.status), 'a student of another school');
      assert.equal((await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'selected', studentIds: [] } })).status, 400);
      assert.equal((await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'some' } })).status, 400);
      assert.equal(await enrolled(ids.courseA2, U.studentA), undefined);
    });

    it('"all" later widens the class: everyone is enrolled, and an individual exception keeps its origin', async () => {
      // s3 was enrolled individually in courseA (an exception) before courseA is assigned to 8-C
      await ctx.db.run('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)', [ids.courseA, x.s3]);
      const response = await ctx.api('POST', `/api/courses/${ids.courseA}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'all' } });
      assert.deepEqual(response.body.data.map((r) => [r.scope, r.students, r.enrolledNow, r.alreadyEnrolled]), [['all', 4, 3, 1]]);
      assert.equal((await enrolled(ids.courseA, x.s3)).enrolledViaClassroomId, null, 'the individual enrolment is not taken over by the class');

      const widened = await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'all' } });
      assert.equal(widened.body.data[0].scope, 'all');
      assert.ok(await enrolled(ids.courseA2, x.s3));
      assert.ok(await enrolled(ids.courseA2, x.late));
      const narrowed = await ctx.api('POST', `/api/courses/${ids.courseA2}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'selected', studentIds: [x.s1] } });
      assert.equal(narrowed.body.data[0].scope, 'all', '"selected" never narrows an "all" class');
    });
  });

  describe('being in a class does not by itself give a course', () => {
    it('a class member without an enrolment does not take the course anywhere', async () => {
      const member = await addUser('Unenrolled Member', 'student', ids.schoolA);
      await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [member, ids.classroomA]);
      assert.ok(!(await studentCourses(member)).includes(ids.courseA), 'not in the course list');
      assert.equal((await ctx.api('GET', `/api/courses/${ids.courseA}`, as(member, 'student'))).status, 404, 'not readable');
      assert.equal((await ctx.api('GET', `/api/chapters/course/${ids.courseA}`, as(member, 'student'))).status, 404, 'its chapters neither');
      const roster = (await ctx.api('GET', `/api/courses/${ids.courseA}/roster`, { as: 'mentorA' })).body.data;
      assert.ok(!roster.groups.some((g) => g.students.some((s) => s.id === member)), 'not on the teacher\'s roster');
    });
  });

  describe('what a teacher sees', () => {
    const classesOf = async (auth) => {
      const response = await ctx.api('GET', '/api/classrooms/mentor/me', auth);
      assert.equal(response.status, 200, response.text.slice(0, 120));
      return (response.body.data || response.body).map((c) => [c.id, c.role]);
    };

    it('a teacher with no class and no course sees nothing and reaches nothing', async () => {
      const idle = as(x.idle);
      assert.deepEqual(await classesOf(idle), []);
      assert.deepEqual((await ctx.api('GET', '/api/classrooms/teaching-scope', idle)).body.data, []);
      assert.deepEqual((await ctx.api('GET', '/api/courses/teaching/overview', idle)).body.data, { courses: [], classes: [] });
      for (const url of [`/api/classrooms/${ids.classroomA}`, `/api/classrooms/${ids.classroomA}/students`, `/api/courses/${ids.courseA}`, `/api/courses/${ids.courseA}/roster`,
        `/api/results/classroom/${ids.classroomA}`, `/api/attendance/classroom/${ids.classroomA}/date/2026-01-15`, `/api/results/student/${U.studentA}`]) {
        const response = await ctx.api('GET', url, idle);
        assert.ok([403, 404].includes(response.status), `${url} -> ${response.status}`);
      }
      const mark = await ctx.api('POST', '/api/attendance/mark', { ...idle, body: { classroomId: ids.classroomA, date: '2026-01-16', attendanceData: [{ studentId: U.studentA, status: 'present' }] } });
      assert.ok([403, 404].includes(mark.status), `marking attendance -> ${mark.status}`);
    });

    it('a classroomAssignments row that is not "class teacher" gives no class', async () => {
      await ctx.db.run("INSERT INTO classroomAssignments (classroomId, teacherId, role) VALUES (?, ?, 'subject_teacher')", [ids.classroomA, x.idle]);
      assert.deepEqual(await classesOf(as(x.idle)), []);
      await ctx.db.run("UPDATE classroomAssignments SET role = 'class_teacher' WHERE teacherId = ?", [x.idle]);
      assert.deepEqual(await classesOf(as(x.idle)), [[ids.classroomA, 'class_teacher']], 'as class teacher they see the class');
      await ctx.db.run('DELETE FROM classroomAssignments WHERE teacherId = ?', [x.idle]);
    });

    it('mentoring a course assigned to a class shows that class, labelled as course teacher', async () => {
      const course = (await ctx.db.run("INSERT INTO courses (title, mentorId, classroomId, university_id) VALUES ('Idle Course', ?, NULL, ?)", [x.idle, ids.schoolA])).lastID;
      assert.deepEqual(await classesOf(as(x.idle)), [], 'a course with no class shows no class');
      await ctx.api('POST', `/api/courses/${course}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class8C], scope: 'selected', studentIds: [x.s2] } });
      assert.deepEqual(await classesOf(as(x.idle)), [[x.class8C, 'course_teacher']]);
      const scope = (await ctx.api('GET', '/api/classrooms/teaching-scope', as(x.idle))).body.data;
      assert.deepEqual(scope.map((c) => [c.id, c.courses.map((k) => k.id)]), [[x.class8C, [course]]]);
      assert.equal((await ctx.api('GET', `/api/classrooms/${ids.classroomA}`, as(x.idle))).status, 404, 'still not class 5-A');
      x.idleCourse = course;
    });

    it('the class teacher sees the class but not another teacher\'s course in it', async () => {
      // mentorA2 is class teacher of classroomA2; a course of mentorA taught in classroomA2
      const other = (await ctx.db.run("INSERT INTO courses (title, mentorId, classroomId, university_id) VALUES ('Someone Else Course', ?, ?, ?)", [U.mentorA, ids.classroomA2, ids.schoolA])).lastID;
      const asClassTeacher = { as: 'mentorA2' };
      assert.ok((await classesOf(asClassTeacher)).some(([id, role]) => id === ids.classroomA2 && role === 'class_teacher'));
      assert.ok([403, 404].includes((await ctx.api('GET', `/api/courses/${other}`, asClassTeacher)).status));
      assert.ok([403, 404].includes((await ctx.api('PUT', `/api/courses/${other}`, { ...asClassTeacher, body: { title: 'Renamed' } })).status));
      assert.ok([403, 404].includes((await ctx.api('GET', `/api/courses/${other}/roster`, asClassTeacher)).status));
      const scope = (await ctx.api('GET', '/api/classrooms/teaching-scope', asClassTeacher)).body.data;
      assert.ok(!JSON.stringify(scope).includes('Someone Else Course'), 'not offered in the class -> course choice');
      assert.equal((await ctx.db.get('SELECT title FROM courses WHERE id = ?', [other])).title, 'Someone Else Course');
      // ...and the class's own attendance still works for the class teacher
      const mark = await ctx.api('POST', '/api/attendance/mark', { ...asClassTeacher, body: { classroomId: ids.classroomA2, date: '2026-01-17', attendanceData: [{ studentId: U.studentA2, status: 'present' }] } });
      assert.equal(mark.status, 200, mark.text.slice(0, 120));
      x.otherCourse = other;
    });

    it('course lists: a class teacher gets only the courses they mentor; the admin gets all', async () => {
      // the class's course list: mentorA2 is class teacher of A2, which also holds mentorA's course
      const byClassTeacher = await ctx.api('GET', `/api/courses/classroom/${ids.classroomA2}`, { as: 'mentorA2' });
      assert.equal(byClassTeacher.status, 200);
      assert.deepEqual(byClassTeacher.body.map((c) => c.id), [ids.courseA2], 'own course only');
      assert.ok(!byClassTeacher.text.includes('Someone Else Course'));

      const byMentor = await ctx.api('GET', `/api/courses/classroom/${ids.classroomA2}`, { as: 'mentorA' });
      assert.deepEqual(byMentor.body.map((c) => c.id), [x.otherCourse], 'the other teacher sees only theirs');

      const byAdmin = await ctx.api('GET', `/api/courses/classroom/${ids.classroomA2}`, { as: 'adminA' });
      assert.deepEqual(byAdmin.body.map((c) => c.id).sort((a, b) => a - b), [ids.courseA2, x.otherCourse].sort((a, b) => a - b));

      // each course names its teacher the way the class page reads it (it showed "Not Assigned")
      assert.deepEqual(byClassTeacher.body[0].courseTeacher, { id: U.mentorA2, name: 'mentorA2', email: 'mentora2@test.invalid' });
      assert.equal(byAdmin.body.find((c) => c.id === x.otherCourse).courseTeacher.name, 'mentorA');
      const noMentor = (await ctx.db.run("INSERT INTO courses (title, mentorId, classroomId, university_id) VALUES ('Mentorless', NULL, ?, ?)", [ids.classroomA2, ids.schoolA])).lastID;
      const withNone = await ctx.api('GET', `/api/courses/classroom/${ids.classroomA2}`, { as: 'adminA' });
      assert.equal(withNone.body.find((c) => c.id === noMentor).courseTeacher, null, 'only a course without a mentor has none');
      await ctx.db.run('DELETE FROM courses WHERE id = ?', [noMentor]);

      // a course assigned to a class (not its home class) is listed for that class
      const assignedHere = await ctx.api('GET', `/api/courses/classroom/${x.class8C}`, as(x.idle));
      assert.deepEqual(assignedHere.body.map((c) => c.id), [x.idleCourse]);

      // the teacher's own lists
      for (const url of ['/api/courses', '/api/courses/mentor']) {
        const list = await ctx.api('GET', url, { as: 'mentorA2' });
        assert.ok(list.body.every((c) => Number(c.mentorId) === U.mentorA2), `${url} holds a course mentorA2 does not mentor`);
      }
    });

    it('another teacher\'s course data cannot be reached by changing an id', async () => {
      const asClassTeacher = { as: 'mentorA2' };
      for (const url of [`/api/courses/${x.otherCourse}/students`, `/api/assessments/course/${x.otherCourse}`, `/api/chapters/course/${x.otherCourse}`,
        `/api/courses/${x.otherCourse}/classrooms`, `/api/courses/${ids.courseA}`, `/api/assessments/course/${ids.courseA}`]) {
        const response = await ctx.api('GET', url, asClassTeacher);
        assert.ok([403, 404].includes(response.status), `${url} -> ${response.status}`);
      }
      const chapter = await ctx.api('POST', '/api/chapters/create-chapter', { ...asClassTeacher, body: { courseId: x.otherCourse, title: 'Sneaky chapter' } });
      assert.ok([403, 404].includes(chapter.status), `adding a chapter -> ${chapter.status}`);
      assert.equal((await ctx.db.get("SELECT COUNT(*) AS n FROM chapters WHERE title = 'Sneaky chapter'")).n, 0);
    });

    it('labels: class teacher wins when the teacher is both; otherwise course teacher', async () => {
      // mentorA is class teacher of 5-A and mentors courseA there; mentorA also mentors a course in A2 and 8-C
      const labels = Object.fromEntries((await classesOf({ as: 'mentorA' })).map(([id, role]) => [id, role]));
      assert.equal(labels[ids.classroomA], 'class_teacher');
      assert.equal(labels[ids.classroomA2], 'course_teacher');
    });

    it('teachers of another school see none of this school\'s classes', async () => {
      assert.ok((await classesOf({ as: 'mentorB' })).every(([id]) => id === ids.classroomB));
      assert.equal((await ctx.api('GET', `/api/classrooms/${x.class8C}`, { as: 'mentorB' })).status, 404);
    });
  });

  describe('class first', () => {
    it('a class cannot be created without a class teacher of the school', async () => {
      const create = (body) => ctx.api('POST', '/api/classrooms', { as: 'adminA', body: { grade: '3', section: 'Z', ...body } });
      assert.equal((await create({})).status, 400, 'no class teacher');
      assert.ok([400, 404].includes((await create({ classTeacherId: U.mentorB })).status), 'a teacher of another school');
      assert.equal((await create({ classTeacherId: U.studentA })).status, 400, 'a student');
      assert.equal((await create({ classTeacherId: U.pendingMentorA })).status, 400, 'a teacher not yet approved');
      assert.equal((await ctx.db.get("SELECT COUNT(*) AS n FROM classrooms WHERE grade = '3' AND section = 'Z'")).n, 0);
      const ok = await create({ classTeacherId: U.mentorA });
      assert.equal(ok.status, 201, ok.text.slice(0, 160));
      const row = await ctx.db.get("SELECT classTeacher FROM classrooms WHERE grade = '3' AND section = 'Z'");
      assert.equal(Number(row.classTeacher), U.mentorA);
    });

    it('a school without classes cannot save a fee structure', async () => {
      const school = (await ctx.db.run("INSERT INTO universities (name, area) VALUES ('Empty School', 'X')")).lastID;
      const admin = await addUser('Empty Admin', 'admin', school);
      const response = await ctx.api('POST', '/api/classrooms/fee-structures', { ...as(admin, 'admin', school), body: { category: 'Primary', tuitionFee: 100, dueDate: '2027-01-01' } });
      assert.equal(response.status, 400);
      assert.match(response.body.message, /class/i);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM feeStructures WHERE university_id = ?', [school])).n, 0);
    });

    it('a course created for a class with enrollScope "none" enrols nobody until the admin chooses', async () => {
      const created = await ctx.api('POST', '/api/courses/create-course', { as: 'adminA', body: { title: 'Scoped Later', mentorId: U.mentorA, classroomId: x.class8C, enrollScope: 'none' } });
      assert.equal(created.status, 201, created.text.slice(0, 160));
      const id = created.body.course.id;
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ?', [id])).n, 0);
      assert.equal((await ctx.db.get('SELECT enrollAll FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [id, x.class8C])).enrollAll, 0);
      // created the usual way, the class's students are enrolled and remembered as such
      const usual = await ctx.api('POST', '/api/courses/create-course', { as: 'adminA', body: { title: 'Whole Class', mentorId: U.mentorA, classroomId: x.class8C } });
      for (let i = 0; i < 40 && (await ctx.db.get('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ?', [usual.body.course.id])).n < 4; i++) await new Promise((r) => setTimeout(r, 50));
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ? AND enrolledViaClassroomId = ?', [usual.body.course.id, x.class8C])).n, 4);
      assert.equal((await ctx.db.get('SELECT enrollAll FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [usual.body.course.id, x.class8C])).enrollAll, 1);
    });
  });
});
