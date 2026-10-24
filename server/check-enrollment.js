const axios = require('axios');

const API = 'http://localhost:5002/api';

async function checkEnrollment() {
  try {
    // Step 1: Login as student
    console.log('1️⃣  Logging in as student...');
    const loginRes = await axios.post(`${API}/auth/login`, {
      email: 'student@gmail.com',
      password: 'password'
    });
    
    const studentToken = loginRes.data.token;
    const studentId = loginRes.data.user.userId;
    console.log('✅ Student logged in:', loginRes.data.user.name, `(ID: ${studentId})`);

    // Step 2: Check enrolled courses
    console.log('\n2️⃣  Checking enrolled courses...');
    const enrollmentRes = await axios.get(
      `${API}/courses/student`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );

    const enrolledCourses = enrollmentRes.data || [];
    console.log(`Student is enrolled in ${enrolledCourses.length} course(s):`);
    enrolledCourses.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.title} (ID: ${c.id})`);
    });

    // Step 3: Check if student is enrolled in "test" course
    const testCourse = enrolledCourses.find(c => c.title === 'test');
    if (testCourse) {
      console.log('\n✅ Student is already enrolled in "test" course');
      console.log('\n📝 Now refresh the student portal and:');
      console.log('1. Go to "My Courses"');
      console.log('2. Click on the "test" course');
      console.log('3. Scroll down to see the "🎥 Live Classes" section');
      console.log('4. You should see the live class card with a Join button');
    } else {
      console.log('\n❌ Student is NOT enrolled in the "test" course');
      console.log('\n📝 Creating enrollment...');
      
      // Enroll student in course ID 1 (test)
      await axios.post(
        `${API}/courses/1/enroll`,
        {},
        { headers: { Authorization: `Bearer ${studentToken}` } }
      );
      
      console.log('✅ Student enrolled in "test" course!');
      console.log('\n📝 Now:');
      console.log('1. Refresh the student portal');
      console.log('2. Go to "My Courses"');
      console.log('3. Click on the "test" course');
      console.log('4. Scroll down to see the "🎥 Live Classes" section');
      console.log('5. You should see the live class card with a Join button');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkEnrollment();
