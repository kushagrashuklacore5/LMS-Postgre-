const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/lms-database.sqlite');

console.log('🔍 Checking Current System State\n');
console.log('=' .repeat(60));

async function checkCurrentState() {
  try {
    // Check SuperAdmin subscription
    console.log('1️⃣ SuperAdmin 33 Subscription Status:');
    console.log('-' .repeat(40));
    
    const superadminSub = await new Promise((resolve, reject) => {
      db.get(`
        SELECT planType, planName, status, expiryDate, createdAt, updatedAt
        FROM subscriptions
        WHERE superadminId = '33'
        ORDER BY createdAt DESC
        LIMIT 1
      `, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    if (superadminSub) {
      const now = new Date();
      const expiry = new Date(superadminSub.expiryDate);
      const isExpired = now > expiry;
      
      console.log(`📋 Plan: ${superadminSub.planName} (${superadminSub.planType})`);
      console.log(`📅 Status: ${superadminSub.status}`);
      console.log(`📅 Expiry: ${expiry.toLocaleDateString()}`);
      console.log(`⚠️ Expired: ${isExpired ? 'YES' : 'NO'}`);
      console.log(`📅 Updated: ${new Date(superadminSub.updatedAt).toLocaleDateString()}`);
    } else {
      console.log('❌ No subscription found for SuperAdmin 33');
    }
    
    // Check universities
    console.log('\n2️⃣ Universities Under SuperAdmin 33:');
    console.log('-' .repeat(40));
    
    const universities = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, name, subscriptionPlan, adminId, updatedAt
        FROM universities
        WHERE adminId = '33'
      `, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    universities.forEach(uni => {
      console.log(`🏢 ${uni.name}: ${uni.subscriptionPlan || 'Not set'} (Updated: ${new Date(uni.updatedAt).toLocaleDateString()})`);
    });
    
    // Check users
    console.log('\n3️⃣ Users Under SuperAdmin 33:');
    console.log('-' .repeat(40));
    
    const users = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.role, u.subscriptionPlan, u.updatedAt,
               uni.name as university_name
        FROM users u
        LEFT JOIN universities uni ON u.university_id = uni.id
        WHERE uni.adminId = '33'
        ORDER BY u.name
      `, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    
    users.forEach(user => {
      console.log(`👤 ${user.name} (${user.role}): ${user.subscriptionPlan || 'Not set'} (Updated: ${new Date(user.updatedAt).toLocaleDateString()})`);
    });
    
    // Check what API would return for these users
    console.log('\n4️⃣ API Response Test:');
    console.log('-' .repeat(40));
    
    const planInheritance = require('./controllers/plan-inheritance-controller');
    
    for (const user of users) {
      try {
        const effectivePlan = await planInheritance.getEffectiveUserPlan(user.id);
        console.log(`📋 ${user.name}: ${effectivePlan.planName} - Calendar: ${effectivePlan.canAccessCalendar ? '✅' : '❌'}`);
      } catch (error) {
        console.log(`❌ ${user.name}: Error - ${error.message}`);
      }
    }
    
    console.log('\n🎯 ISSUE ANALYSIS:');
    console.log('=' .repeat(40));
    
    if (superadminSub && superadminSub.planType === 'free') {
      console.log('✅ SuperAdmin plan is correctly set to Free');
      
      const allUsersFree = users.every(user => user.subscriptionPlan === 'free');
      const allUniversitiesFree = universities.every(uni => uni.subscriptionPlan === 'free');
      
      if (!allUsersFree || !allUniversitiesFree) {
        console.log('❌ PROBLEM: Users/Universities not downgraded to Free');
        console.log('🔧 SOLUTION: Need to run manual propagation');
        
        console.log('\n🔧 Running Manual Downgrade...');
        await planInheritance.propagatePlanToUsers('33', 'free', 'Free Plan', superadminSub.expiryDate);
        
        console.log('✅ Manual downgrade completed');
      } else {
        console.log('✅ All users correctly downgraded to Free');
      }
    } else {
      console.log('❌ SuperAdmin plan is not Free');
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    db.close();
  }
}

checkCurrentState();
