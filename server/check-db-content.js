const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open database
const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  }
  console.log('✅ Database connected');
  testData();
});

function testData() {
  console.log('\n📋 Checking Database Contents...\n');
  
  // Check users (mentors)
  db.all("SELECT id, name, email, role FROM users WHERE role = 'mentor' LIMIT 5", (err, mentors) => {
    console.log('📚 Mentors:');
    if (mentors && mentors.length > 0) {
      mentors.forEach(m => console.log(`  - ID: ${m.id}, Name: ${m.name}, Email: ${m.email}`));
    } else {
      console.log('  ❌ No mentors found');
    }

    // Check courses
    db.all("SELECT id, title, mentorId, category FROM courses LIMIT 10", (err, courses) => {
      console.log('\n📖 Courses:');
      if (courses && courses.length > 0) {
        courses.forEach(c => console.log(`  - ID: ${c.id}, Title: ${c.title}, MentorID: ${c.mentorId}, Category: ${c.category}`));
      } else {
        console.log('  ❌ No courses found');
      }

      // Check course students
      db.all("SELECT courseId, studentId FROM course_students LIMIT 10", (err, assignments) => {
        console.log('\n👥 Course-Student Assignments:');
        if (assignments && assignments.length > 0) {
          console.log(`  Found ${assignments.length} assignments`);
          assignments.slice(0, 5).forEach(a => console.log(`  - CourseID: ${a.courseId}, StudentID: ${a.studentId}`));
        } else {
          console.log('  ❌ No assignments found');
        }

        // Check progress
        db.all("SELECT studentId, courseId, contentType, completed FROM progress LIMIT 10", (err, progress) => {
          console.log('\n✅ Progress Records:');
          if (progress && progress.length > 0) {
            console.log(`  Found ${progress.length} progress records`);
            progress.slice(0, 5).forEach(p => console.log(`  - StudentID: ${p.studentId}, CourseID: ${p.courseId}, Type: ${p.contentType}, Completed: ${p.completed}`));
          } else {
            console.log('  ❌ No progress records found');
          }

          // Check chapters
          db.all("SELECT id, courseId, title FROM chapters LIMIT 5", (err, chapters) => {
            console.log('\n📕 Chapters:');
            if (chapters && chapters.length > 0) {
              chapters.forEach(c => console.log(`  - ID: ${c.id}, CourseID: ${c.courseId}, Title: ${c.title}`));
            } else {
              console.log('  ❌ No chapters found');
            }

            db.close();
          });
        });
      });
    });
  });
}
