const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔍 CHECKING PAYMENTS TABLE...');
console.log('============================');

// Check if payments table exists
db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name='payments'", (err, rows) => {
  if (err) {
    console.error('Error checking table:', err);
    return;
  }
  
  if (rows.length === 0) {
    console.log('❌ Payments table does not exist');
    
    // Check for payment_transactions table instead
    db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name='payment_transactions'", (err, rows) => {
      if (err) {
        console.error('Error checking payment_transactions table:', err);
        return;
      }
      
      if (rows.length === 0) {
        console.log('❌ payment_transactions table does not exist either');
      } else {
        console.log('✅ payment_transactions table exists');
        
        // Check table structure
        db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payment_transactions)', (err, columns) => {
          if (err) {
            console.error('Error getting table info:', err);
            return;
          }
          
          console.log('\n📋 payment_transactions table structure:');
          columns.forEach(col => {
            console.log(`   - ${col.name}: ${col.type}`);
          });
          
          // Check for any existing transactions
          db.all('SELECT * FROM payment_transactions LIMIT 10', (err, transactions) => {
            if (err) {
              console.error('Error fetching transactions:', err);
              return;
            }
            
            console.log(`\n📊 Found ${transactions.length} payment transactions in database`);
            
            if (transactions.length > 0) {
              console.log('\n💰 Recent transactions:');
              transactions.forEach((transaction, index) => {
                console.log(`   ${index + 1}. ID: ${transaction.id}, Amount: ${transaction.amount || 'N/A'}, Type: ${transaction.type || 'N/A'}, Date: ${transaction.createdAt || 'N/A'}`);
              });
            } else {
              console.log('ℹ️ No payment transactions found in database');
            }
            
            db.close();
          });
        });
      }
    });
  } else {
    console.log('✅ Payments table exists');
    
    // Check table structure
    db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payments)', (err, columns) => {
      if (err) {
        console.error('Error getting table info:', err);
        return;
      }
      
      console.log('\n📋 Payments table structure:');
      columns.forEach(col => {
        console.log(`   - ${col.name}: ${col.type}`);
      });
      
      // Check for any existing payments
      db.all('SELECT * FROM payments LIMIT 10', (err, payments) => {
        if (err) {
          console.error('Error fetching payments:', err);
          return;
        }
        
        console.log(`\n📊 Found ${payments.length} payments in database`);
        
        if (payments.length > 0) {
          console.log('\n💰 Recent payments:');
          payments.forEach((payment, index) => {
            console.log(`   ${index + 1}. ID: ${payment.id}, Amount: ${payment.amount || 'N/A'}, Student: ${payment.studentId || 'N/A'}, Date: ${payment.createdAt || 'N/A'}`);
          });
        } else {
          console.log('ℹ️ No payments found in database');
        }
        
        db.close();
      });
    });
  }
});
