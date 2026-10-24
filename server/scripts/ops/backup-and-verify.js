/**
 * Makes a backup of the LMS database and proves the backup can be restored.
 *
 *   node scripts/ops/backup-and-verify.js --out <backup folder> [--database-url <postgres://...>]
 *                                         [--verify-url <postgres://role-that-may-create-databases@host/postgres>]
 *
 *   --database-url  the database to back up; default DATABASE_MIGRATION_URL, else DATABASE_URL (server/.env)
 *   --verify-url    a connection that may CREATE DATABASE (default LMS_BACKUP_VERIFY_URL). With it the backup is
 *                   restored into a temporary database, checked and dropped again. Without it only the archive
 *                   itself is checked, and the output says that the restore was NOT tested.
 *
 * Steps:
 *   1. Row counts of every table, then pg_dump in custom format (a consistent snapshot; safe while the
 *      server is running; the source is never changed).
 *   2. pg_restore --list must read the archive and find the data of every table.
 *   3. With a verify connection: restore into lms_backup_verify_<random>, compare every table's row count
 *      (rows written between count and dump may add to a table, never remove), drop that database.
 *   4. Prints the backup path and exits 0 only when every check passed.
 *
 * pg_dump / pg_restore come with PostgreSQL; put its bin folder on PATH or set PG_BIN.
 * A backup that has not been restored and checked is only a hope. Run this from a scheduled task,
 * keep the files off the server, and copy the uploads folder with the same timestamp.
 * To restore: stop the server, create an empty database owned by the LMS owner role,
 *   pg_restore --no-owner --role=lms_owner -d <that database> <backup file>, point DATABASE_URL at it,
 *   start the server, check /health/ready.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

if (process.env.LMS_SKIP_DOTENV !== 'true') require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const outDir = option('--out');
const databaseUrl = option('--database-url') || process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
const verifyUrl = option('--verify-url') || process.env.LMS_BACKUP_VERIFY_URL;
if (!outDir || !databaseUrl) {
  console.error('Usage: node scripts/ops/backup-and-verify.js --out <backup folder> [--database-url <postgres://...>] [--verify-url <postgres://...>]');
  process.exit(1);
}

const tool = (name) => {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return process.env.PG_BIN ? path.join(process.env.PG_BIN, exe) : exe;
};
const describe = (url) => {
  const u = new URL(url);
  return `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}${u.pathname}`;
};
const withDatabase = (url, database) => {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
};

async function rowCounts(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = (await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY 1"
    )).rows.map((r) => r.table_name);
    const counts = {};
    for (const table of tables) counts[table] = Number((await client.query(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    await client.query('COMMIT');
    return counts;
  } finally {
    await client.end();
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const source = new URL(databaseUrl).pathname.slice(1) || 'lms';
  const backupPath = path.resolve(outDir, `${source}-${stamp}.dump`);

  const expected = await rowCounts(databaseUrl);
  execFileSync(tool('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', `--file=${backupPath}`, `--dbname=${databaseUrl}`], { stdio: ['ignore', 'pipe', 'pipe'] });

  const problems = [];
  // The archive must be readable and carry the data of every table
  const listing = execFileSync(tool('pg_restore'), ['--list', backupPath], { encoding: 'utf8' });
  for (const table of Object.keys(expected)) {
    if (!new RegExp(`TABLE DATA \\S+ ${table}(\\s|$)`, 'm').test(listing)) problems.push(`table ${table}: no data in the archive`);
  }

  let restoreChecked = false;
  if (verifyUrl && !problems.length) {
    const scratch = `lms_backup_verify_${crypto.randomBytes(5).toString('hex')}`;
    const admin = new Client({ connectionString: verifyUrl });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${scratch}`);
      const scratchUrl = withDatabase(verifyUrl, scratch);
      execFileSync(tool('pg_restore'), ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${scratchUrl}`, backupPath], { stdio: ['ignore', 'pipe', 'pipe'] });
      const actual = await rowCounts(scratchUrl);
      for (const table of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
        if (actual[table] === undefined || actual[table] < expected[table]) {
          problems.push(`table ${table}: expected at least ${expected[table]} rows, restored backup has ${actual[table] ?? 'no table'}`);
        }
      }
      restoreChecked = true;
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`).catch(() => {});
      await admin.end();
    }
  }

  const totalRows = Object.values(expected).reduce((sum, n) => sum + n, 0);
  console.log(`Backup: ${backupPath}`);
  console.log(`Source: ${describe(databaseUrl)} | size: ${fs.statSync(backupPath).size} bytes | tables: ${Object.keys(expected).length} | rows: ${totalRows}`);
  if (problems.length) {
    console.error('BACKUP NOT VERIFIED:');
    problems.forEach((problem) => console.error(` - ${problem}`));
    process.exit(2);
  }
  console.log(restoreChecked
    ? 'Verified: the backup restores into a fresh database with every table and row.'
    : 'Archive checked (every table\'s data is in it), but the restore was NOT tested: pass --verify-url to prove it.');
})().catch((err) => {
  const detail = err.stderr ? String(err.stderr).trim() : err.message;
  console.error('Backup failed:', detail.replace(/postgres(ql)?:\/\/[^@\s]*@/g, 'postgres://***@'));
  process.exit(1);
});
