// Simple check of current SuperAdmin plans
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Database error:', err);
    return;
  }
  
  console.log('🔍 Checking Current SuperAdmin Plans\n');
  
  // Check subscriptions
  db.all('SELECT superadminId, planType, planName, status, expiryDate FROM subscriptions ORDER BY createdAt DESC', (err, subscriptions) => {
    if (err) {
      console.error('❌ Error fetching subscriptions:', err);
      return;
    }
    
    console.log('📋 Current Subscriptions:');
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
    
    // Check users and their universities
    db.all(`
      SELECT u.id, u.name, u.email, u.role, u.university_id, uni.adminId as superadmin_id
      FROM users u
      LEFT JOIN universities uni ON u.university_id = uni.id
      WHERE u.university_id IS NOT NULL AND u.id <= 35
      ORDER BY u.university_id, u.id
    `, (err, users) => {
      if (err) {
        console.error('❌ Error fetching users:', err);
        return;
      }
      
      console.log('👥 User to SuperAdmin Mapping:');
      users.forEach(user => {
        const superadminId = `superadmin-${user.superadmin_id}`;
        console.log(`   User: ${user.name} (ID: ${user.id}, Role: ${user.role}) → SuperAdmin: ${superadminId}`);
      });
      
      db.close();
    });
  });
});
