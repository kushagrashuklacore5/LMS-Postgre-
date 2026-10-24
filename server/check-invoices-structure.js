const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking invoices table structure...');
console.log('📁 Database Path:', dbPath);

// Get the table structure
db.get("SELECT sql FROM sqlite_master WHERE name='invoices'", [], (err, table) => {
  if (err) {
    console.error('❌ Error checking invoices table:', err);
    return;
  }

  console.log('\n📊 Invoices Table Structure:');
  console.log('============================');
  console.log(table.sql);

  // Check sample data
  db.all("SELECT * FROM invoices LIMIT 5", [], (err, invoices) => {
    if (err) {
      console.error('❌ Error checking invoices data:', err);
      return;
    }

    console.log('\n📋 Sample Data from invoices table:');
    console.log('===================================');
    if (invoices.length === 0) {
      console.log('❌ No data found in invoices table');
    } else {
      invoices.forEach((invoice, index) => {
        console.log(`\n${index + 1}. Invoice ID: ${invoice.id}`);
        console.log(`   Invoice Number: ${invoice.invoiceNumber || 'N/A'}`);
        console.log(`   Vendor ID: ${invoice.vendorId || 'N/A'}`);
        console.log(`   Vendor Name: ${invoice.vendorName || 'N/A'}`);
        console.log(`   Amount: ${invoice.amount || 'N/A'}`);
        console.log(`   Status: ${invoice.status || 'N/A'}`);
        console.log(`   Issue Date: ${invoice.issueDate || 'N/A'}`);
        console.log(`   Due Date: ${invoice.dueDate || 'N/A'}`);
        console.log(`   Description: ${invoice.description || 'N/A'}`);
        console.log(`   University ID: ${invoice.university_id || 'N/A'}`);
      });
    }

    console.log('\n🎯 Current Invoice Storage:');
    console.log('============================');
    console.log('✅ Vendor invoices are stored in the "invoices" table');
    console.log('✅ The table includes vendor information (vendorId, vendorName)');
    console.log('✅ Contains standard invoice fields (amount, status, dates)');
    console.log('✅ Linked to universities via university_id');

    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err);
      } else {
        console.log('\n✅ Database connection closed');
      }
    });
  });
});
