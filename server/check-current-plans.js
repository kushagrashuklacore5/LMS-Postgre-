// Check current SuperAdmin plans
const db = require('config/database-switch');

console.log('🔍 Checking Current SuperAdmin Plans\n');

db.all('SELECT superadminId, planType, planName, status, expiryDate FROM subscriptions ORDER BY createdAt DESC', (err, subscriptions) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  console.log('📋 All Active Subscriptions:');
  subscriptions.forEach(sub => {
    const expiry = new Date(sub.expiryDate);
    const isExpired = new Date() > expiry;
    const status = isExpired ? 'EXPIRED' : sub.status.toUpperCase();
    console.log(`   SuperAdmin: ${sub.superadminId}`);
    console.log(`   Plan: ${sub.planName} (${sub.planType})`);
    console.log(`   Status: ${status}`);
    console.log(`   Expires: ${expiry.toLocaleDateString()} ${isExpired ? '(EXPIRED)' : '(ACTIVE)'}`);
    console.log('');
  });
  
  // Check which users are under which SuperAdmin
  console.log('👥 User to SuperAdmin Mapping:');
  db.all(`
    SELECT u.id, u.name, u.email, u.role, u.university_id, uni.adminId as superadmin_id
    FROM users u
    LEFT JOIN universities uni ON u.university_id = uni.id
    WHERE u.university_id IS NOT NULL
    ORDER BY u.university_id, u.id
  `, (err, users) => {
    if (err) {
      console.error('❌ Error fetching users:', err);
      return;
    }
    
    users.forEach(user => {
      const superadminId = `superadmin-${user.superadmin_id}`;
      console.log(`   User: ${user.name} (ID: ${user.id}) → SuperAdmin: ${superadminId}`);
    });
    
    db.close();
  });
});
