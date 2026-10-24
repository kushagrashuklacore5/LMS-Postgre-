#!/usr/bin/env node
const db = require('../config/database-switch');

console.log('\n=== ANNOUNCEMENTS TABLE INSPECTION ===\n');

db.all('SELECT * FROM announcements', (err, rows) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  console.log(`Total announcements: ${rows.length}\n`);
  
  rows.forEach((ann, idx) => {
    console.log(`[${idx + 1}] ID: ${ann.id}`);
    console.log(`    Title: ${ann.title}`);
    console.log(`    Content: ${ann.content}`);
    console.log(`    PublishFor: ${ann.publishFor}`);
    console.log(`    CreatedByRole: ${ann.createdByRole}`);
    console.log(`    ReadBy: ${ann.readBy}`);
    console.log('');
  });
  
  process.exit(0);
});
