const db = require('./config/database-switch');

async function checkCoursesSchema() {
  console.log('🔍 Checking courses table schema...\n');
  
  try {
    const schema = await new Promise((resolve, reject) => {
      db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='courses'", [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (schema) {
      console.log('✅ Courses table CREATE SQL:');
      console.log(schema.sql);
    } else {
      console.log('❌ Courses table not found');
    }
    
    // Check column names
    const columns = await new Promise((resolve, reject) => {
      db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'courses)", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n📊 Table columns:');
    columns.forEach((col, index) => {
      console.log(`${index + 1}. ${col.name} (${col.type})`);
    });
    
    // Check if table has data
    const data = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM courses LIMIT 1", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`\n📈 Sample data:`, data.length > 0 ? data[0] : 'No data');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCoursesSchema();
