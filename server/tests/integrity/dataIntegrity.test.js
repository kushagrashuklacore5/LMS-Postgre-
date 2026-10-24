/**
 * Data integrity: registers, results, procurement records and the staged school-ownership
 * migration. Covers audit findings DATA-004 (multi-step writes), DATA-005 (attendance
 * uniqueness), the class-membership part of SEC-012 and the procurement part of SEC-010.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startTestApp } = require('../helpers/testApp');
const { createTestDatabase, ADMIN_URL_VARIABLE } = require('../helpers/pgTestDatabase');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

// pg_dump / pg_restore (PostgreSQL client tools) on PATH or in PG_BIN
const pgToolsAvailable = (() => {
  try {
    execFileSync(process.env.PG_BIN ? path.join(process.env.PG_BIN, 'pg_dump') : 'pg_dump', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('data integrity', () => {
  let ctx;
  let ids;
  before(async () => { ctx = await startTestApp(); ids = ctx.ids; });
  after(async () => { await ctx.stop(); });

  describe('attendance register', () => {
    const mark = (account, body) => ctx.api('POST', '/api/attendance/mark', { as: account, body });
    const register = (date) => ctx.db.all('SELECT studentId, status FROM attendance WHERE classroomId = ? AND date = ? ORDER BY studentId', [ids.classroomA, date]);
    const present = (status = 'present') => [{ studentId: ids.users.studentA, status }];

    it('marking the same day again replaces it instead of adding rows', async () => {
      const date = '2026-05-04';
      assert.equal((await mark('mentorA', { classroomId: ids.classroomA, date, attendanceData: present('present') })).status, 200);
      assert.equal((await mark('mentorA', { classroomId: ids.classroomA, date, attendanceData: present('absent') })).status, 200);
      assert.deepEqual(await register(date), [{ studentId: ids.users.studentA, status: 'absent' }]);
    });

    it('a student listed twice in one submission is stored once', async () => {
      const date = '2026-05-05';
      const response = await mark('mentorA', { classroomId: ids.classroomA, date, attendanceData: [...present('absent'), ...present('present')] });
      assert.equal(response.status, 200);
      assert.deepEqual(await register(date), [{ studentId: ids.users.studentA, status: 'present' }]);
    });

    it('a submission naming a student outside the class is refused and the existing day is kept', async () => {
      const date = '2026-05-06';
      await mark('mentorA', { classroomId: ids.classroomA, date, attendanceData: present('present') });
      const response = await mark('adminA', {
        classroomId: ids.classroomA,
        date,
        attendanceData: [...present('absent'), { studentId: ids.users.studentA2, status: 'present' }],
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await register(date), [{ studentId: ids.users.studentA, status: 'present' }]);
    });

    it('two submissions at the same moment leave one row per student', async () => {
      const date = '2026-05-07';
      const results = await Promise.all(
        ['present', 'absent', 'present', 'absent'].map((status) => mark('mentorA', { classroomId: ids.classroomA, date, attendanceData: present(status) }))
      );
      assert.deepEqual(results.map((response) => response.status), [200, 200, 200, 200]);
      assert.equal((await register(date)).length, 1);
    });

    it('malformed registers are rejected', async () => {
      for (const body of [
        {}, { classroomId: ids.classroomA }, { classroomId: ids.classroomA, date: 'not-a-date', attendanceData: [] },
        { classroomId: ids.classroomA, date: '2026-05-08', attendanceData: 'everyone' },
        { classroomId: ids.classroomA, date: '2026-05-08', attendanceData: [{ studentId: ids.users.studentA }] },
        { classroomId: ids.classroomA, date: '2026-05-08', attendanceData: [{ studentId: ids.users.studentA, status: 'x'.repeat(200) }] },
        { classroomId: ids.classroomA, date: '2026-05-08', attendanceData: [{ studentId: ids.users.studentA, status: 'late' }] },
      ]) {
        assert.equal((await mark('mentorA', body)).status, 400, JSON.stringify(body).slice(0, 80));
      }
      assert.deepEqual(await register('2026-05-08'), []);
    });

    it('the database itself refuses a second row for the same student, class and day', async () => {
      await assert.rejects(
        ctx.db.run("INSERT INTO attendance (classroomId, studentId, date, status, markedBy) VALUES (?, ?, '2026-05-04', 'present', ?)", [ids.classroomA, ids.users.studentA, ids.users.mentorA]),
        (err) => err.code === '23505' // unique_violation
      );
    });
  });

  describe('term results', () => {
    const save = (body) => ctx.api('POST', '/api/results', { as: 'mentorA', body });
    const subjects = [{ name: 'Maths', marks: 30, total: 50, status: 'PASS' }];

    it('saving the same student and term twice updates one result', async () => {
      const first = await save({ classroomId: ids.classroomA, studentId: ids.users.studentA, term: 'Final', subjects });
      const second = await save({ classroomId: ids.classroomA, studentId: ids.users.studentA, term: 'Final', subjects: [{ name: 'Maths', marks: 10, total: 50, status: 'FAIL' }] });
      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      const rows = await ctx.db.all("SELECT overallStatus FROM results WHERE studentId = ? AND classroomId = ? AND term = 'Final'", [ids.users.studentA, ids.classroomA]);
      assert.deepEqual(rows, [{ overallStatus: 'FAIL' }]);
    });

    it('a result cannot be recorded for a student who is not in that classroom', async () => {
      const response = await ctx.api('POST', '/api/results', { as: 'adminA', body: { classroomId: ids.classroomA, studentId: ids.users.studentA2, term: 'Final', subjects } });
      assert.equal(response.status, 400);
      assert.equal((await ctx.db.get('SELECT COUNT(*) AS n FROM results WHERE studentId = ? AND classroomId = ?', [ids.users.studentA2, ids.classroomA])).n, 0);
    });

    it('missing fields are rejected', async () => {
      assert.equal((await save({ studentId: ids.users.studentA })).status, 400);
      assert.equal((await save({ classroomId: ids.classroomA })).status, 400);
    });
  });

  describe('procurement records belong to one school', () => {
    it('expenses: each school sees and changes only its own', async () => {
      const mine = await ctx.api('POST', '/api/expenses', { as: 'adminA', body: { description: 'EXPENSE-A', amount: 100, category: 'Supplies' } });
      const theirs = await ctx.api('POST', '/api/expenses', { as: 'adminB', body: { description: 'EXPENSE-B', amount: 999, category: 'Supplies' } });
      assert.ok(mine.status < 300 && theirs.status < 300, `${mine.status} ${theirs.status}`);

      const listA = await ctx.api('GET', '/api/expenses', { as: 'accountantA' });
      assert.ok(listA.text.includes('EXPENSE-A'));
      assert.equal(listA.text.includes('EXPENSE-B'), false);
      const summaryA = await ctx.api('GET', '/api/expenses/summary', { as: 'accountantA' });
      assert.equal(summaryA.text.includes('999'), false);

      const expenseB = await ctx.db.get("SELECT id, status FROM expenses WHERE description = 'EXPENSE-B'");
      await ctx.api('PATCH', `/api/expenses/${expenseB.id}/status`, { as: 'accountantA', body: { status: 'approved' } });
      assert.equal((await ctx.db.get('SELECT status FROM expenses WHERE id = ?', [expenseB.id])).status, expenseB.status);
    });

    it('orders: each school sees and changes only its own', async () => {
      const placed = await ctx.api('POST', '/api/orders', { as: 'storekeeperA', body: { itemName: 'ORDER-ITEM-A', quantity: 2, unitPrice: 10 } });
      assert.ok(placed.status < 300, `${placed.status} ${placed.text.slice(0, 120)}`);
      await ctx.db.run("INSERT INTO orders (storekeeperId, itemName, quantity, unitPrice, totalAmount, status, university_id) VALUES (?, 'ORDER-ITEM-B', 1, 5, 5, 'pending', ?)", [ids.users.adminB, ids.schoolB]);

      const listA = await ctx.api('GET', '/api/orders', { as: 'accountantA' });
      assert.ok(listA.text.includes('ORDER-ITEM-A'));
      assert.equal(listA.text.includes('ORDER-ITEM-B'), false);

      const orderB = await ctx.db.get("SELECT id FROM orders WHERE itemName = 'ORDER-ITEM-B'");
      await ctx.api('PATCH', `/api/orders/${orderB.id}/status`, { as: 'storekeeperA', body: { status: 'delivered' } });
      assert.equal((await ctx.db.get('SELECT status FROM orders WHERE id = ?', [orderB.id])).status, 'pending');
    });

    it('inventory, vendors and stock requests: each school sees and changes only its own', async () => {
      await ctx.db.run("INSERT INTO inventory (itemName, category, quantity, unitPrice, university_id) VALUES ('INVENTORY-A', 'Stationery', 5, 10, ?), ('INVENTORY-B', 'Stationery', 5, 10, ?)", [ids.schoolA, ids.schoolB]);
      await ctx.db.run("INSERT INTO vendors (name, email, category, university_id) VALUES ('VENDOR-A', 'va@test.invalid', 'Books', ?), ('VENDOR-B', 'vb@test.invalid', 'Books', ?)", [ids.schoolA, ids.schoolB]);
      await ctx.db.run("INSERT INTO stock_requests (request_number, storekeeper_id, university_id, title, status) VALUES ('REQ-A-1', ?, ?, 'STOCK-REQUEST-A', 'pending'), ('REQ-B-1', ?, ?, 'STOCK-REQUEST-B', 'pending')", [ids.users.storekeeperA, ids.schoolA, ids.users.adminB, ids.schoolB]);

      for (const [url, mine, theirs] of [
        ['/api/storekeeper/inventory', 'INVENTORY-A', 'INVENTORY-B'],
        ['/api/storekeeper/vendors', 'VENDOR-A', 'VENDOR-B'],
        ['/api/stock-requests', 'STOCK-REQUEST-A', 'STOCK-REQUEST-B'],
        ['/api/stock-requests/dashboard/stats', null, 'STOCK-REQUEST-B'],
      ]) {
        const response = await ctx.api('GET', url, { as: 'storekeeperA' });
        assert.equal(response.status, 200, `${url} -> ${response.status} ${response.text.slice(0, 120)}`);
        if (mine) assert.ok(response.text.includes(mine), `${url} does not show the school's own record`);
        assert.equal(response.text.includes(theirs), false, `${url} leaked another school's record`);
      }

      const requestB = await ctx.db.get("SELECT id FROM stock_requests WHERE title = 'STOCK-REQUEST-B'");
      assert.equal((await ctx.api('GET', `/api/stock-requests/${requestB.id}`, { as: 'storekeeperA' })).status, 404);
      await ctx.api('PUT', `/api/stock-requests/${requestB.id}`, { as: 'storekeeperA', body: { title: 'HACKED', status: 'approved' } });
      await ctx.api('DELETE', `/api/stock-requests/${requestB.id}`, { as: 'storekeeperA' });
      assert.deepEqual(await ctx.db.get('SELECT title, status FROM stock_requests WHERE id = ?', [requestB.id]), { title: 'STOCK-REQUEST-B', status: 'pending' });
    });

    it('rows from before the school column (no school) are shown to no school', async () => {
      await ctx.db.run("INSERT INTO expenses (description, amount, category, date, status) VALUES ('LEGACY-EXPENSE', 1, 'Other', '2025-01-01', 'pending')");
      for (const account of ['accountantA', 'adminA', 'adminB']) {
        assert.equal((await ctx.api('GET', '/api/expenses', { as: account })).text.includes('LEGACY-EXPENSE'), false, account);
      }
    });
  });

  describe('backup and restore drill', { skip: !pgToolsAvailable && 'pg_dump/pg_restore not found (add PostgreSQL\'s bin folder to PATH or set PG_BIN)' }, () => {
    const script = path.join(SERVER_ROOT, 'scripts', 'ops', 'backup-and-verify.js');
    const run = (args) => {
      // only the database named on the command line, never the one this test process uses
      const env = { ...process.env, LMS_SKIP_DOTENV: 'true' };
      delete env.DATABASE_URL;
      delete env.DATABASE_MIGRATION_URL;
      try {
        return { code: 0, output: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) };
      } catch (error) {
        return { code: error.status, output: `${error.stdout || ''}${error.stderr || ''}` };
      }
    };

    it('a backup taken while the server is running restores into a fresh database with the same data', async () => {
      const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-backup-drill-'));
      const { code, output } = run(['--database-url', ctx.databaseUrl, '--out', outDir, '--verify-url', process.env[ADMIN_URL_VARIABLE]]);
      assert.equal(code, 0, output);
      assert.match(output, /Verified: the backup restores into a fresh database/);

      // Restore it ourselves into a database of its own and compare real content
      const backupFile = path.join(outDir, fs.readdirSync(outDir)[0]);
      const restored = await createTestDatabase({ migrate: false });
      try {
        execFileSync(process.env.PG_BIN ? path.join(process.env.PG_BIN, 'pg_restore') : 'pg_restore', ['--no-owner', '--exit-on-error', `--dbname=${restored.url}`, backupFile], { stdio: 'ignore' });
        const users = await restored.query('SELECT id::int AS id, email, role, university_id::int AS university_id FROM users ORDER BY id');
        assert.deepEqual(users, await ctx.db.all('SELECT id, email, role, university_id FROM users ORDER BY id'));
        assert.deepEqual(
          await restored.query('SELECT id::int AS id, studentid::int AS "studentId", amount, transactionid AS "transactionId" FROM payments ORDER BY id'),
          await ctx.db.all('SELECT id, studentId, amount, transactionId FROM payments ORDER BY id')
        );
        assert.equal((await restored.query("SELECT COUNT(*)::int AS n FROM pg_indexes WHERE indexname = 'idx_attendance_one_per_day'"))[0].n, 1);
      } finally {
        await restored.drop();
      }
    });

    it('a database that cannot be reached is reported, and nothing is accepted as a backup', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-backup-bad-'));
      const result = run(['--database-url', 'postgres://nobody:not-the-real-one@127.0.0.1:1/lms', '--out', path.join(dir, 'out')]);
      assert.equal(result.code, 1);
      assert.equal(result.output.includes('not-the-real-one'), false, 'the password was printed');
      assert.equal(run(['--out', path.join(dir, 'out')]).code, 1, 'no database named: usage error');
    });
  });

  describe('school-ownership reconciliation script (on a disposable database)', () => {
    const script = path.join(SERVER_ROOT, 'scripts', 'security', 'reconcile-school-ownership.js');
    let copy;
    let backupDir;
    const runScript = (...args) => {
      try {
        return { code: 0, output: execFileSync(process.execPath, [script, '--database-url', copy.url, '--backup-dir', backupDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
      } catch (error) {
        return { code: error.status, output: `${error.stdout || ''}${error.stderr || ''}` };
      }
    };
    const count = async (sql) => (await copy.query(sql))[0].n;
    const legacyRows = async () => copy.query('SELECT id::int AS id, university_id FROM orders UNION ALL SELECT id::int, university_id FROM expenses ORDER BY 1, 2');

    before(async () => {
      // The same rows in the application's database (which must never be touched) and in a disposable one
      await ctx.db.run("INSERT INTO orders (storekeeperId, itemName, quantity, unitPrice, totalAmount, status) VALUES (?, 'LEGACY-ORDER', 1, 1, 1, 'pending')", [ids.users.storekeeperA]);
      copy = await createTestDatabase();
      backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-reconcile-test-'));
      await copy.query("INSERT INTO universities (id, name, area) VALUES (1, 'School A', 'North'), (2, 'School B', 'South')");
      await copy.query("INSERT INTO users (id, name, email, password, role, university_id, isApproved) VALUES ($1, 'storekeeperA', 'storekeepera@test.invalid', 'x', 'storekeeper', 1, 1)", [ids.users.storekeeperA]);
      await copy.query("INSERT INTO orders (storekeeperId, itemName, quantity, unitPrice, totalAmount, status) VALUES ($1, 'LEGACY-ORDER', 1, 1, 1, 'pending')", [ids.users.storekeeperA]);
      await copy.query("INSERT INTO expenses (description, amount, category, date, status) VALUES ('LEGACY-EXPENSE', 1, 'Other', '2025-01-01', 'pending')");
    });
    after(async () => { if (copy) await copy.drop(); });

    it('report mode changes nothing', async () => {
      const before = await legacyRows();
      const { code, output } = runScript();
      assert.equal(code, 0, output);
      assert.match(output, /Report only: nothing was changed/);
      assert.match(output, /orders\s+\d+\s+1\s+1/); // one order without a school, derivable from its storekeeper
      assert.deepEqual(await legacyRows(), before);
      assert.deepEqual(fs.readdirSync(backupDir), [], 'report mode wrote a backup');
    });

    it('refuses to pour every unassigned row into one school when there are several schools', async () => {
      const { code, output } = runScript('--assign-remaining', '1');
      assert.equal(code, 1);
      assert.match(output, /more than one school/);
      assert.equal(await count("SELECT COUNT(*)::int AS n FROM expenses WHERE description = 'LEGACY-EXPENSE' AND university_id IS NULL"), 1);
    });

    it('refuses a school that does not exist', () => {
      assert.equal(runScript('--assign-remaining', '999', '--i-have-checked').code, 1);
    });

    it('--apply-derived fills only what a link proves, after writing an undo file', async () => {
      const legacyOrder = (await copy.query("SELECT id::int AS id FROM orders WHERE itemName = 'LEGACY-ORDER'"))[0].id;
      const { code, output } = runScript('--apply-derived');
      assert.equal(code, 0, output);
      assert.match(output, /Backup written/);
      assert.equal(await count("SELECT COUNT(*)::int AS n FROM orders WHERE itemName = 'LEGACY-ORDER' AND university_id = 1"), 1);
      // an expense has no link to a school: it is left for a human decision
      assert.equal(await count("SELECT COUNT(*)::int AS n FROM expenses WHERE description = 'LEGACY-EXPENSE' AND university_id IS NULL"), 1);
      const backups = fs.readdirSync(backupDir).filter((name) => name.startsWith('pre-school-reconcile.'));
      assert.equal(backups.length, 1);
      // the undo file restores exactly the state from before the change
      await copy.query(fs.readFileSync(path.join(backupDir, backups[0]), 'utf8'));
      assert.equal(await count(`SELECT COUNT(*)::int AS n FROM orders WHERE id = ${legacyOrder} AND university_id IS NULL`), 1);
    });

    it('never touches the database the application is using', async () => {
      assert.equal((await ctx.db.get("SELECT university_id FROM orders WHERE itemName = 'LEGACY-ORDER'")).university_id, null);
    });
  });
});
