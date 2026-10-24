/**
 * One-time import of an existing SQLite LMS database (server/data/lms_permanent.db) into PostgreSQL.
 *
 *   node scripts/postgres/import-sqlite.js --sqlite <path to .db> [options]
 *
 *   --database-url <url>   target database (default DATABASE_MIGRATION_URL, else DATABASE_URL, from server/.env);
 *                          use the OWNING role: pending schema migrations are applied first
 *   --work-dir <dir>       where the backup copy, the working copy and the report go
 *                          (default server/data/postgres-import-<time>)
 *   --dry-run              do everything, verify everything, then roll back: the target is not changed
 *   --replace              the target already holds rows: empty every LMS table first (in the same transaction)
 *   --null-invalid         store NULL for a value that cannot be converted to its column's type (each one is
 *                          listed in the report) instead of stopping
 *   --skip-upgrade         copy the file as it is, without first bringing a copy up to the current SQLite schema
 *
 * Safety:
 *   - The original file is opened read-only and never written. Its SHA-256 is recorded before and after.
 *   - A consistent copy (SQLite online backup) is written to <work-dir>/backup-<name> before anything else.
 *   - An older database is brought up to the current SQLite schema on a SECOND copy (the legacy SQLite
 *     start-up code adds missing columns and runs the one-time enrolment backfill there), and that copy is
 *     what gets imported.
 *   - Everything in PostgreSQL happens in ONE transaction: copying, moving the id sequences, and verifying
 *     (row counts, a content checksum per table, orphan-relationship counts). Any failure rolls it all back,
 *     so an interrupted import leaves the target exactly as it was; just run it again.
 *   - Values keep their ids, relationships and timestamps (timestamps are text in both databases).
 *   - A value that does not fit its PostgreSQL column stops the import with a precise report.
 *
 * Exit codes: 0 imported (or dry run passed), 1 usage/connection/upgrade error, 2 data or verification problem.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

/* ---------------------------------------------------------------- internal mode: upgrade a SQLite copy */
// Runs the legacy SQLite start-up (config/sqlite-db.js) against LMS_SQLITE_PATH, waits until its schema
// changes and the one-time data migration have finished, then exits. Used on the working copy only.
if (process.argv[2] === '--internal-upgrade-sqlite') {
  process.env.LMS_SQLITE_PATH = process.argv[3];
  delete process.env.SEED_DEMO_DATA;
  const log = console.log;
  console.log = () => {}; // the legacy start-up logs every table it touches
  const db = require(path.join(SERVER_ROOT, 'config', 'sqlite-db'));
  const all = (sql) => new Promise((resolve, reject) => db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))));
  const columns = async (table) => (await all(`PRAGMA table_info("${table}")`)).map((c) => c.name);
  const checks = {
    'core tables': async () => (await all("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users','universities','results','calendar_events','assessment_attempts','student_fee_schedules','payment_orders','live_class_attendance','course_classrooms')")).length === 9,
    'school columns': async () => (await columns('orders')).includes('university_id') && (await columns('expenses')).includes('university_id'),
    'payment columns': async () => ['amountPaise', 'receiptNo', 'recordedBy'].every((c) => paymentColumns.includes(c)),
    'fee schedule columns': async () => (await columns('student_fee_schedules')).includes('totalFeePaise'),
    'enrolment columns': async () => (await columns('course_students')).includes('enrolledViaClassroomId') && (await columns('course_classrooms')).includes('enrollAll'),
    'lecture columns': async () => (await columns('live_classes')).includes('attendanceState'),
    'explicit enrolment migration': async () => (await all('PRAGMA user_version'))[0].user_version >= 1,
  };
  let paymentColumns = [];
  (async () => {
    const deadline = Date.now() + 120000;
    for (;;) {
      paymentColumns = await columns('payments').catch(() => []);
      const pending = [];
      for (const [name, check] of Object.entries(checks)) if (!(await check().catch(() => false))) pending.push(name);
      if (!pending.length) break;
      if (Date.now() > deadline) throw new Error(`the SQLite copy did not reach the current schema: ${pending.join(', ')}`);
      await new Promise((r) => setTimeout(r, 300));
    }
    await new Promise((r) => setTimeout(r, 3000)); // index creation queued behind the last checks
    await new Promise((resolve) => db.close(resolve));
    log('UPGRADED');
    process.exit(0);
  })().catch((err) => {
    log(`UPGRADE FAILED: ${err.message}`);
    process.exit(1);
  });
  return;
}

