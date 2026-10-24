const db = require('./config/database-switch');

console.log('=== CHECKING CURRENT USERS ===');

async function checkCurrentUsers() {
  try {
    console.log('1. Checking all users in database...');
    
    db.all(`
      SELECT id, name, email, role, university_id, created_at
      FROM users 
      ORDER BY id DESC
    `, [], (err, users) => {
      if (err) {
        console.error('Error fetching users:', err);
        return;
      }
      
      console.log(`\nFound ${users.length} users in database:`);
      console.log('=====================================');
      
      users.forEach(user => {
        console.log(`ID: ${user.id}`);
        console.log(`Name: ${user.name}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log(`University: ${user.university_id || 'None'}`);
        console.log(`Created: ${user.created_at || 'Unknown'}`);
        console.log('-------------------------------------');
      });
      
      // Check for SuperAdmins specifically
      const superAdmins = users.filter(u => u.role === 'superadmin');
      console.log(`\n🔍 Found ${superAdmins.length} SuperAdmins:`);
      
      if (superAdmins.length === 0) {
        console.log('❌ No SuperAdmins found in database');
      } else {
        superAdmins.forEach(sa => {
          console.log(`  - ${sa.name} (${sa.email}) - ID: ${sa.id}`);
        });
      }
      
      // Check for recent users (created in last few minutes)
      const now = new Date();
      const recentUsers = users.filter(u => {
        if (!u.created_at) return false;
        const createdTime = new Date(u.created_at);
        const diffMinutes = (now - createdTime) / (1000 * 60);
        return diffMinutes < 10; // Users created in last 10 minutes
      });
      
      console.log(`\n🕐 Found ${recentUsers.length} recently created users (last 10 minutes):`);
      
      if (recentUsers.length === 0) {
        console.log('❌ No recently created users found');
      } else {
        recentUsers.forEach(user => {
          const createdTime = new Date(user.created_at);
          const diffMinutes = Math.round((now - createdTime) / (1000 * 60));
          console.log(`  - ${user.name} (${user.email}) - Created ${diffMinutes} minutes ago`);
        });
      }
      
      console.log('\n2. Testing SuperAdmin login...');
      testSuperAdminLogin();
    });
    
    function testSuperAdminLogin() {
      // Test if we can find the SuperAdmin you created
      console.log('\n🔍 Checking for recently created SuperAdmin...');
      
      db.all(`
        SELECT id, name, email, role, password, university_id
        FROM users 
        WHERE role = 'superadmin' 
        ORDER BY id DESC
        LIMIT 5
      `, [], (err, superAdmins) => {
        if (err) {
          console.error('Error fetching SuperAdmins:', err);
          return;
        }
        
        if (superAdmins.length === 0) {
          console.log('❌ No SuperAdmins found in database');
          console.log('\n🔧 Possible issues:');
          console.log('1. SuperAdmin creation failed during save');
          console.log('2. User was saved with different role');
          console.log('3. Database transaction was rolled back');
          console.log('4. Email validation failed');
          
          console.log('\n💡 Solutions:');
          console.log('1. Check browser console for errors during creation');
          console.log('2. Try creating SuperAdmin again');
          console.log('3. Use existing SuperAdmin account:');
          console.log('   Email: superadmin@core5.co.in');
          console.log('   Password: password123');
          
          return;
        }
        
        console.log(`✅ Found ${superAdmins.length} SuperAdmins:`);
        
        superAdmins.forEach((sa, index) => {
          console.log(`\n${index + 1}. ${sa.name}`);
          console.log(`   Email: ${sa.email}`);
          console.log(`   ID: ${sa.id}`);
          console.log(`   University: ${sa.university_id || 'None'}`);
          console.log(`   Password Hash: ${sa.password ? 'Present' : 'Missing'}`);
          
          if (sa.password) {
            console.log(`   ✅ Password is set - should be able to login`);
          } else {
            console.log(`   ❌ Password is missing - cannot login`);
          }
        });
        
        console.log('\n3. Checking login credentials...');
        checkLoginCredentials();
      });
    }
    
    function checkLoginCredentials() {
      // Get the most recent SuperAdmin
      db.get(`
        SELECT id, name, email, role, password
        FROM users 
        WHERE role = 'superadmin' 
        ORDER BY id DESC 
        LIMIT 1
      `, [], (err, latestSuperAdmin) => {
        if (err) {
          console.error('Error fetching latest SuperAdmin:', err);
          return;
        }
        
        if (!latestSuperAdmin) {
          console.log('❌ No SuperAdmin found to test');
          return;
        }
        
        console.log(`\n🔑 Testing login for: ${latestSuperAdmin.email}`);
        
        // Check if password exists
        if (!latestSuperAdmin.password) {
          console.log('❌ Password is missing from database');
          console.log('🔧 Fix: Set a password for this user');
          
          // Fix the password
          fixSuperAdminPassword(latestSuperAdmin.id);
          return;
        }
        
        console.log('✅ Password exists in database');
        console.log('✅ User should be able to login');
        
        console.log('\n=== LOGIN INSTRUCTIONS ===');
        console.log(`Email: ${latestSuperAdmin.email}`);
        console.log('Password: [Use the password you set during creation]');
        console.log('URL: http://localhost:3000/login');
        
        console.log('\nIf login still fails, try these working accounts:');
        console.log('1. superadmin@core5.co.in / password123');
        console.log('2. portal@core5.co.in / Core5@2022');
        
        process.exit(0);
      });
    }
    
    function fixSuperAdminPassword(userId) {
      const bcrypt = require('bcryptjs');
      const defaultPassword = 'password123';
      
      bcrypt.hash(defaultPassword, 10, (err, hashedPassword) => {
        if (err) {
          console.error('Error hashing password:', err);
          return;
        }
        
        db.run(`
          UPDATE users 
          SET password = ? 
          WHERE id = ?
        `, [hashedPassword, userId], function(err) {
          if (err) {
            console.error('Error updating password:', err);
            return;
          }
          
          console.log(`✅ Password fixed for SuperAdmin ID: ${userId}`);
          console.log(`✅ Can now login with: password123`);
          
          process.exit(0);
        });
      });
    }
    
  } catch (error) {
    console.error('Error checking users:', error);
    process.exit(1);
  }
}

checkCurrentUsers();
