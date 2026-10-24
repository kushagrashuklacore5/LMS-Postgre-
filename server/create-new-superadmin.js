const db = require('./config/database-switch');
const bcrypt = require('bcryptjs');

console.log('=== CREATING NEW SUPERADMIN ===');

async function createNewSuperAdmin() {
  try {
    // Create a new SuperAdmin with proper credentials
    const newSuperAdmin = {
      name: 'New SuperAdmin',
      email: 'newsuperadmin@core5.co.in',
      password: 'password123',
      role: 'superadmin',
      university_id: null
    };
    
    console.log('1. Creating new SuperAdmin account...');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(newSuperAdmin.password, 10);
    
    // Insert the new SuperAdmin
    db.run(`
      INSERT INTO users (name, email, password, role, university_id)
      VALUES (?, ?, ?, ?, ?)
    `, [newSuperAdmin.name, newSuperAdmin.email, hashedPassword, newSuperAdmin.role, newSuperAdmin.university_id], function(err) {
      if (err) {
        console.error('Error creating new SuperAdmin:', err);
        
        if (err.code === 'SQLITE_CONSTRAINT') {
          console.log('❌ Email already exists. Trying alternative email...');
          
          // Try with a different email
          const alternativeEmail = `superadmin${Date.now()}@core5.co.in`;
          
          db.run(`
            INSERT INTO users (name, email, password, role, university_id)
            VALUES (?, ?, ?, ?, ?)
          `, [newSuperAdmin.name, alternativeEmail, hashedPassword, newSuperAdmin.role, newSuperAdmin.university_id], function(err) {
            if (err) {
              console.error('Error creating SuperAdmin with alternative email:', err);
              return;
            }
            
            console.log(`✅ Created SuperAdmin with alternative email: ${alternativeEmail}`);
            console.log(`   ID: ${this.lastID}`);
            console.log(`   Password: ${newSuperAdmin.password}`);
            
            showCredentials(alternativeEmail, newSuperAdmin.password, this.lastID);
          });
        } else {
          console.error('Unknown error:', err);
        }
        return;
      }
      
      console.log(`✅ Successfully created new SuperAdmin!`);
      console.log(`   ID: ${this.lastID}`);
      console.log(`   Email: ${newSuperAdmin.email}`);
      console.log(`   Password: ${newSuperAdmin.password}`);
      
      showCredentials(newSuperAdmin.email, newSuperAdmin.password, this.lastID);
    });
    
    function showCredentials(email, password, userId) {
      console.log('\n=== NEW SUPERADMIN CREDENTIALS ===');
      console.log(`🔑 Email: ${email}`);
      console.log(`🔑 Password: ${password}`);
      console.log(`🔑 User ID: ${userId}`);
      console.log(`🔑 Role: superadmin`);
      
      console.log('\n🌐 LOGIN URL: http://localhost:3000/login');
      
      console.log('\n✅ This SuperAdmin account is ready to use!');
      console.log('✅ You can now login with these credentials');
      console.log('✅ The account has full SuperAdmin privileges');
      
      console.log('\n📋 ALL AVAILABLE SUPERADMIN ACCOUNTS:');
      console.log('1. superadmin@core5.co.in / password123 (Original)');
      console.log(`2. ${email} / ${password} (New)`);
      console.log('3. portal@core5.co.in / Core5@2022 (Portal Admin)');
      
      console.log('\n🔧 If you want to create universities for this SuperAdmin:');
      console.log('1. Login with the new SuperAdmin account');
      console.log('2. Go to University Management');
      console.log('3. Create new universities');
      console.log('4. Assign users to universities');
      
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Error creating new SuperAdmin:', error);
    process.exit(1);
  }
}

createNewSuperAdmin();
