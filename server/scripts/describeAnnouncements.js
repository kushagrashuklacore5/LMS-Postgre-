const db = require('../config/database-switch');

console.log('\nSELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'announcements)');

db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'announcements)", (err, rows) => {
  if (err) { console.error(err); process.exit(1); }
  rows.forEach(r => console.log(r));
  process.exit(0);
});
