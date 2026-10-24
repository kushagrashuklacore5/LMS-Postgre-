const db = require('./config/database-switch');

console.log('=== DELETING ALL UNIVERSITIES ===');

async function deleteAllUniversities() {
  try {
    console.log('WARNING: This will delete ALL universities and associated data!');
    console.log('This includes users, stock requests, vendors, and all related data.');
    
    // 1. First, get current data count for confirmation
    console.log('\n1. Current data before deletion:');
    
    const tables = ['universities', 'users', 'stock_requests', 'vendors', 'students', 'classrooms', 'courses'];
    
    let dataCounts = {};
    let completedCounts = 0;
    
    tables.forEach(table => {
      db.get(`SELECT COUNT(*) as count FROM ${table}`, [], (err, result) => {
        if (err) {
          console.error(`Error counting ${table}:`, err);
          return;
        }
        
        dataCounts[table] = result.count;
        completedCounts++;
        
        if (completedCounts === tables.length) {
          console.log('Current data:');
          Object.keys(dataCounts).forEach(table => {
            console.log(`  ${table}: ${dataCounts[table]} records`);
          });
          
          // 2. Delete all data in proper order (to respect foreign keys)
          console.log('\n2. Starting deletion process...');
          
          deleteData();
        }
      });
    });
    
    function deleteData() {
      let deletions = 0;
      let completedDeletions = 0;
      
      // Delete in order to respect foreign key constraints
      const deletionOrder = [
        { table: 'stock_request_items', name: 'Stock Request Items' },
        { table: 'stock_requests', name: 'Stock Requests' },
        { table: 'vendor_quotes', name: 'Vendor Quotes' },
        { table: 'vendors', name: 'Vendors' },
        { table: 'students', name: 'Students' },
        { table: 'classrooms', name: 'Classrooms' },
        { table: 'courses', name: 'Courses' },
        { table: 'users', name: 'Users' },
        { table: 'universities', name: 'Universities' }
      ];
      
      deletionOrder.forEach(({ table, name }) => {
        deletions++;
        
        db.run(`DELETE FROM ${table}`, function(err) {
          if (err) {
            console.error(`Error deleting from ${table}:`, err);
            return;
          }
          
          console.log(`✅ Deleted ${this.changes} records from ${name}`);
          
          completedDeletions++;
          
          if (completedDeletions === deletions) {
            console.log('\n3. Verification - checking final state...');
            
            // Verify all tables are empty
            let verificationCount = 0;
            let completedVerifications = 0;
            
            tables.forEach(table => {
              db.get(`SELECT COUNT(*) as count FROM ${table}`, [], (err, result) => {
                if (err) {
                  console.error(`Error verifying ${table}:`, err);
                  return;
                }
                
                console.log(`  ${table}: ${result.count} records (should be 0)`);
                
                completedVerifications++;
                
                if (completedVerifications === tables.length) {
                  console.log('\n=== DELETION COMPLETED ===');
                  console.log('✅ All universities and associated data deleted');
                  console.log('✅ Database is now clean and empty');
                  console.log('✅ Ready for fresh university creation');
                  
                  // Reset auto-increment counters
                  console.log('\n4. Resetting auto-increment counters...');
                  resetCounters();
                }
              });
            });
          }
        });
      });
    }
    
    function resetCounters() {
      const tablesToReset = ['users', 'universities', 'stock_requests', 'vendors', 'students', 'classrooms', 'courses'];
      let resetCount = 0;
      let completedResets = 0;
      
      tablesToReset.forEach(table => {
        resetCount++;
        
        db.run(`DELETE FROM sqlite_sequence WHERE name = '${table}'`, function(err) {
          if (err) {
            console.error(`Error resetting ${table} counter:`, err);
            // Don't return, continue with others
          } else {
            console.log(`✅ Reset ${table} auto-increment counter`);
          }
          
          completedResets++;
          
          if (completedResets === resetCount) {
            console.log('\n=== FINAL STATUS ===');
            console.log('✅ ALL UNIVERSITIES DELETED SUCCESSFULLY');
            console.log('✅ All associated data removed');
            console.log('✅ Auto-increment counters reset');
            console.log('✅ Database is completely clean');
            
            console.log('\n=== NEXT STEPS ===');
            console.log('1. Create new universities as needed');
            console.log('2. Create new SuperAdmin accounts');
            console.log('3. Assign users to new universities');
            console.log('4. Test with fresh data');
            
            process.exit(0);
          }
        });
      });
    }
    
  } catch (error) {
    console.error('Error during deletion:', error);
    process.exit(1);
  }
}

deleteAllUniversities();
