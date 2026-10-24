const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/lms-database.sqlite');

console.log('🔍 Checking Accounts with Standard Access\n');
console.log('=' .repeat(60));

// Check all users and their current effective plans
db.all(`
  SELECT 
    u.id,
    u.name,
    u.email,
    u.role,
    u.subscriptionPlan as user_plan,
    uni.name as university_name,
    uni.subscriptionPlan as university_plan,
    uni.adminId as superadmin_id,
    sub.planName as subscription_name,
    sub.planType as subscription_type,
    sub.status as subscription_status,
    sub.expiryDate as subscription_expiry
  FROM users u
  LEFT JOIN universities uni ON u.university_id = uni.id
  LEFT JOIN subscriptions sub ON uni.adminId = sub.superadminId
  ORDER BY uni.name, u.role, u.name
`, (err, results) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  console.log('📊 All Accounts and Their Access Levels:\n');
  
  let standardCount = 0;
  let professionalCount = 0;
  let freeCount = 0;
  
  results.forEach(user => {
    // Determine effective plan (inheritance logic)
    let effectivePlan = 'free';
    let planName = 'Free';
    let hasCalendarAccess = false;
    
    // If user belongs to a university with a SuperAdmin subscription
    if (user.superadmin_id && user.subscription_type) {
      const now = new Date();
      const expiry = new Date(user.subscription_expiry);
      const isExpired = now > expiry;
      
      effectivePlan = isExpired ? 'free' : user.subscription_type;
      planName = isExpired ? 'Free (Expired)' : user.subscription_name;
      hasCalendarAccess = !isExpired && (user.subscription_type === 'standard' || user.subscription_type === 'professional');
    }
    
    // Count plans
    if (effectivePlan === 'standard') standardCount++;
    else if (effectivePlan === 'professional') professionalCount++;
    else freeCount++;
    
    // Display user info
    const calendarStatus = hasCalendarAccess ? '✅ UNLOCKED' : '🔒 LOCKED';
    const planStatus = user.subscription_status === 'active' ? '🟢 Active' : '🔴 Expired';
    
    console.log(`👤 ${user.name} (${user.role})`);
    console.log(`   📧 Email: ${user.email}`);
    console.log(`   🏢 University: ${user.university_name || 'None'}`);
    console.log(`   👑 SuperAdmin ID: ${user.superadmin_id || 'None'}`);
    console.log(`   📋 Effective Plan: ${planName} (${effectivePlan})`);
    console.log(`   📅 Status: ${planStatus}`);
    console.log(`   📅 Calendar: ${calendarStatus}`);
    console.log(`   📅 Expiry: ${user.subscription_expiry ? new Date(user.subscription_expiry).toLocaleDateString() : 'Not set'}`);
    console.log('');
  });
  
  // Summary
  console.log('📈 Summary Statistics:');
  console.log('=' .repeat(40));
  console.log(`🆓 Free Plan: ${freeCount} accounts`);
  console.log(`📋 Standard Plan: ${standardCount} accounts`);
  console.log(`👑 Professional Plan: ${professionalCount} accounts`);
  console.log(`📅 Total Accounts: ${results.length}`);
  
  // Show Standard Plan accounts specifically
  const standardAccounts = results.filter(user => {
    if (!user.superadmin_id || !user.subscription_type) return false;
    const now = new Date();
    const expiry = new Date(user.subscription_expiry);
    const isExpired = now > expiry;
    return !isExpired && user.subscription_type === 'standard';
  });
  
  if (standardAccounts.length > 0) {
    console.log('\n🎯 Accounts with STANDARD Access:');
    console.log('-' .repeat(40));
    standardAccounts.forEach(user => {
      console.log(`✅ ${user.name} (${user.role}) - ${user.email}`);
      console.log(`   🏢 University: ${user.university_name}`);
      console.log(`   👑 SuperAdmin: ${user.superadmin_id}`);
      console.log(`   📅 Calendar: ✅ UNLOCKED`);
      console.log(`   📅 Expiry: ${new Date(user.subscription_expiry).toLocaleDateString()}`);
      console.log('');
    });
  } else {
    console.log('\n❌ No accounts currently have Standard access');
  }
  
  db.close();
});
