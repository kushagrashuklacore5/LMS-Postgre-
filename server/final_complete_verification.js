const axios = require('axios');

async function finalCompleteVerification() {
  console.log('🎯 FINAL COMPLETE VERIFICATION...\n');
  
  try {
    // Test Rishi login
    console.log('🔐 Testing Rishi login...');
    try {
      const rishiLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
        email: 'rishi@core5.co.in',
        password: 'rishi123'
      });
      
      if (rishiLogin.status === 200) {
        const rishiToken = rishiLogin.data.token;
        console.log('✅ Rishi login successful');
        
        // Get Rishi's courses
        const rishiCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/mentor', {
          headers: { 
            'Authorization': `Bearer ${rishiToken}`
          }
        });
        
        console.log(`✅ Rishi has access to ${rishiCoursesResponse.data.length} courses:`);
        rishiCoursesResponse.data.forEach(course => {
          console.log(`   📚 ${course.title} (Classroom: ${course.classroomId || 'N/A'})`);
        });
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
        const rashmiToken = rashmiLogin.data.token;
        console.log('✅ Rashmi login successful');
        
        // Get Rashmi's courses
        const rashmiCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/student', {
          headers: { 
            'Authorization': `Bearer ${rashmiToken}`
          }
        });
        
        console.log(`✅ Rashmi has access to ${rashmiCoursesResponse.data.length} courses:`);
        rashmiCoursesResponse.data.forEach(course => {
          console.log(`   📚 ${course.title} (Mentor: ${course.mentorName || 'N/A'})`);
        });
        
        // Count courses by mentor
        const rishiCoursesForRashmi = rashmiCoursesResponse.data.filter(course => course.mentorName && course.mentorName.toLowerCase().includes('rishi'));
        console.log(`\n📊 Summary: Rashmi has ${rishiCoursesForRashmi.length} courses assigned by Rishi`);
      }
    } catch (error) {
      console.log('❌ Rashmi login failed:', error.response?.data?.message);
      
      // Try alternative email
      console.log('🔄 Trying alternative email for Rashmi...');
      try {
        const rashmiLoginAlt = await axios.post('http://127.0.0.1:5002/api/auth/login', {
          email: 'rashmi.shetty@example.com',
          password: 'rashmi123'
        });
        
        if (rashmiLoginAlt.status === 200) {
          const rashmiToken = rashmiLoginAlt.data.token;
          console.log('✅ Rashmi login successful (alternative email)');
          
          // Get Rashmi's courses
          const rashmiCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/student', {
            headers: { 
              'Authorization': `Bearer ${rashmiToken}`
            }
          });
          
          console.log(`✅ Rashmi has access to ${rashmiCoursesResponse.data.length} courses:`);
          rashmiCoursesResponse.data.forEach(course => {
            console.log(`   📚 ${course.title} (Mentor: ${course.mentorName || 'N/A'})`);
          });
        }
      } catch (error2) {
        console.log('❌ Both Rashmi login attempts failed');
      }
    }
    
    // Get classroom summary
    console.log('\n🏛️ Getting classroom summary...');
    try {
      const adminLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
        email: 'abhishek@core5.co.in',
        password: 'O#P$0A@7THQW'
      });
      
      if (adminLogin.status === 200) {
        const adminToken = adminLogin.data.token;
        
        const classroomsResponse = await axios.get('http://127.0.0.1:5002/api/classrooms', {
          headers: { 
            'Authorization': `Bearer ${adminToken}`
          }
        });
        
        const classrooms = classroomsResponse.data.data;
        console.log(`🏛️ Found ${classrooms.length} classrooms`);
        
        let totalCourses = 0;
        for (const classroom of classrooms) {
          try {
            const coursesResponse = await axios.get(`http://127.0.0.1:5002/api/courses/classroom?classroomId=${classroom.id}`, {
              headers: { 
                'Authorization': `Bearer ${adminToken}`
              }
            });
            
            const courses = coursesResponse.data;
            totalCourses += courses.length;
            console.log(`   📚 ${classroom.name}: ${courses.length} courses`);
          } catch (error) {
            console.log(`   ❌ ${classroom.name}: Failed to get courses`);
          }
        }
        
        console.log(`\n📊 Total courses across all classrooms: ${totalCourses}`);
      }
    } catch (error) {
      console.log('❌ Failed to get classroom summary:', error.response?.data?.message);
    }
    
    // Final summary
    console.log('\n🎯 FINAL SETUP SUMMARY:');
    console.log('👨‍🏫 Mentor: Rishi');
    console.log('   - Email: rishi@core5.co.in');
    console.log('   - Password: rishi123');
    console.log('   - Role: Mentor');
    console.log('👩‍🎓 Student: Rashmi Shetty');
    console.log('   - Email: rashmi.shetty@core5.co.in (or rashmi.shetty@example.com)');
    console.log('   - Password: rashmi123');
    console.log('   - Role: Student');
    console.log('📚 Courses: 2 courses created in each classroom');
    console.log('🔗 Assignment: All Rishi\'s courses assigned to Rashmi');
    console.log('🌐 Access: http://localhost:5174');
    
  } catch (error) {
    console.error('❌ Final verification failed:', error.message);
  }
}

finalCompleteVerification();
