const db = require('./config/database-switch');
const bcrypt = require('bcrypt');

async function resetUserPasswords() {
  console.log('🔧 Resetting User Passwords...\n');
  
  try {
    // Get Rishi's user data
    console.log('👨‍🏫 Processing Rishi...');
    db.get("SELECT * FROM users WHERE name LIKE '%rishi%' AND role = 'mentor'", [], (err, rishi) => {
      if (err) {
        console.error('❌ Error finding Rishi:', err);
        return;
      }
      
      if (!rishi) {
        console.log('❌ Rishi not found');
        return;
      }
      
      console.log(`👨‍🏫 Rishi found: ${rishi.name} (ID: ${rishi.id})`);
      console.log(`   Current email: ${rishi.email}`);
      
      // Update Rishi's password
      bcrypt.hash('rishi123', 10, (err, hashedPassword) => {
        if (err) {
          console.error('❌ Error hashing Rishi password:', err);
          return;
        }
        
        db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, rishi.id], function(err) {
          if (err) {
            console.error('❌ Error updating Rishi password:', err);
          } else {
            console.log('✅ Rishi password updated to: rishi123');
          }
        });
      });
    });
    
    // Get Rashmi's user data
    console.log('\n👩‍🎓 Processing Rashmi...');
    db.get("SELECT * FROM users WHERE name LIKE '%rashmi%' AND role = 'student'", [], (err, rashmi) => {
      if (err) {
        console.error('❌ Error finding Rashmi:', err);
        return;
      }
      
      if (!rashmi) {
        console.log('❌ Rashmi not found');
        return;
      }
      
      console.log(`👩‍🎓 Rashmi found: ${rashmi.name} (ID: ${rashmi.id})`);
      console.log(`   Current email: ${rashmi.email}`);
      
      // Update Rashmi's password
      bcrypt.hash('rashmi123', 10, (err, hashedPassword) => {
        if (err) {
          console.error('❌ Error hashing Rashmi password:', err);
          return;
        }
        
        db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, rashmi.id], function(err) {
          if (err) {
            console.error('❌ Error updating Rashmi password:', err);
          } else {
            console.log('✅ Rashmi password updated to: rashmi123');
          }
        });
      });
    });
    
    // Wait a bit and test logins
    setTimeout(() => {
      console.log('\n🧪 Testing updated credentials...');
      testLogins();
    }, 1000);
    
  } catch (error) {
    console.error('❌ Password reset failed:', error.message);
  }
}

async function testLogins() {
  const axios = require('axios');
  
  // Test Rishi login
  console.log('🔐 Testing Rishi login...');
  try {
    const rishiLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
      email: 'rishi@core5.co.in',
      password: 'rishi123'
    });
    
    if (rishiLogin.status === 200) {
      console.log('✅ Rishi login successful');
      
      // Get Rishi's courses
      const rishiToken = rishiLogin.data.token;
      const rishiCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/mentor', {
        headers: { 
          'Authorization': `Bearer ${rishiToken}`
        }
      });
      
      console.log(`📚 Rishi has access to ${rishiCoursesResponse.data.length} courses`);
    }
  } catch (error) {
    console.log('❌ Rishi login failed:', error.response?.data?.message);
  }
  
  // Test Rashmi login
  console.log('\n🔐 Testing Rashmi login...');
  try {
    const rashmiLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
      email: 'rashmi.shetty@core5.co.in',
      password: 'rashmi123'
    });
    
    if (rashmiLogin.status === 200) {
      console.log('✅ Rashmi login successful');
      
      // Get Rashmi's courses
      const rashmiToken = rashmiLogin.data.token;
      const rashmiCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/student', {
        headers: { 
          'Authorization': `Bearer ${rashmiToken}`
        }
      });
      
      console.log(`📚 Rashmi has access to ${rashmiCoursesResponse.data.length} courses`);
      
      // Show course details
      console.log('\n📋 Rashmi\'s courses:');
      rashmiCoursesResponse.data.forEach(course => {
        console.log(`   📚 ${course.title} (Mentor: ${course.mentorName || 'N/A'})`);
      });
    }
  } catch (error) {
    console.log('❌ Rashmi login failed:', error.response?.data?.message);
  }
  
  console.log('\n🎯 SETUP COMPLETE!');
  console.log('👨‍🏫 Rishi Login: rishi@core5.co.in / rishi123');
  console.log('👩‍🎓 Rashmi Login: rashmi.shetty@core5.co.in / rashmi123');
  console.log('🌐 Access: http://localhost:5174');
}

resetUserPasswords();
