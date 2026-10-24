#!/usr/bin/env node
const db = require('config/database-switch');

console.log('\n=== ANNOUNCEMENT SYSTEM DIAGNOSTIC ===\n');

// Check announcements
db.all('SELECT id, title, publishFor, createdByRole FROM announcements ORDER BY id', (err, announcements) => {
  if (err) {
    console.error('Database error:', err);
    process.exit(1);
  }
  
  console.log('📢 ANNOUNCEMENTS:');
  if (announcements.length === 0) {
    console.log('  (No announcements)');
  } else {
    announcements.forEach(row => {
      console.log(`  [${row.id}] "${row.title}" → publishFor: "${row.publishFor}"`);
    });
  }
  
  console.log('\n👥 USERS:');
  db.all('SELECT id, name, role FROM users LIMIT 10', (err2, users) => {
    if (err2) {
      console.error('Error fetching users:', err2);
    } else {
      users.forEach(u => {
        console.log(`  [${u.id}] ${u.name} → role: "${u.role}"`);
      });
    }
    process.exit(0);
  });
});
