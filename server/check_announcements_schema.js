const db = require('./config/database-switch');

async function checkAnnouncementsSchema() {
  console.log('🔍 Checking announcements table schema...\n');
  
  try {
    const schema = await new Promise((resolve, reject) => {
      db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='announcements'", [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (schema) {
      console.log('✅ Announcements table CREATE SQL:');
      console.log(schema.sql);
    } else {
      console.log('❌ Announcements table not found');
    }
    
    // Check column names
    const columns = await new Promise((resolve, reject) => {
      db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'announcements)", [], (err, rows) => {
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
      db.all("SELECT COUNT(*) as count FROM announcements", [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log(`\n📈 Total announcements: ${data.count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAnnouncementsSchema();
