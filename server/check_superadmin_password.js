const db = require('./config/database-switch');

async function checkSuperAdminPassword() {
  console.log('🔍 Checking SuperAdmin Password...\n');
  
  try {
    // Get superadmin user details
    db.get("SELECT id, name, email, role, password FROM users WHERE email = ?", ['superadmin@test.com'], (err, user) => {
      if (err) {
        console.error('❌ Error finding superadmin:', err);
        return;
      }
      
      if (!user) {
        console.log('❌ SuperAdmin user not found');
        
        // Check if there are any admin users
        db.all("SELECT id, name, email, role FROM users WHERE role = 'admin' OR role = 'superadmin'", (err, admins) => {
          if (err) {
            console.error('❌ Error fetching admins:', err);
            return;
          }
          
          console.log('📋 Available Admin/SuperAdmin Users:');
          if (admins.length === 0) {
            console.log('   No admin users found');
          } else {
            admins.forEach(admin => {
              console.log(`   - ${admin.name} (${admin.email}) - Role: ${admin.role}`);
            });
          }
        });
        return;
      }
      
      console.log('👨‍💻 SuperAdmin User Found:');
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Name: ${user.name}`);
      console.log(`   - Email: ${user.email}`);
      console.log(`   - Role: ${user.role}`);
      console.log(`   - Password Hash: ${user.password}`);
      
      // Check if password is plain text or hashed
      if (user.password && user.password.length < 50 && !user.password.startsWith('$2')) {
        console.log(`   - Password (Plain Text): ${user.password}`);
      } else {
        console.log('   - Password: Hashed (bcrypt)');
        console.log('   - To verify password, use bcrypt.compare()');
      }
      
      // List all admin users for reference
      db.all("SELECT id, name, email, role FROM users WHERE role IN ('admin', 'superadmin') ORDER BY id", (err, admins) => {
        if (err) {
          console.error('❌ Error fetching admins:', err);
          return;
        }
        
        console.log('\n📋 All Admin/SuperAdmin Users:');
        admins.forEach(admin => {
          console.log(`   - ${admin.name} (${admin.email}) - Role: ${admin.role}`);
        });
        
        console.log('\n🔐 LOGIN CREDENTIALS:');
        console.log('👨‍💻 SuperAdmin: superadmin@test.com');
        if (user.password && user.password.length < 50 && !user.password.startsWith('$2')) {
          console.log(`🔑 Password: ${user.password}`);
        } else {
          console.log('🔑 Password: [Hashed - needs verification]');
        }
        
        console.log('\n🌐 ADMIN LOGIN:');
        console.log('👨‍💻 Admin Portal: http://localhost:5174/admin/dashboard');
        console.log('🔐 Use the above credentials to login');
      });
    });
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  }
}

checkSuperAdminPassword();
