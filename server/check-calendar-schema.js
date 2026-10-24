const db = require('config/database-switch');

console.log('Checking calendar_events table schema...\n');

db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'calendar_events)', (err, cols) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('calendar_events table columns:');
  if (cols && cols.length > 0) {
    cols.forEach(c => {
      console.log(`  - ${c.name} (${c.type})${c.notnull ? ' NOT NULL' : ''}`);
    });
  } else {
    console.log('  (no columns found)');
  }
  
  process.exit(0);
});
