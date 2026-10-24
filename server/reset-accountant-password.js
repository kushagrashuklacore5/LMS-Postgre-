const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Resetting accountant password...');

const newPassword = 'accountant123';
const hashedPassword = bcrypt.hashSync(newPassword, 10);

db.run('UPDATE users SET password = ? WHERE role = "accountant"', [hashedPassword], (err) => {
  if (err) {
    console.error('❌ Error resetting password:', err);
  } else {
    console.log('✅ Accountant password reset successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Email: accountant@demo.com');
    console.log('   Password: accountant123');
    console.log('\n🚀 Go to http://localhost:5176 and login with these credentials');
    console.log('📋 After login, navigate to Accountant Portal → Vendor Invoices');
  }
  
  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err);
    } else {
      console.log('\n✅ Database connection closed');
    }
  });
});
