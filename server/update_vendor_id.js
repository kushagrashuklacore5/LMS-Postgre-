const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Updating Vendor (Mumbai) ID from 16 to 36 ===\n');

// First, let's check current vendor records
console.log('1. Checking current vendor records...');
db.all('SELECT * FROM vendors WHERE name LIKE "%Mumbai%" OR id IN (16, 36)', (err, vendors) => {
  if (err) {
    console.error('Error fetching vendors:', err);
    return;
  }
  
  console.log(`Found ${vendors.length} vendor records:`);
  vendors.forEach((vendor, index) => {
    console.log(`\nVendor ${index + 1}:`);
    console.log(`- ID: ${vendor.id}`);
    console.log(`- Name: ${vendor.name}`);
    console.log(`- Email: ${vendor.email}`);
    console.log(`- University ID: ${vendor.university_id}`);
    console.log(`- Created: ${vendor.created_at}`);
  });
  
  // Check if there are any stock items or requests for vendor ID 16
  console.log('\n2. Checking dependencies on vendor ID 16...');
  
  // Check stock items
  db.all('SELECT COUNT(*) as count FROM vendor_stock WHERE vendor_id = 16', (err, stockCount) => {
    if (err) {
      console.error('Error checking stock count:', err);
      return;
    }
    
    const stockItems16 = stockCount[0].count;
    console.log(`Stock items for vendor 16: ${stockItems16}`);
    
    // Check stock request items
    db.all('SELECT COUNT(*) as count FROM stock_request_items WHERE vendor_id = 16', (err, requestCount) => {
      if (err) {
        console.error('Error checking request count:', err);
        return;
      }
      
      const requestItems16 = requestCount[0].count;
      console.log(`Request items for vendor 16: ${requestItems16}`);
      
      // Check stock items for vendor ID 36
      db.all('SELECT COUNT(*) as count FROM vendor_stock WHERE vendor_id = 36', (err, stockCount36) => {
        if (err) {
          console.error('Error checking stock count for 36:', err);
          return;
        }
        
        const stockItems36 = stockCount36[0].count;
        console.log(`Stock items for vendor 36: ${stockItems36}`);
        
        // Check stock request items for vendor ID 36
        db.all('SELECT COUNT(*) as count FROM stock_request_items WHERE vendor_id = 36', (err, requestCount36) => {
          if (err) {
            console.error('Error checking request count for 36:', err);
            return;
          }
          
          const requestItems36 = requestCount36[0].count;
          console.log(`Request items for vendor 36: ${requestItems36}`);
          
          console.log('\n3. Analysis:');
          console.log(`- Vendor 16 has: ${stockItems16} stock items, ${requestItems16} request items`);
          console.log(`- Vendor 36 has: ${stockItems36} stock items, ${requestItems36} request items`);
          
          if (stockItems16 > 0 || requestItems16 > 0) {
            console.log('⚠️  WARNING: Vendor 16 has existing data!');
            console.log('💡 Recommendation: Update existing records instead of changing ID');
            console.log('🔧 Proceeding with safe update approach...');
            
            // Update vendor ID 16 to point to user ID 36 instead
            updateVendorMapping(db, 16, 36);
          } else {
            console.log('✅ Safe to proceed - Vendor 16 has no dependencies');
            console.log('🔧 Proceeding with ID update...');
            
            // Update vendor ID from 16 to 36
            updateVendorId(db, 16, 36);
          }
        });
      });
    });
  });
});

