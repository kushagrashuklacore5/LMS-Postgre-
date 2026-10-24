/**
 * Start-up behaviour, across real process restarts.
 *
 *  - Existing data survives restarts: fee structures (the audit's DATA-012, "fee structures
 *    deleted on start-up") and every other table.
 *  - Start-up never changes the schema and never re-creates what an admin removed.
 *  - A database without the current schema, or no database configuration at all, stops start-up.
 *  - Demo accounts and default fee structures appear only when asked for, never in production.
 *  - Unsafe configuration stops the server (SEC-007: signing secret, CORS, demo data).
 *
 * Each case uses its own throw-away PostgreSQL database (lms_test_<random>).
 */
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startServer, temporaryDatabase, SERVER_ROOT } = require('../helpers/serverProcess');

const { findConfigProblems, getAllowedOrigins } = require(path.join(SERVER_ROOT, 'config', 'securityConfig'));

const created = [];
const newDatabase = async (options) => {
  const db = await temporaryDatabase(options);
  created.push(db);
  return db;
};
after(async () => {
  for (const db of created) await db.drop();
});

const tableNames = async (db) =>
  (await db.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY 1"))
    .map((row) => row.name);
const snapshot = async (db) => {
  const out = {};
  for (const name of await tableNames(db)) out[name] = await db.query(`SELECT * FROM ${name} ORDER BY 1`);
  return out;
};

async function runOnce(db, env = {}) {
  const server = await startServer(db.url, env);
  assert.equal(server.listening, true, `server did not start:\n${server.output.slice(-600)}`);
  await server.stop();
  return server;
}

const FEES = [
  // id, university_id, category, grade, tuitionFee, transportFee, totalFee, dueDate, installmentOptions
  [501, 1, 'Primary', '1-4', 4321, 111, 4432, '2027-03-31', JSON.stringify([{ stage: 1, percent: 60 }, { stage: 2, percent: 40 }])],
  [502, 1, 'Custom Scholarship Band', '5', 1, 0, 1, '2027-04-30', null],
  [503, 2, 'Secondary', '5-12', 9999.5, 250, 10249.5, '2027-05-31', null],
];

async function insertSchoolData(db) {
  // payments.studentId holds a users.id (audit finding DATA-006); insert the way the application does.
  await db.query("INSERT INTO universities (id, name, area) VALUES (1, 'School A', 'North'), (2, 'School B', 'South')");
  for (const row of FEES) {
    await db.query('INSERT INTO feeStructures (id, university_id, category, grade, tuitionFee, transportFee, totalFee, dueDate, installmentOptions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)', row);
  }
  await db.query("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (7, 'Admin', 'admin@test.invalid', 'x', 'admin', 1, 1), (8, 'Student', 'student@test.invalid', 'x', 'student', 1, 1)");
  await db.query("INSERT INTO classrooms (id, university_id, name, grade, section) VALUES (70, 1, 'Grade 5 - A', '5', 'A')");
  await db.query('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (8, 70)');
  await db.query("INSERT INTO courses (id, title, university_id, classroomId) VALUES (700, 'Maths', 1, 70)");
  await db.query("INSERT INTO results (classroomId, studentId, term, subjects, overallPercentage, overallStatus) VALUES (70, 8, 'Term 1', '[]', 75, 'PASS')");
  await db.query("INSERT INTO attendance (classroomId, studentId, date, status, markedBy) VALUES (70, 8, '2026-02-02', 'present', 7)");
  await db.query("INSERT INTO payments (studentId, amount, type, status, transactionId) VALUES (8, 4432, 'offline-cash', 'success', 'TXN-KEEP')");
  // explicit ids above: move the id sequences past them, as the application's database layer does
  for (const table of ['universities', 'feeStructures', 'users', 'classrooms', 'courses']) {
    await db.query(`SELECT setval(pg_get_serial_sequence('${table.toLowerCase()}', 'id'), (SELECT MAX(id) FROM ${table}))`);
  }
}

describe('start-up and restarts', () => {
  it('a newly migrated database starts with tables and with no accounts, fee structures or other rows', async () => {
    const db = await newDatabase();
    await runOnce(db);

    const tables = await tableNames(db);
    for (const expected of ['users', 'universities', 'classrooms', 'feestructures', 'courses', 'results', 'attendance', 'payments', 'aia_assessments', 'soa_custom_fields', 'otp_reset']) {
      assert.ok(tables.includes(expected), `table ${expected} missing`);
    }
    for (const table of tables) {
      assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`))[0].n, 0, `${table} is not empty after first start`);
    }
  });

  it('fee structures and all other school data survive repeated restarts unchanged', async () => {
    const db = await newDatabase();
    await runOnce(db);
    await insertSchoolData(db);
    const before = await snapshot(db);
    assert.equal(before.feestructures.length, 3);

    for (const restart of [1, 2, 3]) {
      await runOnce(db);
      const now = await snapshot(db);
      assert.deepEqual(now.feestructures, before.feestructures, `fee structures changed on restart ${restart}`);
      assert.deepEqual(now, before, `some table changed on restart ${restart}`);
    }
  });

  it('the same data survives a restart in production mode', async () => {
    const db = await newDatabase();
    await runOnce(db);
    await insertSchoolData(db);
    const before = await snapshot(db);

    await runOnce(db, { NODE_ENV: 'production', CORS_ORIGINS: 'https://lms.school.example' });
    assert.deepEqual(await snapshot(db), before);
  });

  it('fee structures an admin removed are not brought back by a restart', async () => {
    const db = await newDatabase();
    await runOnce(db);
    await insertSchoolData(db);
    await db.query('DELETE FROM feeStructures');

    await runOnce(db);
    await runOnce(db, { NODE_ENV: 'production', CORS_ORIGINS: 'https://lms.school.example' });
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM feeStructures'))[0].n, 0);
  });

  it('demo data is created only on request, once, and never over existing accounts', async () => {
    const db = await newDatabase();
    await runOnce(db, { NODE_ENV: 'development', SEED_DEMO_DATA: 'true' });
    const seeded = await snapshot(db);
    assert.ok(seeded.users.length >= 4, 'demo accounts were not created');
    assert.ok(seeded.feestructures.length >= 1, 'default fee structures were not created');

    await runOnce(db, { NODE_ENV: 'development', SEED_DEMO_DATA: 'true' });
    const again = await snapshot(db);
    assert.equal(again.users.length, seeded.users.length);
    assert.deepEqual(again.feestructures, seeded.feestructures);

    // a database that already has accounts gets no demo accounts added
    const real = await newDatabase();
    await runOnce(real);
    await insertSchoolData(real);
    await runOnce(real, { NODE_ENV: 'development', SEED_DEMO_DATA: 'true' });
    assert.deepEqual(await real.query('SELECT id::int AS id FROM users ORDER BY id'), [{ id: 7 }, { id: 8 }]);
    assert.equal((await real.query('SELECT COUNT(*)::int AS n FROM feeStructures'))[0].n, 3);
  });

  it('a database without the LMS schema is refused, and start-up never creates or changes tables', async () => {
    const empty = await newDatabase({ migrate: false });
    const server = await startServer(empty.url, {}, { settleMs: 200 });
    if (server.listening) await server.stop();
    assert.equal(server.listening, false, 'the server started on a database without its schema');
    assert.equal(server.exitCode, 1);
    assert.match(server.output, /npm run db:migrate/);
    assert.deepEqual(await tableNames(empty), [], 'start-up created tables');
  });

  it('a database with a pending migration is refused', async () => {
    const db = await newDatabase();
    await db.query("DELETE FROM schema_migrations WHERE version = (SELECT MAX(version) FROM schema_migrations)");
    const server = await startServer(db.url, {}, { settleMs: 200 });
    if (server.listening) await server.stop();
    assert.equal(server.listening, false);
    assert.match(server.output, /schema is out of date/);
  });

  it('no database configuration at all stops start-up (there is no fallback database)', async () => {
    const server = await startServer(undefined, {}, { settleMs: 200 });
    if (server.listening) await server.stop();
    assert.equal(server.listening, false);
    assert.equal(server.exitCode, 1);
    assert.match(server.output, /PostgreSQL is not configured/);
  });

  it('an unreachable database stops start-up with a message naming it, never the password', async () => {
    const server = await startServer('postgres://lms_app:not-the-real-one@127.0.0.1:1/lms', {}, { settleMs: 200 });
    if (server.listening) await server.stop();
    assert.equal(server.listening, false);
    assert.match(server.output, /Cannot connect to PostgreSQL at lms_app@127\.0\.0\.1:1\/lms/);
    assert.equal(server.output.includes('not-the-real-one'), false, 'the password was printed');
  });
});

describe('graceful shutdown', () => {
  it('finishes the request in hand, refuses new ones, closes its database connections and exits with code 0', async () => {
    const db = await newDatabase();
    const server = await startServer(db.url);
    assert.equal(server.listening, true, server.output.slice(-400));
    const base = `http://127.0.0.1:${server.port}`;
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);

    // A request that is still being received when the stop is asked for: the headers have
    // arrived, the body has not finished.
    const http = require('http');
    const inFlight = new Promise((resolve, reject) => {
      const request = http.request(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode, body }));
      });
      request.on('error', reject);
      request.write('{"email":"nobody@test.invalid",');
      setTimeout(() => request.end('"password":"x"}'), 700);
    });
    await new Promise((r) => setTimeout(r, 150));

    const started = Date.now();
    const stopped = server.shutdownGracefully();
    const answered = await inFlight;
    assert.equal(answered.status, 401, 'the request in hand was answered normally, not cut off');

    const { exitCode, output } = await stopped;
    assert.equal(exitCode, 0, output.slice(-400));
    assert.ok(Date.now() - started < 9000, 'it did not need the 10-second hard stop');
    assert.match(output, /Shutting down \(shutdown message\)/);
    await assert.rejects(fetch(`${base}/health/ready`), 'the port is closed');

    // The pool was closed properly: no session of the server is left on the database, and it starts again.
    const left = await db.query("SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'lms-server'");
    assert.equal(left[0].n, 0, 'database sessions were left open');
    await runOnce(db);
  });
});

