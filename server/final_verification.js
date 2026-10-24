const axios = require('axios');

async function finalVerification() {
  console.log('🧪 Final Verification - Course Setup...\n');
  
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
      
      // Get all users to find Rashmi
      console.log('\n👥 Getting all users...');
      const usersResponse = await axios.get('http://127.0.0.1:5002/api/users/all', {
        headers: { 
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      const rishi = usersResponse.data.find(u => u.name && u.name.toLowerCase().includes('rishi'));
      const rashmi = usersResponse.data.find(u => u.name && u.name.toLowerCase().includes('rashmi'));
      
      console.log('👨‍🏫 Rishi:', rishi ? `${rishi.name} (ID: ${rishi.id}) - Email: ${rishi.email}` : 'Not found');
      console.log('👩‍🎓 Rashmi:', rashmi ? `${rashmi.name} (ID: ${rashmi.id}) - Email: ${rashmi.email}` : 'Not found');
      
      if (!rashmi) {
        console.log('❌ Rashmi not found, creating her...');
        try {
          const createRashmi = await axios.post('http://127.0.0.1:5002/api/auth/register', {
            name: 'rashmi shetty',
            email: 'rashmi.shetty@example.com',
            password: 'rashmi123',
            role: 'student',
            university_id: 15
          });
          console.log('✅ Rashmi created successfully');
          rashmi = createRashmi.data.user;
        } catch (error) {
          console.log('❌ Failed to create Rashmi:', error.response?.data?.message);
          return;
        }
      }
      
      // Get Rishi's courses
      console.log('\n📚 Getting Rishi\'s courses...');
      try {
        const coursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/', {
          headers: { 
            'Authorization': `Bearer ${adminToken}`
          }
        });
        
        const allCourses = coursesResponse.data;
        const rishiCourses = allCourses.filter(course => course.mentorId == rishi.id);
        
        console.log(`📋 Found ${rishiCourses.length} courses assigned to Rishi:`);
        
        // Manually assign Rashmi to each course using direct database approach
        for (const course of rishiCourses) {
          console.log(`\n📚 Course: ${course.title} (ID: ${course.id})`);
          
          try {
            // Use the direct assign students endpoint
            await axios.post(`http://127.0.0.1:5002/api/courses/${course.id}/assign-students`, {
              studentIds: [rashmi.id.toString()]
            }, {
              headers: { 
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`✅ Assigned Rashmi to course "${course.title}"`);
          } catch (error) {
            console.log(`⚠️ Assignment attempt: ${error.response?.data?.message}`);
          }
        }
        
        // Verify assignments
        console.log('\n🔍 Verifying assignments...');
        const updatedCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/', {
          headers: { 
            'Authorization': `Bearer ${adminToken}`
          }
        });
        
        const updatedCourses = updatedCoursesResponse.data;
        const updatedRishiCourses = updatedCourses.filter(course => course.mentorId == rishi.id);
        
        console.log(`\n📊 Final Verification - Rishi's Courses (${updatedRishiCourses.length}):`);
        let assignedCount = 0;
        for (const course of updatedRishiCourses) {
          const rashmiAssigned = course.students && course.students.some(s => s.studentId == rashmi.id);
          console.log(`   📚 ${course.title}: ${rashmiAssigned ? '✅ Rashmi Assigned' : '❌ Not Assigned'}`);
          if (rashmiAssigned) assignedCount++;
        }
        
        console.log(`\n📊 Summary: ${assignedCount}/${updatedRishiCourses.length} courses assigned to Rashmi`);
        
        // Test Rashmi login
        console.log('\n🔐 Testing Rashmi login...');
        try {
          const rashmiLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
            email: rashmi.email,
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
            
            console.log(`✅ Rashmi can access ${rashmiCoursesResponse.data.length} courses:`);
            rashmiCoursesResponse.data.forEach(course => {
              console.log(`   📚 ${course.title} (Mentor: ${course.mentorName || 'N/A'})`);
            });
          }
        } catch (error) {
          console.log('❌ Rashmi login failed:', error.response?.data?.message);
        }
        
        // Summary
        console.log('\n🎯 SETUP SUMMARY:');
        console.log(`👨‍🏫 Mentor: Rishi (ID: ${rishi.id})`);
        console.log(`👩‍🎓 Student: Rashmi Shetty (ID: ${rashmi.id})`);
        console.log(`📚 Courses Created: ${rishiCourses.length} (2 per classroom)`);
        console.log(`📚 Courses Assigned to Rashmi: ${assignedCount}/${rishiCourses.length}`);
        console.log(`🔐 Rashmi Login: ${rashmi.email} / rashmi123`);
        console.log(`🔐 Rishi Login: ${rishi.email} / rishi123`);
        
      } catch (error) {
        console.log('❌ Failed to get courses:', error.response?.data?.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

finalVerification();
