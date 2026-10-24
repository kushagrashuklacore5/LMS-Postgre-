const db = require('./config/database-switch');

db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'", [], (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else if (row) {
    console.log('Users table CREATE SQL:');
    console.log(row.sql);
    
    // Check actual column names by querying the table
    db.all("SELECT * FROM users LIMIT 1", [], (err, rows) => {
      if (err) {
        console.error('Error:', err);
      } else if (rows.length > 0) {
        console.log('\nActual column names in users table:');
        Object.keys(rows[0]).forEach(col => {
          console.log(`- ${col}`);
        });
      }
    });
  }
});
