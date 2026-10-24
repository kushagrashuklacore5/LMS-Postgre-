const db = require('../config/database-switch');
const { isRetryableConflict, isConstraintViolation } = require('../helpers/dbErrors');

/**
 * Transaction isolation for payment reads and writes.
 *
 * Payment work runs in its own PostgreSQL transaction on one pooled connection, so it never
 * captures or undoes another request's statements:
 *
 *  - withWriteTransaction: an "exclusive" transaction (config/pg-db.js). Payment writes, and the
 *    other LMS writer transactions, run one at a time across every server process, so two
 *    payments for the same student can never both read the same balance and both allocate it.
 *    Waiting for that turn gives up after LMS_DB_LOCK_TIMEOUT_MS (5 s) with a "busy" error.
 *  - withReadConnection: one consistent snapshot of committed data (REPEATABLE READ, read only).
 *
 * The callback receives { get, all, run } returning promises, and is awaited.
 * The first argument (the request's database) is accepted for compatibility and not needed.
 */

const BUSY_TIMEOUT_MS = Number(process.env.LMS_DB_LOCK_TIMEOUT_MS) || 5000;

/** A concurrent transaction held the payment lock for too long, or a deadlock was broken: retryable. */
const isBusyError = (err) => isRetryableConflict(err);
/** A unique / not-null / check constraint rejected the payment row (e.g. a repeated idempotency key). */
const isConstraintError = (err) => isConstraintViolation(err);

/** Runs fn(q) inside one exclusive transaction; rolls back (only its own work) if fn throws. */
function withWriteTransaction(_database, fn) {
  return db.transaction((tx) => fn(tx), { exclusive: true });
}

/** Runs fn(q) on a consistent read-only snapshot of committed data. */
function withReadConnection(_database, fn) {
  return db.transaction((tx) => fn(tx), { readOnlySnapshot: true });
}

module.exports = { withWriteTransaction, withReadConnection, isBusyError, isConstraintError, BUSY_TIMEOUT_MS };
