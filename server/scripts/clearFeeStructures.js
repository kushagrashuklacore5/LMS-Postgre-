const db = require('../config/database-switch');

db.run('DELETE FROM feeStructures', function(err) {
  if (err) {
    console.error('❌ Error clearing fee structures:', err);
    process.exit(1);
  }
  console.log('✅ Cleared all fee structures from database');
  db.close(() => {
    process.exit(0);
  });
});
