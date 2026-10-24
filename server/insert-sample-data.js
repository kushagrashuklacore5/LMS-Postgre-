const db = require('config/database-switch');

console.log('=== Creating Sample Attendance and Results Data ===');

const studentId = 3; // Student User
const classroomId = 9; // From our previous data
const currentDate = new Date();

// Create sample attendance data for the last 15 days
const attendanceRecords = [];
for (let i = 0; i < 15; i++) {
  const date = new Date(currentDate);
  date.setDate(date.getDate() - i);
  
  // Create realistic attendance pattern (85% present)
  const status = Math.random() > 0.15 ? 'present' : 'absent';
  
  attendanceRecords.push({
    classroomId,
    studentId,
    date: date.toISOString().split('T')[0], // YYYY-MM-DD format
    status,
    markedBy: 'teacher',
    createdAt: new Date().toISOString()
  });
}

console.log('Creating attendance records...');

// Insert attendance records
let attendanceInserted = 0;
attendanceRecords.forEach(record => {
  db.run(
    `INSERT INTO attendance (classroomId, studentId, date, status, markedBy, createdAt) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [record.classroomId, record.studentId, record.date, record.status, record.markedBy, record.createdAt],
    function(err) {
      if (err) {
        // Ignore duplicate errors
        if (!err.message.includes('UNIQUE constraint failed')) {
          console.error('Error inserting attendance:', err);
        }
      } else {
        attendanceInserted++;
        if (attendanceInserted % 5 === 0) {
          console.log(`✅ Created ${attendanceInserted} attendance records...`);
        }
      }
    }
  );
});

// Create sample results data
setTimeout(() => {
  console.log('\nCreating sample results...');
  
  const results = [
    {
      studentId,
      classroomId,
      term: 'Mid Term Examination 2026',
      subjects: JSON.stringify([
        { name: 'Mathematics', marks: 88, total: 100, grade: 'A+' },
        { name: 'Science', marks: 92, total: 100, grade: 'A+' },
        { name: 'English', marks: 85, total: 100, grade: 'A' },
        { name: 'Social Studies', marks: 78, total: 100, grade: 'B+' },
        { name: 'Computer Science', marks: 95, total: 100, grade: 'A+' }
      ]),
      overallPercentage: 87.6,
      overallStatus: 'Excellent',
      comments: 'Outstanding performance! Keep up the excellent work across all subjects.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      studentId,
      classroomId,
      term: 'Unit Test 1',
      subjects: JSON.stringify([
        { name: 'Mathematics', marks: 82, total: 100, grade: 'A' },
        { name: 'Science', marks: 79, total: 100, grade: 'B+' },
        { name: 'English', marks: 86, total: 100, grade: 'A' }
      ]),
      overallPercentage: 82.3,
      overallStatus: 'Very Good',
      comments: 'Good performance. Focus on Science for improvement.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      studentId,
      classroomId,
      term: 'Monthly Assessment',
      subjects: JSON.stringify([
        { name: 'Mathematics', marks: 90, total: 100, grade: 'A+' },
        { name: 'Science', marks: 85, total: 100, grade: 'A' },
        { name: 'English', marks: 88, total: 100, grade: 'A+' },
        { name: 'Social Studies', marks: 76, total: 100, grade: 'B' }
      ]),
      overallPercentage: 84.8,
      overallStatus: 'Excellent',
      comments: 'Consistent good performance. Maintain the momentum.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  let resultsInserted = 0;
  results.forEach(result => {
    db.run(
      `INSERT INTO results (studentId, classroomId, term, subjects, overallPercentage, overallStatus, comments, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [result.studentId, result.classroomId, result.term, result.subjects, result.overallPercentage, result.overallStatus, result.comments, result.createdAt, result.updatedAt],
      function(err) {
        if (err) {
          console.error('Error inserting result:', err);
        } else {
          resultsInserted++;
          console.log(`✅ Created result: ${result.term} - ${result.overallStatus} (${result.overallPercentage}%)`);
        }
      }
    );
  });

  // Verification
  setTimeout(() => {
    console.log('\n=== Verification ===');
    
    // Check attendance
    db.all('SELECT * FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 10', [studentId], (err, attendance) => {
      if (err) {
        console.error('Error fetching attendance:', err);
      } else {
        const presentCount = attendance.filter(a => a.status === 'present').length;
        const totalCount = attendance.length;
        const attendancePercentage = (presentCount / totalCount) * 100;
        
        console.log(`\n📊 Attendance Summary:`);
        console.log(`Total Records: ${totalCount}`);
        console.log(`Present: ${presentCount}, Absent: ${totalCount - presentCount}`);
        console.log(`Attendance Percentage: ${attendancePercentage.toFixed(1)}%`);
        
        // Show last 5 records
        console.log(`\nLast 5 attendance records:`);
        attendance.slice(0, 5).forEach(record => {
          const status = record.status === 'present' ? '✅ Present' : '❌ Absent';
          console.log(`  ${record.date}: ${status}`);
        });
      }
      
      // Check results
      db.all('SELECT * FROM results WHERE studentId = ? ORDER BY createdAt DESC', [studentId], (err, results) => {
        if (err) {
          console.error('Error fetching results:', err);
        } else {
          console.log(`\n📈 Results Overview:`);
          console.log(`Total Results: ${results.length}`);
          results.forEach(r => {
            console.log(`\n📋 ${r.term}:`);
            console.log(`   Status: ${r.overallStatus}`);
            console.log(`   Percentage: ${r.overallPercentage}%`);
            console.log(`   Comment: ${r.comments}`);
            
            try {
              const subjects = JSON.parse(r.subjects);
              console.log(`   Subjects:`);
              subjects.forEach(s => {
                console.log(`     - ${s.name}: ${s.marks}/${s.total} (${s.grade})`);
              });
            } catch (e) {
              console.log(`   Subjects data: ${r.subjects}`);
            }
          });
        }
        
        console.log('\n✅ Sample data creation completed successfully!');
        console.log('🔄 Please refresh your browser to see the updated dashboard');
        console.log('📊 Your dashboard should now show:');
        console.log('   - Attendance Summary with real attendance data');
        console.log('   - Results Overview with multiple result cards');
        console.log('   - Subject-wise marks and teacher comments');
        process.exit(0);
      });
    });
  }, 2000);
}, 2000);
