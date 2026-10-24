/**
 * Phase 1B: cross-process safety of the fee-reminder cooldown claim
 *
 * Runs the EXACT claim statement (the INSERT ... WHERE NOT EXISTS extracted from
 * routes/classroomRoutes.js at run time, so the test follows the code) from several separate
 * Node.js processes at the same instant, against a temporary SQLite database cloned from the
 * real schema (see phase2c_test_fixture.js: the project database is opened read-only for its
 * table definitions only; no rows are read or copied; nothing is written to it).
 *
 * The app's driver (node-sqlite3) is used with its default busy timeout, exactly as the app does.
 * Verified: no round ever produces more than one reminder announcement for the same student.
 *
 * usage: node scripts/test_phase1b_crossprocess_claim.js
 *   (the same file is re-invoked as a child process with the 'child' argument)
 */

const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const assert = require('assert');

const ROUTES_FILE = path.join(__dirname, '../routes/classroomRoutes.js');
const TITLE_PREFIX = '⚠️ Fee Payment Reminder';

function extractClaimSql() {
  const src = fs.readFileSync(ROUTES_FILE, 'utf8');
  const start = src.indexOf('`INSERT INTO announcements (university_id, title, content, createdByUser');
  const end = src.indexOf('`', start + 1);
  if (start < 0 || end < 0) throw new Error('Reminder claim SQL not found in routes/classroomRoutes.js');
  return src.slice(start + 1, end);
}

// Same 10 parameters, same order as the route
const claimParams = (studentId) => [1, `${TITLE_PREFIX}: Test`, 'test reminder', 1, 'accountant', studentId, studentId, 1, `${TITLE_PREFIX}%`, '-24 hours'];

// ------------------------------------------------------------------ child process
if (process.argv[2] === 'child') {
  const [, , , dbPath, studentId, startAt, busyMs, holdMs] = process.argv;
  const sqlite3 = require('sqlite3');
  const db = new sqlite3.Database(dbPath);
  if (Number(busyMs) >= 0) db.configure('busyTimeout', Number(busyMs)); // -1 = keep the driver default, as the app does
  const reply = (obj) => { process.stdout.write(JSON.stringify(obj)); db.close(); };
  setTimeout(() => {
    if (Number(holdMs) > 0) {
      // A competing writer in another process holding the write lock for holdMs
      db.exec('BEGIN IMMEDIATE', (e) => {
        if (e) return reply({ role: 'holder', err: e.code });
        setTimeout(() => db.exec('COMMIT', () => reply({ role: 'holder', held: true })), Number(holdMs));
      });
      return;
    }
    db.run(extractClaimSql(), claimParams(Number(studentId)), function (err) {
      reply(err ? { err: err.code } : { changes: this.changes });
    });
  }, Math.max(0, Number(startAt) - Date.now()));
  return;
}

// ------------------------------------------------------------------ parent (the test)
const { createIsolatedDb } = require('./phase2c_test_fixture');
const sqlite3 = require('sqlite3');

