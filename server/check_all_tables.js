const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔍 CHECKING ALL TABLES...');
console.log('========================');

db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", (err, tables) => {
  if (err) {
    console.error('Error checking tables:', err);
    return;
  }
  
  console.log(`\n📋 Found ${tables.length} tables in database:`);
  tables.forEach((table, index) => {
    console.log(`   ${index + 1}. ${table.name}`);
  });
  
  // Check for any table that might contain payment/fee data
  const paymentRelatedTables = tables.filter(table => 
    table.name.toLowerCase().includes('payment') || 
    table.name.toLowerCase().includes('fee') ||
    table.name.toLowerCase().includes('transaction') ||
    table.name.toLowerCase().includes('student')
  );
  
  if (paymentRelatedTables.length > 0) {
    console.log('\n💳 Payment/fee related tables found:');
    paymentRelatedTables.forEach(table => {
      console.log(`   - ${table.name}`);
    });
    
    // Check the first payment-related table for data
    const tableToCheck = paymentRelatedTables[0].name;
    console.log(`\n🔍 Checking ${tableToCheck} table for data...`);
    
    db.all(`SELECT * FROM ${tableToCheck} LIMIT 5`, (err, rows) => {
      if (err) {
        console.error(`Error fetching from ${tableToCheck}:`, err);
        return;
      }
      
      console.log(`\n📊 Found ${rows.length} records in ${tableToCheck}:`);
      
      if (rows.length > 0) {
        console.log('\nSample data:');
        rows.forEach((row, index) => {
          console.log(`   ${index + 1}. ${JSON.stringify(row, null, 2).substring(0, 200)}...`);
        });
      } else {
        console.log('ℹ️ No records found');
      }
      
      db.close();
    });
  } else {
    console.log('\n❌ No payment/fee related tables found');
    db.close();
  }
});
