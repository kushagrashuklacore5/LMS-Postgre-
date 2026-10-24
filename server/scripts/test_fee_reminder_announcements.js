/**
 * Automated Test Suite for Fee Reminders & Student Announcements Flow
 */

const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, user, signToken, request } = require('./phase2c_test_fixture');

const JWT_SECRET = 'test-fee-reminder-secret';
process.env.JWT_SECRET = JWT_SECRET;

const createTestToken = (payload) => signToken(JWT_SECRET, payload);
const makeRequest = (server, method, path, token, body = {}) => request(server, method, path, { token, body });

async function seed(db) {
  // Users
  await insert(db, 'users', user(1, 'accountant', 1, 'Accountant Univ 1'));
  await insert(db, 'users', user(2, 'accountant', 2, 'Accountant Univ 2'));
  await insert(db, 'users', user(10, 'student', 1, 'Student Rahul'));
  await insert(db, 'users', user(11, 'student', 1, 'Student Priya'));
  await insert(db, 'users', user(20, 'student', 2, 'Student Univ 2'));

  // Classrooms
  await insert(db, 'classrooms', {
    id: 1,
    university_id: 1,
    name: 'Computer Science - Section A',
    grade: '10',
    section: 'A'
  });

  // Classroom assignments
  await insert(db, 'student_classroom_assignment', {
    id: 1,
    studentId: 10,
    classroomId: 1
  });
  await insert(db, 'student_classroom_assignment', {
    id: 2,
    studentId: 11,
    classroomId: 1
  });

  // Payments (Student 10 paid 15000, Student 11 paid 5000)
  await insert(db, 'payments', {
    id: 1001,
    studentId: 10,
    amount: 15000,
    type: 'online',
    status: 'success'
  });
  await insert(db, 'payments', {
    id: 1002,
    studentId: 11,
    amount: 5000,
    type: 'online',
    status: 'success'
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST: Fee Reminders & Student Announcements Pipeline');
  console.log('================================================================\n');

  const fixture = await createIsolatedDb('fee-reminder-test');
  const testDb = fixture.db;
  let server;

  try {
    await seed(testDb);

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.tenant = { database: testDb };
      next();
    });
    app.use('/api/classrooms', require('../routes/classroomRoutes'));
    app.use('/api/announcements', require('../routes/announcementRoutes'));

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    const tokenAccU1 = createTestToken({ userId: 1, role: 'accountant', universityId: 1 });
    const tokenStudentU1 = createTestToken({ userId: 11, role: 'student', universityId: 1 });
    const tokenStudentU2 = createTestToken({ userId: 20, role: 'student', universityId: 2 });

    // Test 1: GET /api/classrooms/teacher/students-fees returns students with fee calculations
    console.log('--- Test 1: Fetch students fees with real calculations ---');
    const resList = await makeRequest(server, 'GET', '/api/classrooms/teacher/students-fees', tokenAccU1);
    assert.strictEqual(resList.statusCode, 200, `Expected 200, got ${resList.statusCode}`);
    assert.strictEqual(resList.body.success, true);
    assert.ok(Array.isArray(resList.body.students), 'Should return students array');
    
    const rahul = resList.body.students.find(s => s.id === 10);
    const priya = resList.body.students.find(s => s.id === 11);
    assert.ok(rahul, 'Rahul should be present');
    assert.ok(priya, 'Priya should be present');
    assert.strictEqual(rahul.status, 'Paid', 'Rahul should have status Paid');
    assert.strictEqual(rahul.remainingBalance, 0);
    assert.strictEqual(priya.status, 'Partial', 'Priya should have status Partial');
    assert.strictEqual(priya.remainingBalance, 10000);
    console.log('✅ PASS: Students fee status correctly calculated without SQL error\n');

    // Test 2: POST /api/classrooms/send-fee-reminder inserts announcement
    console.log('--- Test 2: Send fee reminder creates announcement in DB ---');
    const reminderPayload = {
      studentId: 11,
      studentEmail: 'priya.v@university.edu',
      studentName: 'Priya Verma',
      classroomName: 'Computer Science - Section A',
      amount: 10000,
      dueDate: '2026-10-31',
      message: 'Please clear your academic dues'
    };

    const resReminder = await makeRequest(server, 'POST', '/api/classrooms/send-fee-reminder', tokenAccU1, reminderPayload);
    assert.strictEqual(resReminder.statusCode, 200, `Expected 200, got ${resReminder.statusCode}`);
    assert.strictEqual(resReminder.body.success, true);

    // Verify row in announcements table
    const row = await new Promise((resolve) => {
      testDb.get('SELECT * FROM announcements WHERE university_id = 1 ORDER BY id DESC LIMIT 1', (err, r) => resolve(r));
    });
    assert.ok(row, 'Announcement row must exist in DB');
    assert.strictEqual(row.publishFor, 'students');
    assert.strictEqual(row.university_id, 1);
    assert.ok(row.content.includes('10,000'), 'Announcement content must include fee amount');
    console.log('✅ PASS: Announcement row successfully created in database\n');

    // Test 3: Student U1 sees announcement in /api/announcements
    console.log('--- Test 3: Student U1 receives fee announcement ---');
    const resAnnouncementsU1 = await makeRequest(server, 'GET', '/api/announcements', tokenStudentU1);
    assert.strictEqual(resAnnouncementsU1.statusCode, 200);
    const listU1 = Array.isArray(resAnnouncementsU1.body) ? resAnnouncementsU1.body : resAnnouncementsU1.body?.data || [];
    const feeAlert = listU1.find(a => a.content && a.content.includes('10,000'));
    assert.ok(feeAlert, 'Student U1 must see the fee payment reminder announcement');
    console.log('✅ PASS: Student portal successfully receives the fee reminder alert\n');

    // Test 4: Student U2 (different university) does NOT see U1 fee announcement
    console.log('--- Test 4: Student U2 does NOT see U1 fee announcement ---');
    const resAnnouncementsU2 = await makeRequest(server, 'GET', '/api/announcements', tokenStudentU2);
    assert.strictEqual(resAnnouncementsU2.statusCode, 200);
    const listU2 = Array.isArray(resAnnouncementsU2.body) ? resAnnouncementsU2.body : resAnnouncementsU2.body?.data || [];
    const leakAlert = listU2.find(a => a.content && a.content.includes('10,000'));
    assert.strictEqual(leakAlert, undefined, 'Student U2 must NOT see U1 fee reminder');
    console.log('✅ PASS: Cross-tenant isolation verified\n');

    console.log('🎉 ALL 4 FEE REMINDER & STUDENT ANNOUNCEMENT TESTS PASSED!');
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await fixture.cleanup();
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
