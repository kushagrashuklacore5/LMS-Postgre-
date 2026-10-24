/**
 * Course enrolment management (16 October 2026).
 *
 *  - A course is created for its classes in one request, for all students of the classes or for
 *    selected students, and is saved together with its classes and enrolments or not at all.
 *  - The admin opens a class of a course: its whole roster, ticked when enrolled; ticking enrols,
 *    unticking removes only that course enrolment.
 *  - A class assignment can be removed; only the enrolments it created go with it.
 *  - The course mentor sees only enrolled students; class membership never grants a course.
 *
 * Fixture: class 7-B (school A) with five students; "Course Mentor" teaches the new courses and
 * "Class Teacher" is 7-B's class teacher but teaches none of them. Synthetic accounts only.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('course enrolment management', () => {
  let ctx;
  let ids;
  let U;
  const x = {};
  const addUser = async (name, role, school) =>
    (await ctx.db.run('INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, ?, ?, 1)', [name, `${name.toLowerCase().replace(/\s+/g, '.')}@test.invalid`, 'x', role, school])).lastID;
  const as = (userId, role = 'mentor', school = 1) => ({ token: ctx.tokenFor(role === 'student' ? 'studentA' : role === 'admin' ? 'adminA' : 'mentorA', { userId, role, universityId: school }) });
  const enrolment = (courseId, studentId) => ctx.db.get('SELECT * FROM course_students WHERE courseId = ? AND studentId = ?', [courseId, studentId]);
  const enrolledIds = async (courseId) => (await ctx.db.all('SELECT studentId FROM course_students WHERE courseId = ? ORDER BY studentId', [courseId])).map((r) => Number(r.studentId));
  const create = (body) => ctx.api('POST', '/api/courses/create-course', { as: 'adminA', body: { mentorId: x.mentor, ...body } });
  const courseByTitle = (title) => ctx.db.get('SELECT * FROM courses WHERE title = ?', [title]);
  const refused = (response) => [403, 404].includes(response.status);

  before(async () => {
    ctx = await startTestApp();
    ids = ctx.ids;
    U = ids.users;
    x.mentor = await addUser('Course Mentor', 'mentor', ids.schoolA);
    x.mentor2 = await addUser('Second Mentor', 'mentor', ids.schoolA);
    x.mentor3 = await addUser('Third Mentor', 'mentor', ids.schoolA);
    x.classTeacher = await addUser('Class Teacher', 'mentor', ids.schoolA);
    x.class7B = (await ctx.db.run("INSERT INTO classrooms (university_id, name, grade, section, classTeacherId) VALUES (?, 'Grade 7 - B', '7', 'B', ?)", [ids.schoolA, x.classTeacher])).lastID;
    x.class7C = (await ctx.db.run("INSERT INTO classrooms (university_id, name, grade, section) VALUES (?, 'Grade 7 - C', '7', 'C')", [ids.schoolA])).lastID;
    x.s = [];
    for (let i = 1; i <= 5; i++) {
      const id = await addUser(`Seven B${i}`, 'student', ids.schoolA);
      await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [id, x.class7B]);
      x.s.push(id);
    }
    x.c1 = await addUser('Seven C1', 'student', ids.schoolA);
    x.c2 = await addUser('Seven C2', 'student', ids.schoolA);
    for (const id of [x.c1, x.c2]) await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [id, x.class7C]);
  });
  after(async () => { await ctx.stop(); });

  describe('creating a course for classes', () => {
    it('"selected": exactly the three chosen students of five are enrolled, in one request', async () => {
      const response = await create({ title: 'Drawing 7', classroomIds: [x.class7B], scope: 'selected', studentIds: x.s.slice(0, 3) });
      assert.equal(response.status, 201, response.text.slice(0, 200));
      x.drawing = response.body.course.id;
      assert.equal(response.body.course.totalStudents, 3);
      assert.deepEqual(await enrolledIds(x.drawing), x.s.slice(0, 3));
      const course = await courseByTitle('Drawing 7');
      assert.equal(course.classroomId, x.class7B, 'the first class is the home class');
      assert.equal(course.mentorId, x.mentor);
      const link = await ctx.db.get('SELECT enrollAll FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [x.drawing, x.class7B]);
      assert.equal(link.enrollAll, 0, 'a "selected" class');
      for (const sid of x.s.slice(0, 3)) assert.equal((await enrolment(x.drawing, sid)).enrolledViaClassroomId, x.class7B);
    });

    it('"all": every student of the class is enrolled', async () => {
      const response = await create({ title: 'Music 7', classroomIds: [x.class7B], scope: 'all' });
      assert.equal(response.status, 201, response.text.slice(0, 200));
      x.music = response.body.course.id;
      assert.deepEqual(await enrolledIds(x.music), x.s);
      assert.equal((await ctx.db.get('SELECT enrollAll FROM course_classrooms WHERE courseId = ?', [x.music])).enrollAll, 1);
    });

    it('several classes: each chosen student is enrolled through their own class', async () => {
      const response = await create({ title: 'Dance 7', mentorId: x.mentor2, classroomIds: [x.class7B, x.class7C], scope: 'selected', studentIds: [x.s[0], x.c1] });
      assert.equal(response.status, 201, response.text.slice(0, 200));
      x.dance = response.body.course.id;
      assert.deepEqual(await enrolledIds(x.dance), [x.s[0], x.c1].sort((a, b) => a - b));
      assert.equal((await enrolment(x.dance, x.c1)).enrolledViaClassroomId, x.class7C);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM course_classrooms WHERE courseId = ?', [x.dance])).n, 2);
    });

    it('nothing is saved when any part is wrong (no course without its classes)', async () => {
      const before = (await ctx.db.get('SELECT COUNT(*) AS n FROM courses')).n;
      const cases = [
        [{ title: 'Bad 1', classroomIds: [x.class7B], scope: 'selected', studentIds: [x.s[0], x.c1] }, 400, 'a student of another class'],
        [{ title: 'Bad 2', classroomIds: [x.class7B], scope: 'selected', studentIds: [U.studentB] }, [400, 404], 'a student of another school'],
        [{ title: 'Bad 3', classroomIds: [x.class7B, ids.classroomB], scope: 'all' }, [400, 404], 'a class of another school'],
        [{ title: 'Bad 4', classroomIds: [], scope: 'all' }, 400, 'no class'],
        [{ title: 'Bad 5', classroomIds: [x.class7B], scope: 'selected', studentIds: [] }, 400, 'selected without students'],
        [{ title: 'Bad 6', classroomIds: [x.class7B], scope: 'everyone' }, 400, 'unknown scope'],
        [{ title: 'Bad 7', classroomIds: [x.class7B], scope: 'all', mentorId: U.mentorB }, [400, 404], 'a teacher of another school'],
        [{ title: 'Bad 8', classroomIds: [x.class7B], scope: 'all', mentorId: x.s[0] }, [400, 404], 'a student as teacher'],
      ];
      for (const [body, status, why] of cases) {
        const response = await create({ mentorId: x.mentor3, ...body });
        assert.ok([].concat(status).includes(response.status), `${why}: ${response.status} ${response.text.slice(0, 120)}`);
        assert.equal(await courseByTitle(body.title), undefined, `${why}: no course was saved`);
      }
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM courses')).n, before);
    });

    it('the older single-class form still works, and checks the teacher and students it names', async () => {
      const ok = await create({ title: 'Legacy Form', classroomId: x.class7C });
      assert.equal(ok.status, 201, ok.text.slice(0, 160));
      x.legacy = ok.body.course.id;
      assert.deepEqual(await enrolledIds(x.legacy), [x.c1, x.c2].sort((a, b) => a - b));
      assert.equal((await create({ title: 'Legacy Foreign', classroomId: x.class7C, mentorId: U.mentorB })).status >= 400, true);
      assert.equal(await courseByTitle('Legacy Foreign'), undefined);
      assert.equal((await create({ title: 'No Class Legacy' })).status, 400, 'class first still applies');
    });
  });

  describe('the course mentor sees only enrolled students', () => {
    it('roster, course students and overview hold exactly the three enrolled students', async () => {
      const mentor = as(x.mentor);
      const roster = (await ctx.api('GET', `/api/courses/${x.drawing}/roster`, mentor)).body.data;
      assert.deepEqual(roster.groups.flatMap((g) => g.students.map((s) => s.id)).sort((a, b) => a - b), x.s.slice(0, 3));
      assert.equal(roster.total, 3);
      const listed = (await ctx.api('GET', `/api/courses/${x.drawing}/students`, mentor)).body.map((s) => Number(s.studentId)).sort((a, b) => a - b);
      assert.deepEqual(listed, x.s.slice(0, 3));
      const overview = (await ctx.api('GET', '/api/courses/teaching/overview', mentor)).body.data;
      const drawing = overview.courses.find((c) => c.id === x.drawing);
      assert.equal(drawing.total, 3);
      assert.equal(drawing.classes.find((c) => c.id === x.class7B).count, 3);
      // the admin's full class roster is not open to the teacher
      assert.ok(refused(await ctx.api('GET', `/api/courses/${x.drawing}/classrooms/${x.class7B}/students`, mentor)));
    });

    it('the class list shows a course teacher only their enrolled students; the class teacher sees everyone', async () => {
      const url = `/api/classrooms/${x.class7B}/students`;
      const mentorView = await ctx.api('GET', url, as(x.mentor));
      assert.equal(mentorView.status, 200, mentorView.text.slice(0, 160));
      // Course Mentor teaches Drawing (3 of 7-B) and Music (all of 7-B) at this point; check with
      // a teacher of Drawing alone
      const drawingOnly = await addUser('Drawing Only', 'mentor', ids.schoolA);
      await ctx.db.run('UPDATE courses SET mentorId = ? WHERE id = ?', [drawingOnly, x.drawing]);
      const onlyView = (await ctx.api('GET', url, as(drawingOnly))).body.map((s) => s.id).sort((a, b) => a - b);
      assert.deepEqual(onlyView, x.s.slice(0, 3), 'only the three enrolled in Drawing');
      const classTeacherView = (await ctx.api('GET', url, as(x.classTeacher))).body.map((s) => s.id).sort((a, b) => a - b);
      assert.deepEqual(classTeacherView, x.s, 'the class teacher sees the whole class');
      // the course teacher cannot open an unenrolled classmate's records or add someone to the class
      for (const target of [`/api/results/student/${x.s[4]}`]) {
        const response = await ctx.api('GET', target, as(drawingOnly));
        assert.ok(response.status >= 400 && response.status !== 500, `${target} -> ${response.status}`);
      }
      const add = await ctx.api('POST', '/api/classrooms/assign-student', { ...as(drawingOnly), body: { classroomId: x.class7B, studentId: x.c2 } });
      assert.ok(refused(add), `a course teacher adding to the class -> ${add.status}`);
      assert.equal(await ctx.db.get('SELECT 1 FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?', [x.c2, x.class7B]), undefined);
      await ctx.db.run('UPDATE courses SET mentorId = ? WHERE id = ?', [x.mentor, x.drawing]);
    });

    it('the two others reach nothing of the course, though they are in its class', async () => {
      for (const sid of x.s.slice(3)) {
        const student = as(sid, 'student');
        const courses = (await ctx.api('GET', '/api/courses/student', student)).body.map((c) => c.id || c._id);
        assert.ok(!courses.includes(x.drawing), 'not in their course list');
        assert.ok(courses.includes(x.music), 'their "all students" course is');
        for (const url of [`/api/courses/${x.drawing}`, `/api/courses/${x.drawing}/students`, `/api/chapters/course/${x.drawing}`,
          `/api/chapters/get-chapters?courseId=${x.drawing}`, `/api/assessments/course/${x.drawing}`, `/api/progress/${x.drawing}`]) {
          const response = await ctx.api('GET', url, student);
          assert.ok(response.status >= 400 && response.status !== 500, `${url} -> ${response.status}`);
        }
      }
    });

    it('an enrolled student sees the course, but not classmates\' email addresses', async () => {
      const course = await ctx.api('GET', `/api/courses/${x.drawing}`, as(x.s[0], 'student'));
      assert.equal(course.status, 200, course.text.slice(0, 160));
      assert.ok(course.body.students.length === 3 && course.body.students.every((s) => s.email === undefined));
      const list = await ctx.api('GET', `/api/courses/${x.drawing}/students`, as(x.s[0], 'student'));
      assert.equal(list.status, 200);
      assert.ok(list.body.every((s) => s.email === undefined));
      assert.ok((await ctx.api('GET', `/api/courses/${x.drawing}/students`, as(x.mentor))).body.every((s) => s.email), 'the teacher still gets them');
    });

    it('the class teacher keeps the class roster but gets nothing of another teacher\'s course', async () => {
      const teacher = as(x.classTeacher);
      const classRoster = await ctx.api('GET', `/api/classrooms/${x.class7B}/students`, teacher);
      assert.equal(classRoster.status, 200, 'class-level screen');
      for (const url of [`/api/courses/${x.drawing}`, `/api/courses/${x.drawing}/roster`, `/api/courses/${x.drawing}/students`,
        `/api/assessments/course/${x.drawing}/all`, `/api/chapters/course/${x.drawing}`, `/api/progress/${x.drawing}?studentId=${x.s[0]}`]) {
        const response = await ctx.api('GET', url, teacher);
        assert.ok(refused(response), `${url} -> ${response.status}`);
      }
      const classCourses = (await ctx.api('GET', `/api/courses/classroom/${x.class7B}`, teacher)).body;
      assert.deepEqual(classCourses, [], 'the class\'s course list shows only courses the teacher mentors');
    });
  });

  describe('assigned classes', () => {
    it('an assigned class is listed as assigned; assigning it again duplicates nothing', async () => {
      const again = await ctx.api('POST', `/api/courses/${x.drawing}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class7B], scope: 'selected', studentIds: [x.s[0]] } });
      assert.equal(again.status, 200);
      assert.equal(again.body.data[0].newlyAssigned, false);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [x.drawing, x.class7B])).n, 1);
      assert.deepEqual(await enrolledIds(x.drawing), x.s.slice(0, 3));
      const overview = (await ctx.api('GET', '/api/courses/teaching/overview', { as: 'adminA' })).body.data;
      assert.equal(overview.courses.find((c) => c.id === x.drawing).classes.find((c) => c.id === x.class7B).assigned, true);
    });

    it('removing a class removes only that assignment and the enrolments it created', async () => {
      // Dance: 7-B (home, s0) and 7-C (c1). c2 is enrolled in Dance individually.
      await ctx.db.run('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)', [x.dance, x.c2]);
      const removed = await ctx.api('DELETE', `/api/courses/${x.dance}/classrooms/${x.class7C}`, { as: 'adminA' });
      assert.equal(removed.status, 200, removed.text.slice(0, 160));
      assert.equal(removed.body.data.enrolmentsRemoved, 1);
      assert.equal(await enrolment(x.dance, x.c1), undefined, 'enrolled through 7-C: removed');
      assert.ok(await enrolment(x.dance, x.c2), 'enrolled individually: kept');
      assert.ok(await enrolment(x.dance, x.s[0]), 'another class: kept');
      assert.ok(await ctx.db.get('SELECT 1 FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?', [x.c1, x.class7C]), 'class membership kept');
      assert.ok(await enrolment(x.legacy, x.c1), 'other courses kept');
      assert.equal((await ctx.api('DELETE', `/api/courses/${x.dance}/classrooms/${x.class7C}`, { as: 'adminA' })).status, 404, 'already removed');
    });

    it('the last class cannot be removed; the home class can when another one is assigned', async () => {
      const last = await ctx.api('DELETE', `/api/courses/${x.dance}/classrooms/${x.class7B}`, { as: 'adminA' });
      assert.equal(last.status, 400);
      assert.ok(await ctx.db.get('SELECT 1 FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [x.dance, x.class7B]), 'unchanged');
      await ctx.api('POST', `/api/courses/${x.dance}/classrooms`, { as: 'adminA', body: { classroomIds: [x.class7C], scope: 'all' } });
      const home = await ctx.api('DELETE', `/api/courses/${x.dance}/classrooms/${x.class7B}`, { as: 'adminA' });
      assert.equal(home.status, 200, home.text.slice(0, 160));
      assert.equal((await ctx.db.get('SELECT classroomId FROM courses WHERE id = ?', [x.dance])).classroomId, x.class7C, '7-C is the home class now');
      assert.equal(await enrolment(x.dance, x.s[0]), undefined);
    });

    it('only the admin of the school removes or changes class assignments', async () => {
      assert.equal((await ctx.api('DELETE', `/api/courses/${x.music}/classrooms/${x.class7B}`, as(x.mentor))).status, 403);
      assert.ok(refused(await ctx.api('DELETE', `/api/courses/${x.music}/classrooms/${x.class7B}`, { as: 'adminB' })));
      assert.ok(refused(await ctx.api('POST', `/api/courses/${x.music}/classrooms`, { as: 'adminB', body: { classroomIds: [ids.classroomB] } })));
      assert.deepEqual(await enrolledIds(x.music), x.s);
    });
  });

  describe('the students of one class of a course', () => {
    it('shows the whole class, ticked when enrolled, and no one else', async () => {
      const response = await ctx.api('GET', `/api/courses/${x.drawing}/classrooms/${x.class7B}/students`, { as: 'adminA' });
      assert.equal(response.status, 200, response.text.slice(0, 160));
      const data = response.body.data;
      assert.equal(data.classSize, 5);
      assert.equal(data.enrolled, 3);
      assert.equal(data.scope, 'selected');
      assert.deepEqual(data.students.map((s) => [s.id, s.enrolled]), x.s.map((id, i) => [id, i < 3]));
      // a class the course is not assigned to
      assert.equal((await ctx.api('GET', `/api/courses/${x.drawing}/classrooms/${x.class7C}/students`, { as: 'adminA' })).status, 404);
    });

    it('ticking a student enrols them once; unticking removes only that enrolment', async () => {
      const url = `/api/courses/${x.drawing}/classrooms/${x.class7B}/students`;
      const add = await ctx.api('PUT', url, { as: 'adminA', body: { studentIds: [...x.s.slice(0, 3), x.s[3]] } });
      assert.equal(add.status, 200, add.text.slice(0, 160));
      assert.deepEqual(add.body.data.added.map((s) => s.id), [x.s[3]]);
      assert.deepEqual(add.body.data.removed, []);
      const twice = await ctx.api('PUT', url, { as: 'adminA', body: { studentIds: [...x.s.slice(0, 3), x.s[3], x.s[3]] } });
      assert.deepEqual(twice.body.data.added, [], 'nothing new');
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ? AND studentId = ?', [x.drawing, x.s[3]])).n, 1);

      // s1 has a result and another course: both stay when s1 leaves Drawing
      await ctx.db.run("INSERT INTO results (classroomId, studentId, term, subjects, overallPercentage, overallStatus) VALUES (?, ?, 'Term 1', '[]', 80, 'PASS')", [x.class7B, x.s[1]]);
      const remove = await ctx.api('PUT', url, { as: 'adminA', body: { studentIds: [x.s[0], x.s[2], x.s[3]] } });
      assert.equal(remove.status, 200);
      assert.deepEqual(remove.body.data.removed.map((s) => s.id), [x.s[1]]);
      assert.equal(remove.body.data.enrolled, 3);
      assert.equal(await enrolment(x.drawing, x.s[1]), undefined);
      assert.ok(await enrolment(x.music, x.s[1]), 'other course kept');
      assert.ok(await ctx.db.get('SELECT 1 FROM users WHERE id = ?', [x.s[1]]), 'account kept');
      assert.ok(await ctx.db.get('SELECT 1 FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?', [x.s[1], x.class7B]), 'class kept');
      assert.ok(await ctx.db.get('SELECT 1 FROM results WHERE studentId = ?', [x.s[1]]), 'result kept');
      const counts = (await ctx.api('GET', '/api/courses/teaching/overview', as(x.mentor))).body.data.courses.find((c) => c.id === x.drawing);
      assert.equal(counts.total, 3, 'counts follow');
    });

    it('unticking someone of an "all students" class makes it "selected"; scope "all" enrols the whole class again', async () => {
      const url = `/api/courses/${x.music}/classrooms/${x.class7B}/students`;
      const narrowed = await ctx.api('PUT', url, { as: 'adminA', body: { studentIds: x.s.slice(1) } });
      assert.equal(narrowed.body.data.scope, 'selected');
      assert.equal(await enrolment(x.music, x.s[0]), undefined);
      const all = await ctx.api('PUT', url, { as: 'adminA', body: { scope: 'all' } });
      assert.equal(all.status, 200);
      assert.equal(all.body.data.scope, 'all');
      assert.deepEqual(await enrolledIds(x.music), x.s);
    });

    it('students of another class or school, teachers, students and other schools are refused', async () => {
      const url = `/api/courses/${x.drawing}/classrooms/${x.class7B}/students`;
      const before = await enrolledIds(x.drawing);
      assert.equal((await ctx.api('PUT', url, { as: 'adminA', body: { studentIds: [x.s[0], x.c1] } })).status, 400, 'a student of 7-C');
      assert.ok([400, 404].includes((await ctx.api('PUT', url, { as: 'adminA', body: { studentIds: [U.studentB] } })).status), 'a student of school B');
      assert.ok([400, 404].includes((await ctx.api('PUT', url, { as: 'adminA', body: { studentIds: 'all' } })).status));
      assert.equal((await ctx.api('PUT', url, as(x.mentor))).status, 403, 'the course teacher');
      assert.equal((await ctx.api('PUT', url, { ...as(x.s[0], 'student'), body: { studentIds: [] } })).status, 403, 'a student');
      assert.ok(refused(await ctx.api('PUT', url, { as: 'adminB', body: { studentIds: [] } })), 'admin of school B');
      assert.ok(refused(await ctx.api('GET', url, { as: 'adminB' })));
      assert.ok(refused(await ctx.api('GET', url, { as: 'superadmin' })), 'the platform owner does not run a school\'s courses');
      assert.deepEqual(await enrolledIds(x.drawing), before, 'nothing changed');
    });
  });

  describe('teacher enrolment page (assign-students)', () => {
    it('keeps the class an unchanged enrolment came through', async () => {
      const current = (await ctx.db.all('SELECT studentId FROM course_students WHERE courseId = ?', [x.drawing])).map((r) => r.studentId);
      const response = await ctx.api('POST', `/api/courses/${x.drawing}/assign-students`, { ...as(x.mentor), body: { studentIds: current } });
      assert.equal(response.status, 200, response.text.slice(0, 160));
      assert.equal((await enrolment(x.drawing, x.s[0])).enrolledViaClassroomId, x.class7B);
      assert.ok(refused(await ctx.api('POST', `/api/courses/${x.drawing}/assign-students`, { ...as(x.classTeacher), body: { studentIds: current } })), 'not for the class teacher');
    });
  });
});
