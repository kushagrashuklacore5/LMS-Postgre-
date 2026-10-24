const db = require('./config/database-switch');

db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)', (err, columns) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('📋 Users table columns:');
    columns.forEach((col, i) => {
      console.log(`   ${i+1}. ${col.name} - Type: ${col.type}`);
    });
  }
});
