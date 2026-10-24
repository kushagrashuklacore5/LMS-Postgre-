const db = require('./config/database-switch');

console.log('🔍 Checking users table schema in main database...\n');

// Get table schema
db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)", (err, rows) => {
  if (err) {
    console.error('❌ Database error:', err);
    return;
  }

  console.log('✅ Users table schema:');
  rows.forEach(row => {
    console.log(`   - ${row.name}: ${row.type} (NOT NULL: ${row.notnull}, DEFAULT: ${row.dflt_value})`);
  });

  // Check if university_id column exists
  const universityIdColumn = rows.find(row => row.name === 'university_id');
  if (!universityIdColumn) {
    console.log('\n❌ university_id column not found in users table!');
    console.log('🔧 Adding university_id column to users table...');
    
    const addColumnQuery = `
      ALTER TABLE users ADD COLUMN university_id INTEGER DEFAULT 1
    `;
    
    db.run(addColumnQuery, (err) => {
      if (err) {
        console.error('❌ Error adding university_id column:', err);
      } else {
        console.log('✅ university_id column added successfully to users table!');
      }
    });
  } else {
    console.log('\n✅ university_id column exists in users table');
  }
});
