const axios = require('axios');

async function addStudentsToClassrooms() {
  console.log('🧪 Adding Students to Classrooms...\n');
  
  try {
    // Login as Admin to add students
    console.log('🔐 Login as Admin...');
    const adminLogin = await axios.post('http://127.0.0.1:5002/api/auth/login', {
      email: 'abhishek@core5.co.in',
      password: 'O#P$0A@7THQW'
    });
    
    if (adminLogin.status === 200) {
      const adminToken = adminLogin.data.token;
      console.log('✅ Admin login successful');
      
      // Get all students
      console.log('\n👥 Getting all students...');
      const studentsResponse = await axios.get('http://127.0.0.1:5002/api/users?role=student', {
        headers: { 
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      const students = studentsResponse.data.data || studentsResponse.data;
      console.log('✅ Found', students.length, 'students');
      
      // Get all classrooms
      console.log('\n🏛️ Getting all classrooms...');
      const classroomsResponse = await axios.get('http://127.0.0.1:5002/api/classrooms', {
        headers: { 
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      const classrooms = classroomsResponse.data.data || classroomsResponse.data;
      console.log('✅ Found', classrooms.length, 'classrooms');
      
      // Add first few students to first few classrooms
      const studentsToAdd = students.slice(0, 3); // Take first 3 students
      const classroomsToUpdate = classrooms.slice(0, 3); // Take first 3 classrooms
      
      for (const classroom of classroomsToUpdate) {
        console.log(`\n📝 Adding students to classroom: ${classroom.name}`);
        
        for (const student of studentsToAdd) {
          try {
            const addStudentResponse = await axios.post(`http://127.0.0.1:5002/api/classrooms/${classroom.id}/students`, {
              studentId: student.id || student._id
            }, {
              headers: { 
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`   ✅ Added ${student.name} to ${classroom.name}`);
          } catch (error) {
            console.log(`   ❌ Failed to add ${student.name}: ${error.response?.data?.message}`);
          }
        }
      }
      
      console.log('\n🎯 STUDENT ASSIGNMENT COMPLETE');
      console.log('✅ Students have been added to classrooms');
      console.log('✅ Mentors can now see students in their classrooms');
      
    }
    
  } catch (error) {
    console.error('❌ Process failed:', error.message);
  }
}

addStudentsToClassrooms();
