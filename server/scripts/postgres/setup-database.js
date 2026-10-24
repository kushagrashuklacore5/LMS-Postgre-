/**
 * One-time PostgreSQL set-up for the LMS: two roles and one database, least privilege.
 *
 *   LMS_OWNER_PASSWORD=... LMS_APP_PASSWORD=... \
 *     node scripts/postgres/setup-database.js --admin-url postgres://postgres@localhost:5432/postgres [--database lms]
 *
 *   --admin-url      a superuser connection (the "postgres" account and the password chosen when
 *                    PostgreSQL was installed). Used for this set-up only; the LMS never uses it.
 *                    The password may also come from PGPASSWORD instead of the URL.
 *   --database       database name (default lms)
 *   --owner-role / --app-role   role names (default lms_owner / lms_app)
 *   --reset-passwords           set the passwords of roles that already exist
 *
 * Creates (or leaves as they are, when they already exist):
 *   lms_owner  LOGIN, owns the database and its tables. Used ONLY for `npm run db:migrate` and the
 *              SQLite import (DATABASE_MIGRATION_URL). Not a superuser; cannot create databases or roles.
 *   lms_app    LOGIN, what the server runs as (DATABASE_URL): may read and write rows and use the id
 *              sequences, nothing else (no CREATE, ALTER, DROP or TRUNCATE).
 *   <database> owned by lms_owner; PUBLIC may not connect; default privileges give lms_app access to
 *              every table and sequence lms_owner creates later.
 *
 * The two passwords are taken from LMS_OWNER_PASSWORD and LMS_APP_PASSWORD (at least 16 characters each,
 * different from each other). They are never printed, logged or written anywhere by this script.
 */
'use strict';
const { Client } = require('pg');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const adminUrl = option('--admin-url');
const database = option('--database', 'lms');
const ownerRole = option('--owner-role', 'lms_owner');
const appRole = option('--app-role', 'lms_app');
const resetPasswords = args.includes('--reset-passwords');
const ownerPassword = process.env.LMS_OWNER_PASSWORD;
const appPassword = process.env.LMS_APP_PASSWORD;

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const fail = (message) => { console.error(message); process.exit(1); };
if (!adminUrl) fail('Usage: LMS_OWNER_PASSWORD=... LMS_APP_PASSWORD=... node scripts/postgres/setup-database.js --admin-url postgres://postgres@localhost:5432/postgres [--database lms]');
for (const [label, value] of [['database', database], ['owner role', ownerRole], ['app role', appRole]]) {
  if (!IDENT.test(value)) fail(`The ${label} name must be lower-case letters, digits and _ (got "${value}").`);
}
for (const [variable, value] of [['LMS_OWNER_PASSWORD', ownerPassword], ['LMS_APP_PASSWORD', appPassword]]) {
  if (!value || value.length < 16) fail(`Set ${variable} to a password of at least 16 characters (it is never printed).`);
}
if (ownerPassword === appPassword) fail('LMS_OWNER_PASSWORD and LMS_APP_PASSWORD must be different.');

const withDatabase = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.toString(); };
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`; // CREATE/ALTER ROLE cannot take parameters

async function ensureRole(admin, role, password) {
  const exists = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount > 0;
  if (!exists) {
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${literal(password)}`);
    console.log(`created role ${role}`);
  } else if (resetPasswords) {
    await admin.query(`ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${literal(password)}`);
    console.log(`role ${role} exists: password reset`);
  } else {
    await admin.query(`ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    console.log(`role ${role} exists: password left as it is (use --reset-passwords to change it)`);
  }
}

(async () => {
  const admin = new Client({ connectionString: adminUrl, application_name: 'lms-setup' });
  await admin.connect();
  try {
    const me = (await admin.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user')).rows[0];
    if (!me || !me.rolsuper) fail('--admin-url must connect as a superuser (for example the "postgres" account).');
    await ensureRole(admin, ownerRole, ownerPassword);
    await ensureRole(admin, appRole, appPassword);
    if ((await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount === 0) {
      await admin.query(`CREATE DATABASE ${database} OWNER ${ownerRole} ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`created database ${database} owned by ${ownerRole}`);
    } else {
      await admin.query(`ALTER DATABASE ${database} OWNER TO ${ownerRole}`);
      console.log(`database ${database} exists: owner set to ${ownerRole}`);
    }
    await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${database} TO ${ownerRole}`);
    await admin.query(`GRANT CONNECT ON DATABASE ${database} TO ${appRole}`);
  } finally {
    await admin.end();
  }

  // Inside the database: schema rights and default privileges for the tables the owner will create
  const inDb = new Client({ connectionString: withDatabase(adminUrl, database), application_name: 'lms-setup' });
  await inDb.connect();
  try {
    await inDb.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await inDb.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${ownerRole}`);
    await inDb.query(`GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await inDb.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appRole}`);
    await inDb.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ownerRole} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${appRole}`);
    // tables that already exist (set-up run again after migrations)
    await inDb.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`);
    await inDb.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`);
  } finally {
    await inDb.end();
  }

  const u = new URL(adminUrl);
  const hostPort = `${u.hostname}:${u.port || 5432}`;
  console.log('\nDone. Put these in server/.env (with the passwords you chose):');
  console.log(`  DATABASE_URL=postgres://${appRole}:<LMS_APP_PASSWORD>@${hostPort}/${database}`);
  console.log(`  DATABASE_MIGRATION_URL=postgres://${ownerRole}:<LMS_OWNER_PASSWORD>@${hostPort}/${database}`);
  console.log('Then: npm run db:migrate   (creates the tables as the owner)');
})().catch((err) => {
  console.error(`Set-up failed: ${err.message.replace(/postgres(ql)?:\/\/[^@\s]*@/g, 'postgres://***@')}`);
  process.exit(1);
});
