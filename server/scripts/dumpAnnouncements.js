const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) return console.error('Failed to open DB:', err.message);
});

db.all('SELECT id, title, content, publishFor, courseId, createdByUser, createdByRole, readBy, createdAt FROM announcements ORDER BY createdAt DESC', [], (err, rows) => {
  if (err) {
    console.error('Error querying announcements:', err.message);
    process.exit(1);
  }

  console.log('Announcements:');
  rows.forEach(r => {
    try { r.readBy = JSON.parse(r.readBy || '[]'); } catch(e) { r.readBy = r.readBy; }
    console.log(JSON.stringify(r, null, 2));
  });

  db.close();
});
