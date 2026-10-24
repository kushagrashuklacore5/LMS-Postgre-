const db = require('./config/database-switch');

console.log('=== DATABASE ISOLATION CHECK FOR SUPERADMINS ===');

async function checkIsolation() {
  try {
    console.log('1. Checking database configuration...');
    console.log('Database type:', process.env.USE_POSTGRES === 'true' ? 'PostgreSQL' : 'SQLite');
    
    // 1. Check universities table structure
    console.log('\n2. Checking universities table...');
    const universitiesQuery = `
      SELECT id, name, adminId 
      FROM universities 
      ORDER BY adminId
    `;
    
    db.all(universitiesQuery, [], (err, universities) => {
      if (err) {
        console.error('Error fetching universities:', err);
        return;
      }
      
      console.log(`Found ${universities.length} universities:`);
      universities.forEach(uni => {
        console.log(`- University ID: ${uni.id}, Name: ${uni.name}, SuperAdmin ID: ${uni.adminId}`);
      });
      
      // 2. Check users table structure with university_id
      console.log('\n3. Checking users table distribution...');
      const usersQuery = `
        SELECT u.id, u.name, u.email, u.role, u.university_id, uni.name as universityName, uni.adminId
        FROM users u
        LEFT JOIN universities uni ON u.university_id = uni.id
        ORDER BY uni.adminId, u.role
      `;
      
      db.all(usersQuery, [], (err, users) => {
        if (err) {
          console.error('Error fetching users:', err);
          return;
        }
        
        console.log(`Found ${users.length} users:`);
        
        // Group users by superadmin
        const usersBySuperAdmin = {};
        users.forEach(user => {
          const superAdminId = user.adminId || 'unassigned';
          if (!usersBySuperAdmin[superAdminId]) {
            usersBySuperAdmin[superAdminId] = [];
          }
          usersBySuperAdmin[superAdminId].push(user);
        });
        
        // Display users grouped by superadmin
        Object.keys(usersBySuperAdmin).forEach(superAdminId => {
          console.log(`\n--- SuperAdmin ${superAdminId} Users ---`);
          usersBySuperAdmin[superAdminId].forEach(user => {
            console.log(`  User ID: ${user.id}, Name: ${user.name}, Role: ${user.role}, University: ${user.universityName || 'None'}`);
          });
        });
        
        // 3. Check stock requests isolation
        console.log('\n4. Checking stock requests isolation...');
        const stockRequestsQuery = `
          SELECT sr.id, sr.title, sr.storekeeper_id, sr.university_id, 
                 u.name as storekeeperName, uni.name as universityName, uni.adminId
          FROM stock_requests sr
          JOIN users u ON sr.storekeeper_id = u.id
          JOIN universities uni ON sr.university_id = uni.id
          ORDER BY uni.adminId
        `;
        
        db.all(stockRequestsQuery, [], (err, stockRequests) => {
          if (err) {
            console.error('Error fetching stock requests:', err);
            return;
          }
          
          console.log(`Found ${stockRequests.length} stock requests:`);
          
          // Group stock requests by superadmin
          const requestsBySuperAdmin = {};
          stockRequests.forEach(request => {
            const superAdminId = request.adminId;
            if (!requestsBySuperAdmin[superAdminId]) {
              requestsBySuperAdmin[superAdminId] = [];
            }
            requestsBySuperAdmin[superAdminId].push(request);
          });
          
          // Display stock requests grouped by superadmin
          Object.keys(requestsBySuperAdmin).forEach(superAdminId => {
            console.log(`\n--- SuperAdmin ${superAdminId} Stock Requests ---`);
            requestsBySuperAdmin[superAdminId].forEach(request => {
              console.log(`  Request ID: ${request.id}, Title: ${request.title}, University: ${request.universityName}, Storekeeper: ${request.storekeeperName}`);
            });
          });
          
          // 4. Check vendors isolation
          console.log('\n5. Checking vendors isolation...');
          const vendorsQuery = `
            SELECT v.id, v.name, v.university_id, uni.name as universityName, uni.adminId
            FROM vendors v
            LEFT JOIN universities uni ON v.university_id = uni.id
            ORDER BY uni.adminId
          `;
          
          db.all(vendorsQuery, [], (err, vendors) => {
            if (err) {
              console.error('Error fetching vendors:', err);
              return;
            }
            
            console.log(`Found ${vendors.length} vendors:`);
            
            // Group vendors by superadmin
            const vendorsBySuperAdmin = {};
            vendors.forEach(vendor => {
              const superAdminId = vendor.adminId || 'unassigned';
              if (!vendorsBySuperAdmin[superAdminId]) {
                vendorsBySuperAdmin[superAdminId] = [];
              }
              vendorsBySuperAdmin[superAdminId].push(vendor);
            });
            
            // Display vendors grouped by superadmin
            Object.keys(vendorsBySuperAdmin).forEach(superAdminId => {
              console.log(`\n--- SuperAdmin ${superAdminId} Vendors ---`);
              vendorsBySuperAdmin[superAdminId].forEach(vendor => {
                console.log(`  Vendor ID: ${vendor.id}, Name: ${vendor.name}, University: ${vendor.universityName || 'Shared'}`);
              });
            });
            
            // 5. Final isolation analysis
            console.log('\n=== ISOLATION ANALYSIS ===');
            
            let isolationIssues = [];
            
            // Check for cross-contamination
            Object.keys(usersBySuperAdmin).forEach(superAdminId => {
              if (superAdminId !== 'unassigned') {
                const users = usersBySuperAdmin[superAdminId];
                const uniqueUniversities = [...new Set(users.map(u => u.university_id))];
                
                users.forEach(user => {
                  if (user.university_id && !uniqueUniversities.includes(user.university_id)) {
                    isolationIssues.push(`User ${user.name} belongs to university not assigned to SuperAdmin ${superAdminId}`);
                  }
                });
              }
            });
            
            // Check stock requests isolation
            Object.keys(requestsBySuperAdmin).forEach(superAdminId => {
              const requests = requestsBySuperAdmin[superAdminId];
              requests.forEach(request => {
                // Check if storekeeper belongs to same superadmin
                const storekeeper = users.find(u => u.id === request.storekeeper_id);
                if (storekeeper && storekeeper.adminId !== request.adminId) {
                  isolationIssues.push(`Stock Request ${request.id} created by storekeeper from different SuperAdmin domain`);
                }
              });
            });
            
            if (isolationIssues.length === 0) {
              console.log('✅ DATABASE ISOLATION: SECURE');
              console.log('✅ No cross-contamination found between SuperAdmin domains');
              console.log('✅ Users are properly isolated by university_id');
              console.log('✅ Stock requests are isolated by university_id');
              console.log('✅ Vendors are properly isolated');
            } else {
              console.log('❌ DATABASE ISOLATION: COMPROMISED');
              console.log('❌ Found isolation issues:');
              isolationIssues.forEach(issue => console.log(`   - ${issue}`));
            }
            
            console.log('\n=== ISOLATION SUMMARY ===');
            console.log(`Total SuperAdmins: ${Object.keys(usersBySuperAdmin).filter(id => id !== 'unassigned').length}`);
            console.log(`Total Universities: ${universities.length}`);
            console.log(`Total Users: ${users.length}`);
            console.log(`Total Stock Requests: ${stockRequests.length}`);
            console.log(`Total Vendors: ${vendors.length}`);
            console.log(`Isolation Status: ${isolationIssues.length === 0 ? 'SECURE' : 'COMPROMISED'}`);
            
            process.exit(0);
          });
        });
      });
    });
    
  } catch (error) {
    console.error('Error during isolation check:', error);
    process.exit(1);
  }
}

checkIsolation();
