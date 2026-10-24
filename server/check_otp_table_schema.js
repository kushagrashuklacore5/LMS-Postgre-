const db = require('./config/database-switch');

db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'otp_reset)", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('otp_reset table schema:');
    if (rows.length === 0) {
      console.log('  (Table does not exist)');
    } else {
      rows.forEach(row => {
        console.log(`- ${row.name}: ${row.type}`);
      });
    }
    
    // Check if verified column exists
    const hasVerifiedColumn = rows.some(row => row.name === 'verified');
    if (!hasVerifiedColumn) {
      console.log('❌ Missing "verified" column, adding it...');
      
      db.run(`
        ALTER TABLE otp_reset ADD COLUMN verified INTEGER DEFAULT 0
      `, (err) => {
        if (err) {
          console.error('Error adding verified column:', err);
        } else {
          console.log('✅ Added verified column successfully');
        }
      });
    } else {
      console.log('✅ verified column exists');
    }
  }
});
