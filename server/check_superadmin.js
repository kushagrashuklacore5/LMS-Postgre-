const db = require('./config/database-switch');

db.all("SELECT * FROM superadmins", [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Superadmins in database:');
    rows.forEach(row => {
      console.log(`- Email: ${row.email}, ID: ${row.id}, Status: ${row.status}`);
    });
  }
});