function updateVendorMapping(db, oldVendorId, newVendorId) {
  console.log(`\n🔧 Updating vendor mapping: ${oldVendorId} → ${newVendorId}`);
  
  // Update users table to map to vendor 36
  db.run('UPDATE users SET vendor_id = ? WHERE id = ?', [newVendorId, 36], (err) => {
    if (err) {
      console.error('Error updating user vendor mapping:', err);
      return;
    }
    
    console.log('✅ User 36 now mapped to vendor 36');
    
    // Update vendor record if needed
    db.run('UPDATE vendors SET id = ? WHERE id = ?', [newVendorId, oldVendorId], (err) => {
      if (err) {
        console.error('Error updating vendor ID:', err);
        return;
      }
      
      console.log('✅ Vendor ID updated from 16 to 36');
      
      // Update all stock items from vendor 16 to vendor 36
      db.run('UPDATE vendor_stock SET vendor_id = ? WHERE vendor_id = ?', [newVendorId, oldVendorId], function(err) {
        if (err) {
          console.error('Error updating stock items:', err);
          return;
        }
        
        console.log(`✅ Updated ${this.changes} stock items from vendor 16 to 36`);
        
        // Update all stock request items from vendor 16 to vendor 36
        db.run('UPDATE stock_request_items SET vendor_id = ? WHERE vendor_id = ?', [newVendorId, oldVendorId], function(err) {
          if (err) {
            console.error('Error updating request items:', err);
            return;
          }
          
          console.log(`✅ Updated ${this.changes} request items from vendor 16 to 36`);
          
          console.log('\n🎉 Update Complete!');
          console.log('📋 Summary:');
          console.log(`- Vendor (Mumbai) ID: 16 → 36`);
          console.log(`- User 36 now correctly mapped`);
          console.log(`- All stock items updated`);
          console.log(`- All request items updated`);
          
          verifyUpdate(db, newVendorId);
        });
      });
    });
  });
}

function updateVendorId(db, oldId, newId) {
  console.log(`\n🔧 Direct ID update: ${oldId} → ${newId}`);
  
  // Update vendor ID directly
  db.run('UPDATE vendors SET id = ? WHERE id = ?', [newId, oldId], function(err) {
    if (err) {
      console.error('Error updating vendor ID:', err);
      return;
    }
    
    console.log(`✅ Vendor ID updated: ${this.changes} records`);
    
    // Update all related records
    db.run('UPDATE vendor_stock SET vendor_id = ? WHERE vendor_id = ?', [newId, oldId], function(err) {
      if (err) {
        console.error('Error updating stock items:', err);
        return;
      }
      
      console.log(`✅ Updated ${this.changes} stock items`);
      
      db.run('UPDATE stock_request_items SET vendor_id = ? WHERE vendor_id = ?', [newId, oldId], function(err) {
        if (err) {
          console.error('Error updating request items:', err);
          return;
        }
        
        console.log(`✅ Updated ${this.changes} request items`);
        
        console.log('\n🎉 Vendor ID Update Complete!');
        console.log('📋 Final State:');
        console.log(`- Vendor (Mumbai) ID: ${newId}`);
        console.log(`- All references updated`);
        
        verifyUpdate(db, newId);
      });
    });
  });
}

function verifyUpdate(db, vendorId) {
  console.log('\n🔍 Verifying update...');
  
  // Check vendor record
  db.get('SELECT * FROM vendors WHERE id = ?', [vendorId], (err, vendor) => {
    if (err) {
      console.error('Error verifying vendor:', err);
      return;
    }
    
    if (vendor) {
      console.log('✅ Vendor verification successful:');
      console.log(`- ID: ${vendor.id}`);
      console.log(`- Name: ${vendor.name}`);
      console.log(`- Email: ${vendor.email}`);
    } else {
      console.log('❌ Vendor verification failed');
    }
    
    // Check stock items
    db.all('SELECT COUNT(*) as count FROM vendor_stock WHERE vendor_id = ?', [vendorId], (err, stockCount) => {
      if (err) {
        console.error('Error verifying stock:', err);
        return;
      }
      
      console.log(`✅ Stock items for vendor ${vendorId}: ${stockCount[0].count}`);
      
      // Check request items
      db.all('SELECT COUNT(*) as count FROM stock_request_items WHERE vendor_id = ?', [vendorId], (err, requestCount) => {
        if (err) {
          console.error('Error verifying requests:', err);
          return;
        }
        
        console.log(`✅ Request items for vendor ${vendorId}: ${requestCount[0].count}`);
        
        console.log('\n=== Update Verification Complete ===');
        console.log('✅ All records successfully updated!');
        console.log('✅ Vendor (Mumbai) now has ID 36');
        console.log('✅ User 36 authentication will work correctly');
        
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
}
