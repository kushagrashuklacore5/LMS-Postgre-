const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'lms-database.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to database successfully');
});

// Create vendor users based on existing vendors
const vendors = [
  { id: 16, name: 'vendor (Mumbai)', email: 'vendor@mumbai.com' },
  { id: 17, name: 'Dell Computer Supplies', email: 'dell@vendor.com' }
];

console.log('\n=== Creating vendor users ===');

vendors.forEach((vendor, index) => {
  const password = 'vendor123'; // Default password
  
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Error hashing password:', err);
      return;
    }
    
    db.run(
      `INSERT OR REPLACE INTO users (email, password, role, name, university_id, is_active) 
       VALUES (?, ?, 'vendor', ?, 1, 1)`,
      [vendor.email, hashedPassword, vendor.name],
      function(err) {
        if (err) {
          console.error('Error creating user:', err);
        } else {
          const userId = this.lastID;
          console.log(`✅ Created vendor user: ${vendor.email} with User ID: ${userId}`);
          
          // Update vendor table with user_id
          db.run(
            'UPDATE vendors SET user_id = ? WHERE id = ?',
            [userId, vendor.id],
            function(err) {
              if (err) {
                console.error('Error updating vendor user_id:', err);
              } else {
                console.log(`✅ Linked vendor ${vendor.name} (ID: ${vendor.id}) to user ${vendor.email} (ID: ${userId})`);
              }
            }
          );
        }
      }
    );
  });
});

setTimeout(() => {
  console.log('\n=== Verification ===');
  db.all('SELECT u.id as user_id, u.email, u.role, v.id as vendor_id, v.name as vendor_name FROM users u LEFT JOIN vendors v ON u.id = v.user_id WHERE u.role = "vendor"', (err, results) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Vendor users with vendor relationships:');
      results.forEach(result => {
        console.log(`User ID: ${result.user_id}, Email: ${result.email}, Vendor ID: ${result.vendor_id}, Vendor Name: ${result.vendor_name}`);
      });
    }
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('\n✅ Vendor user creation completed!');
        console.log('\nYou can now login with:');
        console.log('1. Email: vendor@mumbai.com, Password: vendor123');
        console.log('2. Email: dell@vendor.com, Password: vendor123');
      }
    });
  });
}, 2000);
