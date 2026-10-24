const db = require('./config/database-switch');

db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'otp_reset)", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('otp_reset table schema:');
    if (rows.length === 0) {
      console.log('  (Table does not exist)');
      
      // Create the table if it doesn't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS otp_reset (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          otp TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          attempts INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating otp_reset table:', err);
        } else {
          console.log('✅ otp_reset table created successfully');
        }
      });
    } else {
      rows.forEach(row => {
        console.log(`- ${row.name}: ${row.type}`);
      });
    }
  }
});
