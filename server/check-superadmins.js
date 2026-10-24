const db = require('config/database-switch');

console.log('🔍 Checking existing superadmins in database...');

const query = `
  SELECT id, email, role, created_at, expires_at, status
  FROM users 
  WHERE role = 'superadmin' 
  ORDER BY created_at DESC
`;

db.all(query, [], (err, rows) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }

  console.log(`📊 Found ${rows.length} superadmins:`);
  
  if (rows.length === 0) {
    console.log('❌ No superadmins found in database!');
    console.log('🔧 Creating some test superadmins...');
    
    const bcrypt = require('bcryptjs');
    
    // Create test superadmins
    const testSuperadmins = [
      {
        email: 'test1@superadmin.com',
        password: 'Test123!@#',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
      },
      {
        email: 'test2@superadmin.com', 
        password: 'Test456!@#',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days from now
      },
      {
        email: 'expired@superadmin.com',
        password: 'Expired!@#',
        expires_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago (expired)
      }
    ];

    testSuperadmins.forEach(async (superadmin, index) => {
      const hashedPassword = await bcrypt.hash(superadmin.password, 10);
      
      db.run(
        `INSERT INTO users (email, password, role, created_at, expires_at, status) 
         VALUES (?, ?, 'superadmin', ?, ?, 'active')`,
        [
          superadmin.email,
          hashedPassword,
          new Date().toISOString(),
          superadmin.expires_at
        ],
        function(err) {
          if (err) {
            console.error(`❌ Error creating ${superadmin.email}:`, err);
          } else {
            console.log(`✅ Created superadmin: ${superadmin.email}`);
            console.log(`   Password: ${superadmin.password}`);
            console.log(`   Expires: ${new Date(superadmin.expires_at).toLocaleDateString()}`);
            
            if (index === testSuperadmins.length - 1) {
              console.log('\n🎯 Test superadmins created successfully!');
              console.log('📝 You can now test the internal admin portal with these accounts.');
              process.exit(0);
            }
          }
        }
      );
    });
  } else {
    rows.forEach(row => {
      console.log(`👤 ${row.email}`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Role: ${row.role}`);
      console.log(`   Created: ${new Date(row.created_at).toLocaleDateString()}`);
      console.log(`   Expires: ${row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'Not set'}`);
      console.log(`   Status: ${row.status || 'Not set'}`);
      console.log('');
    });
    process.exit(0);
  }
});
