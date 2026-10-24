const db = require('config/database-switch');

console.log('Checking database tables...');

db.all('SELECT name FROM sqlite_master WHERE type="table"', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Tables in database:');
    rows.forEach(row => {
      console.log('- ' + row.name);
    });
    
    // Check if vendors table exists
    const hasVendors = rows.some(row => row.name === 'vendors');
    console.log('\nVendors table exists:', hasVendors);
    
    // Check inventory table structure
    db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory)', (err, result) => {
      if (err) {
        console.error('Error getting inventory table info:', err);
      } else {
        console.log('\nInventory table structure:');
        result.forEach(col => {
          console.log(`- ${col.name}: ${col.type}`);
        });
      }
    });
  }
});
