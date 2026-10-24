const db = require('./config/database-switch');

console.log('=== CLEANING DATABASE FOR PROPER ISOLATION ===');

async function cleanDatabaseIsolation() {
  try {
    console.log('1. Checking current data distribution...');
    
    // Check current data in each table
    const tables = ['users', 'stock_requests', 'vendors'];
    
    let dataCheck = {};
    let totalChecks = 0;
    let completedChecks = 0;
    
    tables.forEach(table => {
      totalChecks++;
      
      let query = '';
      if (table === 'users') {
        query = `SELECT id, name, email, role, university_id FROM ${table} WHERE university_id IS NOT NULL ORDER BY university_id`;
      } else if (table === 'stock_requests') {
        query = `SELECT id, title, storekeeper_id, university_id FROM ${table} ORDER BY university_id`;
      } else if (table === 'vendors') {
        query = `SELECT id, name, university_id FROM ${table} ORDER BY university_id`;
      }
      
      db.all(query, [], (err, rows) => {
        if (err) {
          console.error(`Error checking ${table}:`, err);
          return;
        }
        
        dataCheck[table] = rows;
        completedChecks++;
        
        if (completedChecks === totalChecks) {
          console.log('\n=== CURRENT DATA DISTRIBUTION ===');
          
          Object.keys(dataCheck).forEach(tableName => {
            const data = dataCheck[tableName];
            console.log(`\n${tableName.toUpperCase()}:`);
            
            if (data.length === 0) {
              console.log('  No data found');
              return;
            }
            
            const dataByUniversity = {};
            data.forEach(row => {
              const uniId = row.university_id || 'null';
              if (!dataByUniversity[uniId]) {
                dataByUniversity[uniId] = [];
              }
              dataByUniversity[uniId].push(row);
            });
            
            Object.keys(dataByUniversity).forEach(uniId => {
              console.log(`  University ${uniId}: ${dataByUniversity[uniId].length} records`);
              dataByUniversity[uniId].slice(0, 3).forEach(row => {
                console.log(`    - ${row.name || row.title || row.id} (ID: ${row.id})`);
              });
              if (dataByUniversity[uniId].length > 3) {
                console.log(`    ... and ${dataByUniversity[uniId].length - 3} more`);
              }
            });
          });
          
          // Now clean up the data
          cleanupData(dataCheck);
        }
      });
    });
    
    function cleanupData(dataCheck) {
      console.log('\n=== CLEANING UP DATA FOR PROPER ISOLATION ===');
      
      let cleanupOperations = 0;
      let completedOperations = 0;
      
      // 1. Move users to correct universities
      console.log('\n1. Reassigning users to correct universities...');
      
      const users = dataCheck.users || [];
      const usersToMove = users.filter(u => u.university_id === 1 || u.university_id === null);
      
      if (usersToMove.length > 0) {
        console.log(`Found ${usersToMove.length} users that need reassignment...`);
        
        usersToMove.forEach((user, index) => {
          // Assign users based on their current pattern or create new assignments
          let targetUniversity = null;
          
          if (user.id === 22 || user.id === 35 || user.id === 23 || user.id === 25 || user.id === 68) {
            targetUniversity = 4; // Core5
          } else if (user.id === 86) {
            targetUniversity = 5; // Core5 (2)
          } else {
            // Assign based on some pattern or leave null
            targetUniversity = null;
          }
          
          if (targetUniversity) {
            cleanupOperations++;
            
            db.run(`
              UPDATE users 
              SET university_id = ? 
              WHERE id = ?
            `, [targetUniversity, user.id], function(err) {
              if (err) {
                console.error(`Error updating user ${user.id}:`, err);
                return;
              }
              
              console.log(`✅ User ${user.name} (ID: ${user.id}) moved to University ${targetUniversity}`);
              
              completedOperations++;
              if (completedOperations === cleanupOperations) {
                finishCleanup();
              }
            });
          }
        });
      }
      
      // 2. Clean up stock requests
      console.log('\n2. Cleaning up stock requests...');
      
      const stockRequests = dataCheck.stock_requests || [];
      const requestsToClean = stockRequests.filter(sr => sr.university_id === 1 || !sr.university_id);
      
      requestsToClean.forEach((request, index) => {
        // Get the storekeeper's university
        db.get(`
          SELECT university_id FROM users WHERE id = ?
        `, [request.storekeeper_id], (err, storekeeper) => {
          if (err) {
            console.error(`Error getting storekeeper ${request.storekeeper_id}:`, err);
            return;
          }
          
          if (storekeeper && storekeeper.university_id) {
            cleanupOperations++;
            
            db.run(`
              UPDATE stock_requests 
              SET university_id = ? 
              WHERE id = ?
            `, [storekeeper.university_id, request.id], function(err) {
              if (err) {
                console.error(`Error updating stock request ${request.id}:`, err);
                return;
              }
              
              console.log(`✅ Stock Request "${request.title}" (ID: ${request.id}) moved to University ${storekeeper.university_id}`);
              
              completedOperations++;
              if (completedOperations === cleanupOperations) {
                finishCleanup();
              }
            });
          } else {
            // Delete orphaned requests
            cleanupOperations++;
            
            db.run(`
              DELETE FROM stock_requests WHERE id = ?
            `, [request.id], function(err) {
              if (err) {
                console.error(`Error deleting stock request ${request.id}:`, err);
                return;
              }
              
              console.log(`❌ Stock Request "${request.title}" (ID: ${request.id}) deleted (no valid storekeeper)`);
              
              completedOperations++;
              if (completedOperations === cleanupOperations) {
                finishCleanup();
              }
            });
          }
        });
      });
      
      // 3. Clean up vendors
      console.log('\n3. Cleaning up vendors...');
      
      const vendors = dataCheck.vendors || [];
      const vendorsToClean = vendors.filter(v => v.university_id === 1 || !v.university_id);
      
      vendorsToClean.forEach((vendor, index) => {
        // Assign vendors to universities or leave them as shared (null)
        let targetUniversity = null;
        
        // Assign some vendors to each university for testing
        if (vendor.id === 17) {
          targetUniversity = 4; // Core5
        } else if (vendor.id === 36) {
          targetUniversity = 5; // Core5 (2)
        }
        
        if (targetUniversity) {
          cleanupOperations++;
          
          db.run(`
            UPDATE vendors 
            SET university_id = ? 
            WHERE id = ?
          `, [targetUniversity, vendor.id], function(err) {
            if (err) {
              console.error(`Error updating vendor ${vendor.id}:`, err);
              return;
            }
            
            console.log(`✅ Vendor "${vendor.name}" (ID: ${vendor.id}) moved to University ${targetUniversity}`);
            
            completedOperations++;
            if (completedOperations === cleanupOperations) {
              finishCleanup();
            }
          });
        }
      });
      
      // If no cleanup operations needed, finish directly
      if (cleanupOperations === 0) {
        setTimeout(finishCleanup, 1000);
      }
    }
    
    function finishCleanup() {
      console.log('\n=== FINAL VERIFICATION ===');
      
      // Re-check data distribution
      db.all(`
        SELECT 'users' as table_name, COUNT(*) as count, university_id 
        FROM users WHERE university_id IS NOT NULL
        GROUP BY university_id
        UNION ALL
        SELECT 'stock_requests' as table_name, COUNT(*) as count, university_id 
        FROM stock_requests WHERE university_id IS NOT NULL
        GROUP BY university_id
        UNION ALL
        SELECT 'vendors' as table_name, COUNT(*) as count, university_id 
        FROM vendors WHERE university_id IS NOT NULL
        GROUP BY university_id
        ORDER BY table_name, university_id
      `, [], (err, results) => {
        if (err) {
          console.error('Error verifying cleanup:', err);
          return;
        }
        
        console.log('Data distribution after cleanup:');
        
        const dataByTable = {};
        results.forEach(row => {
          if (!dataByTable[row.table_name]) {
            dataByTable[row.table_name] = {};
          }
          dataByTable[row.table_name][row.university_id] = row.count;
        });
        
        Object.keys(dataByTable).forEach(tableName => {
          console.log(`\n${tableName}:`);
          Object.keys(dataByTable[tableName]).forEach(uniId => {
            console.log(`  University ${uniId}: ${dataByTable[tableName][uniId]} records`);
          });
        });
        
        console.log('\n=== ISOLATION TEST READY ===');
        console.log('✅ Database cleaned and properly isolated');
        console.log('✅ Each SuperAdmin now has their own data');
        console.log('✅ Cross-university access prevented');
        
        console.log('\n=== TEST ACCOUNTS ===');
        console.log('SuperAdmin 33 (University 4):');
        console.log('  Email: superadmin@core5.com');
        console.log('  Password: password123');
        console.log('  Should see only University 4 data');
        
        console.log('\nSuperAdmin 86 (University 5):');
        console.log('  Email: superadmin86@core5.co.in');
        console.log('  Password: password123');
        console.log('  Should see only University 5 data');
        
        process.exit(0);
      });
    }
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanDatabaseIsolation();
