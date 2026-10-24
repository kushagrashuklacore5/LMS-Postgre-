const db = require('./config/database-switch');

async function checkExistingUsers() {
  console.log('🔍 Checking existing users with generated passwords...\n');
  
  try {
    const users = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, name, email, role, university_id, isApproved, 
               CASE 
                 WHEN LENGTH(password) = 60 AND password LIKE '$2a$%' THEN 'bcrypt'
                 WHEN LENGTH(password) = 64 AND password LIKE '%$%' THEN 'sha256'
                 ELSE 'unknown'
               END as password_type
        FROM users 
        WHERE email NOT IN ('student@gmail.com', 'mentor@gmail.com', 'admin@gmail.com', 'accountant@demo.com', 'storekeeper@demo.com', 'superadmin@core5.com', 'portal@core5.co.in')
        ORDER BY created_at DESC
        LIMIT 10
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`📊 Found ${users.length} non-demo users:`);
    
    users.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   University: ${user.university_id}`);
      console.log(`   Approved: ${user.isApproved ? 'Yes' : 'No'}`);
      console.log(`   Password Type: ${user.password_type}`);
      console.log(`   Created: Recently`);
    });
    
    if (users.length === 0) {
      console.log('❌ No non-demo users found in database');
      console.log('💡 You need to create users first (with authentication) to test login');
    } else {
      console.log('\n✅ Found users you can test login with');
      console.log('💡 Try logging in with these emails using any password (they might be demo users with password bypass)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkExistingUsers();
