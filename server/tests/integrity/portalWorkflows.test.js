/**
 * The requests the portal pages actually send.
 *
 * Each case here was first seen failing in a browser run of the four portals (the page
 * showed an empty list or an error while the API suites were green). They pin the contract
 * between a page and the server: the address, the shape of the request, the fields used.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');

describe('portal workflows', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  describe('teacher: attendance page', () => {
    it('lists the signed-in teacher\'s own classes at /classrooms/mentor/me', async () => {
      const mine = await ctx.api('GET', '/api/classrooms/mentor/me', { as: 'mentorA' });
      assert.equal(mine.status, 200, mine.text.slice(0, 120));
      const list = mine.body.data || mine.body;
      assert.deepEqual(list.map((c) => c.id), [ids.classroomA], 'only the class this teacher teaches');

      const other = await ctx.api('GET', '/api/classrooms/mentor/me', { as: 'mentorB' });
      assert.deepEqual((other.body.data || other.body).map((c) => c.id), [ids.classroomB]);

      assert.equal((await ctx.api('GET', '/api/classrooms/mentor/me', { as: 'studentA' })).status, 403);
      assert.equal((await ctx.api('GET', '/api/classrooms/mentor/me')).status, 401);
    });
  });

  describe('admin: create course page', () => {
    it('the teacher list carries the id and email the form shows', async () => {
      const response = await ctx.api('GET', '/api/users/mentors-simple', { as: 'adminA' });
      assert.equal(response.status, 200);
      const teacher = response.body.find((m) => m.id === ids.users.mentorA);
      assert.ok(teacher, 'the school\'s teacher is listed by id');
      assert.equal(teacher.email, 'mentora@test.invalid');
      assert.ok(!response.body.some((m) => m.id === ids.users.mentorB), 'no teacher of another school');
      assert.ok(!response.body.some((m) => 'password' in m));
      assert.equal((await ctx.api('GET', '/api/users/mentors-simple')).status, 401);
    });

    it('a JSON request creates the course for the chosen teacher and enrols the chosen students', async () => {
      const created = await ctx.api('POST', '/api/courses/create-course', {
        as: 'adminA',
        body: { title: 'Browser-run course', category: 'Science', duration: '8 Weeks', description: 'd', mentorId: ids.users.mentorA2, classroomId: ids.classroomA, enrollScope: 'none', studentIds: [ids.users.studentA, ids.users.studentA2] },
      });
      assert.equal(created.status, 201, created.text.slice(0, 160));
      const course = await ctx.db.get("SELECT * FROM courses WHERE title = 'Browser-run course'");
      assert.equal(course.mentorId, ids.users.mentorA2, 'the chosen teacher, not the admin');
      assert.equal(course.university_id, ids.schoolA);
      for (let attempt = 0; attempt < 40; attempt++) {
        const enrolled = await ctx.db.all('SELECT studentId FROM course_students WHERE courseId = ? ORDER BY studentId', [course.id]);
        if (enrolled.length === 2) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const enrolled = await ctx.db.all('SELECT studentId FROM course_students WHERE courseId = ? ORDER BY studentId', [course.id]);
      assert.deepEqual(enrolled.map((r) => r.studentId), [ids.users.studentA, ids.users.studentA2]);
    });

    it('an admin cannot create a course without a class (class first)', async () => {
      const response = await ctx.api('POST', '/api/courses/create-course', { as: 'adminA', body: { title: 'No class course', mentorId: ids.users.mentorA } });
      assert.equal(response.status, 400);
      assert.match(response.body.message, /class/i);
      assert.equal((await ctx.db.get("SELECT COUNT(*) AS n FROM courses WHERE title = 'No class course'")).n, 0);
    });

    it('a teacher or student of another school cannot be put on the course', async () => {
      const before = (await ctx.db.get('SELECT COUNT(*) AS n FROM courses')).n;
      const foreignTeacher = await ctx.api('POST', '/api/courses/create-course', { as: 'adminA', body: { title: 'Foreign teacher', mentorId: ids.users.mentorB, classroomId: ids.classroomA } });
      assert.ok([400, 403, 404].includes(foreignTeacher.status), `foreign teacher -> ${foreignTeacher.status}`);
      const foreignStudent = await ctx.api('POST', '/api/courses/create-course', { as: 'adminA', body: { title: 'Foreign student', mentorId: ids.users.mentorA, classroomId: ids.classroomA, enrollScope: 'none', studentIds: [ids.users.studentB] } });
      assert.ok([400, 403, 404].includes(foreignStudent.status), `foreign student -> ${foreignStudent.status}`);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM courses')).n, before);
    });
  });

  describe('student: course page', () => {
    it('lists published quizzes only; the teacher still sees drafts', async () => {
      const draft = await ctx.db.run(
        "INSERT INTO assessments (courseId, weekId, title, startTime, endTime, timer, isPublished, createdBy) VALUES (?, ?, 'DRAFT-QUIZ', ?, ?, 30, 0, ?)",
        [ids.courseA, ids.weekA, new Date(Date.now() - 3600e3).toISOString(), new Date(Date.now() + 3600e3).toISOString(), ids.users.mentorA]
      );
      const asStudent = await ctx.api('GET', `/api/assessments/course/${ids.courseA}`, { as: 'studentA' });
      assert.equal(asStudent.status, 200);
      assert.ok(asStudent.body.some((a) => (a.id || a._id) === ids.assessmentA), 'the published quiz is listed');
      assert.ok(!asStudent.text.includes('DRAFT-QUIZ'), 'a draft is not shown to a student');

      const asTeacher = await ctx.api('GET', `/api/assessments/course/${ids.courseA}`, { as: 'mentorA' });
      assert.ok(asTeacher.body.some((a) => (a.id || a._id) === draft.lastID), 'the teacher sees the draft');
    });

    it('the generic read routes show a student their own courses only, and no drafts', async () => {
      // studentA takes courseA (class A). courseA2 belongs to another class of the same school.
      const list = async (entity) => {
        const response = await ctx.api('GET', `/api/${entity}`, { as: 'studentA' });
        assert.equal(response.status, 200, `${entity}: ${response.text.slice(0, 100)}`);
        return response.body.data || response.body;
      };
      // (the course created by the admin test above also enrolled studentA)
      const enrolled = (await ctx.db.all('SELECT courseId FROM course_students WHERE studentId = ? ORDER BY courseId', [ids.users.studentA])).map((r) => r.courseId);
      assert.ok(enrolled.includes(ids.courseA) && !enrolled.includes(ids.courseA2));
      assert.deepEqual((await list('courses')).map((c) => c.id).sort((a, b) => a - b), enrolled);
      assert.deepEqual((await list('chapters')).map((c) => c.courseId), [ids.courseA]);
      const quizzes = await list('assessments');
      assert.ok(quizzes.length >= 1 && quizzes.every((a) => a.courseId === ids.courseA && a.isPublished === 1), JSON.stringify(quizzes.map((a) => [a.courseId, a.isPublished])));

      assert.equal((await ctx.api('GET', `/api/courses/${ids.courseA2}`, { as: 'studentA' })).status, 404);
      const draft = await ctx.db.get("SELECT id FROM assessments WHERE title = 'DRAFT-QUIZ'");
      assert.equal((await ctx.api('GET', `/api/assessments/${draft.id}`, { as: 'studentA' })).status, 404);

      // staff of the school are not narrowed
      const staff = await ctx.api('GET', '/api/courses', { as: 'adminA' });
      assert.ok((staff.body.data || staff.body.courses || staff.body).length >= 2);
    });

    it('a student sees who is in the class, without classmates\' email addresses', async () => {
      await ctx.db.run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [ids.users.studentA2, ids.classroomA]);
      const asStudent = await ctx.api('GET', `/api/classrooms/${ids.classroomA}/students`, { as: 'studentA' });
      assert.equal(asStudent.status, 200);
      assert.equal(asStudent.body.length, 2);
      assert.ok(asStudent.body.every((s) => s.name && !('email' in s)), JSON.stringify(asStudent.body[0]));
      assert.ok(!asStudent.text.includes('@test.invalid'));

      const asTeacher = await ctx.api('GET', `/api/classrooms/${ids.classroomA}/students`, { as: 'mentorA' });
      assert.ok(asTeacher.body.every((s) => s.email), 'the teacher still gets contact details');
      await ctx.db.run('DELETE FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?', [ids.users.studentA2, ids.classroomA]);
    });

    it('a chapter\'s file is offered through a signed link that opens', async () => {
      await ctx.db.run("UPDATE chapters SET fileUrl = '/uploads/chapter-notes.pdf' WHERE id = ?", [ids.chapterA]);
      require('fs').mkdirSync(ctx.uploadsDir, { recursive: true });
      require('fs').writeFileSync(require('path').join(ctx.uploadsDir, 'chapter-notes.pdf'), '%PDF-1.4\n%%EOF\n');

      const chapters = await ctx.api('GET', `/api/chapters/course/${ids.courseA}`, { as: 'studentA' });
      assert.equal(chapters.status, 200, chapters.text.slice(0, 120));
      const list = chapters.body.chapters || chapters.body.data || chapters.body;
      const link = list.find((c) => (c.id || c._id) === ids.chapterA).fileUrl;
      assert.match(link, /^\/uploads\/chapter-notes\.pdf\?expires=\d+&signature=[0-9a-f]+$/);
      assert.equal((await ctx.api('GET', link)).status, 200, 'the signed link opens');
      assert.equal((await ctx.api('GET', '/uploads/chapter-notes.pdf')).status, 403, 'the bare address does not');
    });
  });
});
