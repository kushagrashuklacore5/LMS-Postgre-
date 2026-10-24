// Check Current Subscription Status
const db = require('config/database-switch');

console.log('🔍 Current Subscription Monitor Check');
console.log('=====================================');

// Get the most recent user (current logged in user simulation)
db.get('SELECT * FROM users ORDER BY createdAt DESC LIMIT 1', [], (err, user) => {
  if (err) {
    console.error('❌ Error fetching user:', err);
    return;
  }
  
  if (!user) {
    console.log('❌ No users found in system');
    return;
  }
  
  console.log('👤 Current User:');
  console.log('   ID:', user.id);
  console.log('   Email:', user.email);
  console.log('   Role:', user.role);
  console.log('   Plan:', user.subscriptionPlan || 'FREE TRIAL');
  console.log('   Created:', user.createdAt);
  
  // Check subscription for this user
  db.get('SELECT * FROM subscriptions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1', [user.id], (subErr, subscription) => {
    if (subErr) {
      console.error('❌ Error fetching subscription:', subErr);
      return;
    }
    
    console.log('\n💳 Subscription Status:');
    
    if (!subscription) {
      console.log('   📋 Status: FREE TRIAL (No subscription record)');
      console.log('   ⏰ Duration: 10 days from account creation');
      console.log('   🎯 Features: Limited access');
      
      // Calculate trial expiry from user creation date
      const trialExpiry = new Date(user.createdAt);
      trialExpiry.setDate(trialExpiry.getDate() + 10);
      const now = new Date();
      const remainingTrialDays = Math.ceil((trialExpiry - now) / (1000 * 60 * 60 * 24));
      
      console.log('   📅 Trial Expires:', trialExpiry.toLocaleDateString());
      console.log('   ⏳ Remaining Trial Days:', Math.max(0, remainingTrialDays));
      console.log('   ✅ Trial Active:', remainingTrialDays > 0);
      
    } else {
      console.log('   📋 Plan Type:', subscription.planType);
      console.log('   📝 Plan Name:', subscription.planName);
      console.log('   📊 Status:', subscription.status.toUpperCase());
      console.log('   📅 Start Date:', new Date(subscription.startDate).toLocaleDateString());
      console.log('   📅 Expiry Date:', new Date(subscription.expiryDate).toLocaleDateString());
      
      const now = new Date();
      const expiry = new Date(subscription.expiryDate);
      const isExpired = now > expiry;
      const remainingDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      
      console.log('   ⏰ Remaining Days:', Math.max(0, remainingDays));
      console.log('   ❌ Expired:', isExpired);
      console.log('   ✅ Active:', !isExpired && subscription.status === 'active');
      
      if (subscription.planType !== 'free') {
        console.log('   🎯 Premium Features: UNLOCKED');
      } else {
        console.log('   🎯 Features: Limited to free tier');
      }
    }
    
    console.log('\n🔐 Access Level:');
    if (subscription && subscription.planType !== 'free' && !subscription.status !== 'expired') {
      console.log('   🌟 PREMIUM USER - Full Access');
    } else {
      console.log('   🆓 FREE USER - Limited Access');
    }
    
    console.log('\n📱 Quick Test URL:');
    console.log('   http://localhost:5174/student/subscription');
  });
});

console.log('\n✅ Subscription check completed!');
