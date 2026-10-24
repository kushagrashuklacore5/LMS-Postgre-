/**
 * Test suite for Student Classroom & Timetable endpoint (GET /api/classrooms/student-classrooms)
 *
 * Covers all required test cases:
 * 1. A valid student with a classroom assignment.
 * 2. A student without assignments.
 * 3. Missing authenticated user ID.
 * 4. Correct teacher-name resolution (both legacy classTeacher string and classTeacherId, no duplicates).
 * 5. Cross-university classroom isolation.
 * 6. Legacy req.user.id fallback support.
 * 7. Response shape verification matching Timetable, Student Dashboard, and PayFees.
 */

const express = require('express');
const assert = require('assert');
const { createIsolatedDb, insert, user, signToken, request } = require('./phase2c_test_fixture');
const { getStudentClassrooms } = require('../controllers/classroomController');

const JWT_SECRET = 'test-student-classrooms-secret';
process.env.JWT_SECRET = JWT_SECRET;

const say = console.log.bind(console);

async function seed(db) {
  // Teachers
  await insert(db, 'users', user(1, 'teacher', 1, 'Prof. Sharma'));
  await insert(db, 'users', user(2, 'teacher', 2, 'Dr. Smith'));

  // Students
  await insert(db, 'users', user(10, 'student', 1, 'Student Priya'));
  await insert(db, 'users', user(11, 'student', 1, 'Student Unassigned'));
  await insert(db, 'users', user(20, 'student', 2, 'Student Univ 2'));

  // Classrooms
  // Classroom 101: Univ 1, teacher in legacy 'classTeacher' column
  await insert(db, 'classrooms', {
    id: 101,
    university_id: 1,
    name: 'Grade 10-A',
    grade: '10',
    section: 'A',
    classTeacher: '1',
    classTeacherId: null,
    studentCount: 1,
    timetable: '/uploads/timetables/g10a.pdf'
  });

  // Classroom 102: Univ 1, teacher in 'classTeacherId' column
  await insert(db, 'classrooms', {
    id: 102,
    university_id: 1,
    name: 'Grade 10-B',
    grade: '10',
    section: 'B',
    classTeacher: null,
    classTeacherId: 1,
    studentCount: 1,
    timetable: null
  });

  // Classroom 103: Univ 1, teacher in BOTH classTeacher and classTeacherId (must not duplicate rows)
  await insert(db, 'classrooms', {
    id: 103,
    university_id: 1,
    name: 'Grade 10-C',
    grade: '10',
    section: 'C',
    classTeacher: '1',
    classTeacherId: 1,
    studentCount: 1,
    timetable: null
  });

  // Classroom 201: Univ 2, teacher Dr. Smith
  await insert(db, 'classrooms', {
    id: 201,
    university_id: 2,
    name: 'Grade 12-B',
    grade: '12',
    section: 'B',
    classTeacher: null,
    classTeacherId: 2,
    studentCount: 1,
    timetable: null
  });

  // Assignments
  // Student 10 (Univ 1) -> Classroom 101 (Univ 1, Valid legacy classTeacher format)
  await insert(db, 'student_classroom_assignment', { id: 1, studentId: 10, classroomId: 101 });
  // Student 10 (Univ 1) -> Classroom 102 (Univ 1, Valid classTeacherId format)
  await insert(db, 'student_classroom_assignment', { id: 2, studentId: 10, classroomId: 102 });
  // Student 10 (Univ 1) -> Classroom 103 (Univ 1, Dual columns populated)
  await insert(db, 'student_classroom_assignment', { id: 3, studentId: 10, classroomId: 103 });
  // Student 10 (Univ 1) -> Classroom 201 (Univ 2, Malformed cross-tenant assignment)
  await insert(db, 'student_classroom_assignment', { id: 4, studentId: 10, classroomId: 201 });
}

