const db = require('./config/database-switch');

console.log('=== Getting Superadmin Credentials ===');

const query = `
  SELECT id, email, role, created_at, expires_at, status
  FROM users 
  WHERE role = 'superadmin'
  ORDER BY created_at DESC
`;

db.all(query, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  console.log(`Found ${rows.length} superadmins:`);
  console.log('');
  
  rows.forEach((row, index) => {
    console.log(`${index + 1}. Superadmin Credentials:`);
    console.log(`   Email: ${row.email}`);
    console.log(`   Role: ${row.role}`);
    console.log(`   Status: ${row.status || 'Not set'}`);
    console.log(`   Created: ${new Date(row.created_at).toLocaleDateString()}`);
    console.log(`   Expires: ${row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'Not set'}`);
    console.log(`   ID: ${row.id}`);
    console.log('');
  });
  
  console.log('Note: Passwords are hashed in the database for security.');
  console.log('To get actual passwords, you may need to check the creation logs or reset passwords.');
  
  process.exit(0);
});
