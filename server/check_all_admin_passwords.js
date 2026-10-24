const db = require('./config/database-switch');

async function checkAllAdminPasswords() {
  console.log('🔍 Checking All Admin Users Passwords...\n');
  
  try {
    // Get all admin users with passwords
    db.all("SELECT id, name, email, role, password FROM users WHERE role IN ('admin', 'superadmin') ORDER BY id", (err, admins) => {
      if (err) {
        console.error('❌ Error fetching admins:', err);
        return;
      }
      
      console.log('📋 All Admin/SuperAdmin Users:');
      if (admins.length === 0) {
        console.log('   No admin users found');
        return;
      }
      
      admins.forEach(admin => {
        console.log(`\n👤 ${admin.name} (${admin.email})`);
        console.log(`   - ID: ${admin.id}`);
        console.log(`   - Role: ${admin.role}`);
        console.log(`   - Password Hash: ${admin.password}`);
        
        // Check if password is plain text or hashed
        if (admin.password && admin.password.length < 50 && !admin.password.startsWith('$2')) {
          console.log(`   - 🔑 Password (Plain Text): ${admin.password}`);
        } else {
          console.log('   - 🔑 Password: Hashed (bcrypt)');
        }
      });
      
      // Check for known test passwords
      console.log('\n🔐 COMMON TEST PASSWORDS:');
      console.log('   - admin123');
      console.log('   - password');
      console.log('   - test123');
      console.log('   - 123456');
      console.log('   - admin');
      
      console.log('\n🌐 ADMIN LOGIN OPTIONS:');
      admins.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.name}: ${admin.email}`);
        if (admin.password && admin.password.length < 50 && !admin.password.startsWith('$2')) {
          console.log(`      Password: ${admin.password}`);
        } else {
          console.log(`      Password: Try common test passwords or check database`);
        }
      });
      
      console.log('\n👨‍💻 Admin Portal: http://localhost:5174/admin/dashboard');
      console.log('🔐 Use any of the above credentials to login');
      
      // If you want to create a superadmin user, uncomment the code below:
      /*
      console.log('\n🔧 To create a superadmin user, run:');
      console.log('   INSERT INTO users (name, email, password, role, university_id, isApproved) VALUES');
      console.log('   ("Super Admin", "superadmin@test.com", "admin123", "superadmin", 1, 1)');
      */
    });
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  }
}

checkAllAdminPasswords();
