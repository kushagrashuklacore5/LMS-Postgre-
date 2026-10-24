/**
 * Test harness for the security and data-integrity suites.
 *
 * Starts the real Express app (server.js) inside the test process against a
 * brand-new PostgreSQL database (lms_test_<random>, see pgTestDatabase.js), seeded
 * with two synthetic schools and one account per role. Nothing here touches the school
 * database, a mail server, the payment gateway or an AI provider:
 *   - DATABASE_URL points at the throw-away database, which is dropped by stop();
 *   - uploaded files go to a temporary folder (LMS_UPLOADS_DIR);
 *   - server/.env is not loaded (LMS_SKIP_DOTENV), so no real credential is in memory;
 *   - mail goes to an in-memory outbox (EMAIL_TRANSPORT=mock);
 *   - payment and AI keys are removed, which switches those features off.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createTestDatabase } = require('./pgTestDatabase');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

// Variables that would connect a test run to something real. They must not be set.
const REAL_SERVICE_VARIABLES = [
  'EMAIL_USER', 'EMAIL_PASS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'HF_TOKEN',
  'ONBOARDING_EMAIL_ENABLED', 'MASTER_DB_PASSWORD', 'TENANT_DB_PASSWORD',
  'JAAS_PRIVATE_KEY', 'JAAS_PRIVATE_KEY_FILE', 'JAAS_WEBHOOK_SECRET', 'CHATBOT_URL', 'CHATBOT_CALLER_KEY',
  'DATABASE_URL', 'DATABASE_MIGRATION_URL', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD',
];

const TEST_PASSWORD = 'Synthetic-Passw0rd!';

// Fixed ids so tests read clearly. 1xxx belongs to School A, 2xxx to School B.
const IDS = {
  schoolA: 1, schoolB: 2,
  users: {
    superadmin: 1,
    adminA: 10, mentorA: 11, mentorA2: 12, studentA: 13, studentA2: 14, accountantA: 15, storekeeperA: 16, pendingMentorA: 17,
    adminB: 20, mentorB: 21, studentB: 23,
  },
  classroomA: 100, classroomA2: 101, classroomB: 200,
  courseA: 1000, courseA2: 1001, courseB: 2000,
  weekA: 1100, weekB: 2100,
  chapterA: 1200, chapterB: 2200,
  materialA: 1300, materialB: 2300,
  assessmentA: 1400, assessmentB: 2400,
  questionA: 1500, questionB: 2500,
  resultA: 1600, resultB: 2600,
  attendanceA: 1700, attendanceB: 2700,
  feeStructureA: 1800, feeStructureB: 2800,
  paymentA: 1900, paymentB: 2900,
  announcementA: 1950, announcementB: 2950,
  calendarEventA: 1960, calendarEventB: 2960,
  certificateA: 1970, certificateB: 2970,
  liveClassA: 1980, liveClassB: 2980,
};

const ROLE_OF = {
  superadmin: 'superadmin',
  adminA: 'admin', adminB: 'admin',
  mentorA: 'mentor', mentorA2: 'mentor', mentorB: 'mentor', pendingMentorA: 'mentor',
  studentA: 'student', studentA2: 'student', studentB: 'student',
  accountantA: 'accountant', storekeeperA: 'storekeeper',
};
const SCHOOL_OF = (name) => (name === 'superadmin' ? null : name.endsWith('B') ? IDS.schoolB : IDS.schoolA);

async function prepareEnvironment() {
  const leaked = REAL_SERVICE_VARIABLES.filter((name) => process.env[name]);
  if (leaked.length) {
    throw new Error(`Refusing to run tests: real service configuration is present in the environment (${leaked.join(', ')}).`);
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-security-test-'));
  const database = await createTestDatabase();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    LMS_SKIP_DOTENV: 'true',
    DATABASE_URL: database.url,
    LMS_UPLOADS_DIR: path.join(directory, 'uploads'),
    LMS_DISABLE_BACKGROUND_JOBS: 'true',
    EMAIL_TRANSPORT: 'mock',
    RATE_LIMIT_MAX_REQUESTS: '1000000', // the per-account limits (login, reset) are what the tests exercise
    JWT_SECRET: `test-only-jwt-secret-${'a'.repeat(40)}`,
    JWT_REFRESH_SECRET: `test-only-refresh-secret-${'b'.repeat(40)}`,
  });
  return { directory, database };
}

async function startTestApp() {
  const { directory, database } = await prepareEnvironment();

  // Keep test output readable.
  const realLog = console.log;
  console.log = () => {};

  const { app, server } = require(path.join(SERVER_ROOT, 'server.js'));
  const db = require(path.join(SERVER_ROOT, 'config', 'database-switch'));
  const { signToken } = require(path.join(SERVER_ROOT, 'config', 'jwt'));
  const bcrypt = require(path.join(SERVER_ROOT, 'node_modules', 'bcryptjs'));

  const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
  const run = (sql, params = []) =>
    new Promise((resolve, reject) => db.run(sql, params, function (e) { return e ? reject(e) : resolve({ lastID: this.lastID, changes: this.changes }); }));

  // connects and checks that the throw-away database carries the current schema
  await db.connect();

  await seed({ run, bcrypt });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const tokenFor = (name, overrides = {}, options = {}) =>
    signToken(
      { userId: IDS.users[name], role: ROLE_OF[name], universityId: SCHOOL_OF(name), email: `${name}@test.invalid`.toLowerCase(), name, ...overrides },
      { expiresIn: '10m', ...options }
    );

  /**
   * api('GET', '/api/courses', { as: 'adminA' })      signed in as a fixture account
   * api('GET', '/api/courses', { token: '...' })      a hand-made token
   * api('GET', '/api/courses')                         no credentials at all
   */
  async function api(method, url, { as, token, body, form, headers = {} } = {}) {
    const requestHeaders = { ...headers };
    const bearer = token !== undefined ? token : as ? tokenFor(as) : null;
    if (bearer !== null) requestHeaders.Authorization = `Bearer ${bearer}`;
    if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
    const response = await fetch(base + url, {
      method,
      headers: requestHeaders,
      // `form` is a FormData (multipart upload); fetch sets its own content type for it
      body: form !== undefined ? form : body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: response.status, body: json, text, headers: response.headers };
  }

  async function stop() {
    console.log = realLog;
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => db.close(() => resolve()));
    await database.drop();
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* Windows may still hold a file */ }
  }

  return { app, base, api, tokenFor, db: { all, get, run }, ids: IDS, password: TEST_PASSWORD, databaseUrl: database.url, uploadsDir: process.env.LMS_UPLOADS_DIR, stop, log: realLog };
}

