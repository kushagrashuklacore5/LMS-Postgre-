// Check universities and their adminId
const db = require('config/database-switch');

function checkUniversities() {
  console.log('🔍 Checking Universities and Admin IDs\n');
  
  db.all('SELECT id, name, adminId FROM universities', [], (err, rows) => {
    if (err) {
      console.error('❌ Error:', err);
      return;
    }
    
    console.log('\n📋 Universities found:');
    rows.forEach(row => {
      console.log(`ID: ${row.id}, Name: ${row.name}, AdminID: ${row.adminId}`);
    });
    
    console.log('\n👤 Checking users with role superadmin:');
    db.all('SELECT id, name, email FROM users WHERE role = ?', ['superadmin'], (err2, users) => {
      if (err2) {
        console.error('❌ Error fetching users:', err2);
        return;
      }
      
      users.forEach(user => {
        console.log(`User ID: ${user.id}, Name: ${user.name}, Email: ${user.email}`);
      });
      
      console.log('\n🎯 Analysis:');
      console.log('- Superadmin ID from login: 33');
      console.log('- Universities with adminId 33: ' + rows.filter(r => r.adminId === 33).length);
      console.log('- Need to ensure superadmin 33 is admin of at least one university');
    });
  });
}

checkUniversities();
