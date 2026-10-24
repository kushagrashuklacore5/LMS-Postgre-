/**
 * Throwaway LMS database for adapter tests: a fresh PostgreSQL database with the LMS schema
 * (server/database/postgres/migrations, which include the module's soa_* tables), created on the
 * test server named by LMS_TEST_DATABASE_ADMIN_URL and dropped when the test file ends.
 * The school database is never opened.
 */
const path = require('path');
const { after } = require('node:test');

const SERVER = path.resolve(__dirname, '../../../../../server');
const { createTestDatabase } = require(path.join(SERVER, 'tests', 'helpers', 'pgTestDatabase'));
const { PgDatabase } = require(path.join(SERVER, 'config', 'pg-db'));

const created = new Set();
after(async () => {
  for (const db of created) await db.close();
});

/**
 * Seed: schools 1 (free), 2 (standard), 3 (professional).
 * Users: 1 admin@s1 (school 1), 2 admin@s2 (school 2), 3 mentor@s1 (mentor, school 1),
 *        4 admin with NULL school, 5 admin@s3 (school 3).
 * Classrooms: school 1: 10/A, 11/B, 12/C twice (ambiguous); school 2: 10/A.
 *
 * Returns { get, all, run, transaction, exec, sql, url, close }: `sql` is the database interface
 * the module's adapters take ({ get, all, run, transaction }, ? placeholders).
 */
async function createLmsTestDatabase() {
  const database = await createTestDatabase();
  const pg = new PgDatabase({ connectionString: database.url });
  await pg.connect();
  const get = (text, params = []) => new Promise((resolve, reject) => pg.get(text, params, (e, row) => (e ? reject(e) : resolve(row))));
  const all = (text, params = []) => new Promise((resolve, reject) => pg.all(text, params, (e, rows) => (e ? reject(e) : resolve(rows))));
  const run = (text, params = []) => new Promise((resolve, reject) =>
    pg.run(text, params, function (e) { return e ? reject(e) : resolve({ lastID: this.lastID, changes: this.changes }); }));
  const transaction = (fn) => pg.transaction(() => fn(), { exclusive: true });
  const sql = Object.freeze({ get, all, run, transaction });

  for (const [id, name, plan] of [[1, 'School One', 'free'], [2, 'School Two', 'standard'], [3, 'School Three', 'professional']]) {
    await run("INSERT INTO universities (id, name, area, subscriptionPlan) VALUES (?, ?, '', ?)", [id, name, plan]);
  }
  for (const [id, name, email, role, school] of [
    [1, 'Admin One', 'admin@s1.test', 'admin', 1], [2, 'Admin Two', 'admin@s2.test', 'admin', 2], [3, 'Mentor One', 'mentor@s1.test', 'mentor', 1],
    [4, 'Admin Nowhere', 'admin@none.test', 'admin', null], [5, 'Admin Three', 'admin@s3.test', 'admin', 3],
  ]) {
    await run("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES (?, ?, ?, 'x', ?, ?, 1)", [id, name, email, role, school]);
  }
  for (const [school, name, grade, section] of [[1, 'Grade 10 - A', '10', 'A'], [1, 'Grade 11 - B', '11', 'B'], [1, 'Grade 12 - C', '12', 'C'], [1, 'Grade 12 - C (2)', '12', 'C'], [2, 'Grade 10 - A', '10', 'A']]) {
    await run('INSERT INTO classrooms (university_id, name, grade, section) VALUES (?, ?, ?, ?)', [school, name, grade, section]);
  }

  let closed = false;
  const db = {
    ...sql,
    sql,
    url: database.url,
    async exec(text) {
      await new Promise((resolve, reject) => pg.exec(text, (e) => (e ? reject(e) : resolve())));
      await pg.resyncIdentities(); // rows written with explicit ids
    },
    async close() {
      if (closed) return;
      closed = true;
      created.delete(db);
      await new Promise((resolve) => pg.close(() => resolve()));
      await database.drop();
    },
  };
  created.add(db);
  return db;
}

/** Row counts of the tables the adapter writes, for "nothing was written" checks. */
async function counts(db) {
  const n = async (t) => (await db.get(`SELECT COUNT(*) AS n FROM ${t}`)).n;
  return { users: await n('users'), students: await n('students'), assignments: await n('student_classroom_assignment'), idempotency: await n('soa_idempotency_keys') };
}

module.exports = { createLmsTestDatabase, counts };
