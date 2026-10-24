const axios = require('axios');

async function setupCoursesForRishi() {
  console.log('🧪 Setting up courses for Rishi and Rashmi...\n');
  
  try {
    // Login as admin to get full access
    console.log('🔐 Login as admin...');
    const adminLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
      email: 'abhishek@core5.co.in',
      password: 'O#P$0A@7THQW'
    });
    
    if (adminLogin.status === 200) {
      const adminToken = adminLogin.data.token;
      console.log('✅ Admin login successful');
      
      // Get all users to find rishi and rashmi
      console.log('\n👥 Getting all users...');
      try {
        const usersResponse = await axios.get('http://127.0.0.1:5002/api/users/all', {
          headers: { 
            'Authorization': `Bearer ${adminToken}`
          }
        });
        
        const users = usersResponse.data;
        console.log('📋 Total users:', users.length);
        
        // Find rishi (mentor)
        const rishi = users.find(u => u.name && u.name.toLowerCase().includes('rishi') && u.role === 'mentor');
        console.log('👨‍🏫 Rishi found:', rishi ? `${rishi.name} (ID: ${rishi.id})` : 'Not found');
        
        // Find rashmi shetty (student)
        const rashmi = users.find(u => u.name && u.name.toLowerCase().includes('rashmi') && u.role === 'student');
        console.log('👩‍🎓 Rashmi Shetty found:', rashmi ? `${rashmi.name} (ID: ${rashmi.id})` : 'Not found');
        
        if (!rishi || !rashmi) {
          console.log('❌ Could not find both users. Creating them...');
          
          // Create rishi if not found
          if (!rishi) {
            console.log('👨‍🏫 Creating Rishi mentor...');
            try {
              const rishiResponse = await axios.post('http://127.0.0.1:5002/api/auth/register', {
                name: 'rishi',
                email: 'rishi@core5.co.in',
                password: 'rishi123',
                role: 'mentor',
                university_id: 15
              });
              console.log('✅ Rishi created successfully');
              rishi = rishiResponse.data.user;
            } catch (error) {
              console.log('❌ Failed to create Rishi:', error.response?.data?.message);
            }
          }
          
          // Create rashmi if not found
          if (!rashmi) {
            console.log('👩‍🎓 Creating Rashmi Shetty student...');
            try {
              const rashmiResponse = await axios.post('http://127.0.0.1:5002/api/auth/register', {
                name: 'rashmi shetty',
                email: 'rashmi.shetty@example.com',
                password: 'rashmi123',
                role: 'student',
                university_id: 15
              });
              console.log('✅ Rashmi Shetty created successfully');
              rashmi = rashmiResponse.data.user;
            } catch (error) {
              console.log('❌ Failed to create Rashmi:', error.response?.data?.message);
            }
          }
        }
        
        if (rishi && rashmi) {
          await createCoursesForClassrooms(adminToken, rishi.id, rashmi.id);
        }
        
      } catch (error) {
        console.log('❌ Failed to get users:', error.response?.data?.message);
      }
      
    } else {
      console.log('❌ Admin login failed');
    }
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

async function createCoursesForClassrooms(adminToken, mentorId, studentId) {
  console.log('\n📚 Creating courses for all classrooms...');
  
  try {
    // Get all classrooms
    const classroomsResponse = await axios.get('http://127.0.0.1:5002/api/classrooms', {
      headers: { 
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    const classrooms = classroomsResponse.data.data;
    console.log('🏛️ Found classrooms:', classrooms.length);
    
    // Course templates
    const courseTemplates = [
      {
        title: 'Mathematics Fundamentals',
        description: 'Basic mathematics concepts and problem-solving',
        category: 'Mathematics',
        duration: '40'
      },
      {
        title: 'Science Essentials',
        description: 'Introduction to scientific concepts and experiments',
        category: 'Science',
        duration: '35'
      }
    ];
    
    // Create 2 courses for each classroom
    for (const classroom of classrooms) {
      console.log(`\n🏛️ Processing classroom: ${classroom.name} (ID: ${classroom.id})`);
      
      // Check existing courses in this classroom
      try {
        const existingCoursesResponse = await axios.get(`http://127.0.0.1:5002/api/courses/classroom?classroomId=${classroom.id}`, {
          headers: { 
            'Authorization': `Bearer ${adminToken}`
          }
        });
        
        const existingCourses = existingCoursesResponse.data;
        console.log(`📚 Existing courses in classroom ${classroom.id}: ${existingCourses.length}`);
        
        // Create courses if less than 2
        if (existingCourses.length < 2) {
          for (let i = existingCourses.length; i < 2; i++) {
            const template = courseTemplates[i];
            const courseData = {
              title: `${template.title} - ${classroom.name}`,
              description: template.description,
              category: template.category,
              duration: template.duration,
              mentorId: mentorId.toString(),
              studentIds: [studentId.toString()],
              classroomId: classroom.id.toString()
            };
            
            console.log(`📚 Creating course: ${courseData.title}`);
            
            try {
              const courseResponse = await axios.post('http://127.0.0.1:5002/api/courses/create-course', courseData, {
                headers: { 
                  'Authorization': `Bearer ${adminToken}`,
                  'Content-Type': 'application/json'
                }
              });
              
              console.log(`✅ Course created successfully (ID: ${courseResponse.data.course.id})`);
            } catch (error) {
              console.log(`❌ Failed to create course:`, error.response?.data?.message);
            }
          }
        } else {
          console.log(`⏭️ Classroom ${classroom.name} already has 2 courses`);
        }
        
      } catch (error) {
        console.log(`❌ Failed to check existing courses for classroom ${classroom.id}:`, error.response?.data?.message);
      }
    }
    
    console.log('\n✅ Course setup completed!');
    
  } catch (error) {
    console.log('❌ Failed to get classrooms:', error.response?.data?.message);
  }
}

setupCoursesForRishi();
