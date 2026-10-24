const db = require('./config/database-switch');

db.all('SELECT id, email, role, name FROM users LIMIT 10', (err, rows) => {
  if (err) console.error(err);
  console.log("Users in database:");
  if (rows && rows.length > 0) {
    rows.forEach(r => console.log(`  - ${r.id}: ${r.email} (${r.role}) - ${r.name}`));
  } else {
    console.log("  No users found");
  }
  process.exit(0);
});