const say = console.log.bind(console);
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    say(`✅ [PASS] ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    say(`❌ [FAIL] ${name}\n      - ${String(e.message).slice(0, 500)}`);
  }
}

function runChild(dbPath, args) {
  return new Promise((resolve) => {
    cp.execFile(process.execPath, [__filename, 'child', dbPath, ...args], { timeout: 30000 }, (error, stdout) => {
      try { resolve(JSON.parse(stdout)); } catch (e) { resolve({ crashed: String(error || stdout).slice(0, 200) }); }
    });
  });
}

async function runRound(dbPath, studentId, { procs, busyMs, holdMs = 0 }) {
  const startAt = Date.now() + 1200; // all children start at the same instant
  const jobs = [];
  if (holdMs) jobs.push(runChild(dbPath, [String(studentId), String(startAt - 100), '-1', String(holdMs)]));
  for (let i = 0; i < procs; i++) jobs.push(runChild(dbPath, [String(studentId), String(startAt), String(busyMs), '0']));
  return (await Promise.all(jobs)).filter(o => o.role !== 'holder');
}

const countRows = (dbPath, studentId) => new Promise((resolve, reject) => {
  const d = new sqlite3.Database(dbPath);
  d.get('SELECT COUNT(*) AS n FROM announcements WHERE targetUserId = ?', [studentId], (e, r) => { d.close(); e ? reject(e) : resolve(r.n); });
});

async function main() {
  say('================================================================');
  say('🧪 PHASE 1B: CROSS-PROCESS REMINDER CLAIM');
  say('================================================================');

  const fixture = await createIsolatedDb('phase1b-xproc');
  await new Promise(r => fixture.db.close(r)); // the children open their own connections
  const dbPath = fixture.dbPath;
  if (path.resolve(dbPath) === path.resolve(__dirname, '../data/lms_permanent.db')) throw new Error('Refusing to run against the project database.');
  say(`Temporary database: ${dbPath}\n`);

  let studentId = 5000;
  try {
    await test('0. the statement under test is the route\'s claim: insert-if-absent within 24 hours, targeted, title-scoped', async () => {
      const sql = extractClaimSql();
      for (const part of ['INSERT INTO announcements', 'WHERE NOT EXISTS', 'targetUserId = ?', 'university_id = ?', 'title LIKE ?', "createdAt >= datetime('now', ?)"]) {
        assert.ok(sql.includes(part), `claim SQL no longer contains: ${part}`);
      }
      assert.strictEqual((sql.match(/\?/g) || []).length, claimParams(1).length, 'parameter count matches the route');
    });

    await test('1. 6 processes at once, driver default busy timeout, 10 rounds: exactly one reminder per round', async () => {
      for (let round = 0; round < 10; round++) {
        studentId += 1;
        const outcomes = await runRound(dbPath, studentId, { procs: 6, busyMs: -1 });
        const rows = await countRows(dbPath, studentId);
        const inserted = outcomes.filter(o => o.changes === 1).length;
        assert.ok(outcomes.every(o => o.changes === 0 || o.changes === 1), `unexpected outcome in round ${round}: ${JSON.stringify(outcomes)}`);
        assert.strictEqual(rows, 1, `round ${round}: ${rows} rows (outcomes ${JSON.stringify(outcomes)})`);
        assert.strictEqual(inserted, 1, `round ${round}: ${inserted} processes reported an insert`);
      }
    });

    await test('2. 6 processes at once with NO lock waiting, 10 rounds: busy errors allowed, never more than one reminder', async () => {
      for (let round = 0; round < 10; round++) {
        studentId += 1;
        const outcomes = await runRound(dbPath, studentId, { procs: 6, busyMs: 0 });
        const rows = await countRows(dbPath, studentId);
        assert.ok(rows <= 1, `round ${round}: ${rows} rows`);
        assert.strictEqual(outcomes.filter(o => o.changes === 1).length, rows, 'reported inserts match stored rows');
        assert.ok(outcomes.every(o => o.changes !== undefined || (o.err && o.err.startsWith('SQLITE_BUSY'))), `only SQLITE_BUSY may fail: ${JSON.stringify(outcomes)}`);
      }
    });

    await test('3. another process holds the write lock longer than the busy timeout: every claim fails with SQLITE_BUSY and nothing is inserted', async () => {
      for (let round = 0; round < 2; round++) {
        studentId += 1;
        const outcomes = await runRound(dbPath, studentId, { procs: 3, busyMs: -1, holdMs: 1600 });
        assert.ok(outcomes.length === 3 && outcomes.every(o => o.err && o.err.startsWith('SQLITE_BUSY')), JSON.stringify(outcomes));
        assert.strictEqual(await countRows(dbPath, studentId), 0);
      }
    });

    await test('4. a later claim for the same student (any process) inside the window is refused', async () => {
      const outcomes = await runRound(dbPath, 5001, { procs: 3, busyMs: -1 }); // student 5001 was claimed in test 1
      assert.ok(outcomes.every(o => o.changes === 0), JSON.stringify(outcomes));
      assert.strictEqual(await countRows(dbPath, 5001), 1);
    });
  } finally {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }

  const failed = results.filter(r => !r.ok).length;
  say(`\n📊 PHASE 1B CROSS-PROCESS SUMMARY: ${results.length - failed} / ${results.length} TESTS PASSED`);
  process.exit(failed > 0 || results.length === 0 ? 1 : 0);
}

main().catch((err) => {
  say('❌ Suite crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
