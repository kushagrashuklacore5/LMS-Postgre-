const db = require('./config/database-switch');

db.all('SELECT * FROM classrooms', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('📋 Available classrooms:');
    rows.forEach((row, i) => {
      console.log(`   ${i+1}. ID: ${row.id}, Name: ${row.name}, Grade: ${row.grade}, Section: ${row.section}, ClassTeacher: ${row.classTeacher}`);
    });
  }
});
