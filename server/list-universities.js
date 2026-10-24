const db = require('config/database-switch');

db.all('SELECT id, name, adminId FROM universities ORDER BY id', (err, rows) => {
  console.log('=== EXISTING UNIVERSITIES ===');
  if (err) {
    console.error('Error:', err);
  } else {
    rows.forEach(row => {
      console.log(`ID: ${row.id} | Name: ${row.name} | Admin: ${row.adminId}`);
    });
  }
  process.exit(0);
});
