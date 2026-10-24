const db = require('./config/database-switch');

async function assignClassrooms() {
  console.log('🔧 Assigning Classrooms to Mentor and Student...\n');
  
  try {
    // Assign classroom 4 to mentor (ID: 34)
    console.log('👨‍🏫 Assigning classroom 4 to mentor (ID: 34)...');
    db.run(`
      INSERT OR IGNORE INTO classroomAssignments (classroomId, teacherId, role, assignedAt)
      VALUES (?, ?, 'mentor', CURRENT_TIMESTAMP)
    `, [4, 34], (err) => {
      if (err) {
        console.error('❌ Error assigning classroom to mentor:', err);
      } else {
        console.log('✅ Classroom 4 assigned to mentor');
      }
    });
    
    // Assign classroom 4 to student (ID: 28)
    console.log('👨‍🎓 Assigning classroom 4 to student (ID: 28)...');
    db.run(`
      INSERT OR IGNORE INTO student_classroom_assignment (classroomId, studentId, createdAt)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [4, 28], (err) => {
      if (err) {
        console.log('❌ Error assigning classroom to student:', err);
      } else {
        console.log('✅ Classroom 4 assigned to student');
      }
    });
    
    // Assign classroom 1 to student (ID: 28)
    console.log('👨‍🎓 Assigning classroom 1 to student (ID: 28)...');
    db.run(`
      INSERT OR IGNORE INTO student_classroom_assignment (classroomId, studentId, createdAt)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [1, 28], (err) => {
      if (err) {
        console.log('❌ Error assigning classroom to student:', err);
      } else {
        console.log('✅ Classroom 1 assigned to student');
      }
    });
    
    // Assign classroom 3 to student (ID: 28) - this one has a teacher
    console.log('👨‍🎓 Assigning classroom 3 to student (ID: 28)...');
    db.run(`
      INSERT OR IGNORE INTO student_classroom_assignment (classroomId, studentId, createdAt)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [3, 28], (err) => {
      if (err) {
        console.log('❌ Error assigning classroom to student:', err);
      } else {
        console.log('✅ Classroom 3 assigned to student');
      }
    });
    
    console.log('\n📋 Verifying assignments...');
    
    // Check mentor assignments
    db.all('SELECT * FROM classroomAssignments WHERE teacherId = ?', [34], (err, mentorAssignments) => {
      if (err) {
        console.error('❌ Error checking mentor assignments:', err);
      } else {
        console.log('📊 Mentor assignments:', mentorAssignments.length);
        mentorAssignments.forEach((assignment, i) => {
          console.log(`   ${i+1}. Classroom ID: ${assignment.classroomId}, Role: ${assignment.role}`);
        });
      }
    });
    
    // Check student assignments
    db.all('SELECT * FROM student_classroom_assignment WHERE studentId = ?', [28], (err, studentAssignments) => {
      if (err) {
        console.error('❌ Error checking student assignments:', err);
      } else {
        console.log('📊 Student assignments:', studentAssignments.length);
        studentAssignments.forEach((assignment, i) => {
          console.log(`   ${i+1}. Classroom ID: ${assignment.classroomId}`);
        });
      }
    });
    
    console.log('\n🎉 Assignment Complete!');
    console.log('✅ Mentor should now see assigned classrooms');
    console.log('✅ Student should now see assigned classrooms');
    
  } catch (error) {
    console.error('❌ Assignment failed:', error.message);
  }
}

assignClassrooms();