/* ---------------------------------------------------------------- the import */
if (process.env.LMS_SKIP_DOTENV !== 'true') require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });
const Database = require('better-sqlite3');
const { Client, types } = require('pg');
const { runMigrations } = require(path.join(SERVER_ROOT, 'database', 'postgres', 'migrate'));
const { describeTarget } = require(path.join(SERVER_ROOT, 'config', 'postgresConfig'));

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);
const sourcePath = option('--sqlite');
const targetUrl = option('--database-url') || process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
const dryRun = flag('--dry-run');
const replace = flag('--replace');
const nullInvalid = flag('--null-invalid');
const skipUpgrade = flag('--skip-upgrade');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const workDir = path.resolve(option('--work-dir') || path.join(SERVER_ROOT, 'data', `postgres-import-${stamp}`));

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/postgres/import-sqlite.js --sqlite <path to .db> [--database-url <postgres://owner...>] [--work-dir <dir>] [--dry-run] [--replace] [--null-invalid] [--skip-upgrade]');
  process.exit(1);
}
if (!sourcePath || !fs.existsSync(sourcePath)) usage(sourcePath ? `SQLite file not found: ${sourcePath}` : 'Name the SQLite database with --sqlite.');
if (!targetUrl) usage('No target database: pass --database-url or set DATABASE_MIGRATION_URL / DATABASE_URL in server/.env.');

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const SQLITE_INTERNAL = /^sqlite_/;

/* value conversion, by PostgreSQL column type ------------------------------------------------------ */
const KIND = { bigint: 'int', integer: 'int', smallint: 'int', 'double precision': 'float', real: 'float', numeric: 'float', text: 'text', 'character varying': 'text' };

/** -> { ok: true, value } | { ok: false, why } */
function convert(value, kind) {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (Buffer.isBuffer(value)) return kind === 'text' ? { ok: true, value: value.toString('utf8') } : { ok: false, why: 'binary value' };
  switch (kind) {
    case 'int': {
      if (typeof value === 'bigint') return { ok: true, value: value.toString() };
      if (typeof value === 'number') return Number.isInteger(value) ? { ok: true, value } : { ok: false, why: `fractional number ${value}` };
      const t = String(value).trim();
      if (/^[+-]?\d+$/.test(t)) return { ok: true, value: t };
      if (/^[+-]?\d+\.0*$/.test(t)) return { ok: true, value: t.replace(/\.0*$/, '') };
      if (/^(true|false)$/i.test(t)) return { ok: true, value: /^true$/i.test(t) ? 1 : 0 };
      return { ok: false, why: t === '' ? 'empty text' : 'text that is not a whole number' };
    }
    case 'float': {
      if (typeof value === 'number' || typeof value === 'bigint') return { ok: true, value: Number(value) };
      const t = String(value).trim();
      if (t !== '' && Number.isFinite(Number(t))) return { ok: true, value: Number(t) };
      return { ok: false, why: t === '' ? 'empty text' : 'text that is not a number' };
    }
    default:
      return { ok: true, value: typeof value === 'string' ? value : String(value) };
  }
}

/** Canonical text of a converted value, identical for both sides (used by the content checksum). */
function canonical(value, kind) {
  if (value === null || value === undefined) return '\u0000';
  if (kind === 'int') return BigInt(value).toString();
  if (kind === 'float') return String(Number(value));
  return String(value);
}

/** Order-independent checksum of a table: XOR-free sum of per-row SHA-256 prefixes (mod 2^64) + count. */
function tableChecksum(rows, columns) {
  let sum = 0n;
  for (const row of rows) {
    const text = columns.map((c) => canonical(row[c.name], c.kind)).join('\u0001');
    sum = (sum + BigInt('0x' + crypto.createHash('sha256').update(text).digest('hex').slice(0, 16))) & 0xffffffffffffffffn;
  }
  return `${rows.length}:${sum.toString(16)}`;
}

