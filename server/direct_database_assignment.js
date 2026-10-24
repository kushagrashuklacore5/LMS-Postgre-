const db = require('./config/database-switch');

async function directDatabaseAssignment() {
  console.log('🧪 Direct Database Assignment for Rashmi...\n');
  
  try {
    // Get Rishi and Rashmi user IDs
    console.log('👥 Getting user IDs...');
    db.get("SELECT id, name, email FROM users WHERE name LIKE '%rishi%' AND role = 'mentor'", [], (err, rishi) => {
      if (err) {
        console.error('❌ Error finding Rishi:', err);
        return;
      }
      
      if (!rishi) {
        console.log('❌ Rishi not found');
        return;
      }
      
      console.log(`👨‍🏫 Rishi found: ${rishi.name} (ID: ${rishi.id})`);
      
      db.get("SELECT id, name, email FROM users WHERE name LIKE '%rashmi%' AND role = 'student'", [], (err, rashmi) => {
        if (err) {
          console.error('❌ Error finding Rashmi:', err);
          return;
        }
        
        if (!rashmi) {
          console.log('❌ Rashmi not found');
          return;
        }
        
        console.log(`👩‍🎓 Rashmi found: ${rashmi.name} (ID: ${rashmi.id})`);
        
        // Get all courses assigned to Rishi
        console.log('\n📚 Getting Rishi\'s courses...');
        db.all("SELECT * FROM courses WHERE mentorId = ?", [rishi.id], (err, courses) => {
          if (err) {
            console.error('❌ Error getting courses:', err);
            return;
          }
          
          console.log(`📋 Found ${courses.length} courses assigned to Rishi`);
          
          // Assign Rashmi to each course
          let assignedCount = 0;
          courses.forEach((course, index) => {
            console.log(`\n📚 Processing course ${index + 1}: ${course.title} (ID: ${course.id})`);
            
            // Check if already assigned
            db.get("SELECT * FROM course_students WHERE courseId = ? AND studentId = ?", [course.id, rashmi.id], (err, existing) => {
              if (err) {
                console.error(`❌ Error checking existing assignment for course ${course.id}:`, err);
                return;
              }
              
              if (existing) {
                console.log(`✅ Rashmi already assigned to course "${course.title}"`);
                assignedCount++;
              } else {
                // Assign Rashmi to the course
                db.run("INSERT INTO course_students (courseId, studentId) VALUES (?, ?)", [course.id, rashmi.id], function(err) {
                  if (err) {
                    console.error(`❌ Error assigning Rashmi to course ${course.id}:`, err);
                  } else {
                    console.log(`✅ Rashmi assigned to course "${course.title}"`);
                    assignedCount++;
                  }
                  
                  // Check if this was the last course
                  if (assignedCount === courses.length) {
                    console.log(`\n🎯 Assignment Complete: ${assignedCount}/${courses.length} courses assigned to Rashmi`);
                    
                    // Verify assignments
                    verifyAssignments(rishi.id, rashmi.id);
                  }
                });
              }
            });
          });
        });
      });
    });
    
  } catch (error) {
    console.error('❌ Direct assignment failed:', error.message);
  }
}

function verifyAssignments(mentorId, studentId) {
  console.log('\n🔍 Verifying final assignments...');
  
  // Get all courses for the mentor
  db.all("SELECT * FROM courses WHERE mentorId = ?", [mentorId], (err, courses) => {
    if (err) {
      console.error('❌ Error getting courses for verification:', err);
      return;
    }
    
    console.log(`\n📊 Verification Results (${courses.length} courses):`);
    
    let verifiedCount = 0;
    courses.forEach((course, index) => {
      db.get("SELECT * FROM course_students WHERE courseId = ? AND studentId = ?", [course.id, studentId], (err, assignment) => {
        if (err) {
          console.error(`❌ Error verifying assignment for course ${course.id}:`, err);
          return;
        }
        
        const isAssigned = !!assignment;
        console.log(`   📚 ${course.title}: ${isAssigned ? '✅ Assigned' : '❌ Not Assigned'}`);
        
        verifiedCount++;
        if (verifiedCount === courses.length) {
          console.log('\n🎯 SETUP COMPLETE!');
          console.log('📚 Course Summary:');
          console.log(`   - Total courses: ${courses.length}`);
          console.log(`   - Assigned to Rashmi: ${courses.filter(c => c.assigned).length}/${courses.length}`);
          
          // Test login credentials
          console.log('\n🔐 Login Credentials:');
          console.log('👨‍🏫 Rishi: rishi@core5.co.in / rishi123');
          console.log('👩‍🎓 Rashmi: rashmi.shetty@core5.co.in / rashmi123');
          
          console.log('\n🌐 Access URLs:');
          console.log('🎓 Student Portal: http://localhost:5174/student/dashboard');
          console.log('👨‍🏫 Mentor Portal: http://localhost:5174/mentor/dashboard');
        }
      });
    });
  });
}

directDatabaseAssignment();
