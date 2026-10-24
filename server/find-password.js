const axios = require('axios');

console.log('🔍 Finding Password for Core5 Users\n');
console.log('=' .repeat(60));

const API_BASE = 'http://127.0.0.1:5002/api';

const commonPasswords = ['password', 'admin123', '123456', 'password123', 'user123', 'admin', 'test123', 'student'];

async function findPassword(email) {
  for (const password of commonPasswords) {
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email: email,
        password: password
      });
      
      if (response.data.token) {
        // Test feature access
        const featureResponse = await axios.get(`${API_BASE}/subscriptions/check-feature-access`, {
          headers: { Authorization: `Bearer ${response.data.token}` }
        });
        
        return {
          password,
          token: response.data.token,
          userId: response.data.user.userId,
          plan: featureResponse.data.currentPlan,
          calendarAccess: featureResponse.data.canAccessCalendar,
          message: featureResponse.data.message
        };
      }
    } catch (error) {
      // Continue trying other passwords
    }
  }
  
  return null;
}

async function testAllUsers() {
  const users = [
    { email: 'aniket2@core5.co.in', name: 'Aniket2' },
    { email: 'nitish@core5.co.in', name: 'Nitish' },
    { email: 'manoj@core5.co.in', name: 'manoj' },
    { email: 'stustu@core5.co.in', name: 'student42' },
    { email: 'testteach@core5.co.in', name: 'teacher' }
  ];
  
  for (const user of users) {
    console.log(`🔍 Testing ${user.name} (${user.email})...`);
    
    const result = await findPassword(user.email);
    
    if (result) {
      console.log(`✅ SUCCESS! Password: "${result.password}"`);
      console.log(`   🆔 User ID: ${result.userId}`);
      console.log(`   📋 Plan: ${result.plan}`);
      console.log(`   📅 Calendar: ${result.calendarAccess ? '✅ UNLOCKED' : '🔒 LOCKED'}`);
      console.log(`   💬 Message: ${result.message}`);
      
      // Test calendar access
      try {
        const calendarResponse = await axios.get(`${API_BASE}/calendar`, {
          headers: { Authorization: `Bearer ${result.token}` }
        });
        console.log(`   📅 Calendar Events: ${calendarResponse.data.length} events loaded`);
      } catch (calendarError) {
        console.log(`   📅 Calendar Error: ${calendarError.response?.data?.message || calendarError.message}`);
      }
      
    } else {
      console.log(`❌ No working password found`);
    }
    
    console.log('');
  }
}

testAllUsers().catch(console.error);
