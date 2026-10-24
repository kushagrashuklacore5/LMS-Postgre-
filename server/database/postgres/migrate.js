'use strict';
/**
 * PostgreSQL schema migrations: the numbered .sql files in ./migrations, applied in order,
 * each in its own transaction, and recorded in schema_migrations with a checksum.
 *
 *   npm run db:migrate          apply pending migrations (uses DATABASE_MIGRATION_URL, the owning role)
 *   npm run db:migrate -- --status
 *
 * The server never changes the schema itself: at start-up it only checks that every migration
 * has been applied (assertSchemaCurrent) and refuses to start otherwise.
 * An applied migration must never be edited; add a new numbered file instead.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_KEY = 728_301_455; // pg_advisory_lock id for "LMS schema migration"

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      return { version: file.slice(0, 3), file, sql, checksum: crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex') };
    });
}

async function appliedMigrations(client) {
  const exists = await client.query("SELECT to_regclass('schema_migrations') AS t");
  if (!exists.rows[0].t) return null;
  const { rows } = await client.query('SELECT version, file, checksum FROM schema_migrations ORDER BY version');
  return new Map(rows.map((r) => [r.version, r]));
}

function compare(all, applied) {
  const pending = [];
  const changed = [];
  for (const m of all) {
    const done = applied && applied.get(m.version);
    if (!done) pending.push(m);
    else if (done.checksum !== m.checksum) changed.push(m.file);
  }
  return { pending, changed };
}

/** Throws unless every migration file has been applied unchanged. Used at server start-up. */
async function assertSchemaCurrent(client) {
  const applied = await appliedMigrations(client);
  if (!applied) {
    throw new Error('The PostgreSQL database has no LMS schema yet. Run `npm run db:migrate` in server/ first (see docs/POSTGRESQL.md).');
  }
  const { pending, changed } = compare(listMigrations(), applied);
  if (changed.length) throw new Error(`Applied migration files were edited afterwards: ${changed.join(', ')}. Restore them and add a new migration instead.`);
  if (pending.length) throw new Error(`The database schema is out of date (pending: ${pending.map((m) => m.file).join(', ')}). Run \`npm run db:migrate\` in server/.`);
}

/** Applies pending migrations. `client` must be a single connection (pg.Client or a pooled client). */
async function runMigrations(client, { log = console.log } = {}) {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      file TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const { pending, changed } = compare(listMigrations(), await appliedMigrations(client));
    if (changed.length) throw new Error(`Applied migration files were edited afterwards: ${changed.join(', ')}`);
    for (const m of pending) {
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version, file, checksum) VALUES ($1, $2, $3)', [m.version, m.file, m.checksum]);
        await client.query('COMMIT');
        log(`applied ${m.file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${m.file} failed and was rolled back: ${err.message}`);
      }
    }
    return pending.map((m) => m.file);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
  }
}

/** Every table and column name as spelled in the migration files (camelCase kept). */
function schemaColumnNames() {
  const names = new Set();
  for (const { sql } of listMigrations()) {
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([A-Za-z_]\w*)/g)) names.add(m[1]);
    for (const m of sql.matchAll(/^\s+([A-Za-z_]\w*) (?:BIGINT|TEXT|SMALLINT|DOUBLE PRECISION|NUMERIC|INTEGER)\b/gm)) names.add(m[1]);
    for (const m of sql.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([A-Za-z_]\w*)/g)) names.add(m[1]);
  }
  return names;
}

module.exports = { listMigrations, runMigrations, assertSchemaCurrent, schemaColumnNames, MIGRATIONS_DIR };

if (require.main === module) {
  if (process.env.LMS_SKIP_DOTENV !== 'true') require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  const { Client } = require('pg');
  const { migrationConfig, describeTarget } = require('../../config/postgresConfig');
  (async () => {
    const config = migrationConfig();
    const client = new Client(config);
    await client.connect();
    try {
      if (process.argv.includes('--status')) {
        const { pending, changed } = compare(listMigrations(), await appliedMigrations(client));
        console.log(`${describeTarget(config)}: ${pending.length ? `pending ${pending.map((m) => m.file).join(', ')}` : 'up to date'}${changed.length ? `; EDITED after applying: ${changed.join(', ')}` : ''}`);
        process.exitCode = pending.length || changed.length ? 1 : 0;
        return;
      }
      const applied = await runMigrations(client);
      console.log(applied.length ? `${describeTarget(config)}: ${applied.length} migration(s) applied` : `${describeTarget(config)}: already up to date`);
    } finally {
      await client.end();
    }
  })().catch((err) => {
    console.error(`Migration failed: ${err.message}`);
    process.exit(1);
  });
}