/* relationships whose orphan counts must be identical before and after ------------------------------- */
const RELATIONS = [
  ['users.university_id -> universities', 'users', 'university_id', 'universities', 'id'],
  ['classrooms.university_id -> universities', 'classrooms', 'university_id', 'universities', 'id'],
  ['student_classroom_assignment.studentId -> users', 'student_classroom_assignment', 'studentId', 'users', 'id'],
  ['student_classroom_assignment.classroomId -> classrooms', 'student_classroom_assignment', 'classroomId', 'classrooms', 'id'],
  ['courses.mentorId -> users', 'courses', 'mentorId', 'users', 'id'],
  ['course_students.courseId -> courses', 'course_students', 'courseId', 'courses', 'id'],
  ['course_students.studentId -> users', 'course_students', 'studentId', 'users', 'id'],
  ['payments.studentId -> users', 'payments', 'studentId', 'users', 'id'],
  ['attendance.studentId -> users', 'attendance', 'studentId', 'users', 'id'],
  ['results.studentId -> users', 'results', 'studentId', 'users', 'id'],
  ['student_fee_schedules.feeStructureId -> feeStructures', 'student_fee_schedules', 'feeStructureId', 'feeStructures', 'id'],
  ['aia_attempts.assessment_id -> aia_assessments', 'aia_attempts', 'assessment_id', 'aia_assessments', 'id'],
  ['aia_questions.assessment_id -> aia_assessments', 'aia_questions', 'assessment_id', 'aia_assessments', 'id'],
];
const orphanSql = ([, t, c, rt, rc], q = (x) => x) =>
  `SELECT COUNT(*) AS n FROM ${q(t)} x WHERE x.${q(c)} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${q(rt)} r WHERE r.${q(rc)} = x.${q(c)})`;

