const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔍 CHECKING EXISTING PAYMENTS TABLE...');
console.log('=====================================');

db.all('SELECT * FROM payments', (err, payments) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log(`\n💰 Found ${payments.length} payments in database:`);
  payments.forEach((payment, index) => {
    console.log(`   ${index + 1}. ID: ${payment.id}, Student ID: ${payment.studentId}, Amount: ${payment.amount}, Status: ${payment.status}, Type: ${payment.type}, Date: ${payment.createdAt}`);
  });
  
  db.close();
});
