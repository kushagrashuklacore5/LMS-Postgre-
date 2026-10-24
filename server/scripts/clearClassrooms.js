#!/usr/bin/env node

const db = require('../config/database-switch');

console.log('🧹 Clearing all classrooms...\n');

db.run('DELETE FROM classrooms', function(err) {
  if (err) {
    console.error('❌ Error clearing classrooms:', err);
    process.exit(1);
  }
  
  console.log('✅ All classrooms have been deleted');
  
  // Check how many were deleted
  db.get('SELECT COUNT(*) as count FROM classrooms', (err, row) => {
    if (!err && row) {
      console.log(`✅ Current classroom count: ${row.count}`);
    }
    
    console.log('\n✨ Classrooms cleanup complete!');
    console.log('Admin can now create new classrooms via the Dashboard.\n');
    process.exit(0);
  });
});
