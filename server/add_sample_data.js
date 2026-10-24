const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('💰 ADDING SAMPLE PAYMENT DATA...');
console.log('==================================');

// First, let's create a users table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    university_id INTEGER DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error creating users table:', err);
  } else {
    console.log('✅ Users table ready');
    
    // Add sample students
    const sampleStudents = [
      { name: 'John Doe', email: 'john@demo.com', role: 'student', university_id: 1 },
      { name: 'Jane Smith', email: 'jane@demo.com', role: 'student', university_id: 1 },
      { name: 'Mike Johnson', email: 'mike@demo.com', role: 'student', university_id: 1 },
      { name: 'Sarah Wilson', email: 'sarah@demo.com', role: 'student', university_id: 1 },
      { name: 'Tom Brown', email: 'tom@demo.com', role: 'student', university_id: 1 }
    ];
    
    let studentCount = 0;
    
    sampleStudents.forEach((student, index) => {
      db.run(`
        INSERT OR IGNORE INTO users (name, email, password, role, university_id) 
        VALUES (?, ?, ?, ?, ?)
      `, [student.name, student.email, 'demo123', student.role, student.university_id], (err) => {
        if (!err) {
          studentCount++;
          console.log(`✅ Added student: ${student.name}`);
        }
      });
    });
    
    // Add sample payments
    setTimeout(() => {
      console.log('\n💰 Adding sample payments...');
      
      const samplePayments = [
        { studentId: 1, amount: 5000, type: 'fees', status: 'success', description: 'Tuition fees - Computer Science' },
        { studentId: 2, amount: 4500, type: 'fees', status: 'success', description: 'Tuition fees - Mathematics' },
        { studentId: 3, amount: 5500, type: 'fees', status: 'success', description: 'Tuition fees - Engineering' },
        { studentId: 4, amount: 4000, type: 'fees', status: 'success', description: 'Tuition fees - Arts' },
        { studentId: 5, amount: 6000, type: 'fees', status: 'success', description: 'Tuition fees - Medicine' },
        { studentId: 1, amount: 2000, type: 'library', status: 'success', description: 'Library fees' },
        { studentId: 2, amount: 1500, type: 'lab', status: 'success', description: 'Lab fees' },
        { studentId: 3, amount: 3000, type: 'hostel', status: 'pending', description: 'Hostel fees' }
      ];
      
      let paymentCount = 0;
      
      samplePayments.forEach((payment, index) => {
        db.run(`
          INSERT INTO payments (studentId, amount, type, status, description) 
          VALUES (?, ?, ?, ?, ?)
        `, [payment.studentId, payment.amount, payment.type, payment.status, payment.description], (err) => {
          if (!err) {
            paymentCount++;
            console.log(`✅ Added payment: ₹${payment.amount} for Student ID ${payment.studentId} (${payment.status})`);
          }
        });
      });
      
      // Verify the data after all inserts
      setTimeout(() => {
        console.log('\n🔍 Verifying sample data...');
        
        db.all('SELECT COUNT(*) as totalStudents FROM users WHERE role = "student"', (err, studentResult) => {
          if (!err) {
            const studentCount = studentResult[0]?.total || 0;
            console.log(`👥 Total students: ${studentCount}`);
          }
        });
        
        db.all('SELECT COUNT(*) as totalPayments FROM payments', (err, paymentResult) => {
          if (!err) {
            const paymentCount = paymentResult[0]?.total || 0;
            console.log(`💰 Total payments: ${paymentCount}`);
          }
        });
        
        db.all('SELECT SUM(amount) as totalFees FROM payments WHERE status = "success"', (err, feesResult) => {
          if (!err) {
            const totalFees = feesResult[0]?.totalFees || 0;
            console.log(`💰 Total fees collected: ₹${totalFees.toLocaleString('en-IN')}`);
            console.log('\n🎉 Sample data added successfully!');
            console.log('📊 Dashboard should now show:');
            console.log(`   • Total Fees Collected: ₹${totalFees.toLocaleString('en-IN')}`);
            console.log(`   • Total Students: ${studentCount}`);
            console.log('🔄 Refresh the dashboard to see the changes!');
          }
        });
        
        db.close();
      }, 1000);
    }, 1000);
  }
});
