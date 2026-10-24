/**
 * Courses taught to whole classes, and the teacher's two views of a course's students.
 *
 * Fixtures (tests/helpers/testApp.js): School A has Grade 5-A (classroomA: studentA) and
 * Grade 6-A (classroomA2: studentA2); courseA is taught by mentorA with home class 5-A,
 * courseA2 by mentorA2 with home class 6-A. School B has its own class, course and people.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('courses assigned to whole classes', () => {
  let ctx;
  let ids;
  let U;
  const extra = {};
  before(async () => {
    ctx = await startTestApp();
    ids = ctx.ids;
    U = ids.users;
    // a third class with a student, and a student who is in no class and no course
    extra.classroomA3 = (await ctx.db.run("INSERT INTO classrooms (university_id, name, grade, section) VALUES (?, 'Grade 7 - B', '7', 'B')", [ids.schoolA])).lastID;
    extra.studentA3 = (await ctx.db.run("INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES ('Zara Seventh', 'zara@test.invalid', 'x', 'student', ?, 1)", [ids.schoolA])).lastID;
    await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [extra.studentA3, extra.classroomA3]);
    extra.loner = (await ctx.db.run("INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES ('Lone Student', 'lone@test.invalid', 'x', 'student', ?, 1)", [ids.schoolA])).lastID;
  });
  after(async () => { await ctx.stop(); });

  const assign = (courseId, classroomIds, as = 'adminA') => ctx.api('POST', `/api/courses/${courseId}/classrooms`, { as, body: { classroomIds } });
  const roster = (courseId, as, query = '') => ctx.api('GET', `/api/courses/${courseId}/roster${query}`, { as });
  const enrolment = (courseId, studentId) => ctx.db.get('SELECT * FROM course_students WHERE courseId = ? AND studentId = ?', [courseId, studentId]);
  const count = async (sql, params) => (await ctx.db.get(sql, params)).n;

  describe('admin assigns a course to classes', () => {
    it('enrols every student of the class through the existing enrolment table', async () => {
      const response = await assign(ids.courseA, [ids.classroomA2]);
      assert.equal(response.status, 200, response.text.slice(0, 160));
      assert.deepEqual(response.body.data.map((r) => [r.classroomId, r.newlyAssigned, r.students, r.enrolledNow, r.alreadyEnrolled]), [[ids.classroomA2, true, 1, 1, 0]]);
      const row = await enrolment(ids.courseA, U.studentA2);
      assert.ok(row, 'studentA2 is enrolled');
      assert.equal(row.enrolledViaClassroomId, ids.classroomA2, 'the enrolment remembers which class assignment made it');
      assert.ok(await ctx.db.get('SELECT 1 FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [ids.courseA, ids.classroomA2]));
    });

    it('assigning again, or naming a class twice, creates no duplicate', async () => {
      const before = await count('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ?', [ids.courseA]);
      const again = await assign(ids.courseA, [ids.classroomA2, ids.classroomA2, ids.classroomA]);
      assert.equal(again.status, 200);
      const byClass = Object.fromEntries(again.body.data.map((r) => [r.classroomId, r]));
      assert.equal(again.body.data.length, 2, 'the repeated id counts once');
      assert.equal(byClass[ids.classroomA2].newlyAssigned, false);
      assert.equal(byClass[ids.classroomA2].enrolledNow, 0);
      assert.equal(byClass[ids.classroomA2].alreadyEnrolled, 1);
      assert.equal(byClass[ids.classroomA].alreadyEnrolled, 1, 'studentA was already enrolled individually');
      assert.equal(await count('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ?', [ids.courseA]), before);
      assert.equal(await count('SELECT COUNT(*) AS n FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [ids.courseA, ids.classroomA2]), 1);
      assert.equal((await enrolment(ids.courseA, U.studentA)).enrolledViaClassroomId, null, 'an individual enrolment is not taken over by the class');
    });

    it('several courses to several classes: each student gets exactly the courses of their class', async () => {
      assert.equal((await assign(ids.courseA2, [ids.classroomA, extra.classroomA3])).status, 200);
      const courseIdsOf = async (studentId) =>
        (await ctx.db.all('SELECT courseId FROM course_students WHERE studentId = ? AND courseId IN (?, ?) ORDER BY courseId', [studentId, ids.courseA, ids.courseA2])).map((r) => r.courseId);
      assert.deepEqual(await courseIdsOf(U.studentA), [ids.courseA, ids.courseA2]);
      assert.deepEqual(await courseIdsOf(U.studentA2), [ids.courseA, ids.courseA2]); // courseA2: enrolled in the fixtures
      assert.deepEqual(await courseIdsOf(extra.studentA3), [ids.courseA2]);
      assert.deepEqual(await courseIdsOf(extra.loner), []);

      // what each student is shown
      const listed = async (as, token) => (await ctx.api('GET', '/api/courses/student', token ? { token } : { as })).body.map((c) => c.id || c._id).filter((id) => [ids.courseA, ids.courseA2].includes(id)).sort();
      assert.deepEqual(await listed('studentA'), [ids.courseA, ids.courseA2]);
      assert.deepEqual(await listed('studentA2'), [ids.courseA, ids.courseA2]);
      assert.deepEqual(await listed(null, ctx.tokenFor('studentA', { userId: extra.studentA3 })), [ids.courseA2]);
    });

    it('a student who joins an assigned class later is enrolled in its courses', async () => {
      const created = await ctx.api('POST', '/api/admin/create-student', { as: 'adminA', body: { fullName: 'Late Joiner', email: 'late.joiner@test.invalid', classroomId: ids.classroomA2, section: 'A' } });
      assert.equal(created.status, 201, created.text.slice(0, 160));
      extra.late = (await ctx.db.get("SELECT id FROM users WHERE email = 'late.joiner@test.invalid'")).id;
      const row = await enrolment(ids.courseA, extra.late);
      assert.ok(row, 'enrolled in the course assigned to the class');
      assert.equal(row.enrolledViaClassroomId, ids.classroomA2);
      assert.ok(await enrolment(ids.courseA2, extra.late), 'and in the course whose home class it is');
    });

    it('only an admin of the course\'s school assigns, and only its own classes', async () => {
      assert.ok([403, 404].includes((await assign(ids.courseA, [ids.classroomA2], 'mentorA')).status), 'a teacher does not assign');
      assert.equal((await assign(ids.courseA, [ids.classroomA2], 'studentA')).status, 403);
      assert.equal((await ctx.api('POST', `/api/courses/${ids.courseA}/classrooms`, { body: { classroomIds: [ids.classroomA2] } })).status, 401);
      assert.equal((await assign(ids.courseA, [ids.classroomB])).status, 404, 'another school\'s class');
      assert.equal((await assign(ids.courseB, [ids.classroomA])).status, 404, 'another school\'s course');
      assert.equal((await assign(ids.courseA, [ids.classroomA2], 'adminB')).status, 404);
      assert.equal((await assign(ids.courseA, [])).status, 400);
      assert.ok([400, 404].includes((await assign(ids.courseA, ['abc'])).status), 'a class id that is not a number');
      assert.equal(await count('SELECT COUNT(*) AS n FROM course_classrooms WHERE classroomId = ? OR courseId = ?', [ids.classroomB, ids.courseB]), 0);
      assert.equal(await enrolment(ids.courseA, U.studentB), undefined, 'no student of another school was enrolled');
    });

    it('lists the classes of a course with their sizes', async () => {
      const response = await ctx.api('GET', `/api/courses/${ids.courseA}/classrooms`, { as: 'adminA' });
      assert.equal(response.status, 200);
      const byId = Object.fromEntries(response.body.data.map((c) => [c.id, c]));
      assert.equal(byId[ids.classroomA].isHome, true);
      assert.equal(byId[ids.classroomA2].isHome, false);
      assert.equal(byId[ids.classroomA2].classSize, 2);
      assert.equal(byId[ids.classroomA].label, '5-A');
    });
  });

  describe('teacher: course first', () => {
    it('shows the course\'s students grouped by class with counts', async () => {
      const response = await roster(ids.courseA, 'mentorA');
      assert.equal(response.status, 200, response.text.slice(0, 160));
      const data = response.body.data;
      assert.equal(data.total, 3);
      assert.deepEqual(data.groups.map((g) => [g.classroom.label, g.count]), [['5-A', 1], ['6-A', 2]]);
      assert.deepEqual(data.classes.map((c) => [c.label, c.count]), [['5-A', 1], ['6-A', 2]]);
      const names = data.groups.flatMap((g) => g.students.map((s) => s.name)).sort();
      assert.deepEqual(names, ['Late Joiner', 'studentA', 'studentA2']);
      assert.ok(!response.text.includes('Zara Seventh') && !response.text.includes('Lone Student'), 'students who do not take the course are not listed');
      assert.ok(!response.text.includes('password'));
    });

    it('filters by class and searches by name, email or roll number; an empty result is empty', async () => {
      const one = (await roster(ids.courseA, 'mentorA', `?inClass=${ids.classroomA2}`)).body.data;
      assert.deepEqual(one.groups.map((g) => [g.classroom.id, g.count]), [[ids.classroomA2, 2]]);
      assert.equal(one.classes.length, 2, 'the filter buttons still show every class');

      const searched = (await roster(ids.courseA, 'mentorA', '?q=LATE')).body.data;
      assert.deepEqual(searched.groups.map((g) => g.students.map((s) => s.name)), [['Late Joiner']]);
      assert.equal(searched.shown, 1);
      assert.equal(searched.total, 3);
      const byEmailResponse = await roster(ids.courseA, 'mentorA', '?q=studenta2%40');
      assert.equal(byEmailResponse.status, 200, byEmailResponse.text.slice(0, 200));
      const byEmail = byEmailResponse.body.data;
      assert.deepEqual(byEmail.groups.flatMap((g) => g.students.map((s) => s.name)), ['studentA2']);

      const nothing = (await roster(ids.courseA, 'mentorA', '?q=nobody-by-this-name')).body.data;
      assert.deepEqual(nothing.groups, []);
      assert.equal(nothing.shown, 0);

      assert.equal((await roster(ids.courseA, 'mentorA', `?inClass=${extra.classroomA3}`)).status, 404, 'a class that does not take the course');
      assert.ok([400, 404].includes((await roster(ids.courseA, 'mentorA', '?inClass=x')).status), 'a class id that is not a number');
    });

    it('a course with no students answers an empty roster', async () => {
      const created = (await ctx.db.run("INSERT INTO courses (title, mentorId, university_id) VALUES ('Empty Course', ?, ?)", [U.mentorA, ids.schoolA])).lastID;
      const data = (await roster(created, 'mentorA')).body.data;
      assert.equal(data.total, 0);
      assert.deepEqual(data.groups, []);
      assert.deepEqual(data.classes, []);
      await ctx.db.run('DELETE FROM courses WHERE id = ?', [created]);
    });

    it('only the course\'s teacher (and an admin of the school) can see it', async () => {
      assert.ok([403, 404].includes((await roster(ids.courseA, 'mentorA2')).status), 'another teacher of the same school');
      assert.equal((await roster(ids.courseA, 'mentorB')).status, 404, 'a teacher of another school');
      assert.equal((await roster(ids.courseA, 'adminB')).status, 404);
      assert.equal((await roster(ids.courseA, 'studentA')).status, 403, 'a student');
      assert.equal((await roster(ids.courseA, 'accountantA')).status, 403);
      assert.equal((await ctx.api('GET', `/api/courses/${ids.courseA}/roster`)).status, 401);
      assert.equal((await roster(ids.courseA, 'adminA')).status, 200);
    });
  });

  describe('teacher: class first', () => {
    it('lists the teacher\'s classes, each with the teacher\'s courses and how many of the class take them', async () => {
      const response = await ctx.api('GET', '/api/courses/teaching/overview', { as: 'mentorA' });
      assert.equal(response.status, 200);
      const { classes, courses } = response.body.data;
      assert.deepEqual(courses.map((c) => [c.id, c.total]), [[ids.courseA, 3]]);
      assert.deepEqual(classes.map((c) => [c.label, c.courses.map((k) => [k.id, k.count])]), [['5-A', [[ids.courseA, 1]]], ['6-A', [[ids.courseA, 2]]]]);
      assert.ok(!JSON.stringify(response.body).includes('History A'), 'no course the teacher does not teach');

      // picking a class and then a course gives that class's students of that course only
      const picked = (await roster(ids.courseA, 'mentorA', `?inClass=${ids.classroomA}`)).body.data;
      assert.deepEqual(picked.groups.flatMap((g) => g.students.map((s) => s.name)), ['studentA']);
    });

    it('a class whose students were enrolled one by one appears too, with the same count as the course view', async () => {
      // 'Solo Course': no class assigned, its one student added individually
      const solo = (await ctx.db.run("INSERT INTO courses (title, mentorId, university_id) VALUES ('Solo Course', ?, ?)", [U.mentorA, ids.schoolA])).lastID;
      await ctx.db.run('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)', [solo, extra.studentA3]);
      const { classes, courses } = (await ctx.api('GET', '/api/courses/teaching/overview', { as: 'mentorA' })).body.data;
      const course = courses.find((c) => c.id === solo);
      assert.deepEqual(course.classes.map((c) => [c.label, c.count, c.assigned]), [['7-B', 1, false]]);
      assert.deepEqual(classes.find((c) => c.label === '7-B').courses, [{ id: solo, title: 'Solo Course', count: 1 }]);
      const picked = await roster(solo, 'mentorA', `?inClass=${extra.classroomA3}`);
      assert.equal(picked.status, 200, picked.text.slice(0, 120));
      assert.deepEqual(picked.body.data.groups.flatMap((g) => g.students.map((s) => s.name)), ['Zara Seventh']);
      await ctx.db.run('DELETE FROM course_students WHERE courseId = ?', [solo]);
      await ctx.db.run('DELETE FROM courses WHERE id = ?', [solo]);
    });

    it('a teacher without courses gets empty lists; students and other roles are refused', async () => {
      const newTeacher = (await ctx.db.run("INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES ('New Teacher', 'new.teacher.cc@test.invalid', 'x', 'mentor', ?, 1)", [ids.schoolA])).lastID;
      const empty = await ctx.api('GET', '/api/courses/teaching/overview', { token: ctx.tokenFor('mentorA', { userId: newTeacher }) });
      assert.equal(empty.status, 200, empty.text.slice(0, 120));
      assert.deepEqual(empty.body.data, { courses: [], classes: [] });
      assert.equal((await ctx.api('GET', '/api/courses/teaching/overview', { as: 'studentA' })).status, 403);
      assert.equal((await ctx.api('GET', '/api/courses/teaching/overview', { as: 'accountantA' })).status, 403);
      const school = await ctx.api('GET', '/api/courses/teaching/overview', { as: 'adminB' });
      assert.ok(!JSON.stringify(school.body).includes('Science A'), 'an admin sees only their own school');
    });
  });

  describe('removing a class from a course', () => {
    it('removes the enrolments that class created and keeps individual ones', async () => {
      // studentA2 also enrolled by hand in courseA through another path: simulate an individual enrolment
      const keep = (await ctx.db.run("INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES ('Kept Individually', 'kept@test.invalid', 'x', 'student', ?, 1)", [ids.schoolA])).lastID;
      await ctx.db.run('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)', [ids.courseA, keep]);

      const removed = await ctx.api('DELETE', `/api/courses/${ids.courseA}/classrooms/${ids.classroomA2}`, { as: 'adminA' });
      assert.equal(removed.status, 200, removed.text.slice(0, 160));
      assert.equal(removed.body.data.enrolmentsRemoved, 2, 'studentA2 and the late joiner');
      assert.equal(await enrolment(ids.courseA, U.studentA2), undefined);
      assert.ok(await enrolment(ids.courseA, keep), 'the individual enrolment stays');
      assert.ok(await enrolment(ids.courseA, U.studentA), 'the home class is untouched');

      const listed = (await ctx.api('GET', '/api/courses/student', { as: 'studentA2' })).body.map((c) => c.id || c._id);
      assert.ok(!listed.includes(ids.courseA), 'the course is no longer shown to the class');
      const after = (await roster(ids.courseA, 'mentorA')).body.data;
      assert.ok(!after.groups.some((g) => g.classroom && g.classroom.id === ids.classroomA2));
      assert.deepEqual(after.groups.find((g) => g.classroom === null).students.map((s) => s.name), ['Kept Individually'], 'an enrolled student with no class is listed under "No class"');
    });

    it('refuses the home class, a class that is not assigned, a teacher and another school', async () => {
      assert.equal((await ctx.api('DELETE', `/api/courses/${ids.courseA}/classrooms/${ids.classroomA}`, { as: 'adminA' })).status, 400);
      assert.equal((await ctx.api('DELETE', `/api/courses/${ids.courseA}/classrooms/${ids.classroomA2}`, { as: 'adminA' })).status, 404);
      assert.ok([403, 404].includes((await ctx.api('DELETE', `/api/courses/${ids.courseA2}/classrooms/${ids.classroomA}`, { as: 'mentorA2' })).status));
      assert.equal((await ctx.api('DELETE', `/api/courses/${ids.courseA2}/classrooms/${ids.classroomA}`, { as: 'adminB' })).status, 404);
      assert.ok(await ctx.db.get('SELECT 1 FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [ids.courseA2, ids.classroomA]));
    });
  });
});
