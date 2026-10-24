const db = require('config/database-switch');

console.log('Checking courses table schema...\n');

db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'courses)', (err, cols) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('courses table columns:');
  if (cols && cols.length > 0) {
    cols.forEach(c => {
      console.log(`  - ${c.name} (${c.type})${c.notnull ? ' NOT NULL' : ''}`);
    });
  } else {
    console.log('  (no columns found)');
  }
  
  // Also check a sample course
  db.all('SELECT * FROM courses LIMIT 1', (err, rows) => {
    if (err) {
      console.error('Error fetching course:', err);
    } else if (rows && rows.length > 0) {
      console.log('\nSample course:');
      console.log(JSON.stringify(rows[0], null, 2));
    } else {
      console.log('\nNo courses in database');
    }
    process.exit(0);
  });
});
