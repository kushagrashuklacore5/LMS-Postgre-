const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Cleaning Up Vendors ===\n');

// Vendors to keep
const vendorsToKeep = [
  'Dell Computer Supplies',
  'vendor (Mumbai)'
];

console.log('1. Current vendors in database...');
db.all('SELECT * FROM vendors ORDER BY id', (err, allVendors) => {
  if (err) {
    console.error('Error fetching vendors:', err);
    return;
  }
  
  console.log(`Found ${allVendors.length} vendors:`);
  allVendors.forEach((vendor, index) => {
    console.log(`\nVendor ${index + 1}:`);
    console.log(`- ID: ${vendor.id}`);
    console.log(`- Name: ${vendor.name}`);
    console.log(`- Email: ${vendor.email}`);
    console.log(`- University ID: ${vendor.university_id}`);
  });
  
  // Identify vendors to delete
  const vendorsToDelete = allVendors.filter(vendor => !vendorsToKeep.includes(vendor.name));
  
  console.log('\n2. Vendors to keep:');
  vendorsToKeep.forEach((name, index) => {
    const vendor = allVendors.find(v => v.name === name);
    if (vendor) {
      console.log(`${index + 1}. ${vendor.name} (ID: ${vendor.id})`);
    }
  });
  
  console.log('\n3. Vendors to delete:');
  vendorsToDelete.forEach((vendor, index) => {
    console.log(`${index + 1}. ${vendor.name} (ID: ${vendor.id})`);
  });
  
  if (vendorsToDelete.length === 0) {
    console.log('\n✅ No vendors to delete - all vendors are already the ones we want to keep');
    db.close();
    return;
  }
  
  console.log('\n4. Deleting vendors and their related records...');
  
  let deletedCount = 0;
  let totalToDelete = vendorsToDelete.length;
  
  vendorsToDelete.forEach((vendor, index) => {
    console.log(`\nDeleting vendor: ${vendor.name} (ID: ${vendor.id})`);
    
    // Delete vendor stock items
    db.run('DELETE FROM vendor_stock WHERE vendor_id = ?', [vendor.id], function(err) {
      if (err) {
        console.error(`Error deleting stock for vendor ${vendor.id}:`, err);
        return;
      }
      
      console.log(`✅ Deleted ${this.changes} stock items for vendor ${vendor.id}`);
      
      // Delete stock request items assigned to this vendor
      db.run('DELETE FROM stock_request_items WHERE vendor_id = ?', [vendor.id], function(err) {
        if (err) {
          console.error(`Error deleting request items for vendor ${vendor.id}:`, err);
          return;
        }
        
        console.log(`✅ Deleted ${this.changes} request items for vendor ${vendor.id}`);
        
        // Delete corresponding user account
        db.run('DELETE FROM users WHERE email = ? AND role = "vendor"', [vendor.email], function(err) {
          if (err) {
            console.error(`Error deleting user for vendor ${vendor.id}:`, err);
            return;
          }
          
          console.log(`✅ Deleted ${this.changes} user accounts for vendor ${vendor.email}`);
          
          // Finally delete the vendor
          db.run('DELETE FROM vendors WHERE id = ?', [vendor.id], function(err) {
            if (err) {
              console.error(`Error deleting vendor ${vendor.id}:`, err);
              return;
            }
            
            console.log(`✅ Deleted vendor ${vendor.id}: ${vendor.name}`);
            deletedCount++;
            
            // Check if all deletions are complete
            if (deletedCount === totalToDelete) {
              console.log('\n5. Verifying cleanup...');
              verifyCleanup();
            }
          });
        });
      });
    });
  });
});

function verifyCleanup() {
  console.log('\n🔍 Verifying vendor cleanup...');
  
  // Check remaining vendors
  db.all('SELECT * FROM vendors ORDER BY id', (err, remainingVendors) => {
    if (err) {
      console.error('Error verifying vendors:', err);
      return;
    }
    
    console.log(`\n✅ Remaining vendors: ${remainingVendors.length}`);
    remainingVendors.forEach((vendor, index) => {
      console.log(`\nVendor ${index + 1}:`);
      console.log(`- ID: ${vendor.id}`);
      console.log(`- Name: ${vendor.name}`);
      console.log(`- Email: ${vendor.email}`);
      console.log(`- University ID: ${vendor.university_id}`);
    });
    
    // Verify only the two vendors remain
    const remainingNames = remainingVendors.map(v => v.name);
    const hasDell = remainingNames.includes('Dell Computer Supplies');
    const hasMumbai = remainingNames.includes('vendor (Mumbai)');
    
    if (remainingVendors.length === 2 && hasDell && hasMumbai) {
      console.log('\n🎉 Vendor Cleanup Complete!');
      console.log('📋 Summary:');
      console.log('✅ Only 2 vendors remain as requested');
      console.log('✅ Dell Computer Supplies kept');
      console.log('✅ vendor (Mumbai) kept');
      console.log('✅ All other vendors deleted');
      console.log('✅ Related records cleaned up');
      
      // Check for any orphaned records
      console.log('\n6. Checking for orphaned records...');
      
      // Check stock request items with non-existent vendor IDs
      db.all(`
        SELECT sri.* FROM stock_request_items sri 
        LEFT JOIN vendors v ON sri.vendor_id = v.id 
        WHERE v.id IS NULL
      `, (err, orphanedItems) => {
        if (err) {
          console.error('Error checking orphaned items:', err);
          return;
        }
        
        if (orphanedItems.length > 0) {
          console.log(`⚠️ Found ${orphanedItems.length} orphaned request items, cleaning up...`);
          
          orphanedItems.forEach(item => {
            db.run('DELETE FROM stock_request_items WHERE id = ?', [item.id], (err) => {
              if (err) {
                console.error('Error deleting orphaned item:', err);
              }
            });
          });
          
          console.log('✅ Cleaned up orphaned request items');
        } else {
          console.log('✅ No orphaned request items found');
        }
        
        // Check vendor stock with non-existent vendor IDs
        db.all(`
          SELECT vs.* FROM vendor_stock vs 
          LEFT JOIN vendors v ON vs.vendor_id = v.id 
          WHERE v.id IS NULL
        `, (err, orphanedStock) => {
          if (err) {
            console.error('Error checking orphaned stock:', err);
            return;
          }
          
          if (orphanedStock.length > 0) {
            console.log(`⚠️ Found ${orphanedStock.length} orphaned stock items, cleaning up...`);
            
            orphanedStock.forEach(stock => {
              db.run('DELETE FROM vendor_stock WHERE id = ?', [stock.id], (err) => {
                if (err) {
                  console.error('Error deleting orphaned stock:', err);
                }
              });
            });
            
            console.log('✅ Cleaned up orphaned stock items');
          } else {
            console.log('✅ No orphaned stock items found');
          }
          
          console.log('\n🎉 Complete Vendor Cleanup Finished!');
          console.log('📋 Final State:');
          console.log('✅ Only 2 vendors remain');
          console.log('✅ All orphaned records cleaned');
          console.log('✅ Database integrity maintained');
          
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err);
            } else {
              console.log('\n✅ Database connection closed');
            }
          });
        });
      });
    } else {
      console.log('\n❌ Cleanup verification failed');
      console.log(`Expected 2 vendors, found ${remainingVendors.length}`);
      console.log(`Has Dell Computer Supplies: ${hasDell}`);
      console.log(`Has vendor (Mumbai): ${hasMumbai}`);
      
      db.close();
    }
  });
}
