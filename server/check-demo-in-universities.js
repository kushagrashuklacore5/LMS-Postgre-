const db = require('config/database-switch');

async function checkDemoAccountsInUniversities() {
  console.log('=== CHECKING DEMO ACCOUNTS IN EXISTING UNIVERSITIES ===');
  
  try {
    // 1. Find all universities with their admins and subscription plans
    console.log('\n1. CURRENT UNIVERSITIES AND THEIR SUBSCRIPTIONS:');
    const universities = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.adminId, u.subscriptionPlan as uniPlan,
               s.planType, s.planName, s.status, s.expiryDate
        FROM universities u
        LEFT JOIN subscriptions s ON (s.superadminId = 'superadmin-' || u.adminId OR s.superadminId = u.adminId)
        ORDER BY u.id
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    universities.forEach(uni => {
      const now = new Date();
      const expiry = uni.expiryDate ? new Date(uni.expiryDate) : null;
      const isExpired = expiry && expiry < now;
      
      console.log(`\nUniversity: ${uni.name} (ID: ${uni.id})`);
      console.log(`  Admin ID: ${uni.adminId}`);
      console.log(`  Subscription: ${uni.planName || 'None'} (${uni.planType || 'free'})`);
      console.log(`  Status: ${uni.status || 'No subscription'}`);
      console.log(`  Expired: ${isExpired || 'No expiry'}`);
    });
    
    // 2. Find demo accounts in these universities
    console.log('\n\n2. DEMO ACCOUNTS IN UNIVERSITIES:');
    const demoUsersInUnis = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.email, u.role, u.university_id, u.subscriptionPlan,
               uni.name as universityName, uni.adminId
        FROM users u
        JOIN universities uni ON u.university_id = uni.id
        WHERE (u.email LIKE '%demo%' OR u.name LIKE '%demo%' OR u.email LIKE '%@demo.com%')
        ORDER BY uni.name, u.role
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    if (demoUsersInUnis.length === 0) {
      console.log('❌ No demo accounts found in any university');
      return;
    }
    
    console.log(`Found ${demoUsersInUnis.length} demo accounts in universities:`);
    
    // 3. For each demo account, test their inherited subscription and feature access
    const planInheritance = require('./controllers/plan-inheritance-controller');
    
    for (const user of demoUsersInUnis) {
      console.log(`\n--- ${user.name} (${user.role}) ---`);
      console.log(`University: ${user.universityName} (ID: ${user.university_id})`);
      console.log(`Email: ${user.email}`);
      
      // Get the university's subscription
      const uniSubscription = await new Promise((resolve, reject) => {
        db.get(`
          SELECT s.planType, s.planName, s.status, s.expiryDate
          FROM subscriptions s
          WHERE s.superadminId = 'superadmin-' || ? OR s.superadminId = ?
          ORDER BY s.createdAt DESC
          LIMIT 1
        `, [user.adminId, user.adminId.toString()], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (uniSubscription) {
        const now = new Date();
        const expiry = new Date(uniSubscription.expiryDate);
        const isExpired = expiry < now;
        
        console.log(`University Subscription: ${uniSubscription.planName} (${uniSubscription.planType})`);
        console.log(`Subscription Status: ${isExpired ? '❌ EXPIRED' : '✅ ACTIVE'}`);
      } else {
        console.log(`University Subscription: ❌ None (defaults to Free)`);
      }
      
      // Test effective plan for this demo user
      try {
        const effectivePlan = await planInheritance.getEffectiveUserPlan(user.id);
        
        console.log(`\nEffective Plan for Demo User:`);
        console.log(`  Plan: ${effectivePlan.planName} (${effectivePlan.planType})`);
        console.log(`  Status: ${effectivePlan.status}`);
        console.log(`  Expired: ${effectivePlan.isExpired || false}`);
        
        console.log(`\nFeature Access Test:`);
        console.log(`  📅 Calendar Access: ${effectivePlan.canAccessCalendar ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
        console.log(`  📊 Data Export: ${effectivePlan.canExportData ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
        console.log(`  📢 Max Announcements: ${effectivePlan.features.announcements.max}`);
        console.log(`  🏫 Max Classrooms: ${effectivePlan.features.classrooms.max}`);
        console.log(`  👥 Max Students: ${effectivePlan.features.students.max}`);
        console.log(`  👨‍🏫 Max Mentors: ${effectivePlan.features.mentors.max}`);
        console.log(`  🎥 Live Classes: ${effectivePlan.features.liveClass ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
        console.log(`  📝 Assessments: ${effectivePlan.features.assessments ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
        
        // Simulate specific feature access scenarios
        console.log(`\nReal-world Feature Tests:`);
        console.log(`  📅 Try to open calendar: ${effectivePlan.canAccessCalendar ? '✅ SUCCESS' : '❌ BLOCKED - Upgrade required'}`);
        console.log(`  📊 Try to export database: ${effectivePlan.canExportData ? '✅ SUCCESS' : '❌ BLOCKED - Professional plan required'}`);
        console.log(`  📢 Try to create announcement: ${effectivePlan.features.announcements.max > 0 ? '✅ SUCCESS' : '❌ BLOCKED'}`);
        console.log(`  🎥 Try to create live class: ${effectivePlan.features.liveClass ? '✅ SUCCESS' : '❌ BLOCKED - Professional plan required'}`);
        console.log(`  📝 Try to create assessment: ${effectivePlan.features.assessments ? '✅ SUCCESS' : '❌ BLOCKED - Professional plan required'}`);
        
      } catch (error) {
        console.log(`❌ Error getting effective plan: ${error.message}`);
      }
    }
    
    console.log('\n=== DEMO ACCOUNTS FEATURE LOCK/UNLOCK TEST COMPLETE ===');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    process.exit(0);
  }
}

checkDemoAccountsInUniversities();
