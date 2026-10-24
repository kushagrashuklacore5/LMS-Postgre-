const axios = require('axios');

const API = 'http://localhost:5002/api';

// Test data - try multiple mentors
const testAccounts = [
  { email: 'mentor@gmail.com', password: 'password' },
  { email: 'teacher@gmail.com', password: 'password' },
  { email: 'mentor2@gmail.com', password: 'password' }
];

async function createTestLiveClass() {
  try {
    let mentorToken = null;
    let mentorUser = null;

    // Try to login with different mentor accounts
    for (const account of testAccounts) {
      try {
        console.log(`🔑 Trying to login as ${account.email}...`);
        const loginRes = await axios.post(`${API}/auth/login`, {
          email: account.email,
          password: account.password
        });
        
        if (loginRes.data.token) {
          mentorToken = loginRes.data.token;
          mentorUser = loginRes.data.user;
          console.log('✅ Logged in successfully!');
          break;
        }
      } catch (err) {
        console.log(`   ❌ Failed (${err.response?.status})`);
      }
    }

    if (!mentorToken) {
      console.error('❌ Could not login with any account');
      return;
    }

    console.log(`✅ Mentor logged in: ${mentorUser.name} (ID: ${mentorUser.userId})`);

    // Step 2: Get all courses
    console.log('\n📚 Fetching all courses...');
    const coursesRes = await axios.get(`${API}/courses`, {
      headers: { Authorization: `Bearer ${mentorToken}` }
    });
    
    const courses = coursesRes.data || [];
    console.log(`Found ${courses.length} courses`);
    
    // Get the first course (any course will work for testing)
    let courseId = null;
    let courseName = null;
    
    if (courses.length > 0) {
      // Prefer courses taught by this mentor, but accept any course
      const myCourses = courses.filter(c => c.mentorId === mentorUser.userId);
      if (myCourses.length > 0) {
        courseId = myCourses[0].id;
        courseName = myCourses[0].title;
        console.log(`✅ Using your course: "${courseName}" (ID: ${courseId})`);
      } else {
        // Use any course for testing (admin can create live classes for any course)
        courseId = courses[0].id;
        courseName = courses[0].title;
        console.log(`✅ Using course: "${courseName}" (ID: ${courseId})`);
      }
    } else {
      console.error('❌ No courses found in the system');
      return;
    }

    // Step 3: Create a live class
    console.log('\n🎬 Creating live class...');
    const now = new Date();
    const startTime = new Date(now.getTime() + 5 * 60000); // 5 minutes from now
    const endTime = new Date(startTime.getTime() + 60 * 60000); // 1 hour duration

    const liveClassRes = await axios.post(
      `${API}/live-classes`,
      {
        courseId: courseId,
        title: '🎬 Demo Live Class - Test Session',
        description: 'This is a test live class to demonstrate the feature. Click Join to test the Jitsi integration!',
        scheduledStartTime: startTime.toISOString(),
        scheduledEndTime: endTime.toISOString(),
        duration: 60,
        platform: 'jitsi'
      },
      { headers: { Authorization: `Bearer ${mentorToken}` } }
    );

    const liveClass = liveClassRes.data.liveClass;
    console.log('✅ Live class created successfully!');
    console.log(`   📌 ID: ${liveClass.id}`);
    console.log(`   📌 Title: ${liveClass.title}`);
    console.log(`   📌 Meeting ID: ${liveClass.meetingId}`);
    console.log(`   📌 Meeting Link: ${liveClass.meetingLink}`);
    console.log(`   📌 Status: ${liveClass.status}`);
    console.log(`   📌 Scheduled Start: ${new Date(liveClass.scheduledStartTime).toLocaleString()}`);

    console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');
    console.log('\n📝 Next steps:');
    console.log('1. Go to your student account (student@gmail.com)');
    console.log(`2. Navigate to course: "${courseName}"`);
    console.log('3. Scroll to the "🎥 Live Classes" section');
    console.log('4. You should see the new live class card');
    console.log('5. Click "Join Class" to join the Jitsi meeting');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.error('   (Check if the course ID is correct)');
    }
  }
}

createTestLiveClass();
