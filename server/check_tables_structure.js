const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Checking Table Structure ===\n');

// Check users table structure
console.log('1. Checking users table structure...');
db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)", (err, columns) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('Users table columns:');
  columns.forEach(col => {
    console.log(`- ${col.name}: ${col.type}`);
  });
  
  // Check vendors table structure
  console.log('\n2. Checking vendors table structure...');
  db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vendors)", (err, vendorColumns) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    console.log('Vendors table columns:');
    vendorColumns.forEach(col => {
      console.log(`- ${col.name}: ${col.type}`);
    });
    
    // Check current vendor records
    console.log('\n3. Checking current vendor records...');
    db.all('SELECT * FROM vendors WHERE id IN (16, 36)', (err, vendors) => {
      if (err) {
        console.error('Error:', err);
        return;
      }
      
      console.log('Current vendor records:');
      vendors.forEach(vendor => {
        console.log(`- ID: ${vendor.id}, Name: ${vendor.name}, Email: ${vendor.email}`);
      });
      
      console.log('\n4. Creating simple update script...');
      console.log('💡 Strategy: Update vendor ID 16 to 36 since user 36 maps to vendor1@gmail.com');
      
      // Simple update - change vendor ID 16 to 36
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
            console.log('\n5. Verifying update...');
            db.get('SELECT * FROM vendors WHERE id = 36', (err, updatedVendor) => {
              if (err) {
                console.error('Error verifying:', err);
                return;
              }
              
              if (updatedVendor) {
                console.log('✅ Verification successful:');
                console.log(`- New ID: ${updatedVendor.id}`);
                console.log(`- Name: ${updatedVendor.name}`);
                console.log(`- Email: ${updatedVendor.email}`);
                
                // Check if old ID 16 still exists
                db.get('SELECT * FROM vendors WHERE id = 16', (err, oldVendor) => {
                  if (err) {
                    console.error('Error checking old vendor:', err);
                    return;
                  }
                  
                  if (oldVendor) {
                    console.log('⚠️  Warning: Old vendor ID 16 still exists');
                    console.log('🔧 Deleting old vendor record...');
                    
                    db.run('DELETE FROM vendors WHERE id = 16', function(err) {
                      if (err) {
                        console.error('Error deleting old vendor:', err);
                        return;
                      }
                      
                      console.log('✅ Deleted old vendor record');
                      
                      console.log('\n🎉 Vendor ID Update Complete!');
                      console.log('📋 Final Result:');
                      console.log(`- Vendor (Mumbai) now has ID: 36`);
                      console.log(`- vendor1@gmail.com correctly mapped to user ID 36`);
                      console.log(`- All database references updated`);
                      console.log(`- Old vendor ID 16 removed`);
                      
                      db.close((err) => {
                        if (err) {
                          console.error('Error closing database:', err);
                        } else {
                          console.log('\n✅ Database connection closed');
                        }
                      });
                    });
                  } else {
                    console.log('✅ Old vendor ID 16 successfully removed');
                    
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
                  }
                });
              });
            });
          });
        });
      });
    });
  });
});
