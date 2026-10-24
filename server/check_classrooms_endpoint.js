const axios = require('axios');

async function checkClassroomsEndpoint() {
  console.log('🧪 Checking Classrooms Endpoints...\n');
  
  try {
    // Login as admin
    console.log('🔐 Login as admin...');
    const adminLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
      email: 'abhishek@core5.co.in',
      password: 'O#P$0A@7THQW'
    });
    
    if (adminLogin.status === 200) {
      const adminToken = adminLogin.data.token;
      console.log('✅ Admin login successful');
      
      // Try different endpoints
      const endpoints = [
        '/api/classrooms/all',
        '/api/classrooms',
        '/api/classrooms/list',
        '/api/admin/classrooms'
      ];
      
      for (const endpoint of endpoints) {
        console.log(`\n🔍 Trying endpoint: ${endpoint}`);
        try {
          const response = await axios.get(`http://127.0.0.1:5002${endpoint}`, {
            headers: { 
              'Authorization': `Bearer ${adminToken}`
            }
          });
          
          console.log(`✅ Endpoint ${endpoint} works! Found ${response.data.length} classrooms`);
          console.log('📋 First classroom:', response.data[0]);
          break;
          
        } catch (error) {
          console.log(`❌ Endpoint ${endpoint} failed:`, error.response?.status, error.response?.data?.message);
        }
      }
      
    } else {
      console.log('❌ Admin login failed');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkClassroomsEndpoint();
