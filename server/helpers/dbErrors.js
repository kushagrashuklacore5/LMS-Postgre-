/**
 * The database errors the code reacts to, by PostgreSQL SQLSTATE code
 * (https://www.postgresql.org/docs/current/errcodes-appendix.html).
 */
const codeOf = (err) => (err && typeof err.code === 'string' ? err.code : '');

/** A UNIQUE constraint or unique index rejected the row. */
const isUniqueViolation = (err) => codeOf(err) === '23505';

/** Any integrity constraint (unique, not null, check, foreign key) rejected the change. */
const isConstraintViolation = (err) => codeOf(err).startsWith('23');

/** The table does not exist in this database. */
const isUndefinedTable = (err) => codeOf(err) === '42P01';

/** A concurrent transaction got in the way (serialization failure, deadlock, lock timeout): safe to retry. */
const isRetryableConflict = (err) => ['40001', '40P01', '55P03'].includes(codeOf(err));

module.exports = { isUniqueViolation, isConstraintViolation, isUndefinedTable, isRetryableConflict };
