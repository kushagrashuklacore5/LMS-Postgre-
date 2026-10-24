const db = require('./config/database-switch');

db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='universities'", [], (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else if (row) {
    console.log('Universities table CREATE SQL:');
    console.log(row.sql);
  }
});
