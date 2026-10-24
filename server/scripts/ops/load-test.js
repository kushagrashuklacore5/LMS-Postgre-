/**
 * Load test against a throw-away copy of the LMS (PostgreSQL).
 *
 * Creates a fresh lms_test_* database (LMS_TEST_DATABASE_ADMIN_URL, never the school database), fills it with
 * synthetic schools using set-based SQL, starts the real server on it, and measures each workload at
 * increasing concurrency. Nothing here can reach a real database, mail server or payment gateway.
 *
 *   LMS_TEST_DATABASE_ADMIN_URL=postgres://... node scripts/ops/load-test.js
 *   ... --schools 4 --students 5000 --seconds 15 --steps 10,50,100,200
 *
 * Per step it prints requests/second, p50 / p95 / p99 / max latency, failures and HTTP statuses, plus the
 * server's CPU (cores used) and memory and the number of PostgreSQL connections, sampled during the step.
 * The numbers describe THIS machine, THIS dataset and THIS request mix; they are not a promise about
 * production hardware, other workloads or a number of users.
 */
const path = require('path');
const { execSync } = require('child_process');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const { startServer } = require(path.join(SERVER_ROOT, 'tests', 'helpers', 'serverProcess'));
const { createTestDatabase } = require(path.join(SERVER_ROOT, 'tests', 'helpers', 'pgTestDatabase'));
const bcrypt = require(path.join(SERVER_ROOT, 'node_modules', 'bcryptjs'));

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const SCHOOLS = parseInt(arg('schools', '4'), 10);
const STUDENTS = parseInt(arg('students', '5000'), 10); // per school
const SECONDS = parseInt(arg('seconds', '15'), 10);
const STEPS = arg('steps', '10,50,100,200').split(',').map(Number);
const CLASSES = 50;
const COURSES = 100;
const DAYS = 20; // attendance days per student
const SECRET = `load-test-secret-${'z'.repeat(40)}`;
const PASSWORD = 'Load-Test-Passw0rd!';

