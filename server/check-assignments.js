const db = require('config/database-switch');

console.log('=== Checking course_students table ===');
db.all('SELECT * FROM course_students', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Course assignments:', rows.length);
    rows.forEach(r => console.log(`  CourseID ${r.courseId} -> StudentID ${r.studentId}`));
  }
  
  console.log('\n=== Checking which student should be logged in ===');
  db.all('SELECT id, name, email, role FROM users WHERE role = "student"', (err, students) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('All students:', students);
    }
    
    console.log('\n=== Auto-assigning students from classrooms to courses ===');
    // Get all courses and their classroom assignments
    db.all('SELECT id, title, classroomId FROM courses', (err, courses) => {
      if (err) {
        console.error('Error fetching courses:', err);
        process.exit(0);
      }
      
      courses.forEach(course => {
        if (course.classroomId) {
          console.log(`\nProcessing course: ${course.title} (Classroom: ${course.classroomId})`);
          
          // Get students assigned to this classroom
          db.all('SELECT studentId FROM student_classroom_assignment WHERE classroomId = ?', [course.classroomId], (err, students) => {
            if (err) {
              console.error('Error fetching students:', err);
              return;
            }
            
            console.log(`Students in classroom ${course.classroomId}:`, students);
            
            // Assign each student to the course
            students.forEach(student => {
              db.run('INSERT OR IGNORE INTO course_students (courseId, studentId) VALUES (?, ?)', 
                [course.id, student.studentId], function(err) {
                  if (err) {
                    console.error('Error assigning student:', err);
                  } else {
                    if (this.changes > 0) {
                      console.log(`✅ Assigned Student ${student.studentId} to Course ${course.title}`);
                    }
                  }
                }
              );
            });
          });
        }
      });
      
      setTimeout(() => {
        console.log('\n=== Final check ===');
        db.all('SELECT * FROM course_students', (err, finalRows) => {
          if (err) {
            console.error('Error:', err);
          } else {
            console.log('Final course assignments:', finalRows.length);
            finalRows.forEach(r => console.log(`  CourseID ${r.courseId} -> StudentID ${r.studentId}`));
          }
          process.exit(0);
        });
      }, 2000);
    });
  });
});
