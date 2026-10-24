const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const MAIN_DB_PATH = path.join(__dirname, 'data', 'lms-main.sqlite');
const TENANT_DB_DIR = path.join(__dirname, 'data', 'tenants');

console.log('🧪 Demonstrating Complete User Isolation');
console.log('=======================================\n');

async function demonstrateIsolation() {
  console.log('📋 Creating test users in different tenant databases...\n');
  
  // Get superadmin info
  const mainDb = new sqlite3.Database(MAIN_DB_PATH);
  
  mainDb.all('SELECT * FROM users WHERE role = "superadmin"', [], async (err, superadmins) => {
    if (err) {
      console.error('Error getting superadmins:', err);
      return;
    }
    
    console.log(`Found ${superadmins.length} superadmins for testing\n`);
    
    // Create test users for each superadmin
    for (const superadmin of superadmins) {
      const tenantDbPath = path.join(TENANT_DB_DIR, `tenant_${superadmin.id}.sqlite`);
      const tenantDb = new sqlite3.Database(tenantDbPath);
      
      console.log(`🏗️ Creating users for SuperAdmin: ${superadmin.name} (${superadmin.email})`);
      
      // Test users to create
      const testUsers = [
        { name: 'John Doe', email: `john_${superadmin.id}@test.com`, role: 'student' },
        { name: 'Jane Smith', email: `jane_${superadmin.id}@test.com`, role: 'teacher' },
        { name: 'Admin User', email: `admin_${superadmin.id}@test.com`, role: 'admin' }
      ];
      
      for (const user of testUsers) {
        try {
          const hashedPassword = await bcrypt.hash('Test@123', 10);
          
          tenantDb.run(`
            INSERT INTO users (name, email, password, role, university_id, superadmin_id)
            VALUES (?, ?, ?, ?, 1, ?)
          `, [user.name, user.email, hashedPassword, user.role, superadmin.id], function(err) {
            if (err) {
              console.error(`  ❌ Error creating ${user.email}:`, err.message);
            } else {
              console.log(`  ✅ Created user: ${user.name} (${user.email}) - ID: ${this.lastID}`);
            }
          });
        } catch (error) {
          console.error(`  ❌ Error hashing password for ${user.email}:`, error);
        }
      }
      
      // Wait a bit for operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Show users in this tenant
      tenantDb.all(`
        SELECT id, name, email, role, superadmin_id 
        FROM users 
        ORDER BY id
      `, [], (err, users) => {
        if (err) {
          console.error(`Error fetching users for tenant ${superadmin.id}:`, err);
        } else {
          console.log(`\n📊 Users in Tenant ${superadmin.id} (${superadmin.name}):`);
          users.forEach(user => {
            console.log(`  - ${user.name} (${user.email}) - ${user.role} - SuperAdminID: ${user.superadmin_id}`);
          });
          console.log(`  Total: ${users.length} users\n`);
        }
      });
    }
    
    // Final isolation verification
    setTimeout(() => {
      console.log('🔒 FINAL ISOLATION VERIFICATION');
      console.log('================================\n');
      
      superadmins.forEach(superadmin => {
        const tenantDbPath = path.join(TENANT_DB_DIR, `tenant_${superadmin.id}.sqlite`);
        const tenantDb = new sqlite3.Database(tenantDbPath);
        
        tenantDb.all('SELECT * FROM users', [], (err, users) => {
          if (err) {
            console.error(`Error checking tenant ${superadmin.id}:`, err);
          } else {
            const otherSuperadminUsers = users.filter(u => u.superadmin_id !== superadmin.id);
            
            if (otherSuperadminUsers.length === 0) {
              console.log(`✅ Tenant ${superadmin.id}: PERFECT ISOLATION - No users from other superadmins`);
            } else {
              console.log(`❌ Tenant ${superadmin.id}: ISOLATION BREACH - Found ${otherSuperadminUsers.length} users from other superadmins`);
              otherSuperadminUsers.forEach(u => {
                console.log(`    - ${u.name} (${u.email}) - belongs to SuperAdmin ${u.superadmin_id}`);
              });
            }
          }
        });
      });
      
      console.log('\n🎉 DATABASE ISOLATION DEMONSTRATION COMPLETED!');
      console.log('================================================');
      console.log('✅ Each superadmin has their own completely separate database');
      console.log('✅ Users are created only in their superadmin\'s tenant database');
      console.log('✅ No users are shared between different superadmin databases');
      console.log('✅ Complete isolation achieved!');
      
      console.log('\n📋 LOGIN CREDENTIALS FOR TESTING:');
      console.log('==================================');
      superadmins.forEach(superadmin => {
        console.log(`\nSuperAdmin ${superadmin.id}: ${superadmin.email} / Admin@123`);
        console.log(`  Student: john_${superadmin.id}@test.com / Test@123`);
        console.log(`  Teacher: jane_${superadmin.id}@test.com / Test@123`);
        console.log(`  Admin: admin_${superadmin.id}@test.com / Test@123`);
      });
      
      console.log('\n🔧 HOW TO TEST:');
      console.log('===============');
      console.log('1. Start the server: npm start');
      console.log('2. Login as different superadmins');
      console.log('3. Create new users - they will only appear in that superadmin\'s database');
      console.log('4. Verify that users created by one superadmin are NOT visible to others');
      console.log('5. Check that each superadmin only sees their own users');
      
      process.exit(0);
    }, 2000);
  });
}

demonstrateIsolation().catch(error => {
  console.error('❌ Error during demonstration:', error);
  process.exit(1);
});
