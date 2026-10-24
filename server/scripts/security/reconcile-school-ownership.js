/**
 * Records without a school (staged school-isolation migration).
 *
 * Some tables were created without a school column (expenses, orders, inventory,
 * vendors) and some older rows carry no school id. The server never guesses a
 * school for such rows: they stay hidden from school accounts until an operator
 * decides where they belong. This script is that decision tool.
 *
 *   node scripts/security/reconcile-school-ownership.js --database-url <postgres://...>
 *       Report only (a read-only transaction): what has no school, what can be derived
 *       from an existing link, and what is ambiguous.
 *
 *   node scripts/security/reconcile-school-ownership.js --database-url <url> --apply-derived
 *       Fills in the school where an existing link proves it (an order belongs to
 *       the school of the storekeeper who placed it). Nothing else is touched.
 *
 *   node scripts/security/reconcile-school-ownership.js --database-url <url> --assign-remaining <schoolId>
 *       Assigns every remaining row without a school to ONE school. Only correct for
 *       a database that has always served a single school; the script refuses when
 *       the database holds more than one school unless --i-have-checked is added.
 *
 * A changing run locks the rows it will change, writes an undo file listing them
 * (<backup dir>/pre-school-reconcile.<time>.sql, default server/data/backups, or --backup-dir)
 * and only then changes them, all in one transaction (all or nothing).
 * There is no default database on purpose: you must name the database you mean.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const flag = (name) => args.includes(name);

const databaseUrl = option('--database-url');
if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
  console.error('Usage: node scripts/security/reconcile-school-ownership.js --database-url <postgres://...> [--apply-derived] [--assign-remaining <schoolId>] [--backup-dir <folder>]');
  process.exit(1);
}

const applyDerived = flag('--apply-derived');
const assignSchool = option('--assign-remaining');
const changing = applyDerived || assignSchool !== undefined;
const backupDir = path.resolve(option('--backup-dir') || path.join(__dirname, '..', '..', 'data', 'backups'));

// Tables with their own school column, and (where one exists) the link that proves the school.
const TABLES = [
  { table: 'orders', derive: 'SELECT u.university_id FROM users u WHERE u.id = orders.storekeeperId' },
  { table: 'expenses', derive: null },
  { table: 'inventory', derive: null },
  { table: 'vendors', derive: null },
  { table: 'calendar_events', derive: 'SELECT u.university_id FROM users u WHERE u.id = calendar_events.createdByUser' },
  { table: 'announcements', derive: 'SELECT u.university_id FROM users u WHERE u.id = announcements.createdByUser' },
  { table: 'courses', derive: 'SELECT c.university_id FROM classrooms c WHERE c.id = courses.classroomId' },
];

const target = () => {
  const u = new URL(databaseUrl);
  return `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}${u.pathname}`;
};

(async () => {
  const db = new Client({ connectionString: databaseUrl, application_name: 'lms-reconcile-school-ownership' });
  await db.connect();
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const count = async (sql, params) => Number((await one(sql, params)).n);
  try {
    await db.query(changing ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN READ ONLY');
    const tableExists = async (table) => Boolean(await one('SELECT to_regclass($1) AS t', [table]).then((r) => r.t));
    const hasColumn = async (table, column) =>
      Boolean(await one('SELECT 1 AS found FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = lower($1) AND column_name = $2', [table, column]));

    const schools = (await tableExists('universities')) ? (await db.query('SELECT id, name FROM universities ORDER BY id')).rows : [];
    console.log(`Database: ${target()}`);
    console.log(`Schools in this database: ${schools.length}${schools.length ? ' (' + schools.map((s) => `${s.id}: ${s.name}`).join(', ') + ')' : ''}`);
    console.log('');

    const report = [];
    for (const { table, derive } of TABLES) {
      if (!(await tableExists(table))) continue;
      if (!(await hasColumn(table, 'university_id'))) {
        report.push({ table, total: await count(`SELECT COUNT(*) AS n FROM ${table}`), withoutSchool: 'no school column (run npm run db:migrate)', derivable: 0, derive });
        continue;
      }
      const total = await count(`SELECT COUNT(*) AS n FROM ${table}`);
      const withoutSchool = await count(`SELECT COUNT(*) AS n FROM ${table} WHERE university_id IS NULL`);
      const derivable = derive ? await count(`SELECT COUNT(*) AS n FROM ${table} WHERE university_id IS NULL AND (${derive}) IS NOT NULL`) : 0;
      report.push({ table, total, withoutSchool, derivable, derive });
    }
    // Accounts of a school role that have no school cannot use the LMS at all.
    if (await tableExists('users')) {
      const stranded = await count("SELECT COUNT(*) AS n FROM users WHERE university_id IS NULL AND role <> 'superadmin'");
      report.push({ table: 'users (school roles)', total: await count('SELECT COUNT(*) AS n FROM users'), withoutSchool: stranded, derivable: 0, derive: null });
    }

    console.log('Table'.padEnd(26) + 'Rows'.padStart(8) + '  Without school'.padEnd(18) + 'Derivable from a link');
    for (const row of report) {
      console.log(row.table.padEnd(26) + String(row.total).padStart(8) + '  ' + String(row.withoutSchool).padEnd(16) + String(row.derivable));
    }
    console.log('');

    if (!changing) {
      await db.query('ROLLBACK');
      console.log('Report only: nothing was changed.');
      return;
    }

    if (assignSchool !== undefined) {
      if (!schools.some((school) => String(school.id) === String(assignSchool))) {
        await db.query('ROLLBACK');
        console.error(`School ${assignSchool} does not exist in this database. Nothing was changed.`);
        process.exitCode = 1;
        return;
      }
      if (schools.length > 1 && !flag('--i-have-checked')) {
        await db.query('ROLLBACK');
        console.error('This database holds more than one school. Assigning every remaining row to one school could give');
        console.error('one school another school\'s records. Review the rows first; add --i-have-checked to proceed. Nothing was changed.');
        process.exitCode = 1;
        return;
      }
    }

    // Lock and list exactly the rows that will change, and write the undo file before changing any.
    const plan = [];
    for (const row of report) {
      if (typeof row.withoutSchool !== 'number' || !TABLES.some((entry) => entry.table === row.table)) continue;
      const derived = applyDerived && row.derive
        ? (await db.query(`SELECT id FROM ${row.table} WHERE university_id IS NULL AND (${row.derive}) IS NOT NULL ORDER BY id FOR UPDATE`)).rows.map((r) => Number(r.id))
        : [];
      const remaining = assignSchool !== undefined
        ? (await db.query(`SELECT id FROM ${row.table} WHERE university_id IS NULL ORDER BY id FOR UPDATE`)).rows.map((r) => Number(r.id)).filter((id) => !derived.includes(id))
        : [];
      if (derived.length || remaining.length) plan.push({ table: row.table, derive: row.derive, derived, remaining });
    }

    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `pre-school-reconcile.${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
    const undo = [`-- Undo for reconcile-school-ownership on ${target()} at ${new Date().toISOString()}`,
      '-- These rows had no school before the run. Run this file with psql to restore that state.'];
    for (const { table, derived, remaining } of plan) {
      undo.push(`UPDATE ${table} SET university_id = NULL WHERE id IN (${[...derived, ...remaining].join(', ')});`);
    }
    fs.writeFileSync(backupPath, undo.join('\n') + '\n');
    console.log(`Backup written: ${backupPath}`);

    const done = [];
    for (const { table, derive, derived, remaining } of plan) {
      if (derived.length) {
        const result = await db.query(`UPDATE ${table} SET university_id = (${derive}) WHERE id = ANY($1::bigint[])`, [derived]);
        done.push(`${table}: ${result.rowCount} row(s) given the school proven by their link`);
      }
      if (remaining.length) {
        const result = await db.query(`UPDATE ${table} SET university_id = $1 WHERE id = ANY($2::bigint[])`, [assignSchool, remaining]);
        done.push(`${table}: ${result.rowCount} row(s) assigned to school ${assignSchool}`);
      }
    }
    await db.query('COMMIT');
    console.log(done.length ? done.join('\n') : 'No row needed a change.');
    console.log(`To undo: run ${backupPath} against this database (psql -f).`);
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error(`Reconciliation failed, nothing was changed: ${err.message}`);
  process.exit(1);
});
