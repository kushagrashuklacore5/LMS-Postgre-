const axios = require('axios');

async function verifyCoursesAndAssignStudent() {
  console.log('🧪 Verifying courses and assigning Rashmi to classrooms...\n');
  
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
        // Get all classrooms
        const classroomsResponse = await axios.get('http://127.0.0.1:5002/api/classrooms', {
          headers: { 
            'Authorization': `Bearer ${adminToken}`
          }
        });
        
        const classrooms = classroomsResponse.data.data;
        console.log(`\n🏛️ Processing ${classrooms.length} classrooms...`);
        
        for (const classroom of classrooms) {
          console.log(`\n📚 Classroom: ${classroom.name} (ID: ${classroom.id})`);
          
          // Get courses in this classroom
          try {
            const coursesResponse = await axios.get(`http://127.0.0.1:5002/api/courses/classroom?classroomId=${classroom.id}`, {
              headers: { 
                'Authorization': `Bearer ${adminToken}`
              }
            });
            
            const courses = coursesResponse.data;
            console.log(`📋 Found ${courses.length} courses:`, courses.map(c => c.title));
            
            // Check if courses are assigned to Rishi
            for (const course of courses) {
              if (course.mentorId == rishi.id) {
                console.log(`✅ Course "${course.title}" is assigned to Rishi`);
              } else {
                console.log(`⚠️ Course "${course.title}" is assigned to mentor ${course.mentorId} (${course.mentorName})`);
              }
              
              // Check if Rashmi is assigned to this course
              const rashmiAssigned = course.students && course.students.some(s => s.studentId == rashmi.id);
              if (rashmiAssigned) {
                console.log(`✅ Rashmi is assigned to "${course.title}"`);
              } else {
                console.log(`⚠️ Rashmi is not assigned to "${course.title}"`);
              }
            }
            
            // Assign Rashmi to this classroom if not already assigned
            console.log(`🔗 Assigning Rashmi to classroom ${classroom.name}...`);
            try {
              await axios.post('http://127.0.0.1:5002/api/classrooms/assign-students', {
                classroomId: classroom.id,
                studentIds: [rashmi.id]
              }, {
                headers: { 
                  'Authorization': `Bearer ${adminToken}`,
                  'Content-Type': 'application/json'
                }
              });
              console.log(`✅ Rashmi assigned to classroom ${classroom.name}`);
            } catch (error) {
              console.log(`ℹ️ Rashmi assignment: ${error.response?.data?.message || 'Already assigned'}`);
            }
            
          } catch (error) {
            console.log(`❌ Failed to get courses for classroom ${classroom.id}:`, error.response?.data?.message);
          }
        }
        
        // Verify Rashmi can access her courses
        console.log('\n🔍 Verifying Rashmi can access courses...');
        try {
          // Login as Rashmi
          const rashmiLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
            email: 'rashmi.shetty@example.com',
            password: 'rashmi123'
          });
          
          if (rashmiLogin.status === 200) {
            const rashmiToken = rashmiLogin.data.token;
            
            // Get Rashmi's courses
            const rashmiCoursesResponse = await axios.get('http://127.0.0.1:5002/api/courses/student', {
              headers: { 
                'Authorization': `Bearer ${rashmiToken}`
              }
            });
            
            console.log(`✅ Rashmi can access ${rashmiCoursesResponse.data.length} courses:`);
            rashmiCoursesResponse.data.forEach(course => {
              console.log(`   📚 ${course.title} (Classroom: ${course.classroomId || 'N/A'})`);
            });
          }
        } catch (error) {
          console.log('❌ Failed to verify Rashmi access:', error.response?.data?.message);
        }
        
      }
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  }
}

verifyCoursesAndAssignStudent();
