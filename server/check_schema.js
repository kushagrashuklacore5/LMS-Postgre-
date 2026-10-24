const db = require('./config/database-switch');

db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'universities)", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Universities table schema:');
    rows.forEach(row => {
      console.log(`- ${row.name}: ${row.type}`);
    });
  }
  
  db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'subscriptions)", [], (err, rows) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('\nSubscriptions table schema:');
      rows.forEach(row => {
        console.log(`- ${row.name}: ${row.type}`);
      });
    }
    process.exit(0);
  });
});
