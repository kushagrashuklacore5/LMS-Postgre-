#!/usr/bin/env node
/**
 * Inspection script: Verify database announcements structure
 * Run: node server/scripts/inspectAnnouncements.js
 */

const db = require('../config/database-switch');

console.log('\n' + '='.repeat(70));
console.log('📊 ANNOUNCEMENTS TABLE INSPECTION');
console.log('='.repeat(70) + '\n');

// Check table schema
db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'announcements)', (err, schema) => {
  if (err) {
    console.error('Error checking schema:', err);
    process.exit(1);
  }

  console.log('📋 Table Schema:');
  schema.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  console.log('');

  // Count announcements
  db.get('SELECT COUNT(*) as count FROM announcements', (err, result) => {
    if (err) {
      console.error('Error counting:', err);
      process.exit(1);
    }

    console.log(`📊 Total Announcements: ${result.count}`);
    console.log('');

    if (result.count === 0) {
      console.log('✅ Database is clean (all announcements removed)');
      console.log('✅ Ready for new announcements\n');
      process.exit(0);
    }

    // Display announcements
    db.all(`
      SELECT id, title, content, publishFor, createdByRole, createdByUser, readBy, createdAt 
      FROM announcements 
      ORDER BY createdAt DESC
    `, (err, rows) => {
      if (err) {
        console.error('Error fetching announcements:', err);
        process.exit(1);
      }

      console.log('📢 Existing Announcements:');
      console.log('');
      rows.forEach((ann, idx) => {
        try {
          let readBy = JSON.parse(ann.readBy || '[]');
          console.log(`[${idx + 1}] "${ann.title}"`);
          console.log(`    PublishFor: ${ann.publishFor}`);
          console.log(`    CreatedByRole: ${ann.createdByRole}`);
          console.log(`    CreatedByUser: ${ann.createdByUser}`);
          console.log(`    ReadBy: [${readBy.join(', ')}]`);
          console.log(`    CreatedAt: ${ann.createdAt}`);
          console.log('');
        } catch (e) {
          console.log(`[${idx + 1}] Error parsing: ${ann.title}`);
        }
      });

      // Verify publishFor values are valid
      console.log('🔍 PublishFor Values Check:');
      const validValues = ['students', 'mentors', 'both'];
      const invalidCount = rows.filter(r => !validValues.includes(r.publishFor)).length;
      
      if (invalidCount === 0) {
        console.log(`✅ All announcements use valid publishFor values`);
      } else {
        console.log(`⚠️ ${invalidCount} announcements have invalid publishFor values`);
      }

      process.exit(0);
    });
  });
});
