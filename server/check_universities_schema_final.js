const db = require('./config/database-switch');

db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='universities'", [], (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else if (row) {
    console.log('Universities table CREATE SQL:');
    console.log(row.sql);
    
    // Check actual column names by querying the table
    db.all("SELECT * FROM universities LIMIT 1", [], (err, rows) => {
      if (err) {
        console.error('Error:', err);
      } else if (rows.length > 0) {
        console.log('\nActual column names in universities table:');
        Object.keys(rows[0]).forEach(col => {
          console.log(`- ${col}`);
        });
      }
    });
  }
});
