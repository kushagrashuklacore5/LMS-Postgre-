const db = require('./config/database-switch');

db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'universities)", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('universities table schema:');
    rows.forEach(row => {
      console.log(`- ${row.name}: ${row.type}`);
    });
    
    // Check if updatedAt column exists
    const hasUpdatedAtColumn = rows.some(row => row.name === 'updatedAt');
    if (!hasUpdatedAtColumn) {
      console.log('❌ Missing "updatedAt" column, adding it...');
      
      db.run(`
        ALTER TABLE universities ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      `, (err) => {
        if (err) {
          console.error('Error adding updatedAt column:', err);
        } else {
          console.log('✅ Added updatedAt column successfully');
        }
      });
    } else {
      console.log('✅ updatedAt column exists');
    }
  }
});
