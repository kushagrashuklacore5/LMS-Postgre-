const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'lms-database.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to database successfully');
});

console.log('\n=== Checking All Vendor Emails ===');
db.all('SELECT id, name, email FROM vendors', (err, vendors) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('All vendors:');
    vendors.forEach(vendor => {
      console.log(`ID: ${vendor.id}, Name: "${vendor.name}", Email: "${vendor.email}"`);
    });
  }
  
  console.log('\n=== Checking All Vendor User Emails ===');
  db.all('SELECT id, email, role FROM users WHERE role = "vendor"', (err, users) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('All vendor users:');
      users.forEach(user => {
        console.log(`ID: ${user.id}, Email: "${user.email}", Role: ${user.role}`);
      });
    }
    
    console.log('\n=== Testing Email Matches ===');
    vendors.forEach(vendor => {
      users.forEach(user => {
        if (vendor.email === user.email) {
          console.log(`✅ MATCH: Vendor "${vendor.name}" (ID: ${vendor.id}) <-> User "${user.email}" (ID: ${user.id})`);
        }
      });
    });
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('\nDatabase connection closed');
      }
    });
  });
});
