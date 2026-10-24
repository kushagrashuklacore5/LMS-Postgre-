/**
 * Throw-away PostgreSQL databases for the test suites (the server's and the AI modules').
 *
 * Tests need a PostgreSQL server where they may create and drop databases. Point
 * LMS_TEST_DATABASE_ADMIN_URL at it, for example
 *   LMS_TEST_DATABASE_ADMIN_URL=postgres://lms_test_admin:<password>@127.0.0.1:5432/postgres
 * Every database made here is called lms_test_<random> and is dropped afterwards; nothing else
 * on that server is touched. Never point this at a server that holds school data.
 *
 * A migrated database is a copy of lms_test_template_<schema checksum>, which is migrated once
 * (and kept for later runs; a schema change gives a new template name), so each test gets its own
 * fresh database in a fraction of a second.
 */
const crypto = require('crypto');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const { Client } = require(path.join(SERVER_ROOT, 'node_modules', 'pg'));
const { runMigrations, listMigrations } = require(path.join(SERVER_ROOT, 'database', 'postgres', 'migrate'));

const ADMIN_URL_VARIABLE = 'LMS_TEST_DATABASE_ADMIN_URL';
const TEMPLATE_LOCK = 728_301_457;

function adminUrl() {
  const url = process.env[ADMIN_URL_VARIABLE];
  if (!url) {
    throw new Error(
      `Tests need a PostgreSQL server to create throw-away databases on. Set ${ADMIN_URL_VARIABLE} ` +
      '(see server/tests/helpers/pgTestDatabase.js and docs/POSTGRESQL.md).'
    );
  }
  return url;
}

function urlFor(database) {
  const url = new URL(adminUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

async function withAdmin(work) {
  const client = new Client({ connectionString: adminUrl() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

let templateName = null;

/** Name of the migrated template database for the current migration files (created once). */
async function migratedTemplate() {
  if (templateName) return templateName;
  const checksum = crypto.createHash('sha256').update(listMigrations().map((m) => m.checksum).join(',')).digest('hex').slice(0, 12);
  const name = `lms_test_template_${checksum}`;
  await withAdmin(async (admin) => {
    await admin.query('SELECT pg_advisory_lock($1)', [TEMPLATE_LOCK]); // parallel test files wait for one creator
    try {
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (exists.rowCount) return;
      const building = `${name}_building_${process.pid}`;
      await admin.query(`DROP DATABASE IF EXISTS ${building}`);
      await admin.query(`CREATE DATABASE ${building}`);
      const client = new Client({ connectionString: urlFor(building) });
      await client.connect();
      try {
        await runMigrations(client, { log: () => {} });
      } finally {
        await client.end();
      }
      await admin.query(`ALTER DATABASE ${building} RENAME TO ${name}`);
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1)', [TEMPLATE_LOCK]);
    }
  });
  templateName = name;
  return name;
}

/**
 * Creates lms_test_<random>: a copy of the migrated template, or empty with { migrate: false }.
 * @returns {Promise<{ name: string, url: string, query: Function, drop: Function }>}
 */
async function createTestDatabase({ migrate = true } = {}) {
  const name = `lms_test_${crypto.randomBytes(6).toString('hex')}`;
  const template = migrate ? await migratedTemplate() : null;
  await withAdmin((admin) => admin.query(template ? `CREATE DATABASE ${name} TEMPLATE ${template}` : `CREATE DATABASE ${name}`));
  const url = urlFor(name);

  /** One statement on a fresh connection; returns the rows. */
  const query = async (sql, params = []) => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      return (await client.query(sql, params)).rows;
    } finally {
      await client.end();
    }
  };

  const drop = () => withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)).catch(() => {});

  return { name, url, query, drop };
}

module.exports = { createTestDatabase, ADMIN_URL_VARIABLE };
