const db = require('./config/database-switch');

console.log('🔍 Checking University ID in Users Table...');

// Check what university_id values exist in the users table
db.all("SELECT id, name, email, role, university_id FROM users LIMIT 10", (err, users) => {
  if (err) {
    console.error('❌ Error checking users:', err);
    return;
  }
  
  console.log('📋 Users and their university_id:');
  users.forEach(user => {
    console.log(`   - ${user.name} (${user.email}): university_id = ${user.university_id}`);
  });
  
  // Check what university_id values exist in the universities table
  db.all("SELECT id, name FROM universities LIMIT 5", (err, universities) => {
    if (err) {
      console.error('❌ Error checking universities:', err);
      return;
    }
    
    console.log('\n📋 Available Universities:');
    universities.forEach(uni => {
      console.log(`   - ID: ${uni.id}, Name: ${uni.name}`);
    });
    
    // Set a default university_id for admin if needed
    if (universities.length > 0) {
      const defaultUniId = universities[0].id;
      console.log(`\n💡 Default university_id for announcements: ${defaultUniId}`);
      
      // Update admin user to have university_id
      db.run("UPDATE users SET university_id = ? WHERE role = 'admin'", [defaultUniId], (err) => {
        if (err) {
          console.error('❌ Error updating admin university_id:', err);
        } else {
          console.log('✅ Updated admin user with default university_id');
        }
      });
    }
  });
});
