const db = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');

const database = new db.Database(dbPath, (err) => {
  if (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }

  console.log('✅ Connected to database\n');

  // Check attendance records
  const query = `
    SELECT a.id, a.studentId, a.classroomId, a.date, a.status, u.name as studentName, u.email
    FROM attendance a
    JOIN users u ON a.studentId = u.id
    ORDER BY a.date DESC, a.createdAt DESC
    LIMIT 20
  `;

  database.all(query, (err, rows) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('📋 Latest Attendance Records:');
      if (rows && rows.length > 0) {
        console.table(rows);
      } else {
        console.log('No attendance records found');
      }
    }
    database.close();
  });
});
