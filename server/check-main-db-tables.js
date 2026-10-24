const db = require('./config/database-switch');

console.log('🔍 Checking tables in main database...\n');

db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY name", (err, rows) => {
  if (err) {
    console.error('❌ Database error:', err);
    return;
  }

  if (rows.length === 0) {
    console.log('❌ No tables found in main database');
  } else {
    console.log(`✅ Found ${rows.length} tables in main database:`);
    rows.forEach(row => {
      console.log(`   - ${row.name}`);
    });
    
    // Check if universities table exists
    const universitiesTable = rows.find(row => row.name === 'universities');
    if (!universitiesTable) {
      console.log('\n❌ Universities table not found in main database!');
      console.log('🔧 Creating universities table in main database...');
      
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS universities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(255) NOT NULL,
          area VARCHAR(255),
          adminId INTEGER,
          subscriptionPlan VARCHAR(50) DEFAULT 'free',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;
      
      db.run(createTableQuery, (err) => {
        if (err) {
          console.error('❌ Error creating universities table:', err);
        } else {
          console.log('✅ Universities table created successfully in main database!');
        }
      });
    } else {
      console.log('\n✅ Universities table exists in main database');
    }
  }
});
