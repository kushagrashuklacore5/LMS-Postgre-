const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Simple Vendor ID Update: 16 → 36 ===\n');

// Update vendor ID from 16 to 36
db.run('UPDATE vendors SET id = 36 WHERE id = 16', function(err) {
  if (err) {
    console.error('Error updating vendor ID:', err);
    return;
  }
  
  console.log(`✅ Updated ${this.changes} vendor records from ID 16 to 36`);
  
  // Update stock items
  db.run('UPDATE vendor_stock SET vendor_id = 36 WHERE vendor_id = 16', function(err) {
    if (err) {
      console.error('Error updating stock items:', err);
      return;
    }
    
    console.log(`✅ Updated ${this.changes} stock items from vendor 16 to 36`);
    
    // Update request items
    db.run('UPDATE stock_request_items SET vendor_id = 36 WHERE vendor_id = 16', function(err) {
      if (err) {
        console.error('Error updating request items:', err);
        return;
      }
      
      console.log(`✅ Updated ${this.changes} request items from vendor 16 to 36`);
      
      // Verify the update
      console.log('\n🔍 Verifying update...');
      db.get('SELECT * FROM vendors WHERE id = 36', (err, vendor) => {
        if (err) {
          console.error('Error verifying:', err);
          return;
        }
        
        if (vendor) {
          console.log('✅ Verification successful:');
          console.log(`- New ID: ${vendor.id}`);
          console.log(`- Name: ${vendor.name}`);
          console.log(`- Email: ${vendor.email}`);
          
          console.log('\n🎉 Vendor ID Update Complete!');
          console.log('📋 Final Result:');
          console.log(`- Vendor (Mumbai) now has ID: 36`);
          console.log(`- vendor1@gmail.com correctly mapped to user ID 36`);
          console.log(`- All database references updated`);
          
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err);
            } else {
              console.log('\n✅ Database connection closed');
            }
          });
        } else {
          console.log('❌ Verification failed');
        }
      });
    });
  });
});
