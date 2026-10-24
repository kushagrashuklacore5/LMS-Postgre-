const db = require('config/database-switch');

console.log('Running migration to add classTeacherId column...\n');

db.run(`ALTER TABLE classrooms ADD COLUMN classTeacherId INTEGER`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ classTeacherId column already exists');
    } else {
      console.error('❌ Error adding column:', err.message);
    }
  } else {
    console.log('✅ classTeacherId column added successfully');
  }
  
  // Add foreign key constraint if needed
  db.run(`ALTER TABLE classrooms ADD CONSTRAINT fk_classTeacherId FOREIGN KEY (classTeacherId) REFERENCES users(id)`, (fkErr) => {
    if (fkErr) {
      if (fkErr.message.includes('duplicate') || fkErr.message.includes('already exists')) {
        console.log('✅ Foreign key constraint already exists');
      } else {
        console.warn('⚠️  Note on FK constraint:', fkErr.message);
      }
    } else {
      console.log('✅ Foreign key constraint added');
    }
    
    // Verify the schema
    db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'classrooms)`, (err, rows) => {
      console.log('\n✅ Updated classrooms table structure:');
      rows.forEach(r => {
        console.log(`  - ${r.name} (${r.type})`);
      });
      process.exit(0);
    });
  });
});
