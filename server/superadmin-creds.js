const db = require('./config/database-switch');

console.log('=== GETTING SUPERADMIN CREDENTIALS ===');

db.all('SELECT id, name, email, role, university_id FROM users WHERE role = "superadmin" OR id IN (33, 86)', [], (err, users) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('SuperAdmin Accounts:');
  users.forEach(user => {
    console.log(`ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}, University: ${user.university_id}`);
  });
  
  console.log('\n=== RECOMMENDED TEST ACCOUNTS ===');
  
  // Find two superadmins with different universities
  const superAdmins = users.filter(u => u.role === 'superadmin');
  
  if (superAdmins.length >= 2) {
    console.log('\n1. First SuperAdmin:');
    console.log(`   Email: ${superAdmins[0].email}`);
    console.log(`   Password: password123 (default)`);
    console.log(`   University ID: ${superAdmins[0].university_id}`);
    
    console.log('\n2. Second SuperAdmin:');
    console.log(`   Email: ${superAdmins[1].email}`);
    console.log(`   Password: password123 (default)`);
    console.log(`   University ID: ${superAdmins[1].university_id}`);
  } else {
    console.log('Need at least 2 superadmins for isolation testing');
  }
  
  process.exit(0);
});
