const bcrypt = require('bcryptjs');
const db = require('./config/database-switch');

// Test password verification
const testPassword = 'admin123';
const storedHash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LFvOe';

console.log('Testing password verification...');
console.log('Password:', testPassword);
console.log('Stored hash:', storedHash);

bcrypt.compare(testPassword, storedHash, (err, result) => {
  if (err) {
    console.error('Error comparing password:', err);
  } else {
    console.log('Password match result:', result);
    
    // Also check what's in the database
    db.get("SELECT password_hash FROM superadmins WHERE email = ?", ['superadmin@test.com'], (err, row) => {
      if (err) {
        console.error('Error fetching from DB:', err);
      } else if (row) {
        console.log('Hash from database:', row.password_hash);
        
        // Compare with database hash
        bcrypt.compare(testPassword, row.password_hash, (err, dbResult) => {
          if (err) {
            console.error('Error comparing DB password:', err);
          } else {
            console.log('Database password match result:', dbResult);
          }
        });
      } else {
        console.log('No superadmin found in database');
      }
    });
  }
});
