const path = require('path');

/**
 * Single source of truth for the SQLite file the LMS and its AI modules open.
 *
 * LMS_SQLITE_PATH lets the automated tests (and a staging copy) run against a
 * separate file, so they can never open the school database by accident.
 */
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'lms_permanent.db');

const DB_PATH = process.env.LMS_SQLITE_PATH
  ? path.resolve(process.env.LMS_SQLITE_PATH)
  : DEFAULT_DB_PATH;

module.exports = { DB_PATH, DEFAULT_DB_PATH };
