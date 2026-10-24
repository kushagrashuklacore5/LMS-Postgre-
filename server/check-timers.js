const db = require('config/database-switch');

console.log('🔍 Checking current superadmin expiry times...');

db.all('SELECT id, email, expires_at FROM users WHERE role = ?', ['superadmin'], (err, rows) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  console.log('📊 Current superadmins:');
  rows.forEach(row => {
    const now = new Date();
    const expiry = new Date(row.expires_at);
    const diff = expiry - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    console.log(`👤 ${row.email}:`);
    console.log(`   📅 Expires: ${expiry.toLocaleDateString()} ${expiry.toLocaleTimeString()}`);
    console.log(`   ⏰ Remaining: ${days}d ${hours}h ${minutes}m ${seconds}s`);
    console.log(`   📊 Raw diff: ${diff}ms`);
    console.log('');
  });
  
  process.exit(0);
});
