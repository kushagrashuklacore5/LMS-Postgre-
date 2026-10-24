const db = require('./config/database-switch');

console.log('🔍 Checking announcements table structure...');

// Check if announcements table exists
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='announcements'", (err, tables) => {
  if (err) {
    console.error('❌ Error checking table:', err);
    return;
  }
  
  if (tables.length === 0) {
    console.log('❌ Announcements table does not exist');
    
    // Create the announcements table
    console.log('🔨 Creating announcements table...');
    db.run(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        university_id INTEGER NOT NULL,
        createdByUser INTEGER NOT NULL,
        createdByRole TEXT NOT NULL,
        publishFor TEXT,
        courseId INTEGER,
        readBy TEXT DEFAULT '[]',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (createdByUser) REFERENCES users(id),
        FOREIGN KEY (university_id) REFERENCES universities(id)
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating table:', err);
      } else {
        console.log('✅ Announcements table created successfully');
      }
    });
  } else {
    console.log('✅ Announcements table exists');
    
    // Check table structure
    db.all("PRAGMA table_info(announcements)", (err, columns) => {
      if (err) {
        console.error('❌ Error getting table info:', err);
      } else {
        console.log('📋 Announcements table structure:');
        columns.forEach(col => {
          console.log(`   - ${col.name}: ${col.type} (${col.notNull ? 'NOT NULL' : 'NULL'})`);
        });
      }
    });
  }
});
