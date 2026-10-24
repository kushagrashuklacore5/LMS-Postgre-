const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/lms-database.sqlite');

console.log('🔍 Checking Password Hashes\n');
console.log('=' .repeat(60));

db.all(`
  SELECT id, name, email, password, role
  FROM users 
  WHERE university_id = 4
  ORDER BY name
`, (err, users) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('👥 Users and their password hashes:');
  console.log('-' .repeat(40));
  
  users.forEach(user => {
    console.log(`👤 ${user.name} (${user.role})`);
    console.log(`   📧 Email: ${user.email}`);
    console.log(`   🔑 Password Hash: ${user.password.substring(0, 50)}...`);
    console.log('');
  });
  
  // Let's also check if there's a working superadmin
  db.get(`
    SELECT id, name, email, password, role
    FROM users 
    WHERE role = 'superadmin'
    LIMIT 1
  `, (err, superadmin) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    if (superadmin) {
      console.log('👑 Found SuperAdmin:');
      console.log(`   👤 ${superadmin.name} (${superadmin.role})`);
      console.log(`   📧 Email: ${superadmin.email}`);
      console.log(`   🆔 User ID: ${superadmin.id}`);
      console.log('');
      console.log('🧪 Try logging in with SuperAdmin credentials first');
    }
    
    db.close();
  });
});
