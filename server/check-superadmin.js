const db = require('./config/database-switch');
const bcrypt = require('bcryptjs');

console.log('🔍 Checking superadmin user details...\n');

db.get('SELECT id, name, email, password, role FROM users WHERE email = ?', ['superadmin@core5.co.in'], (err, user) => {
  if (err) {
    console.error('❌ Database error:', err);
    return;
  }

  if (!user) {
    console.log('❌ Superadmin user not found');
    return;
  }

  console.log('✅ Superadmin user found:');
  console.log('   ID:', user.id);
  console.log('   Name:', user.name);
  console.log('   Email:', user.email);
  console.log('   Role:', user.role);
  console.log('   Password Hash:', user.password.substring(0, 20) + '...');
  
  // Test password validation
  const testPassword = '12345678';
  console.log('\n🔐 Testing password validation...');
  
  bcrypt.compare(testPassword, user.password, (compareErr, isValid) => {
    if (compareErr) {
      console.error('❌ Password comparison error:', compareErr);
      return;
    }
    
    console.log('   Test Password:', testPassword);
    console.log('   Password Valid:', isValid ? '✅ YES' : '❌ NO');
    
    if (!isValid) {
      console.log('\n🔧 Updating superadmin password...');
      const newHash = bcrypt.hashSync(testPassword, 10);
      
      db.run('UPDATE users SET password = ? WHERE email = ?', [newHash, 'superadmin@core5.co.in'], (updateErr) => {
        if (updateErr) {
          console.error('❌ Error updating password:', updateErr);
        } else {
          console.log('✅ Superadmin password updated successfully!');
          console.log('   Email: superadmin@core5.co.in');
          console.log('   New Password: 12345678');
          console.log('\n🎯 Try logging in again!');
        }
      });
    }
  });
});
