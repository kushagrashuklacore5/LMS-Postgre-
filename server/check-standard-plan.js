// Check Standard Plan Status
const db = require('config/database-switch');

console.log('🔍 STANDARD PLAN INVESTIGATION');
console.log('==============================');

// Check all users
db.all('SELECT u.id, u.email, u.role, u.subscriptionPlan, u.createdAt FROM users u ORDER BY u.createdAt DESC LIMIT 10', [], (err, users) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  console.log('👥 All Recent Users:');
  users.forEach((user, index) => {
    console.log('   ' + (index + 1) + '. ' + user.email + ' - ' + user.role + ' - Plan: ' + (user.subscriptionPlan || 'FREE'));
  });
  
  // Find Standard plan users
  const standardUsers = users.filter(u => u.subscriptionPlan && u.subscriptionPlan.toLowerCase().includes('standard'));
  console.log('\n📊 Standard Plan Users Found:', standardUsers.length);
  
  standardUsers.forEach(user => {
    console.log('   🌟 Standard User:', user.email);
  });
});

// Check subscriptions table for Standard plans
db.all('SELECT * FROM subscriptions WHERE planType LIKE "%standard%" OR planName LIKE "%Standard%"', [], (subErr, standardSubs) => {
  if (subErr) {
    console.error('❌ Subscription error:', subErr);
    return;
  }
  
  console.log('\n💳 Standard Plan Subscriptions:', standardSubs.length);
  
  standardSubs.forEach((sub, index) => {
    console.log('   Standard ' + (index + 1) + ':');
    console.log('   User ID:', sub.userId);
    console.log('   Plan:', sub.planName);
    console.log('   Status:', sub.status);
    console.log('   Expiry:', sub.expiryDate);
  });
});

// Check specific user again
db.get('SELECT * FROM users WHERE email = ?', ['anisingh2309@gmail.com'], (err, user) => {
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  if (user) {
    console.log('\n🎯 SPECIFIC USER CHECK:');
    console.log('   Email:', user.email);
    console.log('   User Table Plan:', user.subscriptionPlan);
    console.log('   Role:', user.role);
    
    // Check if this user has any subscription record
    db.get('SELECT * FROM subscriptions WHERE userId = ?', [user.id], (subErr, subscription) => {
      if (subErr) {
        console.error('❌ Subscription check error:', subErr);
        return;
      }
      
      if (subscription) {
        console.log('   Subscription Table Plan:', subscription.planName);
        console.log('   Subscription Status:', subscription.status);
      } else {
        console.log('   Subscription Table: NO RECORD');
      }
      
      console.log('\n🔍 CONCLUSION:');
      if (user.subscriptionPlan && user.subscriptionPlan.toLowerCase().includes('standard')) {
        console.log('   ✅ USER HAS STANDARD PLAN in users table');
      } else {
        console.log('   ❌ User shows FREE in users table');
      }
    });
  }
});
