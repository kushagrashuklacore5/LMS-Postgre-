const axios = require('axios');

async function checkClassroomsData() {
  console.log('🧪 Checking Classrooms Data Structure...\n');
  
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
      
      // Get classrooms
      console.log('\n🏛️ Getting classrooms...');
      try {
        const response = await axios.get('http://127.0.0.1:5002/api/classrooms', {
          headers: { 
            'Authorization': `Bearer ${adminToken}`
          }
        });
        
        console.log('📊 Response status:', response.status);
        console.log('📊 Response data type:', typeof response.data);
        console.log('📊 Response data:', response.data);
        
        if (response.data && response.data.data) {
          console.log('📋 Found classrooms in data.data:', response.data.data.length);
          console.log('📋 First classroom:', response.data.data[0]);
        } else if (Array.isArray(response.data)) {
          console.log('📋 Found classrooms array:', response.data.length);
          console.log('📋 First classroom:', response.data[0]);
        }
        
      } catch (error) {
        console.log('❌ Failed to get classrooms:', error.response?.status, error.response?.data?.message);
      }
      
    } else {
      console.log('❌ Admin login failed');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkClassroomsData();
