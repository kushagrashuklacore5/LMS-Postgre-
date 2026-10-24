const db = require('config/database-switch');

console.log('=== Removing Sample Results ===');

db.run('DELETE FROM results', function(err) {
  if (err) {
    console.error('Error deleting results:', err);
  } else {
    console.log(`✅ Deleted ${this.changes} rows from results table.`);
  }
  
  // Verify deletion
  db.all('SELECT COUNT(*) as count FROM results', (err, result) => {
    if (err) {
      console.error('Error verifying deletion:', err);
    } else {
      console.log(`✅ Current results count: ${result[0].count}`);
    }
    
    console.log('✅ Sample results removed successfully!');
    console.log('🔄 Please refresh your browser to see the updated results page');
    process.exit(0);
  });
});
