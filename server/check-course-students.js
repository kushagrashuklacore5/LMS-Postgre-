const db = require('config/database-switch');

console.log('Checking course_students table...\n');

db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'course_students)', (err, cols) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('course_students columns:');
  if (cols && cols.length > 0) {
    cols.forEach(c => console.log(`  - ${c.name} (${c.type})`));
  }
  process.exit(0);
});
