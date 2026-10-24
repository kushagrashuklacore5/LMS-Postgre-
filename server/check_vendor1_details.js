const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Vendor1@gmail.com Account Details ===\n');

// Check user account for vendor1@gmail.com
console.log('1. Checking user account for vendor1@gmail.com...');
db.get('SELECT * FROM users WHERE email = ?', ['vendor1@gmail.com'], (err, user) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  if (user) {
    console.log('✅ User Account Found:');
    console.log(`- User ID: ${user.id}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Role: ${user.role}`);
    console.log(`- Is Approved: ${user.isApproved}`);
    console.log(`- Created At: ${user.created_at}`);
  } else {
    console.log('❌ User account not found');
    return;
  }
  
  // Check vendor record
  console.log('\n2. Checking vendor record...');
  db.get('SELECT * FROM vendors WHERE email = ?', ['vendor1@gmail.com'], (err, vendor) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    if (vendor) {
      console.log('✅ Vendor Record Found:');
      console.log(`- Vendor ID: ${vendor.id}`);
      console.log(`- Name: ${vendor.name}`);
      console.log(`- Email: ${vendor.email}`);
      console.log(`- University ID: ${vendor.university_id}`);
      console.log(`- Created At: ${vendor.created_at}`);
    } else {
      console.log('❌ Vendor record not found');
      return;
    }
    
    // Check stock items for this vendor
    console.log('\n3. Checking stock items for this vendor...');
    db.all('SELECT * FROM vendor_stock WHERE vendor_id = ? ORDER BY id', [vendor.id], (err, stocks) => {
      if (err) {
        console.error('Error:', err);
        return;
      }
      
      if (stocks.length > 0) {
        console.log(`✅ Found ${stocks.length} stock items:`);
        stocks.forEach((stock, index) => {
          console.log(`\nStock Item ${index + 1}:`);
          console.log(`- Stock ID: ${stock.id}`);
          console.log(`- Name: ${stock.name}`);
          console.log(`- Category: ${stock.category}`);
          console.log(`- Quantity: ${stock.quantity}`);
          console.log(`- Unit Price: ₹${stock.unit_price}`);
          console.log(`- Min Stock: ${stock.min_stock}`);
          console.log(`- Description: ${stock.description || 'None'}`);
          console.log(`- Created At: ${stock.created_at}`);
          console.log(`- Updated At: ${stock.updated_at}`);
        });
        
        // Specifically check for Chairs and Chalks
        console.log('\n4. Checking for Chairs and Chalks specifically...');
        const chairs = stocks.find(s => s.name.toLowerCase().includes('chair'));
        const chalks = stocks.find(s => s.name.toLowerCase().includes('chalk'));
        
        if (chairs) {
          console.log('✅ Chairs Found:');
          console.log(`- Stock ID: ${chairs.id}`);
          console.log(`- Name: ${chairs.name}`);
          console.log(`- Quantity: ${chairs.quantity}`);
          console.log(`- Unit Price: ₹${chairs.unit_price}`);
        } else {
          console.log('❌ Chairs not found');
        }
        
        if (chalks) {
          console.log('✅ Chalks Found:');
          console.log(`- Stock ID: ${chalks.id}`);
          console.log(`- Name: ${chalks.name}`);
          console.log(`- Quantity: ${chalks.quantity}`);
          console.log(`- Unit Price: ₹${chalks.unit_price}`);
        } else {
          console.log('❌ Chalks not found');
        }
        
      } else {
        console.log('❌ No stock items found for this vendor');
      }
      
      console.log('\n=== Summary ===');
      console.log(`📧 Email: vendor1@gmail.com`);
      console.log(`👤 User ID: ${user.id}`);
      console.log(`🏪 Vendor ID: ${vendor.id}`);
      console.log(`📦 Total Stock Items: ${stocks.length}`);
      console.log(`🪑 Chairs: ${chairs ? `ID ${chairs.id}, Qty ${chairs.quantity}` : 'Not found'}`);
      console.log(`📝 Chalks: ${chalks ? `ID ${chalks.id}, Qty ${chalks.quantity}` : 'Not found'}`);
      
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('\n✅ Database connection closed');
        }
      });
    });
  });
});
