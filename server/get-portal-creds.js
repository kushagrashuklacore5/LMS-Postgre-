const db = require('./config/database-switch');

console.log('=== GETTING INTERNAL PORTAL CREDENTIALS ===');

// Look for portal admin and internal portal users
db.all(`
  SELECT id, name, email, role, university_id, password
  FROM users 
  WHERE role IN ('portal_admin', 'admin', 'superadmin') 
  ORDER BY role, id
`, [], (err, users) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('Portal/Admin Accounts:');
  users.forEach(user => {
    console.log(`ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}`);
  });
  
  // Look for specific portal admin
  const portalAdmin = users.find(u => u.role === 'portal_admin');
  const internalAdmins = users.filter(u => u.role === 'admin');
  const superAdmins = users.filter(u => u.role === 'superadmin');
  
  console.log('\n=== INTERNAL PORTAL ACCESS ===');
  
  if (portalAdmin) {
    console.log('\n🔑 PORTAL ADMIN (Main Internal Portal):');
    console.log(`   Email: ${portalAdmin.email}`);
    console.log(`   Password: password123 (default)`);
    console.log(`   Role: ${portalAdmin.role}`);
    console.log(`   User ID: ${portalAdmin.id}`);
  }
  
  if (internalAdmins.length > 0) {
    console.log('\n🔑 INTERNAL ADMIN ACCOUNTS:');
    internalAdmins.forEach((admin, index) => {
      console.log(`   ${index + 1}. Email: ${admin.email}`);
      console.log(`      Password: password123 (default)`);
      console.log(`      Role: ${admin.role}`);
      console.log(`      User ID: ${admin.id}`);
    });
  }
  
  if (superAdmins.length > 0) {
    console.log('\n🔑 SUPERADMIN ACCOUNTS:');
    superAdmins.slice(0, 3).forEach((admin, index) => {
      console.log(`   ${index + 1}. Email: ${admin.email}`);
      console.log(`      Password: password123 (default)`);
      console.log(`      Role: ${admin.role}`);
      console.log(`      User ID: ${admin.id}`);
    });
  }
  
  console.log('\n=== PORTAL ACCESS URLs ===');
  console.log('Frontend URL: http://localhost:3000');
  console.log('Backend API: http://localhost:5002');
  console.log('Internal Portal: http://localhost:3000/login');
  
  console.log('\n=== DEFAULT PASSWORDS ===');
  console.log('Most accounts use: password123');
  console.log('If password123 doesn\'t work, try: admin123');
  console.log('Or check the specific user setup in database');
  
  process.exit(0);
});
