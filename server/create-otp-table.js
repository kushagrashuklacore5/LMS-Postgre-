// Create OTP reset table
const db = require('config/database-switch');

const createOTPTable = () => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS otp_reset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      otp TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('❌ Error creating OTP table:', err.message);
      return;
    }
    console.log('✅ OTP reset table created successfully');
  });
};

createOTPTable();
