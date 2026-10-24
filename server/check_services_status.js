const axios = require('axios');

async function checkServicesStatus() {
  console.log('🔍 Checking Services Status...\n');
  
  try {
    // Check Backend
    console.log('🖥️ Checking Backend...');
    try {
      const backendResponse = await axios.get('http://localhost:5002/api/health', { timeout: 5000 });
      console.log('✅ Backend: Running (Status ' + backendResponse.status + ')');
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Backend: Not running or not accessible');
      } else {
        console.log('⚠️ Backend: ' + error.message);
      }
    }
    
    // Check Frontend
    console.log('\n🌐 Checking Frontend...');
    try {
      const frontendResponse = await axios.get('http://localhost:5174', { timeout: 5000 });
      console.log('✅ Frontend: Running (Status ' + frontendResponse.status + ')');
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Frontend: Not running or not accessible');
      } else {
        console.log('⚠️ Frontend: ' + error.message);
      }
    }
    
    console.log('\n🎯 SERVICES STATUS CHECK COMPLETED');
    console.log('\n🌐 Access URLs:');
    console.log('   Frontend: http://localhost:5174');
    console.log('   Backend:  http://localhost:5002');
    
    console.log('\n🔐 Test Credentials:');
    console.log('   Storekeeper: storekeeper@core5.co.in / storekeeper123');
    console.log('   Admin: admin@core5.co.in / admin123');
    console.log('   Mentor: debugmentor@pro.com / jp08qyud');
    console.log('   Student: student@core5.co.in / student123');
    
  } catch (error) {
    console.error('❌ Status check failed:', error.message);
  }
}

checkServicesStatus();
