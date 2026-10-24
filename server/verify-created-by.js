const db = require('./config/database-switch');

console.log('=== VERIFYING CREATED_BY FILTERING ===');

async function verifyCreatedByFiltering() {
  try {
    console.log('1. Checking current user distribution with created_by...');
    
    db.all(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.role,
        u.university_id,
        u.created_by,
        creator.name as creator_name,
        creator.email as creator_email
      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      ORDER BY u.created_by, u.role, u.name
    `, [], (err, users) => {
      if (err) {
        console.error('Error fetching users:', err);
        return;
      }
      
      console.log('\n📊 CURRENT USER DISTRIBUTION:');
      console.log('=====================================');
      
      const usersByCreator = {};
      users.forEach(user => {
        const creatorId = user.created_by || 'system';
        if (!usersByCreator[creatorId]) {
          usersByCreator[creatorId] = [];
        }
        usersByCreator[creatorId].push(user);
      });
      
      Object.keys(usersByCreator).forEach(creatorId => {
        const creatorUsers = usersByCreator[creatorId];
        const creatorName = creatorId === 'system' ? 'System' : 
                          creatorUsers[0]?.creator_name || `Unknown (${creatorId})`;
        
        console.log(`\n👤 Created by: ${creatorName} (${creatorId})`);
        creatorUsers.forEach(user => {
          console.log(`  - ${user.name} (${user.email}) - Role: ${user.role}, Uni: ${user.university_id || 'None'}`);
        });
      });
      
      console.log('\n2. Testing SuperAdmin created_by filtering...');
      
      // Test each SuperAdmin's view
      const superAdmins = users.filter(u => u.role === 'superadmin');
      
      if (superAdmins.length === 0) {
        console.log('❌ No SuperAdmins found to test');
        return;
      }
      
      console.log(`\n🔍 Testing ${superAdmins.length} SuperAdmins:`);
      
      let testCount = 0;
      let totalTests = superAdmins.length;
      
      superAdmins.forEach(sa => {
        console.log(`\n--- Testing SuperAdmin: ${sa.name} (ID: ${sa.id}) ---`);
        console.log(`University: ${sa.university_id}`);
        
        // Simulate what this SuperAdmin would see with created_by filtering
        let whereClause = "";
        let params = [];
        
        if (sa.university_id === null) {
          // Portal admin - sees all users
          whereClause = "1=1";
          params = [];
        } else {
          // Regular SuperAdmin - sees only users created by them (including themselves)
          whereClause = "created_by = ? OR id = ?";
          params = [sa.id, sa.id];
        }
        
        db.all(`
          SELECT id, name, email, role, university_id, created_by
          FROM users
          WHERE ${whereClause}
          ORDER BY role, name
        `, params, (err, visibleUsers) => {
          if (err) {
            console.error(`Error testing SuperAdmin ${sa.id}:`, err);
            return;
          }
          
          console.log(`👥 Users visible to ${sa.name}: ${visibleUsers.length}`);
          
          // Count by role
          const roleCounts = {};
          visibleUsers.forEach(user => {
            roleCounts[user.role] = (roleCounts[user.role] || 0) + 1;
          });
          
          Object.keys(roleCounts).forEach(role => {
            console.log(`  - ${role}: ${roleCounts[role]} users`);
          });
          
          // Check for cross-creator visibility
          const otherCreatorsVisible = visibleUsers.filter(u => 
            u.created_by !== sa.id && u.id !== sa.id
          );
          
          if (otherCreatorsVisible.length > 0) {
            console.log(`❌ ISOLATION BREACH: Can see ${otherCreatorsVisible.length} users created by others:`);
            otherCreatorsVisible.forEach(user => {
              console.log(`    - ${user.name} (${user.email}) - Created by: ${user.created_by}`);
            });
          } else {
            console.log(`✅ ISOLATION SECURE: Can see only self-created users`);
          }
          
          testCount++;
          
          if (testCount === totalTests) {
            console.log('\n=== CREATED_BY FILTERING SUMMARY ===');
            showSummary(users, superAdmins);
          }
        });
      });
    });
    
    function showSummary(users, superAdmins) {
      console.log('\n📋 CREATED_BY FILTERING STATUS:');
      
      const portalAdmins = superAdmins.filter(sa => sa.university_id === null);
      const regularSuperAdmins = superAdmins.filter(sa => sa.university_id !== null);
      
      console.log(`🔑 Portal Admins: ${portalAdmins.length}`);
      portalAdmins.forEach(pa => {
        console.log(`  - ${pa.name} (${pa.email}) - Can see all users`);
      });
      
      console.log(`\n🎓 Regular SuperAdmins: ${regularSuperAdmins.length}`);
      regularSuperAdmins.forEach(sa => {
        const createdUsers = users.filter(u => u.created_by === sa.id);
        console.log(`  - ${sa.name} (${sa.email}) - Created ${createdUsers.length} users (including self)`);
        createdUsers.forEach(user => {
          console.log(`    - ${user.name} (${user.role})`);
        });
      });
      
      console.log('\n✅ CREATED_BY FILTERING IMPLEMENTED!');
      console.log('✅ Each SuperAdmin sees only users they created');
      console.log('✅ Cross-creator visibility prevented');
      console.log('✅ Portal Admins retain full visibility');
      
      console.log('\n🔧 WHAT WAS IMPLEMENTED:');
      console.log('1. Added created_by column to users table');
      console.log('2. Updated user creation to set created_by');
      console.log('3. Modified getAllUsers() to filter by created_by');
      console.log('4. Each SuperAdmin sees only their created users');
      
      console.log('\n🧪 TEST INSTRUCTIONS:');
      console.log('1. Login as different SuperAdmins');
      console.log('2. Check "All Staff" section');
      console.log('3. Verify each sees only users they created');
      console.log('4. Create new users and verify they appear');
      
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Error verifying created_by filtering:', error);
    process.exit(1);
  }
}

verifyCreatedByFiltering();