async function runTests() {
  say('================================================================');
  say('🧪 STUDENT CLASSROOMS & TIMETABLE ENDPOINT TEST SUITE');
  say('================================================================');

  const fixture = await createIsolatedDb('student-classrooms');
  const db = fixture.db;
  let server;

  try {
    await seed(db);

    const app = express();
    app.use(express.json());
    // Attach isolated test db to req.tenant
    app.use((req, res, next) => {
      req.tenant = { database: db };
      next();
    });
    // Legacy route simulator for req.user.id fallback
    app.get('/api/test-legacy-fallback', (req, res) => {
      req.user = { id: 10, role: 'student' };
      getStudentClassrooms(req, res);
    });
    app.use('/api/classrooms', require('../routes/classroomRoutes'));

    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));

    const tokenFor = (userId, role = 'student') => signToken(JWT_SECRET, { userId, role });

    // Test 1: Valid student with classroom assignment
    say('\n--- TEST 1: Valid student with classroom assignment ---');
    const res1 = await request(server, 'GET', '/api/classrooms/student-classrooms', { token: tokenFor(10) });
    assert.strictEqual(res1.statusCode, 200, `Expected 200 OK, got ${res1.statusCode}`);
    assert(Array.isArray(res1.body), 'Expected array response');
    const classIds = res1.body.map(c => c.id);
    assert(classIds.includes(101), 'Expected Classroom 101 in response');
    assert(classIds.includes(102), 'Expected Classroom 102 in response');
    assert(classIds.includes(103), 'Expected Classroom 103 in response');
    // Verify no duplicates
    const count103 = classIds.filter(id => id === 103).length;
    assert.strictEqual(count103, 1, 'Classroom 103 with both teacher columns must not duplicate rows');
    say('✅ PASS: Valid student receives assigned classrooms without duplicates');

    // Test 2: Student without assignments
    say('\n--- TEST 2: Student without assignments ---');
    const res2 = await request(server, 'GET', '/api/classrooms/student-classrooms', { token: tokenFor(11) });
    assert.strictEqual(res2.statusCode, 200, `Expected 200 OK, got ${res2.statusCode}`);
    assert(Array.isArray(res2.body), 'Expected array response');
    assert.strictEqual(res2.body.length, 0, 'Expected empty array for unassigned student');
    say('✅ PASS: Unassigned student receives empty array []');

    // Test 3: Missing authenticated user ID
    say('\n--- TEST 3: Missing authenticated user ID ---');
    // Without token (guest user created by authMiddleware with userId: null)
    const res3NoToken = await request(server, 'GET', '/api/classrooms/student-classrooms');
    assert.strictEqual(res3NoToken.statusCode, 401, `Expected 401 Unauthorized without token, got ${res3NoToken.statusCode}`);

    // Token missing userId field
    const tokenNoUserId = signToken(JWT_SECRET, { role: 'student' });
    const res3NoUserId = await request(server, 'GET', '/api/classrooms/student-classrooms', { token: tokenNoUserId });
    assert.strictEqual(res3NoUserId.statusCode, 401, `Expected 401 Unauthorized with token missing userId, got ${res3NoUserId.statusCode}`);
    say('✅ PASS: Missing authenticated user ID correctly rejected with HTTP 401');

    // Test 4: Correct teacher-name resolution from both column formats
    say('\n--- TEST 4: Teacher-name resolution ---');
    const class101 = res1.body.find(c => c.id === 101);
    const class102 = res1.body.find(c => c.id === 102);
    const class103 = res1.body.find(c => c.id === 103);
    assert(class101, 'Classroom 101 not found');
    assert(class102, 'Classroom 102 not found');
    assert(class103, 'Classroom 103 not found');
    assert.strictEqual(class101.classTeacher?.name, 'Prof. Sharma', `Expected "Prof. Sharma", got "${class101.classTeacher?.name}"`);
    assert.strictEqual(class102.classTeacher?.name, 'Prof. Sharma', `Expected "Prof. Sharma", got "${class102.classTeacher?.name}"`);
    assert.strictEqual(class103.classTeacher?.name, 'Prof. Sharma', `Expected "Prof. Sharma", got "${class103.classTeacher?.name}"`);
    say('✅ PASS: Teacher name resolved correctly from legacy classTeacher, classTeacherId, and dual columns');

    // Test 5: Cross-university classroom isolation
    say('\n--- TEST 5: Cross-university classroom isolation ---');
    // Student 10 belongs to Univ 1, but has assignment to Classroom 201 (Univ 2)
    assert(!classIds.includes(201), 'Cross-tenant Classroom 201 should NOT be returned to Univ 1 student');
    say('✅ PASS: Cross-university classroom assignment excluded from response');

    // Test 6: Legacy req.user.id fallback support
    say('\n--- TEST 6: Legacy req.user.id fallback support ---');
    const resLegacy = await request(server, 'GET', '/api/test-legacy-fallback');
    assert.strictEqual(resLegacy.statusCode, 200, `Expected 200 OK for legacy req.user.id fallback, got ${resLegacy.statusCode}`);
    assert(Array.isArray(resLegacy.body), 'Expected array response');
    const legacyClassIds = resLegacy.body.map(c => c.id);
    assert(legacyClassIds.includes(101), 'Expected Classroom 101 via legacy req.user.id');
    say('✅ PASS: Legacy req.user.id fallback functions correctly');

    // Test 7: Response shape verification for frontend consumers (Timetable, Dashboard, PayFees)
    say('\n--- TEST 7: Response shape matches frontend contract ---');
    assert.strictEqual(class101._id, 101, 'Expected _id alias for compatibility');
    assert.strictEqual(class101.feeCategory, 'Secondary', 'Expected feeCategory calculation (grade 10 is Secondary)');
    assert.strictEqual(typeof class101.classTeacher, 'object', 'Expected classTeacher object');
    assert.strictEqual(typeof class101.timetable, 'string', 'Expected timetable property');
    assert.strictEqual(class101.timetable, '/uploads/timetables/g10a.pdf', 'Expected timetable path string');
    say('✅ PASS: Response shape satisfies Timetable, Student Dashboard, and PayFees requirements');

    say('\n🎉 ALL 7 STUDENT CLASSROOM TESTS PASSED!\n');
  } finally {
    if (server) server.close();
    await fixture.cleanup();
  }
}

runTests().catch(err => {
  say('❌ TEST FAILED:', err);
  process.exit(1);
});
