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

// Update existing vendors with passwords and create corresponding users
const vendors = [
  { id: 16, name: 'vendor (Mumbai)', email: 'vendor@mumbai.com' },
  { id: 17, name: 'Dell Computer Supplies', email: 'dell@vendor.com' }
];

console.log('\n=== Creating vendor user accounts ===');

vendors.forEach((vendor) => {
  const password = 'vendor123'; // Default password
  
  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Error hashing password:', err);
      return;
    }
    
    // First create user record
    db.run(
      `INSERT OR REPLACE INTO users (email, password, role, name, university_id, isApproved) 
       VALUES (?, ?, 'vendor', ?, 1, 1)`,
      [vendor.email, hashedPassword, vendor.name],
      function(err) {
        if (err) {
          console.error('Error creating user:', err);
          return;
        }
        
        const userId = this.lastID;
        console.log(`✅ Created vendor user: ${vendor.email} with User ID: ${userId}`);
        
        // Update vendor with password
        db.run(
          'UPDATE vendors SET password = ? WHERE id = ?',
          [hashedPassword, vendor.id],
          function(err) {
            if (err) {
              console.error('Error updating vendor password:', err);
            } else {
              console.log(`✅ Updated vendor ${vendor.name} (ID: ${vendor.id}) with password`);
            }
          }
        );
      }
    );
  });
});

setTimeout(() => {
  console.log('\n=== Verification ===');
  db.all('SELECT u.id as user_id, u.email, u.role, v.id as vendor_id, v.name as vendor_name FROM users u LEFT JOIN vendors v ON u.email = v.email WHERE u.role = "vendor"', (err, results) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Vendor users with vendor relationships:');
      results.forEach(result => {
        console.log(`User ID: ${result.user_id}, Email: ${result.email}, Vendor ID: ${result.vendor_id}, Vendor Name: ${result.vendor_name}`);
      });
    }
    
    console.log('\n=== Checking existing requests for vendor 16 ===');
    db.all(
      `SELECT sr.*, sri.vendor_id 
       FROM stock_requests sr 
       LEFT JOIN stock_request_items sri ON sr.id = sri.request_id 
       WHERE sri.vendor_id = 16 
       GROUP BY sr.id 
       ORDER BY sr.created_at DESC`,
      (err, requests) => {
        if (err) {
          console.error('Error:', err);
        } else {
          console.log(`Found ${requests.length} requests for vendor 16:`);
          requests.forEach(req => {
            console.log(`- Request ID: ${req.id}, Title: ${req.title}, Status: ${req.status}`);
          });
        }
        
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('\n✅ Vendor account creation completed!');
            console.log('\nYou can now login with:');
            console.log('1. Email: vendor@mumbai.com, Password: vendor123');
            console.log('2. Email: dell@vendor.com, Password: vendor123');
            console.log('\nThese accounts should now see their assigned requests in the vendor portal.');
          }
        });
      }
    );
  });
}, 2000);
