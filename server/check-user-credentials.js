const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/lms-database.sqlite');

console.log('🔍 Checking User Credentials\n');
console.log('=' .repeat(60));

db.all(`
  SELECT id, name, email, role, university_id, subscriptionPlan
  FROM users 
  WHERE university_id = 4
  ORDER BY name
`, (err, users) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('👥 Users under Core5 University:');
  console.log('-' .repeat(40));
  
  users.forEach(user => {
    console.log(`👤 ${user.name} (${user.role})`);
    console.log(`   📧 Email: ${user.email}`);
    console.log(`   🆔 User ID: ${user.id}`);
    console.log(`   🏢 University ID: ${user.university_id}`);
    console.log(`   📋 Plan: ${user.subscriptionPlan || 'Not set'}`);
    console.log('');
  });
  
  console.log('🔑 Default Passwords for Testing:');
  console.log('-' .repeat(40));
  console.log('Usually the default password is one of:');
  console.log('• password123');
  console.log('• admin123');
  console.log('• 123456');
  console.log('• password');
  console.log('• user123');
  console.log('');
  console.log('🧪 Try these passwords with the emails above');
  
  db.close();
});
