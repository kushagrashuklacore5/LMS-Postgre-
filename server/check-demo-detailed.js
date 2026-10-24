const db = require('config/database-switch');

async function checkDemoAccountsDetailed() {
  console.log('=== DETAILED DEMO ACCOUNTS CHECK ===');
  
  try {
    // 1. Check all demo accounts regardless of university assignment
    console.log('\n1. ALL DEMO ACCOUNTS:');
    const allDemoUsers = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, name, email, role, university_id, subscriptionPlan 
        FROM users 
        WHERE email LIKE '%demo%' OR name LIKE '%demo%' OR email LIKE '%@demo.com%'
        ORDER BY id
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    console.log(`Found ${allDemoUsers.length} demo accounts total:`);
    allDemoUsers.forEach(user => {
      console.log(`  ID: ${user.id} | ${user.name} (${user.role}) | ${user.email} | University: ${user.university_id || 'NULL'} | Plan: ${user.subscriptionPlan}`);
    });
    
    // 2. Check if these demo accounts are in universities that have active subscriptions
    console.log('\n\n2. CHECKING UNIVERSITY SUBSCRIPTIONS FOR DEMO USERS:');
    const planInheritance = require('./controllers/plan-inheritance-controller');
    
    for (const user of allDemoUsers) {
      console.log(`\n--- ${user.name} (ID: ${user.id}, Role: ${user.role}) ---`);
      
      if (user.university_id) {
        // Get university details
        const university = await new Promise((resolve, reject) => {
          db.get('SELECT id, name, adminId FROM universities WHERE id = ?', [user.university_id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        if (university) {
          console.log(`University: ${university.name} (Admin ID: ${university.adminId})`);
          
          // Check university subscription
          const subscription = await new Promise((resolve, reject) => {
            db.get(`
              SELECT planType, planName, status, expiryDate
              FROM subscriptions 
              WHERE superadminId = 'superadmin-' || ? OR superadminId = ?
              ORDER BY createdAt DESC
              LIMIT 1
            `, [university.adminId, university.adminId.toString()], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });
          
          if (subscription) {
            const now = new Date();
            const expiry = new Date(subscription.expiryDate);
            const isExpired = expiry < now;
            
            console.log(`University Subscription: ${subscription.planName} (${subscription.planType})`);
            console.log(`Status: ${isExpired ? '❌ EXPIRED' : '✅ ACTIVE'}`);
            
            // Test what this demo user inherits
            try {
              const effectivePlan = await planInheritance.getEffectiveUserPlan(user.id);
              
              console.log(`\n🔒 FEATURE LOCK/UNLOCK STATUS FOR ${user.name}:`);
              console.log(`  Inherited Plan: ${effectivePlan.planName} (${effectivePlan.planType})`);
              console.log(`  📅 Calendar: ${effectivePlan.canAccessCalendar ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
              console.log(`  📊 Data Export: ${effectivePlan.canExportData ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
              console.log(`  📢 Announcements: ${effectivePlan.features.announcements.max} max`);
              console.log(`  🏫 Classrooms: ${effectivePlan.features.classrooms.max} max`);
              console.log(`  👥 Students: ${effectivePlan.features.students.max} max`);
              console.log(`  🎥 Live Classes: ${effectivePlan.features.liveClass ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
              console.log(`  📝 Assessments: ${effectivePlan.features.assessments ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
              
              // Test specific scenarios
              console.log(`\n🧪 REAL-WORLD TESTS:`);
              console.log(`  • Access Calendar: ${effectivePlan.canAccessCalendar ? '✅ ALLOWED' : '❌ BLOCKED - Need Standard+'}`);
              console.log(`  • Export Database: ${effectivePlan.canExportData ? '✅ ALLOWED' : '❌ BLOCKED - Need Professional'}`);
              console.log(`  • Create Live Class: ${effectivePlan.features.liveClass ? '✅ ALLOWED' : '❌ BLOCKED - Need Professional'}`);
              console.log(`  • Create Assessment: ${effectivePlan.features.assessments ? '✅ ALLOWED' : '❌ BLOCKED - Need Professional'}`);
              
            } catch (error) {
              console.log(`❌ Error testing inheritance: ${error.message}`);
            }
          } else {
            console.log(`University Subscription: ❌ None (defaults to Free plan)`);
            console.log(`🔒 All features LOCKED - No active subscription`);
          }
        } else {
          console.log(`❌ University ${user.university_id} not found`);
        }
      } else {
        console.log(`❌ Not assigned to any university - defaults to Free plan`);
        console.log(`🔒 All features LOCKED - No university assignment`);
      }
    }
    
    console.log('\n=== DETAILED DEMO ACCOUNTS CHECK COMPLETE ===');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    process.exit(0);
  }
}

checkDemoAccountsDetailed();
