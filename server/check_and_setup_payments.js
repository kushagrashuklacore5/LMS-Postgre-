const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔍 CHECKING FOR EXISTING PAYMENTS...');
console.log('==================================');

// Check if payments table exists and has data
db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name='payments'", (err, tables) => {
  if (err) {
    console.error('Error checking payments table:', err);
    return;
  }
  
  if (tables.length === 0) {
    console.log('❌ Payments table does not exist');
    console.log('🔧 Creating payments table...');
    
    // Create payments table
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId INTEGER,
        amount REAL,
        type TEXT,
        status TEXT,
        transactionId TEXT,
        razorpay_payment_id TEXT,
        razorpay_order_id TEXT,
        razorpay_signature TEXT,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating payments table:', err);
        return;
      }
      
      console.log('✅ Payments table created');
      checkForExistingUsers();
    });
  } else {
    console.log('✅ Payments table exists');
    checkExistingPayments();
  }
});

function checkExistingPayments() {
  db.all('SELECT COUNT(*) as count FROM payments', (err, result) => {
    if (err) {
      console.error('Error counting payments:', err);
      return;
    }
    
    const paymentCount = result[0]?.count || 0;
    console.log(`📊 Found ${paymentCount} payments in database`);
    
    if (paymentCount > 0) {
      console.log('\n💰 Recent payments:');
      db.all('SELECT * FROM payments ORDER BY createdAt DESC LIMIT 5', (err, payments) => {
        if (err) {
          console.error('Error fetching payments:', err);
          return;
        }
        
        payments.forEach((payment, index) => {
          console.log(`   ${index + 1}. ID: ${payment.id}, Amount: ${payment.amount}, Status: ${payment.status}, Date: ${payment.createdAt}`);
        });
        
        db.close();
      });
    } else {
      console.log('ℹ️ No payments found');
      checkForExistingUsers();
    }
  });
}

function checkForExistingUsers() {
  db.all('SELECT id, name, role FROM users WHERE role = "student" LIMIT 5', (err, students) => {
    if (err) {
      console.error('Error checking students:', err);
      return;
    }
    
    console.log(`\n👥 Found ${students.length} students in database`);
    
    if (students.length > 0) {
      console.log('\n📝 Sample students:');
      students.forEach((student, index) => {
        console.log(`   ${index + 1}. ID: ${student.id}, Name: ${student.name}`);
      });
      
      console.log('\n💡 You can create sample payments using these student IDs');
    } else {
      console.log('ℹ️ No students found in database');
    }
    
    db.close();
  });
}
