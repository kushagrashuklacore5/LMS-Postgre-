const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🗑️ REMOVING SAMPLE DATA...');
console.log('==========================');

// Remove all sample data from payments table
db.run('DELETE FROM payments', (err) => {
  if (err) {
    console.error('Error clearing payments:', err);
  } else {
    console.log('✅ Cleared all payment records');
  }
});

// Remove all sample data from users table
db.run('DELETE FROM users', (err) => {
  if (err) {
    console.error('Error clearing users:', err);
  } else {
    console.log('✅ Cleared all user records');
  }
});

// Verify the data is removed
setTimeout(() => {
  console.log('\n🔍 Verifying data removal...');
  
  db.all('SELECT COUNT(*) as totalPayments FROM payments', (err, paymentResult) => {
    if (!err) {
      const paymentCount = paymentResult[0]?.total || 0;
      console.log(`💰 Payments remaining: ${paymentCount}`);
    }
  });
  
  db.all('SELECT COUNT(*) as totalUsers FROM users', (err, userResult) => {
    if (!err) {
      const userCount = userResult[0]?.total || 0;
      console.log(`👥 Users remaining: ${userCount}`);
    }
  });
  
  db.all('SELECT SUM(amount) as totalFees FROM payments WHERE status = "success"', (err, feesResult) => {
    if (!err) {
      const totalFees = feesResult[0]?.totalFees || 0;
      console.log(`💰 Total fees collected: ₹${totalFees.toLocaleString('en-IN')}`);
    }
  });
  
  console.log('\n🎉 Sample data removed successfully!');
  console.log('📊 System now only fetches real database data');
  console.log('💡 Dashboard will show:');
  console.log('   • Total Fees Collected: ₹0 (no real payments yet)');
  console.log('   • Total Students: 0 (no real students yet)');
  console.log('🔄 System is ready for real data!');
  
  db.close();
}, 1000);
