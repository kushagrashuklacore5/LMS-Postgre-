const db = require('config/database-switch');

console.log('🔍 Exact database check for expiry times...');

db.all('SELECT id, email, created_at, expires_at FROM users WHERE role = ?', ['superadmin'], (err, rows) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  console.log('📊 Raw database data:');
  rows.forEach(row => {
    console.log(`👤 ${row.email} (ID: ${row.id})`);
    console.log(`   📅 Created: ${row.created_at}`);
    console.log(`   🕐 Expires: ${row.expires_at}`);
    console.log(`   📊 Created Date: ${new Date(row.created_at).toISOString()}`);
    console.log(`   📊 Expires Date: ${new Date(row.expires_at).toISOString()}`);
    console.log('');
  });
  
  process.exit(0);
});
