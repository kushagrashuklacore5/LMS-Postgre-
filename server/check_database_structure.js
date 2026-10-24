const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔍 CHECKING DATABASE STRUCTURE...');
console.log('===============================');

// Check all tables
db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", (err, tables) => {
  if (err) {
    console.error('Error checking tables:', err);
    return;
  }
  
  console.log(`\n📋 Found ${tables.length} tables:`);
  tables.forEach((table, index) => {
    console.log(`   ${index + 1}. ${table.name}`);
  });
  
  // Check for users table
  db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name='users'", (err, userTables) => {
    if (err) {
      console.error('Error checking users table:', err);
      return;
    }
    
    if (userTables.length > 0) {
      console.log('\n✅ Users table exists');
      
      // Check users table structure
      db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)', (err, columns) => {
        if (err) {
          console.error('Error getting users table info:', err);
          return;
        }
        
        console.log('\n📋 Users table structure:');
        columns.forEach(col => {
          console.log(`   - ${col.name}: ${col.type}`);
        });
        
        // Check for students
        db.all('SELECT COUNT(*) as count, role FROM users GROUP BY role', (err, roleCounts) => {
          if (err) {
            console.error('Error counting roles:', err);
            return;
          }
          
          console.log('\n👥 Users by role:');
          roleCounts.forEach(role => {
            console.log(`   - ${role.role}: ${role.count} users`);
          });
          
          // Check for payments table
          checkPaymentsTable();
        });
      });
    } else {
      console.log('\n❌ Users table does not exist');
      checkPaymentsTable();
    }
  });
});

function checkPaymentsTable() {
  db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name='payments'", (err, paymentTables) => {
    if (err) {
      console.error('Error checking payments table:', err);
      return;
    }
    
    if (paymentTables.length > 0) {
      console.log('\n✅ Payments table exists');
      
      // Check payments table structure
      db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'payments)', (err, columns) => {
        if (err) {
          console.error('Error getting payments table info:', err);
          return;
        }
        
        console.log('\n📋 Payments table structure:');
        columns.forEach(col => {
          console.log(`   - ${col.name}: ${col.type}`);
        });
        
        // Check for payment records
        db.all('SELECT COUNT(*) as count FROM payments', (err, result) => {
          if (err) {
            console.error('Error counting payments:', err);
            return;
          }
          
          console.log(`\n💰 Found ${result[0]?.count || 0} payment records`);
          
          if (result[0]?.count > 0) {
            db.all('SELECT * FROM payments LIMIT 3', (err, payments) => {
              if (err) {
                console.error('Error fetching payments:', err);
                return;
              }
              
              console.log('\n💰 Sample payments:');
              payments.forEach((payment, index) => {
                console.log(`   ${index + 1}. ID: ${payment.id}, Amount: ${payment.amount}, Status: ${payment.status}, Student: ${payment.studentId}`);
              });
              
              db.close();
            });
          } else {
            console.log('\nℹ️ No payment records found');
            db.close();
          }
        });
      });
    } else {
      console.log('\n❌ Payments table does not exist');
      db.close();
    }
  });
}
