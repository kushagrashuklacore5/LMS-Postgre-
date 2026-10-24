/**
 * Shared fixture for the Phase 2C test suites.
 *
 * Builds an EMPTY, isolated SQLite file whose tables and indexes are cloned from
 * the real project schema, so a query that references a column the real database
 * does not have fails in tests exactly as it would in the running server.
 *
 * The project database is opened READ-ONLY and only its schema (sqlite_master)
 * is read: no rows are copied and nothing is ever written to it. The test file
 * lives in the OS temp directory and is deleted by cleanup().
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3');
const Database = require('better-sqlite3');

const PROJECT_DB_PATH = path.join(__dirname, '../data/lms_permanent.db');
const REQUIRED_TABLES = ['users', 'payments', 'payment_orders', 'feeStructures', 'student_fee_schedules', 'student_classroom_assignment', 'classrooms'];

function readRealSchema() {
  const source = new Database(PROJECT_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    return source.prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
       ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`
    ).all();
  } finally {
    source.close();
  }
}

/** Creates the isolated database file and returns { dbPath, db (async sqlite3 handle), columns(table), cleanup() }. */
async function createIsolatedDb(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  const dbPath = path.join(dir, 'isolated-test.db');
  if (path.resolve(dbPath) === path.resolve(PROJECT_DB_PATH)) {
    throw new Error('Refusing to run: test database path resolves to the project database.');
  }

  const builder = new Database(dbPath);
  builder.pragma('foreign_keys = OFF'); // same as the app's connections (see paymentDb.js)
  const skipped = [];
  for (const object of readRealSchema()) {
    try {
      builder.exec(object.sql);
    } catch (e) {
      skipped.push(`${object.type} ${object.name}: ${e.message}`);
    }
  }
  const created = builder.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map(r => r.name);
  const columnsOf = Object.fromEntries(created.map(t => [t, builder.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name)]));
  builder.close();

  const missing = REQUIRED_TABLES.filter(t => !created.includes(t));
  if (missing.length > 0) {
    throw new Error(`Real schema is missing tables the payment code needs: ${missing.join(', ')}. Skipped: ${skipped.join(' | ')}`);
  }

  const db = new sqlite3.Database(dbPath);
  await run(db, 'PRAGMA foreign_keys = OFF');
  return {
    dbPath,
    db,
    columns: (table) => columnsOf[table] || [],
    cleanup: async () => {
      await new Promise(resolve => db.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}

/** INSERT a row from a plain object (column -> value). */
function insert(db, table, row) {
  const cols = Object.keys(row);
  return run(db, `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map(c => row[c]));
}

const user = (id, role, universityId, name = `Test ${role} ${id}`) =>
  ({ id, name, email: `user${id}@phase2c.test`, password: 'not-a-real-hash', role, university_id: universityId });

const feeStructure = (id, universityId, category, totalFee, extra = {}) => ({
  id, university_id: universityId, category, grade: `TEST-${id}`,
  tuitionFee: totalFee, transportFee: 0, computerLabFee: 0, libraryFee: 0, sportsFee: 0, examinationFee: 0, miscellaneousFee: 0,
  totalFee, dueDate: '2099-12-31', ...extra
});

/** Order-independent fingerprint of every row in the financial tables, to prove a request wrote nothing. */
async function financialSnapshot(db) {
  const snapshot = {};
  for (const table of ['payments', 'student_fee_schedules', 'payment_orders', 'feeStructures']) {
    snapshot[table] = JSON.stringify(await all(db, `SELECT * FROM ${table} ORDER BY id`));
  }
  return JSON.stringify(snapshot);
}

function signToken(secret, claims) {
  return jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: '1h' });
}

function request(server, method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: urlPath, method, headers }, (res) => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { /* non-JSON body */ }
        resolve({ statusCode: res.statusCode, body: parsed, rawBody: raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { PROJECT_DB_PATH, createIsolatedDb, run, all, get, insert, user, feeStructure, financialSnapshot, signToken, request };
