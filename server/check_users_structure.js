const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'lms-database.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to database successfully');
});

console.log('\n=== Checking users table structure ===');
db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)', (err, columns) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Users table columns:');
    columns.forEach(col => {
      console.log(`- ${col.name} (${col.type})`);
    });
  }
  
  console.log('\n=== Checking vendors table structure ===');
  db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vendors)', (err, vendorColumns) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Vendors table columns:');
      vendorColumns.forEach(col => {
        console.log(`- ${col.name} (${col.type})`);
      });
    }
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  });
});
