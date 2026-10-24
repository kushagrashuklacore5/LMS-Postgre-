const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔧 SETTING UP DATABASE STRUCTURE...');
console.log('===============================');

// Create users table
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
    return;
  }
  
  console.log('✅ Users table created');
  
  // Insert sample students
  const sampleStudents = [
    { name: 'John Doe', email: 'john@demo.com', role: 'student', university_id: 1 },
    { name: 'Jane Smith', email: 'jane@demo.com', role: 'student', university_id: 1 },
    { name: 'Mike Johnson', email: 'mike@demo.com', role: 'student', university_id: 1 },
    { name: 'Sarah Wilson', email: 'sarah@demo.com', role: 'student', university_id: 1 },
    { name: 'Tom Brown', email: 'tom@demo.com', role: 'student', university_id: 1 }
  ];
  
  const stmt = db.prepare('INSERT INTO users (name, email, password, role, university_id) VALUES (?, ?, ?, ?, ?)');
  
  sampleStudents.forEach((student, index) => {
    stmt.run([student.name, student.email, 'demo123', student.role, student.university_id], (err) => {
      if (err) {
        console.error(`Error inserting student ${index + 1}:`, err);
      } else {
        console.log(`✅ Added student: ${student.name}`);
      }
    });
  });
  
  stmt.finalize((err) => {
    if (err) {
      console.error('Error finalizing statement:', err);
    }
    
    // Insert sample accountant
    db.run(`
      INSERT INTO users (name, email, password, role, university_id) 
      VALUES (?, ?, ?, ?, ?)
    `, ['Accountant User', 'accountant@demo.com', 'accountant123', 'accountant', 1], (err) => {
      if (err) {
        console.error('Error inserting accountant:', err);
      } else {
        console.log('✅ Added accountant user');
      }
      
      // Insert sample payments
      insertSamplePayments();
    });
  });
});

function insertSamplePayments() {
  console.log('\n💰 Adding sample payments...');
  
  const samplePayments = [
    { studentId: 1, amount: 5000, type: 'fees', status: 'success', description: 'Tuition fees - Computer Science' },
    { studentId: 2, amount: 4500, type: 'fees', status: 'success', description: 'Tuition fees - Mathematics' },
    { studentId: 3, amount: 5500, type: 'fees', status: 'success', description: 'Tuition fees - Engineering' },
    { studentId: 4, amount: 4000, type: 'fees', status: 'pending', description: 'Tuition fees - Arts' },
    { studentId: 5, amount: 6000, type: 'fees', status: 'success', description: 'Tuition fees - Medicine' }
  ];
  
  const stmt = db.prepare('INSERT INTO payments (studentId, amount, type, status, description) VALUES (?, ?, ?, ?, ?)');
  
  samplePayments.forEach((payment, index) => {
    stmt.run([payment.studentId, payment.amount, payment.type, payment.status, payment.description], (err) => {
      if (err) {
        console.error(`Error inserting payment ${index + 1}:`, err);
      } else {
        console.log(`✅ Added payment: ₹${payment.amount} for Student ID ${payment.studentId}`);
      }
    });
  });
  
  stmt.finalize((err) => {
    if (err) {
      console.error('Error finalizing payment statement:', err);
    }
    
    // Verify the data
    verifyData();
  });
}

function verifyData() {
  console.log('\n🔍 Verifying data...');
  
  // Count users by role
  db.all('SELECT role, COUNT(*) as count FROM users GROUP BY role', (err, roleCounts) => {
    if (err) {
      console.error('Error counting users by role:', err);
      return;
    }
    
    console.log('\n👥 Users by role:');
    roleCounts.forEach(role => {
      console.log(`   - ${role.role}: ${role.count} users`);
    });
    
    // Count payments by status
    db.all('SELECT status, COUNT(*) as count FROM payments GROUP BY status', (err, statusCounts) => {
      if (err) {
        console.error('Error counting payments by status:', err);
        return;
      }
      
      console.log('\n💰 Payments by status:');
      statusCounts.forEach(status => {
        console.log(`   - ${status.status}: ${status.count} payments`);
      });
      
      // Calculate total fees collected
      db.all('SELECT SUM(amount) as total FROM payments WHERE status = "success"', (err, result) => {
        if (err) {
          console.error('Error calculating total fees:', err);
          return;
        }
        
        const totalFees = result[0]?.total || 0;
        console.log(`\n💰 Total fees collected: ₹${totalFees.toLocaleString('en-IN')}`);
        
        console.log('\n🎉 Database setup complete!');
        console.log('📊 Ready for testing fees collection page');
        
        db.close();
      });
    });
  });
}
