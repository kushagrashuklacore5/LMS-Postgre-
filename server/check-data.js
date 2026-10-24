const db = require('config/database-switch');

console.log('Checking announcements data in database...\n');

db.all("SELECT id, title, publishFor, createdByRole FROM announcements;", (err, rows) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log('Announcements:');
  if (rows && rows.length > 0) {
    rows.forEach((r, i) => {
      console.log(`${i+1}. "${r.title}" (created by: ${r.createdByRole})`);
      console.log(`   publishFor: ${r.publishFor === null ? 'NULL' : '"' + r.publishFor + '"'} (type: ${typeof r.publishFor})`);
    });
  } else {
    console.log('  (no announcements found)');
  }
  
  process.exit(0);
});
