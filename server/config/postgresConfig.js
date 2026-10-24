'use strict';
/**
 * PostgreSQL connection settings, from the environment only (server/.env). Nothing here has a
 * default user or password: a missing setting stops start-up with a message naming it.
 *
 *   DATABASE_URL=postgres://lms_app:<password>@localhost:5432/lms
 * or the standard libpq variables
 *   PGHOST, PGPORT (5432), PGDATABASE, PGUSER, PGPASSWORD, PGSSLMODE
 *
 * The application connects as a role that can read and write rows only. Creating or changing
 * tables is done by `npm run db:migrate` with DATABASE_MIGRATION_URL (the owning role).
 */

const PLACEHOLDER = /<|>|change[-_]?me|your[-_]?password/i;

function fromUrl(url, variable) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${variable} is not a valid postgres:// URL.`);
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error(`${variable} must start with postgres://`);
  if (PLACEHOLDER.test(decodeURIComponent(parsed.password || ''))) {
    throw new Error(`${variable} still contains a placeholder password. Put the real password in server/.env.`);
  }
  return { connectionString: url };
}

/** Settings for the application's own connections. */
function connectionConfig(env = process.env) {
  if (env.DATABASE_URL) return fromUrl(env.DATABASE_URL, 'DATABASE_URL');
  const missing = ['PGHOST', 'PGDATABASE', 'PGUSER'].filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(
      `PostgreSQL is not configured: set DATABASE_URL, or ${missing.join(', ')} (with PGPASSWORD) in server/.env. ` +
      'See docs/POSTGRESQL.md.'
    );
  }
  if (env.PGPASSWORD && PLACEHOLDER.test(env.PGPASSWORD)) {
    throw new Error('PGPASSWORD still contains a placeholder. Put the real password in server/.env.');
  }
  // host/port/database/user/password/sslmode are read by the pg driver from the PG* variables
  return {};
}

/** Settings for schema changes (migrations, data import): the owning role. */
function migrationConfig(env = process.env) {
  if (env.DATABASE_MIGRATION_URL) return fromUrl(env.DATABASE_MIGRATION_URL, 'DATABASE_MIGRATION_URL');
  return connectionConfig(env);
}

/** "user@host:port/database" for log lines; never includes the password. */
function describeTarget(config, env = process.env) {
  if (config && config.connectionString) {
    const u = new URL(config.connectionString);
    return `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  }
  return `${env.PGUSER}@${env.PGHOST}:${env.PGPORT || 5432}/${env.PGDATABASE}`;
}

module.exports = { connectionConfig, migrationConfig, describeTarget };
