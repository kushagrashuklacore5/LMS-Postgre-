const db = require('config/database-switch');

console.log('Checking stock_request_items table structure...');
db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stock_request_items)', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('stock_request_items table structure:');
    console.log(rows);
  }
  
  console.log('\nChecking for existing requests...');
  db.all('SELECT * FROM stock_request_items LIMIT 5', (err, rows) => {
    if (err) {
      console.error('Error fetching items:', err);
    } else {
      console.log('Existing items:', rows);
    }
    db.close();
  });
});
