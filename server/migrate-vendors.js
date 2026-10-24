const db = require('config/database-switch');

console.log('Migrating vendors table to add university_id...');

// Check if university_id column exists
db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vendors)", (err, result) => {
  if (err) {
    console.error('Error getting table info:', err);
    process.exit(1);
  }
  
  const hasUniversityId = result.some(col => col.name === 'university_id');
  
  if (!hasUniversityId) {
    console.log('Adding university_id column to vendors table...');
    
    // Add university_id column
    db.run('ALTER TABLE vendors ADD COLUMN university_id INTEGER DEFAULT 1', (err) => {
      if (err) {
        console.error('Error adding university_id column:', err);
        process.exit(1);
      }
      
      console.log('✅ university_id column added successfully');
      
      // Update existing vendors to have university_id = 1
      db.run('UPDATE vendors SET university_id = 1 WHERE university_id IS NULL', (err) => {
        if (err) {
          console.error('Error updating existing vendors:', err);
          process.exit(1);
        }
        
        console.log('✅ Existing vendors updated with university_id');
        console.log('✅ Migration completed successfully!');
      });
    });
  } else {
    console.log('✅ university_id column already exists');
  }
});
