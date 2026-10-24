const db = require('./config/database-switch');

async function checkSubscriptionFeatures() {
  console.log('🔍 Checking subscription and feature lock system...\n');
  
  try {
    // Check user's subscription
    console.log('📊 Checking user subscription...');
    
    const user = await new Promise((resolve, reject) => {
      db.get(`
        SELECT u.id, u.name, u.email, u.role, u.subscriptionPlan, u.university_id, u.isApproved
        FROM users u 
        WHERE u.email = ?
      `, ['abhishek@core5.co.in'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('✅ User found:');
    console.log('   ID:', user.id);
    console.log('   Name:', user.name);
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   University ID:', user.university_id);
    console.log('   Subscription Plan:', user.subscriptionPlan);
    console.log('   Approved:', user.isApproved);
    
    // Check university subscription
    console.log('\n📊 Checking university subscription...');
    
    const university = await new Promise((resolve, reject) => {
      db.get(`
        SELECT u.id, u.name, u.subscriptionPlan, u.adminId
        FROM universities u 
        WHERE u.id = ?
      `, [user.university_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!university) {
      console.log('❌ University not found');
      return;
    }
    
    console.log('✅ University found:');
    console.log('   ID:', university.id);
    console.log('   Name:', university.name);
    console.log('   Subscription Plan:', university.subscriptionPlan);
    console.log('   Admin ID:', university.adminId);
    
    // Check superadmin subscription
    console.log('\n📊 Checking superadmin subscription...');
    
    const superadminSubscription = await new Promise((resolve, reject) => {
      db.get(`
        SELECT s.plan, s.features, s.superadminId, s.createdAt, s.updatedAt
        FROM subscriptions s 
        WHERE s.superadminId = ?
      `, [university.adminId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!superadminSubscription) {
      console.log('❌ Superadmin subscription not found');
      return;
    }
    
    console.log('✅ Superadmin subscription found:');
    console.log('   Plan:', superadminSubscription.plan);
    console.log('   Features:', superadminSubscription.features);
    console.log('   Superadmin ID:', superadminSubscription.superadminId);
    
    // Parse features
    let features = {};
    try {
      if (typeof superadminSubscription.features === 'string') {
        features = JSON.parse(superadminSubscription.features);
      } else if (typeof superadminSubscription.features === 'object') {
        features = superadminSubscription.features;
      }
    } catch (error) {
      console.log('❌ Failed to parse features:', error.message);
      return;
    }
    
    console.log('\n📋 Available Features:');
    Object.keys(features).forEach(key => {
      console.log(`   ${key}: ${features[key] ? '✅ Enabled' : '❌ Disabled'}`);
    });
    
    // Check feature access endpoint
    console.log('\n🔍 Testing feature access endpoint...');
    
    try {
      const axios = require('axios');
      
      // Login first
      const loginRes = await axios.post('http://127.0.0.1:5002/api/auth/login', {
        email: 'abhishek@core5.co.in',
        password: 'O#P$0A@7THQW'
      });
      
      const token = loginRes.data.token;
      
      // Test feature access
      const featureAccessRes = await axios.get('http://127.0.0.1:5002/api/subscription/check-feature-access', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('✅ Feature access endpoint working!');
      console.log('📊 Response:', featureAccessRes.data);
      
    } catch (error) {
      console.log('❌ Feature access test failed:', error.response?.status, error.response?.data?.message);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkSubscriptionFeatures();
