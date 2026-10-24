const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking for accountant users...');

db.all('SELECT id, email, role, university_id FROM users WHERE role = "accountant"', [], (err, accountants) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }

  console.log('\n📋 Accountant Users:');
  console.log('===================');
  
  if (accountants.length === 0) {
    console.log('❌ No accountant users found');
    console.log('💡 Creating sample accountant user...');
    
    // Create a sample accountant user
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('accountant123', 10);
    
    db.run(`INSERT INTO users (email, password, role, university_id, name) VALUES (?, ?, ?, ?, ?)`, 
      ['accountant@test.com', hashedPassword, 'accountant', 1, 'Test Accountant'], 
      function(err) {
        if (err) {
          console.error('❌ Error creating accountant:', err);
        } else {
          console.log('✅ Sample accountant created:');
          console.log('   Email: accountant@test.com');
          console.log('   Password: accountant123');
          console.log('   Role: accountant');
          console.log('   University ID: 1');
        }
      }
    );
  } else {
    accountants.forEach((accountant, index) => {
      console.log(`${index + 1}. ID: ${accountant.id}`);
      console.log(`   Email: ${accountant.email}`);
      console.log(`   Role: ${accountant.role}`);
      console.log(`   University ID: ${accountant.university_id}`);
    });
  }
  
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err);
    } else {
      console.log('\n✅ Database connection closed');
    }
  });
});
