const axios = require('axios');

async function verifyExactPassword() {
  console.log('🔍 Verifying exact password for abhishek@core5.co.in\n');
  
  try {
    const testPassword = 'O#P$0A@7THQW';
    
    console.log('🔑 Testing exact password:', JSON.stringify(testPassword));
    console.log('🔑 Password length:', testPassword.length);
    console.log('🔑 Password chars:', testPassword.split('').map(c => `"${c}" (${c.charCodeAt(0)})`).join(', '));
    
    // Test login
    const loginRes = await axios.post('http://127.0.0.1:5002/api/auth/login', {
      email: 'abhishek@core5.co.in',
      password: testPassword
    });
    
    console.log('✅ Login successful!');
    console.log('👤 User:', loginRes.data.user);
    
    console.log('\n💡 SOLUTION:');
    console.log('1. Copy this exact password: O#P$0A@7THQW');
    console.log('2. Make sure there are no extra spaces before/after');
    console.log('3. Check that special characters are correct: # $ @');
    console.log('4. Ensure case sensitivity is maintained');
    
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.message || error.message);
  }
}

verifyExactPassword();
