const db = require('config/database-switch');

console.log('=== Creating Sample Attendance and Results Data ===');

const studentId = 3; // Student User
const currentDate = new Date();

// Create sample attendance data for the last 10 days
const attendanceRecords = [];
for (let i = 0; i < 10; i++) {
  const date = new Date(currentDate);
  date.setDate(date.getDate() - i);
  
  const status = Math.random() > 0.2 ? 'present' : 'absent'; // 80% attendance
  
  attendanceRecords.push({
    studentId,
    date: date.toISOString().split('T')[0], // YYYY-MM-DD format
    status,
    checkInTime: status === 'present' ? '09:00' : null,
    checkOutTime: status === 'present' ? '15:30' : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

console.log('Creating attendance records...');

// Insert attendance records
attendanceRecords.forEach(record => {
  db.run(
    `INSERT INTO attendance (studentId, date, status, checkInTime, checkOutTime, createdAt, updatedAt) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [record.studentId, record.date, record.status, record.checkInTime, record.checkOutTime, record.createdAt, record.updatedAt],
    function(err) {
      if (err) {
        console.error('Error inserting attendance:', err);
      } else {
        console.log(`✅ Attendance record for ${record.date}: ${record.status}`);
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
      courseId: 1,
      assessmentId: 1,
      subject: 'Mathematics',
      examType: 'Mid Term',
      marksObtained: 85,
      totalMarks: 100,
      percentage: 85,
      grade: 'A',
      remarks: 'Good performance',
      examDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      studentId,
      courseId: 2,
      assessmentId: 2,
      subject: 'Science',
      examType: 'Quiz',
      marksObtained: 92,
      totalMarks: 100,
      percentage: 92,
      grade: 'A+',
      remarks: 'Excellent work',
      examDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  results.forEach(result => {
    db.run(
      `INSERT INTO results (studentId, courseId, assessmentId, subject, examType, marksObtained, totalMarks, percentage, grade, remarks, examDate, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [result.studentId, result.courseId, result.assessmentId, result.subject, result.examType, result.marksObtained, result.totalMarks, result.percentage, result.grade, result.remarks, result.examDate, result.createdAt, result.updatedAt],
      function(err) {
        if (err) {
          console.error('Error inserting result:', err);
        } else {
          console.log(`✅ Result record for ${result.subject}: ${result.grade} (${result.percentage}%)`);
        }
      }
    );
  });

  setTimeout(() => {
    console.log('\n=== Verification ===');
    
    // Check attendance
    db.all('SELECT * FROM attendance WHERE studentId = ?', [studentId], (err, attendance) => {
      if (err) {
        console.error('Error fetching attendance:', err);
      } else {
        const presentCount = attendance.filter(a => a.status === 'present').length;
        const totalCount = attendance.length;
        const attendancePercentage = (presentCount / totalCount) * 100;
        
        console.log(`Attendance Records: ${totalCount}`);
        console.log(`Present: ${presentCount}, Absent: ${totalCount - presentCount}`);
        console.log(`Attendance Percentage: ${attendancePercentage.toFixed(1)}%`);
      }
      
      // Check results
      db.all('SELECT * FROM results WHERE studentId = ?', [studentId], (err, results) => {
        if (err) {
          console.error('Error fetching results:', err);
        } else {
          console.log(`\nResults Records: ${results.length}`);
          results.forEach(r => {
            console.log(`${r.subject}: ${r.grade} (${r.percentage}%)`);
          });
        }
        
        console.log('\n✅ Sample data creation completed!');
        process.exit(0);
      });
    });
  }, 1000);
}, 1000);
