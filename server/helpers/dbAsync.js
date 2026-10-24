const db = require('../config/database-switch');

/* ================= PROMISE WRAPPERS ================= */
// Called from inside withTransaction (however deep), these run in that transaction.
const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

/* ================= TRANSACTIONS ================= */
// work() runs inside one exclusive transaction: one writer transaction at a time across all
// server processes, as with SQLite's BEGIN IMMEDIATE. Every statement issued while it runs,
// through any helper, uses that transaction. It commits when work() resolves and rolls back
// when it throws. Called again from inside a transaction, it joins the one already open.
const withTransaction = (work) => db.transaction(() => work(), { exclusive: true });

// work() runs in one transaction that is serialised only with other transactions using the same key
// (a transaction-scoped PostgreSQL advisory lock), e.g. "attendance:<class>:<date>": two teachers saving
// different classes no longer wait for each other, two saves of the same register still cannot interleave.
// Waits at most LMS_DB_LOCK_TIMEOUT_MS (default 5 s) for the lock, then fails instead of piling up.
const withKeyedTransaction = (key, work) =>
  db.transaction(async () => {
    const timeoutMs = Math.max(1, Math.floor(Number(process.env.LMS_DB_LOCK_TIMEOUT_MS) || 5000));
    await run(`SELECT set_config('lock_timeout', ?, true)`, [`${timeoutMs}ms`]);
    await run('SELECT pg_advisory_xact_lock(hashtext(?))', [String(key)]);
    return work();
  });

// The database interface handed to the AI modules (ai-modules/*): ? placeholders, promises.
const moduleDatabase = Object.freeze({ get, all, run, transaction: withTransaction });

module.exports = { get, all, run, withTransaction, withKeyedTransaction, moduleDatabase };
