const axios = require('axios');

async function assignRashmiToCourses() {
  console.log('🧪 Assigning Rashmi to all Rishi\'s courses...\n');
  
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
      
      // Get user IDs
      const usersResponse = await axios.get('http://127.0.0.1:5002/api/users/all', {
        headers: { 
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      const rishi = usersResponse.data.find(u => u.name && u.name.toLowerCase().includes('rishi'));
      const rashmi = usersResponse.data.find(u => u.name && u.name.toLowerCase().includes('rashmi'));
      
      console.log('👨‍🏫 Rishi:', rishi ? `${rishi.name} (ID: ${rishi.id})` : 'Not found');
      console.log('👩‍🎓 Rashmi:', rashmi ? `${rashmi.name} (ID: ${rashmi.id})` : 'Not found');
      
      if (rishi && rashmi) {
        // Get all courses
        console.log('\n📚 Getting all courses...');
        try {
          const coursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/', {
            headers: { 
              'Authorization': `Bearer ${adminToken}`
            }
          });
          
          const allCourses = coursesResponse.data;
          console.log(`📋 Found ${allCourses.length} total courses`);
          
          // Filter courses assigned to Rishi
          const rishiCourses = allCourses.filter(course => course.mentorId == rishi.id);
          console.log(`📋 Found ${rishiCourses.length} courses assigned to Rishi:`);
          
          for (const course of rishiCourses) {
            console.log(`\n📚 Processing course: ${course.title} (ID: ${course.id})`);
            
            // Check if Rashmi is already assigned
            const rashmiAssigned = course.students && course.students.some(s => s.studentId == rashmi.id);
            if (rashmiAssigned) {
              console.log(`✅ Rashmi is already assigned to this course`);
            } else {
              console.log(`⚠️ Rashmi is not assigned - assigning now...`);
              
              try {
                // Assign Rashmi to the course
                await axios.post(`http://127.0.0.1:5002/api/courses/${course.id}/assign-students`, {
                  studentIds: [rashmi.id.toString()]
                }, {
                  headers: { 
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                  }
                });
                
                console.log(`✅ Rashmi assigned to course "${course.title}"`);
              } catch (error) {
                console.log(`❌ Failed to assign Rashmi:`, error.response?.data?.message);
              }
            }
          }
          
          // Verify final assignment
          console.log('\n🔍 Verifying final course assignments...');
          try {
            // Get updated courses
            const updatedCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/', {
              headers: { 
                'Authorization': `Bearer ${adminToken}`
              }
            });
            
            const updatedCourses = updatedCoursesResponse.data;
            const updatedRishiCourses = updatedCourses.filter(course => course.mentorId == rishi.id);
            
            console.log(`\n📊 Final Status - Rishi's Courses (${updatedRishiCourses.length}):`);
            for (const course of updatedRishiCourses) {
              const rashmiAssigned = course.students && course.students.some(s => s.studentId == rashmi.id);
              console.log(`   📚 ${course.title}: ${rashmiAssigned ? '✅ Rashmi Assigned' : '❌ Not Assigned'}`);
            }
            
            // Test Rashmi login
            console.log('\n🔐 Testing Rashmi login...');
            try {
              const rashmiLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
                email: 'rashmi.shetty@example.com',
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
            
          } catch (error) {
            console.log('❌ Failed to get updated courses:', error.response?.data?.message);
          }
          
        } catch (error) {
          console.log('❌ Failed to get courses:', error.response?.data?.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Assignment failed:', error.message);
  }
}

assignRashmiToCourses();
