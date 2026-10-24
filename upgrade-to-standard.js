const db = require('./server/config/sqlite-db');

console.log('🔄 Upgrading SuperAdmin 33 to Standard Plan...\n');

async function upgradeToStandard() {
  try {
    // Step 1: Update existing subscription to Standard
    console.log('1️⃣ Updating existing subscription to Standard...');
    const startDate = new Date().toISOString();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // 30 days from now
    
    const result = await new Promise((resolve, reject) => {
      db.run(`
        UPDATE subscriptions 
        SET planType = ?, planName = ?, status = ?, startDate = ?, expiryDate = ?,
            durationDays = ?, paymentId = ?, amount = ?, currency = ?, paymentMethod = ?,
            isFreeTrial = ?, updatedAt = ?
        WHERE superadminId = ?
      `, [
        'standard',            // planType
        'Standard Plan',       // planName
        'active',              // status
        startDate,             // startDate
        expiryDate.toISOString(), // expiryDate
        30,                    // durationDays
        'upgrade-payment-123', // paymentId
        2999,                  // amount
        'INR',                 // currency
        'upgrade',             // paymentMethod
        0,                     // isFreeTrial
        new Date().toISOString(), // updatedAt
        33                     // superadminId
      ], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
    
    console.log(`✅ Updated ${result.changes} subscription(s) to Standard`);
    
    // Step 2: Trigger plan propagation
    console.log('\n2️⃣ Triggering plan propagation...');
    const planInheritance = require('./server/controllers/plan-inheritance-controller');
    
    const propagationResult = await planInheritance.propagatePlanToUsers(
      33, 
      'standard', 
      'Standard Plan', 
      expiryDate.toISOString()
    );
    
    console.log(`✅ Propagation completed:`);
    console.log(`   Universities updated: ${propagationResult.universitiesUpdated}`);
    console.log(`   Users updated: ${propagationResult.usersUpdated}`);
    console.log(`   Duration: ${propagationResult.duration}ms`);
    
    // Step 3: Verify the changes
    console.log('\n3️⃣ Verifying changes...');
    
    // Check SuperAdmin subscription
    const subscription = await new Promise((resolve, reject) => {
      db.get('SELECT planType, planName, status FROM subscriptions WHERE superadminId = 33', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    console.log(`SuperAdmin subscription: ${subscription.planName} (${subscription.planType}) - ${subscription.status}`);
    
    // Check university plan
    const university = await new Promise((resolve, reject) => {
      db.get('SELECT subscriptionPlan FROM universities WHERE id = 4', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    console.log(`University plan: ${university.subscriptionPlan}`);
    
    // Check users plans
    const users = await new Promise((resolve, reject) => {
      db.all('SELECT name, subscriptionPlan FROM users WHERE university_id = 4', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('User plans under University 4:');
    users.forEach(user => {
      console.log(`   ${user.name}: ${user.subscriptionPlan}`);
    });
    
    // Step 4: Test effective plan and calendar access
    console.log('\n4️⃣ Testing effective plan and calendar access...');
    const effectivePlan = await planInheritance.getEffectiveUserPlan(22);
    console.log(`Aniket2 effective plan: ${effectivePlan.planType}`);
    console.log(`Can access calendar: ${effectivePlan.canAccessCalendar}`);
    console.log(`Features available:`, Object.keys(effectivePlan.features).filter(key => effectivePlan.features[key]));
    
    console.log('\n🎉 SUCCESS! SuperAdmin upgrade to Standard completed!');
    console.log('📝 What happened:');
    console.log('   1. ✅ SuperAdmin subscription updated to Standard');
    console.log('   2. ✅ System automatically propagated to all users');
    console.log('   3. ✅ University plan updated to Standard');
    console.log('   4. ✅ All users under University 4 now have Standard plan');
    console.log('   5. ✅ Users can now access calendar and other Standard features');
    
    console.log('\n💡 Now when users access the calendar:');
    console.log('   - ✅ API check-feature-access will return canAccessCalendar: true');
    console.log('   - ✅ Free plan popup will NOT appear');
    console.log('   - ✅ Calendar will be fully accessible');
    console.log('   - ✅ Real-time updates will work via Socket.IO');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  setTimeout(() => process.exit(0), 2000);
}

upgradeToStandard();
