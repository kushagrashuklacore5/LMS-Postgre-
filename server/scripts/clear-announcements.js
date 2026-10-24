#!/usr/bin/env node
/**
 * Script to clear all existing announcements from the database
 * Run: node server/scripts/clear-announcements.js
 */

const db = require('../config/database-switch');

console.log('\n🗑️  Clearing all announcements from database...\n');

db.run('DELETE FROM announcements', (err) => {
  if (err) {
    console.error('❌ Error clearing announcements:', err);
    process.exit(1);
  }

  console.log('✅ All announcements have been deleted');
  
  // Verify
  db.get('SELECT COUNT(*) as count FROM announcements', (err, result) => {
    if (err) {
      console.error('Error verifying:', err);
    } else {
      console.log(`📊 Current announcement count: ${result.count}`);
    }
    process.exit(0);
  });
});
