const db = require('./config/database-switch');

db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Users table schema:');
    rows.forEach(row => {
      console.log(`- ${row.name}: ${row.type}`);
    });
  }
});
