/**
 * Load test against a throw-away copy of the LMS.
 *
 * Starts the real server on a new database in the system temp folder, fills it with
 * synthetic schools, and sends read traffic at increasing concurrency. Nothing here can
 * reach a real database, mail server or payment gateway (same safeguards as the tests).
 *
 *   node scripts/ops/load-test.js                 # default: 2,000 students per school, 10 s per step
 *   node scripts/ops/load-test.js --students 5000 --seconds 20 --steps 10,50,100,200
 *
 * It prints, per concurrency step: requests per second, p50 / p95 / p99 latency, errors.
 * The numbers describe THIS machine and THIS workload (reads by signed-in students and an
 * admin); they are not a promise about production hardware or about write-heavy traffic.
 */
const path = require('path');
const fs = require('fs');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const { startServer, temporaryDatabase } = require(path.join(SERVER_ROOT, 'tests', 'helpers', 'serverProcess'));
const Database = require('better-sqlite3');

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const STUDENTS = parseInt(arg('students', '2000'), 10);
const SECONDS = parseInt(arg('seconds', '10'), 10);
const STEPS = arg('steps', '10,50,100,200').split(',').map(Number);
const SCHOOLS = 2;
const CLASSES = 40;
const COURSES = 100;
const SECRET = `load-test-secret-${'z'.repeat(40)}`;

function seed(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    const user = db.prepare("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, 'x', ?, ?, 1)");
    for (let s = 1; s <= SCHOOLS; s++) {
      const base = s * 100000;
      db.prepare('INSERT INTO universities (id, name, area) VALUES (?, ?, ?)').run(s, `Load School ${s}`, 'Area');
      user.run(base + 1, 'Admin', `admin${s}@load.invalid`, 'admin', s);
      for (let t = 0; t < CLASSES; t++) user.run(base + 50000 + t, `Teacher ${t}`, `t${s}_${t}@load.invalid`, 'mentor', s);
      for (let c = 0; c < CLASSES; c++) db.prepare('INSERT INTO classrooms (id, university_id, name, grade, section, classTeacherId) VALUES (?, ?, ?, ?, ?, ?)').run(base + c, s, `Class ${c}`, String(c % 12), 'A', base + 50000 + c);
      for (let c = 0; c < COURSES; c++) db.prepare('INSERT INTO courses (id, title, mentorId, classroomId, university_id) VALUES (?, ?, ?, ?, ?)').run(base + c, `Course ${c}`, base + 50000 + (c % CLASSES), base + (c % CLASSES), s);
      db.prepare("INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, publishFor) VALUES (?, 'Notice', 'Text', ?, 'admin', 'all')").run(s, base + 1);
      for (let i = 0; i < STUDENTS; i++) {
        const id = base + 1000 + i;
        const classId = base + (i % CLASSES);
        user.run(id, `Student ${i}`, `s${s}_${i}@load.invalid`, 'student', s);
        db.prepare('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)').run(id, classId);
        db.prepare('INSERT INTO course_students (courseId, studentId) VALUES (?, ?)').run(base + (i % COURSES), id);
        for (let d = 1; d <= 5; d++) db.prepare("INSERT INTO attendance (classroomId, studentId, date, status, markedBy) VALUES (?, ?, ?, 'present', ?)").run(classId, id, `2026-03-0${d}`, base + 50000);
        db.prepare("INSERT INTO results (classroomId, studentId, term, subjects, overallPercentage, overallStatus) VALUES (?, ?, 'Term 1', '[]', 70, 'PASS')").run(classId, id);
      }
    }
  })();
  db.close();
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

async function runStep(base, concurrency, pickRequest) {
  const latencies = [];
  const statuses = {};
  let failures = 0;
  const until = Date.now() + SECONDS * 1000;
  const worker = async () => {
    while (Date.now() < until) {
      const { url, token } = pickRequest();
      const started = process.hrtime.bigint();
      try {
        const response = await fetch(base + url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
        await response.arrayBuffer();
        statuses[response.status] = (statuses[response.status] || 0) + 1;
        if (response.status >= 500) failures++;
      } catch (err) {
        failures++;
      }
      latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  latencies.sort((a, b) => a - b);
  return {
    concurrency,
    requests: latencies.length,
    perSecond: Math.round(latencies.length / SECONDS),
    p50: percentile(latencies, 50).toFixed(1),
    p95: percentile(latencies, 95).toFixed(1),
    p99: percentile(latencies, 99).toFixed(1),
    max: (latencies[latencies.length - 1] || 0).toFixed(1),
    failures,
    statuses: JSON.stringify(statuses),
  };
}

(async () => {
  const { dbPath, directory } = temporaryDatabase();
  const env = { JWT_SECRET: SECRET, RATE_LIMIT_MAX_REQUESTS: '100000000', LMS_ACCESS_LOG: 'off' };
  let server = await startServer(dbPath, env, { settleMs: 6000 });
  if (!server.listening) throw new Error('server did not start: ' + server.output.slice(-300));
  await server.stop();
  seed(dbPath);
  server = await startServer(dbPath, env, { settleMs: 3000 });
  const base = `http://127.0.0.1:${server.port}`;

  process.env.JWT_SECRET = SECRET;
  const { signToken } = require(path.join(SERVER_ROOT, 'config', 'jwt'));
  const studentTokens = Array.from({ length: 200 }, (_, i) => {
    const school = (i % SCHOOLS) + 1;
    return signToken({ userId: school * 100000 + 1000 + ((i * 7) % STUDENTS), role: 'student', universityId: school });
  });
  const adminToken = signToken({ userId: 100001, role: 'admin', universityId: 1 });

  const studentPages = ['/api/courses/student', '/api/attendance/student', '/api/results/my-results', '/api/announcements', '/api/classrooms/student-classrooms'];
  let counter = 0;
  const studentMix = () => {
    counter++;
    return { url: studentPages[counter % studentPages.length], token: studentTokens[counter % studentTokens.length] };
  };

  console.log(`Dataset: ${SCHOOLS} schools x ${STUDENTS} students, ${CLASSES} classes and ${COURSES} courses each. ${SECONDS}s per step. Node ${process.version}.`);
  console.log('\nStudent pages (courses, attendance, results, announcements, classroom):');
  console.log('concurrency  req/s   p50 ms   p95 ms   p99 ms   max ms  failures  statuses');
  for (const concurrency of STEPS) {
    const r = await runStep(base, concurrency, studentMix);
    console.log(`${String(r.concurrency).padStart(11)} ${String(r.perSecond).padStart(6)} ${r.p50.padStart(8)} ${r.p95.padStart(8)} ${r.p99.padStart(8)} ${r.max.padStart(8)} ${String(r.failures).padStart(9)}  ${r.statuses}`);
  }
  console.log(`\nAdmin: full user list of one school (${STUDENTS + CLASSES + 1} rows, no paging):`);
  for (const concurrency of [1, 10]) {
    const r = await runStep(base, concurrency, () => ({ url: '/api/admin/users', token: adminToken }));
    console.log(`${String(r.concurrency).padStart(11)} ${String(r.perSecond).padStart(6)} ${r.p50.padStart(8)} ${r.p95.padStart(8)} ${r.p99.padStart(8)} ${r.max.padStart(8)} ${String(r.failures).padStart(9)}  ${r.statuses}`);
  }
  const ready = await fetch(`${base}/health/ready`);
  console.log(`\nServer still ready after the run: ${ready.status === 200}`);
  await server.stop();
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* best effort on Windows */ }
})().catch((err) => { console.error('LOAD TEST FAILED:', err.message); process.exit(1); });
