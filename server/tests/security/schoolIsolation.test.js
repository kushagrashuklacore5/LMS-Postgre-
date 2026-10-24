/**
 * School isolation: an account of School A can never read or change School B's records,
 * and inside a school a student or teacher reaches only what is theirs.
 * Covers SEC-010 (tenant isolation), SEC-011 (answer exposure), SEC-012 (ownership checks)
 * and the "default school 1" part of SEC-003.
 *
 * Fixtures (tests/helpers/testApp.js): ids 1xxx / 1xx / 1x belong to School A, 2xxx / 2xx / 2x
 * to School B. Every School B record carries a marker ending in "B" so a leak is easy to spot.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('../helpers/testApp');
const { listRoutes } = require('../helpers/routeInventory');

// Text that exists only in School B's records.
const SCHOOL_B_MARKERS = [
  'Science B', 'School B', 'studentb@test.invalid', 'mentorb@test.invalid', 'adminb@test.invalid',
  'ANSWER-KEY-B', 'SUBJECT-B', 'PAYMENT-B', 'TXN-B', 'GATEWAY-SIGNATURE-B', 'ANNOUNCEMENT-B', 'EVENT-B',
  'LIVE-B', 'Category B', 'Week B', 'Chapter B', 'Material B', 'Quiz B', 'Question B',
];
const leaked = (text) => SCHOOL_B_MARKERS.filter((marker) => text.includes(marker));

const SCHOOL_A_ACCOUNTS = ['adminA', 'mentorA', 'studentA', 'accountantA', 'storekeeperA'];

// Replaces every :param of a route with an id from one school.
const fillWith = (ids, school) => (routePath) => {
  const B = school === 'B';
  const values = {
    classroomId: B ? ids.classroomB : ids.classroomA,
    courseId: B ? ids.courseB : ids.courseA,
    studentId: B ? ids.users.studentB : ids.users.studentA,
    userId: B ? ids.users.studentB : ids.users.studentA,
    mentorId: B ? ids.users.mentorB : ids.users.mentorA,
    teacherId: B ? ids.users.mentorB : ids.users.mentorA,
    assessmentId: B ? ids.assessmentB : ids.assessmentA,
    questionId: B ? ids.questionB : ids.questionA,
    weekId: B ? ids.weekB : ids.weekA,
    chapterId: B ? ids.chapterB : ids.chapterA,
    liveClassId: B ? ids.liveClassB : ids.liveClassA,
    certificateId: B ? ids.certificateB : ids.certificateA,
    resultId: B ? ids.resultB : ids.resultA,
    date: '2026-01-15', role: 'student', grade: '5', contentType: 'course', contentField: 'title', lang: 'en',
    contentId: B ? ids.courseB : ids.courseA,
  };
  return routePath.replace(/:(\w+)/g, (match, name) => (values[name] !== undefined ? values[name] : match));
};

describe('school isolation', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  describe('School A cannot read School B (direct object access)', () => {
    // Each URL names a School B record. `:id` routes are listed explicitly because the
    // meaning of :id depends on the router.
    const urls = () => [
      `/api/courses/${ids.courseB}`,
      `/api/courses/${ids.courseB}/students`,
      `/api/courses/classroom/${ids.classroomB}`,
      `/api/chapters/course/${ids.courseB}`,
      `/api/chapters/${ids.chapterB}`,
      `/api/materials/course/${ids.courseB}`,
      `/api/materials/week/${ids.weekB}`,
      `/api/materials/${ids.materialB}`,
      `/api/weeks/${ids.weekB}`,
      `/api/assessments/${ids.assessmentB}`,
      `/api/assessments/${ids.assessmentB}/questions`,
      `/api/assessments/questions/${ids.assessmentB}`,
      `/api/assessments/course/${ids.courseB}`,
      `/api/assessments/course/${ids.courseB}/all`,
      `/api/assessments/${ids.assessmentB}/attempts`,
      `/api/assessments/course/${ids.courseB}/attempts`,
      `/api/attendance/classroom/${ids.classroomB}/date/2026-01-15`,
      `/api/attendance/${ids.attendanceB}`,
      `/api/results/student/${ids.users.studentB}`,
      `/api/results/classroom/${ids.classroomB}`,
      `/api/results/${ids.resultB}`,
      `/api/results/subjects/classroom/${ids.classroomB}`,
      `/api/results/subjects/classroom/${ids.classroomB}/students`,
      `/api/live-classes/course/${ids.courseB}`,
      `/api/progress/${ids.courseB}`,
      `/api/classrooms/${ids.classroomB}`,
      `/api/classrooms/${ids.classroomB}/students`,
      `/api/classrooms/${ids.classroomB}/fee-structure`,
      `/api/classrooms/mentor/${ids.users.mentorB}`,
      `/api/feeStructures/${ids.feeStructureB}`,
      `/api/calendar_events/${ids.calendarEventB}`,
      `/api/announcements/${ids.announcementB}`,
      `/api/users/${ids.users.studentB}`,
      `/api/users/${ids.users.adminB}`,
      `/api/admin/students/${ids.users.studentB}/classrooms`,
      `/api/transactions/student/${ids.users.studentB}`,
      `/api/payments/transactions/${ids.users.studentB}`,
      `/api/student/${ids.users.studentB}/classroom`,
      `/api/translation/content/${ids.courseB}/course/title/en`,
      // the same attack through the query string
      `/api/weeks?courseId=${ids.courseB}`,
      `/api/materials?courseId=${ids.courseB}`,
      `/api/chapters?courseId=${ids.courseB}`,
      `/api/assessments?courseId=${ids.courseB}`,
      `/api/attendance?classroomId=${ids.classroomB}&date=2026-01-15`,
      `/api/attendance/download?classroomId=${ids.classroomB}&startDate=2026-01-01&endDate=2026-12-31`,
      `/api/results?classroomId=${ids.classroomB}`,
      `/api/results?studentId=${ids.users.studentB}`,
      `/api/courses?classroomId=${ids.classroomB}`,
      `/api/courses/classroom?classroomId=${ids.classroomB}`,
      `/api/progress?studentId=${ids.users.studentB}`,
      `/api/certificates?studentId=${ids.users.studentB}`,
      `/api/accountant/student-payments-history?studentId=${ids.users.studentB}`,
      `/api/accountant/student-installment-status?studentId=${ids.users.studentB}`,
    ];

    for (const account of SCHOOL_A_ACCOUNTS) {
      it(`${account} gets no School B record`, async () => {
        const problems = [];
        for (const url of urls()) {
          const response = await ctx.api('GET', url, { as: account });
          if (response.status === 200 || response.status >= 500) problems.push(`${url} -> ${response.status}`);
          const found = leaked(response.text);
          if (found.length) problems.push(`${url} leaked ${found.join(', ')}`);
        }
        assert.deepEqual(problems, []);
      });
    }

    it('School B itself can read its own records through the same URLs', async () => {
      const own = [
        `/api/courses/${ids.courseB}`, `/api/chapters/course/${ids.courseB}`, `/api/materials/course/${ids.courseB}`,
        `/api/assessments/course/${ids.courseB}/all`, `/api/results/classroom/${ids.classroomB}`, `/api/classrooms/${ids.classroomB}`,
        `/api/classrooms/${ids.classroomB}/students`, `/api/users/${ids.users.studentB}`, `/api/weeks?courseId=${ids.courseB}`,
        `/api/results/student/${ids.users.studentB}`,
      ];
      for (const url of own) {
        assert.equal((await ctx.api('GET', url, { as: 'adminB' })).status, 200, url);
      }
    });
  });

  describe('no list, search or dashboard of School A contains School B data', () => {
    for (const account of SCHOOL_A_ACCOUNTS) {
      it(`every GET route as ${account}, with School A ids and with School B ids`, async () => {
        const routes = listRoutes(ctx.app).filter((route) => route.method === 'GET' && route.path.startsWith('/api'));
        const leaks = [];
        const seen = new Set();
        for (const school of ['A', 'B']) {
          for (const route of routes) {
            const url = fillWith(ids, school)(route.path).replace(/:\w+/g, '1');
            if (seen.has(url)) continue;
            seen.add(url);
            const response = await ctx.api('GET', url, { as: account });
            const found = leaked(response.text);
            if (found.length) leaks.push(`${url} (${response.status}) leaked ${found.join(', ')}`);
          }
        }
        assert.deepEqual(leaks, []);
      });
    }

    it('the lists are not simply empty: School A sees its own data', async () => {
      const courses = await ctx.api('GET', '/api/courses', { as: 'adminA' });
      assert.ok(courses.text.includes('Science A') && courses.text.includes('History A'));
      const users = await ctx.api('GET', '/api/users?role=student', { as: 'mentorA' });
      assert.deepEqual(users.body.data.map((user) => user.id).sort(), [ids.users.studentA, ids.users.studentA2]);
      const adminUsers = await ctx.api('GET', '/api/admin/users', { as: 'adminA' });
      assert.ok(adminUsers.text.includes('studenta@test.invalid'));
    });

    it('the platform owner sees every school', async () => {
      const users = await ctx.api('GET', '/api/superadmin/users', { as: 'superadmin' });
      assert.equal(users.status, 200);
      assert.ok(users.text.includes('studenta@test.invalid') && users.text.includes('studentb@test.invalid'));
    });
  });

  describe('School A cannot change School B', () => {
    // [method, url, body] - each names a School B record in the URL or in the body
    const attacks = () => [
      ['PUT', `/api/courses/${ids.courseB}`, { title: 'HACKED' }],
      ['DELETE', `/api/courses/${ids.courseB}`],
      ['POST', `/api/courses/${ids.courseB}/assign-students`, { studentIds: [ids.users.studentA] }],
      ['POST', `/api/courses/${ids.courseA}/assign-students`, { studentIds: [ids.users.studentB] }],
      ['POST', '/api/courses/create-course', { title: 'Smuggled', classroomId: ids.classroomB }],
      ['POST', '/api/courses/create-course', { title: 'Smuggled', classroomId: ids.classroomA, mentorId: ids.users.mentorB }],
      ['PUT', `/api/weeks/${ids.weekB}`, { title: 'HACKED' }],
      ['DELETE', `/api/weeks/${ids.weekB}`],
      ['POST', '/api/weeks', { courseId: ids.courseB, weekNumber: 9, title: 'HACKED' }],
      ['DELETE', `/api/materials/${ids.materialB}`],
      ['DELETE', `/api/chapters/delete-chapter/${ids.chapterB}`],
      ['POST', '/api/assessments/create', { courseId: ids.courseB, title: 'HACKED', startTime: '2026-01-01', endTime: '2026-12-31' }],
      ['POST', '/api/assessments/add-question', { assessmentId: ids.assessmentB, questionText: 'HACKED', questionType: 'multiple_choice' }],
      ['PUT', `/api/assessments/${ids.assessmentB}/publish`, { isPublished: false }],
      ['POST', '/api/attendance/mark', { classroomId: ids.classroomB, date: '2026-03-01', attendanceData: [{ studentId: ids.users.studentB, status: 'absent' }] }],
      ['POST', '/api/attendance/mark', { classroomId: ids.classroomA, date: '2026-03-01', attendanceData: [{ studentId: ids.users.studentB, status: 'absent' }] }],
      ['POST', '/api/results', { classroomId: ids.classroomB, studentId: ids.users.studentB, subjects: [] }],
      ['POST', '/api/results', { classroomId: ids.classroomA, studentId: ids.users.studentB, subjects: [] }],
      ['POST', '/api/results/add', { classroomId: ids.classroomB, studentId: ids.users.studentB, subjects: [] }],
      ['DELETE', `/api/results/${ids.resultB}`],
      ['PUT', `/api/results/subjects/classroom/${ids.classroomB}`, { subjects: [] }],
      ['PUT', `/api/classrooms/${ids.classroomB}`, { name: 'HACKED' }],
      ['DELETE', `/api/classrooms/${ids.classroomB}`],
      ['POST', '/api/classrooms/assign-student', { classroomId: ids.classroomA, studentId: ids.users.studentB }],
      ['POST', '/api/classrooms/assign-student', { classroomId: ids.classroomB, studentId: ids.users.studentA }],
      ['PUT', `/api/classrooms/fee-structures/${ids.feeStructureB}`, { tuitionFee: 1, totalFee: 1 }],
      ['PUT', `/api/users/${ids.users.studentB}`, { name: 'HACKED', role: 'admin' }],
      ['DELETE', `/api/users/${ids.users.studentB}`],
      ['DELETE', `/api/admin/users/${ids.users.studentB}`],
      ['PUT', `/api/admin/students/${ids.users.studentB}/classroom`, { classroomId: ids.classroomA }],
      ['PUT', `/api/users/approve-mentor/${ids.users.mentorB}`],
      ['DELETE', `/api/users/reject-mentor/${ids.users.mentorB}`],
      ['PUT', `/api/calendar/${ids.calendarEventB}`, { title: 'HACKED' }],
      ['DELETE', `/api/calendar/${ids.calendarEventB}`],
      ['DELETE', `/api/announcements/${ids.announcementB}`],
      ['PUT', `/api/live-classes/${ids.liveClassB}/start`, {}],
      ['POST', `/api/live-classes/${ids.liveClassB}/end`, {}],
      ['DELETE', `/api/live-classes/${ids.liveClassB}`],
      ['POST', '/api/live-classes', { courseId: ids.courseB, title: 'HACKED', scheduledStartTime: '2026-12-01', scheduledEndTime: '2026-12-02' }],
      ['POST', '/api/accountant/collect-offline-fee', { studentId: ids.users.studentB, amount: 100, paymentMethod: 'Cash' }],
      ['POST', '/api/classrooms/send-fee-reminder', { studentId: ids.users.studentB, studentEmail: 'studentb@test.invalid', amount: 1 }],
      ['POST', '/api/transactions', { studentId: ids.users.studentB, amount: 1, type: 'offline', status: 'success' }],
      ['POST', '/api/translation/translate-content', { contentId: ids.courseB, contentType: 'course', contentField: 'title', targetLang: 'ar' }],
    ];

    let before;
    const snapshot = async () => JSON.stringify({
      users: await ctx.db.all('SELECT id, name, email, role, isApproved, university_id FROM users WHERE university_id = 2 ORDER BY id'),
      classrooms: await ctx.db.all('SELECT id, name, university_id FROM classrooms WHERE university_id = 2'),
      members: await ctx.db.all('SELECT studentId, classroomId FROM student_classroom_assignment ORDER BY studentId, classroomId'),
      courses: await ctx.db.all('SELECT id, title, mentorId, classroomId, university_id FROM courses ORDER BY id'),
      enrolled: await ctx.db.all('SELECT courseId, studentId FROM course_students ORDER BY courseId, studentId'),
      weeks: await ctx.db.all('SELECT id, courseId, title FROM weeks ORDER BY id'),
      chapters: await ctx.db.all('SELECT id, title FROM chapters ORDER BY id'),
      materials: await ctx.db.all('SELECT id, title FROM course_materials ORDER BY id'),
      assessments: await ctx.db.all('SELECT id, courseId, title, isPublished FROM assessments ORDER BY id'),
      questions: await ctx.db.all('SELECT id, assessmentId, questionText FROM assessment_questions ORDER BY id'),
      attendance: await ctx.db.all('SELECT id, classroomId, studentId, date, status FROM attendance ORDER BY id'),
      results: await ctx.db.all('SELECT id, classroomId, studentId, term FROM results ORDER BY id'),
      fees: await ctx.db.all('SELECT id, tuitionFee, totalFee, university_id FROM feeStructures ORDER BY id'),
      events: await ctx.db.all('SELECT id, title FROM calendar_events ORDER BY id'),
      announcements: await ctx.db.all('SELECT id, title, recipientUserId FROM announcements ORDER BY id'),
      liveClasses: await ctx.db.all('SELECT id, courseId, title, status FROM live_classes ORDER BY id'),
      payments: await ctx.db.all('SELECT id, studentId, amount FROM payments ORDER BY id'),
    });

    it('records the starting state', async () => { before = await snapshot(); });

    for (const account of ['adminA', 'mentorA', 'accountantA']) {
      it(`${account}: every attempt is refused`, async () => {
        const accepted = [];
        for (const [method, url, body] of attacks()) {
          const response = await ctx.api(method, url, { as: account, body: body === undefined && method !== 'DELETE' ? {} : body });
          if (response.status < 400) accepted.push(`${method} ${url} ${JSON.stringify(body || {})} -> ${response.status}`);
        }
        assert.deepEqual(accepted, []);
      });
    }

    it('nothing in either school changed', async () => {
      assert.equal(await snapshot(), before);
      assert.equal(ctx.app && (await ctx.db.get("SELECT COUNT(*) AS n FROM announcements WHERE title LIKE 'Fee Payment Reminder%'")).n, 0);
    });
  });

  describe('inside one school: a student reaches only their own records', () => {
    const others = () => [
      `/api/results/student/${ids.users.studentA2}`,
      `/api/results?studentId=${ids.users.studentA2}`,
      `/api/attendance?studentId=${ids.users.studentA2}`,
      `/api/progress?studentId=${ids.users.studentA2}`,
      `/api/users/${ids.users.studentA2}`,
      `/api/student/${ids.users.studentA2}/classroom`,
      `/api/transactions/student/${ids.users.studentA2}`,
      `/api/payments/transactions/${ids.users.studentA2}`,
      `/api/accountant/student-payments-history?studentId=${ids.users.studentA2}`,
      // a course and classroom the student is not in
      `/api/courses/${ids.courseA2}`,
      `/api/courses/${ids.courseA2}/students`,
      `/api/chapters/course/${ids.courseA2}`,
      `/api/materials/course/${ids.courseA2}`,
      `/api/assessments/course/${ids.courseA2}`,
      `/api/live-classes/course/${ids.courseA2}`,
      `/api/classrooms/${ids.classroomA2}`,
      `/api/classrooms/${ids.classroomA2}/students`,
      `/api/attendance/classroom/${ids.classroomA2}/date/2026-01-15`,
      `/api/results/classroom/${ids.classroomA2}`,
      `/api/results/classroom/${ids.classroomA}`,
    ];

    it('another student\'s records and other classes are refused', async () => {
      const readable = [];
      for (const url of others()) {
        const response = await ctx.api('GET', url, { as: 'studentA' });
        if (response.status === 200) readable.push(url);
      }
      assert.deepEqual(readable, []);
    });

    it('generic lists return only the student\'s own rows', async () => {
      for (const entity of ['results', 'attendance', 'certificates', 'progress']) {
        const response = await ctx.api('GET', `/api/${entity}`, { as: 'studentA' });
        if (response.status !== 200 || !Array.isArray(response.body?.data)) continue;
        for (const row of response.body.data) assert.equal(String(row.studentId), String(ids.users.studentA), entity);
      }
    });

    it('their own course, class and results stay readable', async () => {
      for (const url of [
        `/api/courses/${ids.courseA}`, `/api/chapters/course/${ids.courseA}`, `/api/materials/course/${ids.courseA}`,
        `/api/assessments/course/${ids.courseA}`, `/api/results/student/${ids.users.studentA}`, '/api/results/my-results',
        '/api/attendance/student', '/api/courses/student', '/api/classrooms/student-classrooms', '/api/student-classrooms',
        `/api/live-classes/course/${ids.courseA}`, '/api/announcements',
      ]) {
        assert.equal((await ctx.api('GET', url, { as: 'studentA' })).status, 200, url);
      }
    });

    it('a student never receives the answer key of an assessment (SEC-011)', async () => {
      for (const url of [
        `/api/assessments/${ids.assessmentA}/questions`, `/api/assessments/questions/${ids.assessmentA}`,
        `/api/assessments/course/${ids.courseA}`, `/api/assessments/${ids.assessmentA}`, '/api/assessments',
      ]) {
        const response = await ctx.api('GET', url, { as: 'studentA' });
        assert.equal(response.text.includes('ANSWER-KEY'), false, `${url} exposed the answer key`);
        assert.equal(/"correctAnswer"\s*:\s*"[^"]+"/.test(response.text), false, `${url} exposed correctAnswer`);
      }
      // the teacher of that course still sees it
      const teacher = await ctx.api('GET', `/api/assessments/${ids.assessmentA}/questions`, { as: 'mentorA' });
      assert.ok(teacher.text.includes('ANSWER-KEY-A'));
    });

    it('a student cannot act for another student', async () => {
      const attempts = [
        ['POST', '/api/assessments/submit', { assessmentId: ids.assessmentA, studentId: ids.users.studentA2, answers: [] }],
        ['POST', '/api/progress/mark-completed', { courseId: ids.courseA, studentId: ids.users.studentA2, chapterId: ids.chapterA }],
        ['POST', '/api/payments/create-order', { studentId: ids.users.studentA2, amount: 100 }],
        ['POST', '/api/assessments/submit', { assessmentId: ids.assessmentB, answers: [] }],
        ['POST', '/api/progress/mark-content-completed', { courseId: ids.courseA2, contentType: 'chapter', contentId: 1 }],
      ];
      for (const [method, url, body] of attempts) {
        const response = await ctx.api(method, url, { as: 'studentA', body });
        assert.ok(response.status >= 400 && response.status < 500, `${url} ${JSON.stringify(body)} -> ${response.status}`);
      }
    });
  });

  describe('inside one school: a teacher reaches only the classes they teach', () => {
    it('another teacher\'s class, course and students are refused', async () => {
      const urls = [
        `/api/results/classroom/${ids.classroomA2}`,
        `/api/results/student/${ids.users.studentA2}`,
        `/api/results?classroomId=${ids.classroomA2}`,
        `/api/attendance?classroomId=${ids.classroomA2}&date=2026-01-15`,
        `/api/attendance/classroom/${ids.classroomA2}/date/2026-01-15`,
        `/api/classrooms/${ids.classroomA2}/students`,
        `/api/classrooms/mentor/${ids.users.mentorA2}`,
        `/api/courses/${ids.courseA2}/students`,
        `/api/assessments/course/${ids.courseA2}/attempts`,
        `/api/results/subjects/classroom/${ids.classroomA2}/students`,
      ];
      const readable = [];
      for (const url of urls) {
        const response = await ctx.api('GET', url, { as: 'mentorA' });
        if (response.status === 200) readable.push(url);
      }
      assert.deepEqual(readable, []);
    });

    it('another teacher\'s class cannot be changed', async () => {
      const attacks = [
        ['PUT', `/api/courses/${ids.courseA2}`, { title: 'HACKED' }],
        ['DELETE', `/api/courses/${ids.courseA2}`],
        ['POST', `/api/courses/${ids.courseA2}/assign-students`, { studentIds: [ids.users.studentA] }],
        ['POST', '/api/weeks', { courseId: ids.courseA2, weekNumber: 9, title: 'HACKED' }],
        ['POST', '/api/assessments/create', { courseId: ids.courseA2, title: 'HACKED', startTime: '2026-01-01', endTime: '2026-12-31' }],
        ['POST', '/api/attendance/mark', { classroomId: ids.classroomA2, date: '2026-03-01', attendanceData: [{ studentId: ids.users.studentA2, status: 'absent' }] }],
        ['POST', '/api/results', { classroomId: ids.classroomA2, studentId: ids.users.studentA2, subjects: [] }],
        ['POST', '/api/results', { classroomId: ids.classroomA, studentId: ids.users.studentA2, subjects: [] }],
        ['POST', '/api/attendance/mark', { classroomId: ids.classroomA, date: '2026-03-01', attendanceData: [{ studentId: ids.users.studentA2, status: 'absent' }] }],
        ['POST', '/api/live-classes', { courseId: ids.courseA2, title: 'HACKED', scheduledStartTime: '2026-12-01', scheduledEndTime: '2026-12-02' }],
      ];
      const accepted = [];
      for (const [method, url, body] of attacks) {
        const response = await ctx.api(method, url, { as: 'mentorA', body });
        if (response.status < 400) accepted.push(`${method} ${url} ${JSON.stringify(body || {})} -> ${response.status}`);
      }
      assert.deepEqual(accepted, []);
      assert.equal((await ctx.db.get('SELECT title FROM courses WHERE id = ?', [ids.courseA2])).title, 'History A');
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM attendance WHERE date = ?', ['2026-03-01'])).n, 0);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM results WHERE studentId = ?', [ids.users.studentA2])).n, 0);
    });

    it('their own class keeps working: read, mark attendance, enter a result', async () => {
      for (const url of [
        `/api/results/classroom/${ids.classroomA}`, `/api/classrooms/${ids.classroomA}/students`, `/api/courses/${ids.courseA}/students`,
        `/api/attendance?classroomId=${ids.classroomA}&date=2026-01-15`, `/api/results/student/${ids.users.studentA}`, '/api/courses/mentor',
      ]) {
        assert.equal((await ctx.api('GET', url, { as: 'mentorA' })).status, 200, url);
      }
      const marked = await ctx.api('POST', '/api/attendance/mark', {
        as: 'mentorA',
        body: { classroomId: ids.classroomA, date: '2026-04-01', attendanceData: [{ studentId: ids.users.studentA, status: 'present' }] },
      });
      assert.ok(marked.status < 300, `mark attendance -> ${marked.status} ${marked.text.slice(0, 120)}`);
      const result = await ctx.api('POST', '/api/results', {
        as: 'mentorA',
        body: { classroomId: ids.classroomA, studentId: ids.users.studentA, term: 'Term 2', subjects: [{ name: 'Maths', marks: 40, total: 50, status: 'PASS' }] },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.data.overallStatus, 'PASS');
    });
  });
});
