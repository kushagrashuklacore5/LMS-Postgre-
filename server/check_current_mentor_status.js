const axios = require('axios');

async function checkCurrentMentorStatus() {
  console.log('🔍 Checking Current Mentor Feature Lock Status...\n');
  
  try {
    // Test 1: Check admin access (should work)
    console.log('👑 Test 1: Admin Feature Access');
    try {
      const adminLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
        email: 'abhishek@core5.co.in',
        password: 'O#P$0A@7THQW'
      });
      const adminToken = adminLogin.data.token;
      
      // Admin calendar
      const adminCalendar = await axios.get('http://127.0.0.1:5002/api/calendar', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      console.log('✅ Admin calendar access:', adminCalendar.status);
      
      // Admin database export
      const adminExport = await axios.get('http://127.0.0.1:5002/api/database-export/tables', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      console.log('✅ Admin database export access:', adminExport.status);
      
    } catch (error) {
      console.log('❌ Admin access failed:', error.response?.status, error.response?.data?.message);
    }
    
    // Test 2: Check mentor access (should work but might still be locked)
    console.log('\n👨‍🏫 Test 2: Mentor Feature Access');
    try {
      const mentorLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
        email: 'debugmentor@pro.com',
        password: 'jp08qyud'
      });
      
      if (mentorLogin.status === 200) {
        const mentorToken = mentorLogin.data.token;
        const mentorData = mentorLogin.data.user;
        
        console.log('✅ Mentor login successful');
        console.log('👤 Mentor:', mentorData.name);
        console.log('💳 Subscription Plan:', mentorData.subscriptionPlan);
        console.log('🏫 University ID:', mentorData.universityId);
        
        // Mentor calendar access
        try {
          const mentorCalendar = await axios.get('http://127.0.0.1:5002/api/calendar', {
            headers: { 'Authorization': `Bearer ${mentorToken}` }
          });
          console.log('✅ Mentor calendar access:', mentorCalendar.status);
        } catch (error) {
          console.log('❌ Mentor calendar failed:', error.response?.status);
          if (error.response?.data?.featureRestricted) {
            console.log('🔒 FEATURE RESTRICTED - Current plan:', error.response?.data?.currentPlan);
            console.log('📋 Message:', error.response?.data?.message);
          }
          console.log('📋 Full error:', error.response?.data);
        }
        
        // Mentor database export access
        try {
          const mentorExport = await axios.get('http://127.0.0.1:5002/api/database-export/tables', {
            headers: { 'Authorization': `Bearer ${mentorToken}` }
          });
          console.log('✅ Mentor database export access:', mentorExport.status);
        } catch (error) {
          console.log('❌ Mentor database export failed:', error.response?.status);
          if (error.response?.data?.featureRestricted) {
            console.log('🔒 FEATURE RESTRICTED - Current plan:', error.response?.data?.currentPlan);
            console.log('📋 Message:', error.response?.data?.message);
          }
          console.log('📋 Full error:', error.response?.data);
        }
        
      } else {
        console.log('❌ Mentor login failed:', mentorLogin.status);
      }
    } catch (error) {
      console.log('❌ Mentor login error:', error.response?.status, error.response?.data?.message);
    }
    
    // Test 3: Check database subscription status
    console.log('\n💾 Test 3: Database Subscription Status');
    const db = require('./config/database-switch');
    
    db.get('SELECT id, name, email, role, subscriptionPlan, university_id FROM users WHERE email = ?', ['debugmentor@pro.com'], (err, mentor) => {
      if (err) {
        console.error('Error fetching mentor:', err);
      } else if (mentor) {
        console.log('👤 Mentor Database Status:');
        console.log('   ID:', mentor.id);
        console.log('   Name:', mentor.name);
        console.log('   Email:', mentor.email);
        console.log('   Role:', mentor.role);
        console.log('   Subscription Plan:', mentor.subscriptionPlan);
        console.log('   University ID:', mentor.university_id);
        
        // Check university
        db.get('SELECT id, name, subscriptionPlan, adminId FROM universities WHERE id = ?', [mentor.university_id], (err, university) => {
          if (err) {
            console.error('Error fetching university:', err);
          } else if (university) {
            console.log('🏫 University Status:');
            console.log('   ID:', university.id);
            console.log('   Name:', university.name);
            console.log('   Subscription Plan:', university.subscriptionPlan);
            console.log('   Admin ID:', university.adminId);
            
            // Check superadmin subscription
            db.get('SELECT planType, planName, status FROM subscriptions WHERE superadminId = ?', [`superadmin-${university.adminId}`], (err, subscription) => {
              if (err) {
                console.error('Error fetching subscription:', err);
              } else if (subscription) {
                console.log('💎 SuperAdmin Subscription:');
                console.log('   Plan Type:', subscription.planType);
                console.log('   Plan Name:', subscription.planName);
                console.log('   Status:', subscription.status);
                
                console.log('\n🎯 SUBSCRIPTION ANALYSIS:');
                console.log('✅ SuperAdmin Plan:', subscription.planType);
                console.log('✅ University Plan:', university.subscriptionPlan);
                console.log('❓ Mentor Plan:', mentor.subscriptionPlan);
                console.log('🔍 Issue: Mentor plan should match university plan');
                
              } else {
                console.log('❌ No SuperAdmin subscription found');
              }
            });
          } else {
            console.log('❌ University not found');
          }
        });
      } else {
        console.log('❌ Mentor not found');
      }
    });
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkCurrentMentorStatus();
