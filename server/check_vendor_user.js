const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'lms-database.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to database successfully');
});

console.log('\n=== Checking users table for vendor users ===');
db.all('SELECT id, email, role FROM users WHERE role = "vendor"', (err, users) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Vendor users found:', users.length);
    users.forEach(user => {
      console.log(`User ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`);
    });
  }
  
  console.log('\n=== Checking vendor-user relationships ===');
  db.all('SELECT * FROM vendors', (err, vendors) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Vendors found:', vendors.length);
      vendors.forEach(vendor => {
        console.log(`Vendor ID: ${vendor.id}, Name: ${vendor.name}, User ID: ${vendor.user_id}`);
      });
    }
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  });
});
