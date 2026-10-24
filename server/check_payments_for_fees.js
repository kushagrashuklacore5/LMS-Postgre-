const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔍 CHECKING PAYMENTS FOR TOTAL FEES...');
console.log('====================================');

db.all('SELECT * FROM payments', (err, payments) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log(`💰 Found ${payments.length} payments in database:`);
  if (payments.length > 0) {
    payments.forEach((payment, index) => {
      console.log(`   ${index + 1}. ID: ${payment.id}, Amount: ${payment.amount}, Status: ${payment.status}, Student: ${payment.studentId}, Date: ${payment.createdAt}`);
    });
    
    const totalFees = payments.filter(p => p.status === 'success').reduce((sum, p) => sum + (p.amount || 0), 0);
    console.log(`\n💰 Total fees collected: ₹${totalFees.toLocaleString('en-IN')}`);
    console.log('📊 This amount should appear in the Total Fees Collected card');
  } else {
    console.log('ℹ️ No payments found in database');
    console.log('📊 Total Fees Collected will show ₹0');
  }
  
  db.close();
});
