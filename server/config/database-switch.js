// Database used by the LMS core: PostgreSQL (config/pg-db.js). There is no SQLite fallback;
// a missing or unreachable database stops start-up with a message saying what to fix.
module.exports = require('./pg-db');
