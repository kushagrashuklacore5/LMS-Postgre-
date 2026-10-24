const db = require('../config/database-switch');

const stmt = `INSERT INTO announcements (title, message, publishFor, courseId, createdByUser, createdByRole, readBy) VALUES (?, ?, ?, ?, ?, ?, ?)`;
const params = ['Direct insert test', 'Inserted directly into DB', 'students', null, 1, 'admin', JSON.stringify([])];

db.run(stmt, params, function(err) {
  if (err) {
    console.error('Insert error:', err);
    process.exit(1);
  }
  console.log('Inserted ID:', this.lastID);
  process.exit(0);
});