/* ---------------------------------------------------------------- main */
(async () => {
  fs.mkdirSync(workDir, { recursive: true });
  const report = { source: path.resolve(sourcePath), target: describeTarget({ connectionString: targetUrl }), dryRun, startedAt: new Date().toISOString(), tables: {}, conversions: [], textToNumber: {}, warnings: [] };
  const log = (line) => console.log(line);

  // 1. the original: hash, then a consistent backup copy (opened read-only; never written)
  report.sourceSha256Before = sha256File(sourcePath);
  const backupPath = path.join(workDir, `backup-${path.basename(sourcePath)}`);
  {
    const original = new Database(sourcePath, { readonly: true, fileMustExist: true });
    await original.backup(backupPath);
    original.close();
  }
  report.backup = backupPath;
  log(`Backup of the original: ${backupPath}`);

  // 2. the working copy, brought up to the current SQLite schema by the legacy start-up code
  const workPath = path.join(workDir, `work-${path.basename(sourcePath)}`);
  fs.copyFileSync(backupPath, workPath);
  if (!skipUpgrade) {
    const output = await new Promise((resolve) => {
      const child = spawn(process.execPath, [__filename, '--internal-upgrade-sqlite', workPath], { cwd: SERVER_ROOT, env: { ...process.env, LMS_SKIP_DOTENV: 'true', LMS_DISABLE_BACKGROUND_JOBS: 'true' } });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('exit', (code) => resolve({ code, out }));
    });
    if (output.code !== 0 || !/UPGRADED/.test(output.out)) throw Object.assign(new Error(`Could not bring the working copy up to the current SQLite schema:\n${output.out.slice(-1500)}`), { exitCode: 1 });
    log('Working copy brought up to the current SQLite schema (columns added, one-time enrolment backfill applied).');
  }
  const source = new Database(workPath, { readonly: true, fileMustExist: true });
  source.defaultSafeIntegers(true); // 64-bit integers arrive exactly

  // 3. the target: owner connection, raw text values for verification reads
  const target = new Client({ connectionString: targetUrl, application_name: 'lms-sqlite-import', types: { getTypeParser: () => (v) => v } });
  await target.connect();
  try {
    const applied = await runMigrations(target, { log: (m) => log(`schema: ${m}`) });
    if (!applied.length) log('Target schema is up to date.');

    const targetColumns = new Map(); // table -> [{ name, kind, nullable, hasDefault }]
    for (const r of (await target.query(`SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity
                                         FROM information_schema.columns WHERE table_schema = current_schema() ORDER BY table_name, ordinal_position`)).rows) {
      if (r.table_name === 'schema_migrations') continue;
      if (!targetColumns.has(r.table_name)) targetColumns.set(r.table_name, []);
      targetColumns.get(r.table_name).push({ name: r.column_name, kind: KIND[r.data_type] || 'text', nullable: r.is_nullable === 'YES', hasDefault: r.column_default !== null || r.is_identity === 'YES' });
    }
    const identity = new Set((await target.query("SELECT table_name FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'id' AND is_identity = 'YES'")).rows.map((r) => r.table_name));

    await target.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await target.query("SET LOCAL lock_timeout = '10s'");

    // 4. the target must be empty (or emptied on request, inside this transaction)
    const nonEmpty = [];
    for (const table of targetColumns.keys()) {
      if (Number((await target.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n) > 0) nonEmpty.push(table);
    }
    if (nonEmpty.length && !replace) {
      throw Object.assign(new Error(`The target already holds data (${nonEmpty.join(', ')}). Use an empty database, or --replace to empty these tables in the same transaction.`), { exitCode: 2 });
    }
    if (nonEmpty.length) {
      await target.query(`TRUNCATE ${[...targetColumns.keys()].join(', ')}`);
      report.warnings.push(`--replace: emptied ${nonEmpty.length} table(s) before importing: ${nonEmpty.join(', ')}`);
    }

    // 5. copy, table by table
    const sourceTables = source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name).filter((n) => !SQLITE_INTERNAL.test(n));
    const invalid = [];
    const copiedColumns = new Map(); // SQLite table -> the shared columns copied, in copy order
    for (const table of sourceTables) {
      const tKey = table.toLowerCase();
      const srcCols = source.prepare(`PRAGMA table_info("${table}")`).all();
      const total = Number(source.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n);
      if (!targetColumns.has(tKey)) {
        if (total > 0) report.warnings.push(`table ${table} (${total} rows) does not exist in the PostgreSQL schema and was NOT imported`);
        continue;
      }
      const tCols = targetColumns.get(tKey);
      const byName = new Map(tCols.map((c) => [c.name, c]));
      const shared = srcCols.filter((c) => byName.has(c.name.toLowerCase())).map((c) => ({ src: c.name, ...byName.get(c.name.toLowerCase()) }));
      for (const c of srcCols) {
        if (byName.has(c.name.toLowerCase())) continue;
        const filled = Number(source.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE "${c.name}" IS NOT NULL`).get().n);
        if (filled > 0) throw Object.assign(new Error(`column ${table}.${c.name} holds ${filled} value(s) but does not exist in the PostgreSQL schema`), { exitCode: 2 });
      }
      for (const c of tCols) {
        if (!shared.some((s) => s.name === c.name) && !c.nullable && !c.hasDefault && total > 0) {
          throw Object.assign(new Error(`column ${tKey}.${c.name} is required in PostgreSQL but missing from the SQLite table`), { exitCode: 2 });
        }
      }
      const pk = srcCols.filter((c) => c.pk).sort((a, b) => a.pk - b.pk).map((c) => `"${c.name}"`);
      const order = pk.length ? pk.join(', ') : 'rowid';
      const rows = source.prepare(`SELECT ${shared.map((c) => `"${c.src}"`).join(', ')} FROM "${table}" ORDER BY ${order}`).all();
      const converted = [];
      for (const [i, row] of rows.entries()) {
        const out = {};
        for (const c of shared) {
          const r = convert(row[c.src], c.kind);
          if (r.ok) {
            out[c.name] = r.value;
            // numbers stored as text in SQLite (it accepts anything in any column): counted per column
            if (typeof row[c.src] === 'string' && c.kind !== 'text') {
              const key = `${table}.${c.src}`;
              report.textToNumber[key] = (report.textToNumber[key] || 0) + 1;
            }
            continue;
          }
          const where = `${table}.${c.src} (row ${i + 1}${row.id !== undefined ? `, id ${row.id}` : ''}): ${r.why}`;
          if (nullInvalid && c.nullable) {
            out[c.name] = null;
            report.conversions.push(`${where} -> stored as NULL`);
          } else {
            invalid.push(where);
            out[c.name] = null;
          }
        }
        converted.push(out);
      }
      // insert in chunks (PostgreSQL allows 65535 parameters per statement)
      const perRow = shared.length;
      const chunk = Math.max(1, Math.floor(60000 / Math.max(1, perRow)));
      for (let start = 0; start < converted.length && !invalid.length; start += chunk) {
        const part = converted.slice(start, start + chunk);
        const params = [];
        const tuples = part.map((r) => `(${shared.map((c) => { params.push(r[c.name]); return `$${params.length}`; }).join(', ')})`);
        const cols = shared.map((c) => (c.name === 'order' ? '"order"' : c.name)).join(', ');
        await target.query(`INSERT INTO ${tKey} (${cols}) OVERRIDING SYSTEM VALUE VALUES ${tuples.join(', ')}`, params);
      }
      report.tables[table] = { sourceRows: total, columns: shared.length, sourceChecksum: tableChecksum(converted, shared) };
      copiedColumns.set(table, shared); // the verification reads exactly these columns, in this order
      log(`  ${table.padEnd(34)} ${String(total).padStart(8)} rows`);
    }
    if (invalid.length) {
      fs.writeFileSync(path.join(workDir, 'invalid-values.txt'), invalid.join('\n') + '\n');
      throw Object.assign(new Error(`${invalid.length} value(s) do not fit their PostgreSQL column; nothing was imported. See ${path.join(workDir, 'invalid-values.txt')} (or rerun with --null-invalid).`), { exitCode: 2 });
    }

    // 6. id sequences continue after the imported ids
    for (const table of identity) {
      await target.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`, [table]);
    }

    // 7. verification, inside the transaction: counts, content checksums, orphan counts
    const problems = [];
    for (const [table, info] of Object.entries(report.tables)) {
      const tKey = table.toLowerCase();
      const shared = copiedColumns.get(table);
      const rows = (await target.query(`SELECT ${shared.map((c) => (c.name === 'order' ? '"order"' : c.name)).join(', ')} FROM ${tKey}`)).rows;
      info.targetRows = rows.length;
      info.targetChecksum = tableChecksum(rows, shared);
      if (info.targetRows !== info.sourceRows) problems.push(`${table}: ${info.sourceRows} rows in SQLite, ${info.targetRows} in PostgreSQL`);
      else if (info.targetChecksum !== info.sourceChecksum) problems.push(`${table}: content checksum differs`);
    }
    report.relationships = {};
    for (const rel of RELATIONS) {
      const [name, t, , rt] = rel;
      const has = (n) => sourceTables.includes(n);
      if (!has(t) || !has(rt)) continue;
      const before = Number(source.prepare(orphanSql(rel, (x) => `"${x}"`)).get().n);
      const after = Number((await target.query(orphanSql(rel))).rows[0].n);
      report.relationships[name] = { orphansInSQLite: before, orphansInPostgreSQL: after };
      if (before !== after) problems.push(`${name}: ${before} orphan(s) in SQLite, ${after} in PostgreSQL`);
      if (before > 0) report.warnings.push(`${name}: ${before} row(s) refer to a missing record (already so in SQLite; imported as they were)`);
    }
    // representative records: first and last user, first and last payment
    report.samples = {};
    for (const table of ['users', 'payments', 'courses']) {
      if (!report.tables[table] || !report.tables[table].sourceRows) continue;
      const s = source.prepare(`SELECT id FROM "${table}" ORDER BY id`).all().map((r) => String(r.id));
      for (const id of [s[0], s[s.length - 1]]) {
        const a = source.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(BigInt(id));
        const b = (await target.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];
        const same = b && Object.entries(a).every(([k, v]) => {
          const col = targetColumns.get(table).find((c) => c.name === k.toLowerCase());
          if (!col) return true;
          const conv = convert(v, col.kind);
          return canonical(conv.value, col.kind) === canonical(b[k.toLowerCase()], col.kind);
        });
        report.samples[`${table}#${id}`] = same ? 'identical' : 'DIFFERENT';
        if (!same) problems.push(`${table} id ${id}: the imported row differs from the source row`);
      }
    }
    if (problems.length) {
      report.problems = problems;
      throw Object.assign(new Error(`Verification failed, nothing was imported:\n - ${problems.join('\n - ')}`), { exitCode: 2 });
    }

    if (dryRun) {
      await target.query('ROLLBACK');
      log('Dry run: everything copied and verified, then rolled back. The target was not changed.');
    } else {
      await target.query('COMMIT');
      log('Imported and verified (row counts, content checksums, relationships, sample records). Committed.');
    }
    report.result = dryRun ? 'dry-run-verified' : 'imported';
  } catch (err) {
    await target.query('ROLLBACK').catch(() => {});
    report.result = 'failed';
    report.error = err.message;
    throw err;
  } finally {
    source.close();
    await target.end();
    report.sourceSha256After = sha256File(sourcePath);
    report.sourceUnchanged = report.sourceSha256After === report.sourceSha256Before;
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(workDir, 'import-report.json'), JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    console.log(`Report: ${path.join(workDir, 'import-report.json')}`);
    console.log(`Original file unchanged: ${report.sourceUnchanged ? 'yes' : 'NO'} (sha256 ${report.sourceSha256Before.slice(0, 16)}...)`);
    for (const w of report.warnings) console.log(`Warning: ${w}`);
  }
})().catch((err) => {
  console.error(`Import stopped: ${err.message.replace(/postgres(ql)?:\/\/[^@\s]*@/g, 'postgres://***@')}`);
  process.exit(err.exitCode || 1);
});