async function seed(query) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  // ids: school s owns s*1000000 .. s*1000000+999999 (admin +1, teachers +50000.., classes +0.., courses +0.., students +100000..)
  await query(`INSERT INTO universities (id, name, area) SELECT s, 'Load School ' || s, 'Area' FROM generate_series(1, $1) s`, [SCHOOLS]);
  await query(`INSERT INTO users (id, name, email, password, role, university_id, isApproved)
    SELECT s * 1000000 + 1, 'Admin ' || s, 'admin' || s || '@load.invalid', $2, 'admin', s, 1 FROM generate_series(1, $1) s`, [SCHOOLS, hash]);
  await query(`INSERT INTO users (id, name, email, password, role, university_id, isApproved)
    SELECT s * 1000000 + 50000 + t, 'Teacher ' || t, 't' || s || '_' || t || '@load.invalid', $3, 'mentor', s, 1
    FROM generate_series(1, $1) s, generate_series(0, $2 - 1) t`, [SCHOOLS, CLASSES, hash]);
  await query(`INSERT INTO classrooms (id, university_id, name, grade, section, classTeacherId)
    SELECT s * 1000000 + c, s, 'Class ' || c, (c % 12)::text, 'A' || (c / 12), s * 1000000 + 50000 + c
    FROM generate_series(1, $1) s, generate_series(0, $2 - 1) c`, [SCHOOLS, CLASSES]);
  await query(`INSERT INTO courses (id, title, mentorId, classroomId, university_id)
    SELECT s * 1000000 + c, 'Course ' || c, s * 1000000 + 50000 + (c % $3), s * 1000000 + (c % $3), s
    FROM generate_series(1, $1) s, generate_series(0, $2 - 1) c`, [SCHOOLS, COURSES, CLASSES]);
  await query(`INSERT INTO users (id, name, email, password, role, university_id, isApproved)
    SELECT s * 1000000 + 100000 + i, 'Student ' || i, 's' || s || '_' || i || '@load.invalid', $3, 'student', s, 1
    FROM generate_series(1, $1) s, generate_series(0, $2 - 1) i`, [SCHOOLS, STUDENTS, hash]);
  await query(`INSERT INTO student_classroom_assignment (studentId, classroomId)
    SELECT s * 1000000 + 100000 + i, s * 1000000 + (i % $3) FROM generate_series(1, $1) s, generate_series(0, $2 - 1) i`, [SCHOOLS, STUDENTS, CLASSES]);
  await query(`INSERT INTO course_students (courseId, studentId)
    SELECT s * 1000000 + (i % $3), s * 1000000 + 100000 + i FROM generate_series(1, $1) s, generate_series(0, $2 - 1) i`, [SCHOOLS, STUDENTS, COURSES]);
  await query(`INSERT INTO attendance (classroomId, studentId, date, status, markedBy)
    SELECT s * 1000000 + (i % $3), s * 1000000 + 100000 + i, to_char(DATE '2026-03-01' + d, 'YYYY-MM-DD'), CASE WHEN (i + d) % 9 = 0 THEN 'absent' ELSE 'present' END, s * 1000000 + 50000
    FROM generate_series(1, $1) s, generate_series(0, $2 - 1) i, generate_series(0, $4 - 1) d`, [SCHOOLS, STUDENTS, CLASSES, DAYS]);
  await query(`INSERT INTO results (classroomId, studentId, term, subjects, overallPercentage, overallStatus)
    SELECT s * 1000000 + (i % $3), s * 1000000 + 100000 + i, 'Term 1', '[]', 70, 'PASS' FROM generate_series(1, $1) s, generate_series(0, $2 - 1) i`, [SCHOOLS, STUDENTS, CLASSES]);
  await query(`INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, publishFor, readBy)
    SELECT s, 'Notice ' || n, 'Text of notice ' || n, s * 1000000 + 1, 'admin', 'both', '[]' FROM generate_series(1, $1) s, generate_series(1, 200) n`, [SCHOOLS]);
  for (const table of ['users', 'classrooms', 'courses', 'universities', 'announcements', 'attendance', 'results', 'student_classroom_assignment', 'course_students']) {
    await query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT MAX(id) FROM ${table}))`);
  }
  await query('ANALYZE');
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

/** CPU seconds and working set (MB) of the process listening on `port` (Windows or Unix). */
function sampleProcess(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`powershell -NoProfile -Command "$p = Get-Process -Id (Get-NetTCPConnection -State Listen -LocalPort ${port}).OwningProcess; '' + $p.CPU + ' ' + $p.WorkingSet64"`, { encoding: 'utf8' }).trim().split(' ');
      return { cpu: Number(out[0]), mb: Number(out[1]) / 1048576 };
    }
    const pid = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim().split('\n')[0];
    const [cpuTime, rss] = execSync(`ps -o cputime=,rss= -p ${pid}`, { encoding: 'utf8' }).trim().split(/\s+/);
    const [h, m, s] = cpuTime.split(':').map(Number);
    return { cpu: h * 3600 + m * 60 + s, mb: Number(rss) / 1024 };
  } catch {
    return { cpu: NaN, mb: NaN };
  }
}

async function runStep({ base, port, query, concurrency, pick, seconds = SECONDS }) {
  const latencies = [];
  const statuses = {};
  let failures = 0;
  let peakConnections = 0;
  const before = sampleProcess(port);
  const startedAt = Date.now();
  const until = startedAt + seconds * 1000;
  const sampler = setInterval(async () => {
    try {
      const [row] = await query("SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'lms-server'");
      peakConnections = Math.max(peakConnections, row.n);
    } catch { /* sampling only */ }
  }, 1000);
  const worker = async () => {
    while (Date.now() < until) {
      const { url, token, method = 'GET', body } = pick();
      const started = process.hrtime.bigint();
      try {
        const response = await fetch(base + url, {
          method,
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30000),
        });
        await response.arrayBuffer();
        statuses[response.status] = (statuses[response.status] || 0) + 1;
        if (response.status >= 500) failures++;
      } catch {
        failures++;
        statuses.error = (statuses.error || 0) + 1;
      }
      latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  clearInterval(sampler);
  const elapsed = (Date.now() - startedAt) / 1000;
  const after = sampleProcess(port);
  latencies.sort((a, b) => a - b);
  return {
    concurrency,
    perSecond: Math.round(latencies.length / elapsed),
    p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), max: latencies[latencies.length - 1] || 0,
    failures, statuses,
    cores: (after.cpu - before.cpu) / elapsed, mb: after.mb, connections: peakConnections,
  };
}

const header = () => console.log('  conc   req/s    p50ms    p95ms    p99ms    maxms  fail  cores  rssMB  pgConn  statuses');
const line = (r) => console.log(`${String(r.concurrency).padStart(6)} ${String(r.perSecond).padStart(7)} ${r.p50.toFixed(1).padStart(8)} ${r.p95.toFixed(1).padStart(8)} ${r.p99.toFixed(1).padStart(8)} ${r.max.toFixed(0).padStart(8)} ${String(r.failures).padStart(5)} ${r.cores.toFixed(2).padStart(6)} ${r.mb.toFixed(0).padStart(6)} ${String(r.connections).padStart(7)}  ${JSON.stringify(r.statuses)}`);

(async () => {
  const database = await createTestDatabase();
  let server;
  try {
    const seedStart = Date.now();
    await seed(database.query);
    const [counts] = await database.query(`SELECT (SELECT COUNT(*) FROM users)::int users, (SELECT COUNT(*) FROM attendance)::int attendance, (SELECT COUNT(*) FROM announcements)::int announcements`);
    server = await startServer(database.url, { JWT_SECRET: SECRET, RATE_LIMIT_MAX_REQUESTS: '100000000', LMS_ACCESS_LOG: 'off' }, { settleMs: 2000 });
    if (!server.listening) throw new Error(`server did not start (exit ${server.exitCode}): ` + server.output.slice(-1500));
    const base = `http://127.0.0.1:${server.port}`;
    const ctx = { base, port: server.port, query: database.query };

    process.env.JWT_SECRET = SECRET;
    const { signToken } = require(path.join(SERVER_ROOT, 'config', 'jwt'));
    const studentId = (i) => { const s = (i % SCHOOLS) + 1; return { id: s * 1000000 + 100000 + ((i * 7919) % STUDENTS), s }; };
    const studentTokens = Array.from({ length: 500 }, (_, i) => { const { id, s } = studentId(i); return signToken({ userId: id, role: 'student', universityId: s }); });
    const teacherTokens = Array.from({ length: CLASSES }, (_, c) => signToken({ userId: 1000000 + 50000 + c, role: 'mentor', universityId: 1 }));
    const adminToken = signToken({ userId: 1000001, role: 'admin', universityId: 1 });

    console.log(`Dataset: ${SCHOOLS} schools x ${STUDENTS} students (${counts.users} users, ${counts.attendance} attendance rows, ${counts.announcements} announcements), seeded in ${((Date.now() - seedStart) / 1000).toFixed(1)}s.`);
    console.log(`Machine: ${require('os').cpus().length} logical CPUs, ${(require('os').totalmem() / 1073741824).toFixed(1)} GB RAM; Node ${process.version}; PG pool max ${process.env.PG_POOL_MAX || 10}; ${SECONDS}s per step.\n`);

    const pages = ['/api/courses/student', '/api/attendance/student', '/api/results/my-results', '/api/announcements', '/api/classrooms/student-classrooms'];
    let n = 0;
    console.log('1. Student pages (courses, attendance, results, announcements, classroom), round robin:'); header();
    for (const c of STEPS) line(await runStep({ ...ctx, concurrency: c, pick: () => { n++; return { url: pages[n % pages.length], token: studentTokens[n % studentTokens.length] }; } }));

    console.log('\n2. Notification bell poll only (GET /api/announcements; every open tab polls every 10 s):'); header();
    for (const c of STEPS) line(await runStep({ ...ctx, concurrency: c, pick: () => { n++; return { url: '/api/announcements?limit=30', token: studentTokens[n % studentTokens.length] }; } }));

    console.log('\n3. Logins (bcrypt cost 10, successful):'); header();
    for (const c of [5, 20, 50]) line(await runStep({ ...ctx, concurrency: c, pick: () => { n++; const { s } = studentId(n); return { url: '/api/auth/login', method: 'POST', body: { email: `s${s}_${(n * 7919) % STUDENTS}@load.invalid`, password: PASSWORD } }; } }));

    console.log(`\n4. Teachers saving attendance for a whole class (~${Math.round(STUDENTS / CLASSES)} students per save; serialised write lock):`); header();
    const members = new Map();
    for (const row of await database.query('SELECT classroomId AS c, array_agg(studentId) AS ids FROM student_classroom_assignment WHERE classroomId < 2000000 GROUP BY classroomId')) members.set(Number(row.c), row.ids.map(Number));
    for (const c of [1, 5, 20]) line(await runStep({ ...ctx, concurrency: c, pick: () => {
      n++; const cls = n % CLASSES; const ids = members.get(1000000 + cls) || [];
      return { url: '/api/attendance/mark', method: 'POST', token: teacherTokens[cls], body: { classroomId: 1000000 + cls, date: '2026-03-25', attendanceData: ids.map((id, k) => ({ studentId: id, status: (k + n) % 7 ? 'present' : 'absent' })) } };
    } }));

    console.log(`\n5. Admin full user list of one school (${STUDENTS + CLASSES + 1} rows, no paging):`); header();
    for (const c of [1, 10]) line(await runStep({ ...ctx, concurrency: c, pick: () => ({ url: '/api/admin/users', token: adminToken }) }));

    const top = Math.max(...STEPS) * 2;
    console.log(`\n6. Overload (${top} concurrent student page requests), then recovery at 10:`); header();
    line(await runStep({ ...ctx, concurrency: top, pick: () => { n++; return { url: pages[n % pages.length], token: studentTokens[n % studentTokens.length] }; } }));
    line(await runStep({ ...ctx, concurrency: 10, seconds: 5, pick: () => { n++; return { url: pages[n % pages.length], token: studentTokens[n % studentTokens.length] }; } }));
    const ready = await fetch(`${base}/health/ready`);
    console.log(`\nServer ready after the run: ${ready.status === 200}`);
  } finally {
    if (server) await server.stop().catch(() => {});
    await database.drop();
  }
})().catch((err) => { console.error('LOAD TEST FAILED:', err.message); process.exit(1); });