describe('unsafe configuration stops the server (it never falls back to a built-in secret)', () => {
  const refused = async (env, expectedMessage) => {
    const server = await startServer((await newDatabase()).url, env, { settleMs: 200 });
    if (server.listening) await server.stop();
    assert.equal(server.listening, false, 'the server started with an unsafe configuration');
    assert.equal(server.exitCode, 1);
    assert.match(server.output, expectedMessage);
  };
  const production = { NODE_ENV: 'production', CORS_ORIGINS: 'https://lms.school.example' };

  it('no JWT_SECRET (any environment)', () => refused({ JWT_SECRET: undefined }, /JWT_SECRET is not set/));
  it('no JWT_SECRET in production', () => refused({ ...production, JWT_SECRET: undefined }, /JWT_SECRET is not set/));
  it('the template placeholder as JWT_SECRET', () =>
    refused({ ...production, JWT_SECRET: 'your_jwt_secret_here_change_this_in_production' }, /placeholder/));
  it('the old built-in default as JWT_SECRET', () => refused({ JWT_SECRET: 'default_jwt_secret_key' }, /placeholder/));
  it('a short JWT_SECRET', () => refused({ JWT_SECRET: 'only-24-characters-long!' }, /at least 32 characters/));
  it('production without JWT_REFRESH_SECRET', () => refused({ ...production, JWT_REFRESH_SECRET: undefined }, /JWT_REFRESH_SECRET is not set/));
  it('production with the same value for both secrets', () => {
    const same = `same-secret-${'e'.repeat(40)}`;
    return refused({ ...production, JWT_SECRET: same, JWT_REFRESH_SECRET: same }, /must be different/);
  });
  it('production without an allowed web origin', () => refused({ NODE_ENV: 'production' }, /CORS_ORIGINS/));
  it('production with a wildcard origin', () => refused({ NODE_ENV: 'production', CORS_ORIGINS: '*' }, /must not contain/));
  it('production with demo data switched on', () => refused({ ...production, SEED_DEMO_DATA: 'true' }, /SEED_DEMO_DATA/));

  it('the error output never prints a secret value', async () => {
    const secret = 'short-but-secret-value';
    const server = await startServer((await newDatabase()).url, { JWT_SECRET: secret }, { settleMs: 200 });
    if (server.listening) await server.stop();
    assert.equal(server.output.includes(secret), false);
  });

  it('a complete production configuration starts', async () => {
    const server = await startServer((await newDatabase()).url, production);
    assert.equal(server.listening, true, server.output.slice(-400));
    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(health.status, 200);
    // production: local development origins are not allowed any more
    const preflight = await fetch(`http://127.0.0.1:${server.port}/api/courses`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
    const allowed = await fetch(`http://127.0.0.1:${server.port}/api/courses`, { method: 'OPTIONS', headers: { Origin: 'https://lms.school.example', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://lms.school.example');
    await server.stop();
  });
});

describe('configuration rules (unit)', () => {
  const withEnv = (values, work) => {
    const saved = {};
    for (const [name, value] of Object.entries(values)) {
      saved[name] = process.env[name];
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    try { return work(); } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  };
  const good = { JWT_SECRET: 'f'.repeat(48), JWT_REFRESH_SECRET: 'g'.repeat(48), NODE_ENV: 'production', CORS_ORIGINS: 'https://a.example, https://b.example', FRONTEND_ORIGIN: undefined, SEED_DEMO_DATA: undefined };

  it('accepts a complete production configuration', () => {
    assert.deepEqual(withEnv(good, findConfigProblems), []);
  });

  it('lists every problem at once', () => {
    const problems = withEnv({ ...good, JWT_SECRET: 'secret', JWT_REFRESH_SECRET: undefined, CORS_ORIGINS: undefined }, findConfigProblems);
    assert.equal(problems.length, 3);
  });

  it('allowed origins: explicit list in production, local ports added only outside production', () => {
    assert.deepEqual(withEnv(good, getAllowedOrigins), ['https://a.example', 'https://b.example']);
    const development = withEnv({ ...good, NODE_ENV: 'development' }, getAllowedOrigins);
    assert.ok(development.includes('http://localhost:5173') && development.includes('https://a.example'));
    assert.equal(development.includes('*'), false);
  });
});