async function seed({ run, bcrypt }) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  const A = IDS.schoolA;
  const B = IDS.schoolB;
  const U = IDS.users;

  await run("INSERT INTO universities (id, name, area) VALUES (?, 'School A', 'North'), (?, 'School B', 'South')", [A, B]);

  for (const [name, id] of Object.entries(U)) {
    await run('INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      id, name, `${name}@test.invalid`.toLowerCase(), passwordHash, ROLE_OF[name], SCHOOL_OF(name), name === 'pendingMentorA' ? 0 : 1,
    ]);
  }

  await run('INSERT INTO classrooms (id, university_id, name, grade, section, classTeacherId) VALUES (?, ?, ?, ?, ?, ?)', [IDS.classroomA, A, 'Grade 5 - A', '5', 'A', U.mentorA]);
  await run('INSERT INTO classrooms (id, university_id, name, grade, section, classTeacherId) VALUES (?, ?, ?, ?, ?, ?)', [IDS.classroomA2, A, 'Grade 6 - A', '6', 'A', U.mentorA2]);
  await run('INSERT INTO classrooms (id, university_id, name, grade, section, classTeacherId) VALUES (?, ?, ?, ?, ?, ?)', [IDS.classroomB, B, 'Grade 5 - A', '5', 'A', U.mentorB]);

  for (const [studentId, classroomId] of [[U.studentA, IDS.classroomA], [U.studentA2, IDS.classroomA2], [U.studentB, IDS.classroomB]]) {
    await run('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [studentId, classroomId]);
  }

  const courses = [
    [IDS.courseA, 'Science A', U.mentorA, IDS.classroomA, A, U.studentA],
    [IDS.courseA2, 'History A', U.mentorA2, IDS.classroomA2, A, U.studentA2],
    [IDS.courseB, 'Science B', U.mentorB, IDS.classroomB, B, U.studentB],
  ];
  for (const [id, title, mentorId, classroomId, universityId, studentId] of courses) {
    await run('INSERT INTO courses (id, title, description, mentorId, classroomId, university_id) VALUES (?, ?, ?, ?, ?, ?)', [id, title, 'Synthetic course', mentorId, classroomId, universityId]);
    await run('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)', [id, studentId]);
  }

  const past = new Date(Date.now() - 3600 * 1000).toISOString();
  const future = new Date(Date.now() + 3600 * 1000).toISOString();
  const perSchool = [
    { week: IDS.weekA, chapter: IDS.chapterA, material: IDS.materialA, assessment: IDS.assessmentA, question: IDS.questionA, result: IDS.resultA, attendance: IDS.attendanceA, fee: IDS.feeStructureA, payment: IDS.paymentA, announcement: IDS.announcementA, event: IDS.calendarEventA, certificate: IDS.certificateA, liveClass: IDS.liveClassA, course: IDS.courseA, classroom: IDS.classroomA, mentor: U.mentorA, student: U.studentA, admin: U.adminA, school: A, tag: 'A' },
    { week: IDS.weekB, chapter: IDS.chapterB, material: IDS.materialB, assessment: IDS.assessmentB, question: IDS.questionB, result: IDS.resultB, attendance: IDS.attendanceB, fee: IDS.feeStructureB, payment: IDS.paymentB, announcement: IDS.announcementB, event: IDS.calendarEventB, certificate: IDS.certificateB, liveClass: IDS.liveClassB, course: IDS.courseB, classroom: IDS.classroomB, mentor: U.mentorB, student: U.studentB, admin: U.adminB, school: B, tag: 'B' },
  ];
  for (const s of perSchool) {
    await run('INSERT INTO weeks (id, courseId, weekNumber, title) VALUES (?, ?, 1, ?)', [s.week, s.course, `Week ${s.tag}`]);
    await run('INSERT INTO chapters (id, courseId, title, "order") VALUES (?, ?, ?, 1)', [s.chapter, s.course, `Chapter ${s.tag}`]);
    await run("INSERT INTO course_materials (id, courseId, title, type, linkUrl, uploadedBy, weekId) VALUES (?, ?, ?, 'pdf_link', 'https://example.invalid/doc', ?, ?)", [s.material, s.course, `Material ${s.tag}`, s.mentor, s.week]);
    await run('INSERT INTO assessments (id, courseId, weekId, title, startTime, endTime, timer, isPublished, createdBy) VALUES (?, ?, ?, ?, ?, ?, 30, 1, ?)', [s.assessment, s.course, s.week, `Quiz ${s.tag}`, past, future, s.mentor]);
    await run("INSERT INTO assessment_questions (id, assessmentId, questionNumber, questionText, questionType, options, correctAnswer, marks) VALUES (?, ?, 1, ?, 'multiple_choice', ?, ?, 1)", [s.question, s.assessment, `Question ${s.tag}`, JSON.stringify(['A', 'B', 'C']), `ANSWER-KEY-${s.tag}`]);
    await run("INSERT INTO results (id, classroomId, studentId, term, subjects, overallPercentage, overallStatus) VALUES (?, ?, ?, 'Term 1', ?, 80, 'PASS')", [s.result, s.classroom, s.student, JSON.stringify([{ name: `SUBJECT-${s.tag}`, marks: 80, total: 100, status: 'PASS' }])]);
    await run("INSERT INTO attendance (id, classroomId, studentId, date, status, markedBy) VALUES (?, ?, ?, '2026-01-15', 'present', ?)", [s.attendance, s.classroom, s.student, s.mentor]);
    await run("INSERT INTO feeStructures (id, university_id, category, grade, tuitionFee, totalFee, dueDate) VALUES (?, ?, ?, '5', 5000, 5000, '2026-12-31')", [s.fee, s.school, `Category ${s.tag}`]);
    await run("INSERT INTO payments (id, studentId, amount, type, status, transactionId, razorpay_payment_id, razorpay_order_id, razorpay_signature, description) VALUES (?, ?, 5000, 'online', 'success', ?, ?, ?, ?, ?)", [s.payment, s.student, `TXN-${s.tag}`, `pay_${s.tag}`, `order_${s.tag}`, `GATEWAY-SIGNATURE-${s.tag}`, `PAYMENT-${s.tag}`]);
    await run("INSERT INTO announcements (id, university_id, title, content, createdByUser, createdByRole, publishFor) VALUES (?, ?, ?, ?, ?, 'admin', 'all')", [s.announcement, s.school, `ANNOUNCEMENT-${s.tag}`, `Notice for school ${s.tag}`, s.admin]);
    await run("INSERT INTO calendar_events (id, title, startDate, endDate, publishFor, createdByUser, createdByRole, university_id) VALUES (?, ?, ?, ?, 'all', ?, 'admin', ?)", [s.event, `EVENT-${s.tag}`, past, future, s.admin, s.school]);
    await run('INSERT INTO certificates (id, studentId, courseId, certificateUrl) VALUES (?, ?, ?, ?)', [s.certificate, s.student, s.course, `/certificates/${s.tag}.pdf`]);
    await run("INSERT INTO live_classes (id, courseId, instructorId, title, scheduledStartTime, scheduledEndTime, meetingLink, status) VALUES (?, ?, ?, ?, ?, ?, 'https://example.invalid/meet', 'scheduled')", [s.liveClass, s.course, s.mentor, `LIVE-${s.tag}`, future, future]);
  }
}

module.exports = { startTestApp, IDS, TEST_PASSWORD, REAL_SERVICE_VARIABLES };
