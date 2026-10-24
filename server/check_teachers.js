const db = require('./config/database-switch');

db.all('SELECT id, name, email, role FROM users WHERE role = "mentor" OR role = "teacher"', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('👨‍🏫 Teachers/Mentors in database:');
    rows.forEach((row, i) => {
      console.log(`   ${i+1}. ID: ${row.id}, Name: ${row.name}, Email: ${row.email}, Role: ${row.role}`);
    });
  }
});
