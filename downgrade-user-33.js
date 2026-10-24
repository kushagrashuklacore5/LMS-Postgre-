const db = require('./server/config/sqlite-db');

console.log('🔧 Downgrading user ID 33 to FREE plan...');

// Update the existing subscription for user 33 to free
const updateQuery = `
  UPDATE subscriptions 
  SET 
    planType = 'free',
    planName = 'Free',
    status = 'active',
    startDate = datetime('now'),
    expiryDate = datetime('now', '+10 days'),
    durationDays = 10,
    isFreeTrial = 0,
    paymentId = NULL,
    amount = 0,
    updatedAt = datetime('now')
  WHERE superadminId = 33
`;

db.run(updateQuery, function(err) {
  if (err) {
    console.error('❌ Error updating subscription:', err);
    setTimeout(() => process.exit(0), 1000);
    return;
  }
  
  console.log(`✅ Updated ${this.changes} subscription(s) for user ID 33`);
  
  // Verify the update
  db.get('SELECT * FROM subscriptions WHERE superadminId = 33 ORDER BY createdAt DESC LIMIT 1', (err, row) => {
    if (err) {
      console.error('Error verifying update:', err);
    } else if (row) {
      console.log('📊 Updated subscription details:');
      console.log(`   Plan: ${row.planName} (${row.planType})`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Start: ${row.startDate}`);
      console.log(`   Expiry: ${row.expiryDate}`);
      console.log(`   Updated: ${row.updatedAt}`);
      
      // Now test the plan inheritance system
      const planInheritance = require('./server/controllers/plan-inheritance-controller');
      
      planInheritance.getEffectiveUserPlan(22) // Test user Aniket2
        .then(userPlan => {
          console.log('\n📊 Effective plan for user Aniket2 (ID: 22):');
          console.log(`   Plan: ${userPlan.planType}`);
          console.log(`   Can Access Calendar: ${userPlan.canAccessCalendar}`);
          console.log(`   Is Expired: ${userPlan.isExpired}`);
          
          if (userPlan.canAccessCalendar === false) {
            console.log('✅ SUCCESS: Calendar access should now be blocked!');
          } else {
            console.log('❌ ISSUE: Calendar access still allowed');
          }
          
          setTimeout(() => process.exit(0), 1000);
        })
        .catch(err => {
          console.error('❌ Error testing plan inheritance:', err);
          setTimeout(() => process.exit(0), 1000);
        });
    } else {
      console.log('❌ No subscription found for user 33 after update');
      setTimeout(() => process.exit(0), 1000);
    }
  });
});
