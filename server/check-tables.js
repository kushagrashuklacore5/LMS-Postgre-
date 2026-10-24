const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking all tables in database...');
console.log('📁 Database Path:', dbPath);

db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY name", [], (err, tables) => {
  if (err) {
    console.error('❌ Error checking tables:', err);
    return;
  }

  console.log('\n📊 All Tables in Database:');
  console.log('==========================');
  tables.forEach((table, index) => {
    console.log(`${index + 1}. ${table.name}`);
  });

  // Check specifically for invoice-related tables
  const invoiceTables = tables.filter(table => 
    table.name.toLowerCase().includes('invoice')
  );
  
  console.log('\n📋 Invoice-Related Tables:');
  console.log('==========================');
  if (invoiceTables.length > 0) {
    invoiceTables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.name}`);
    });
  } else {
    console.log('❌ No invoice tables found');
  }

  // Check vendor-related tables
  const vendorTables = tables.filter(table => 
    table.name.toLowerCase().includes('vendor')
  );
  
  console.log('\n📋 Vendor-Related Tables:');
  console.log('==========================');
  if (vendorTables.length > 0) {
    vendorTables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.name}`);
    });
  } else {
    console.log('❌ No vendor tables found');
  }

  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err);
    } else {
      console.log('\n✅ Database connection closed');
    }
  });
});
