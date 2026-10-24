const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

console.log('🔍 CHECKING FOR STUDENT DATA...');
console.log('============================');

// Check all tables again and look for student-related data
db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", (err, tables) => {
  if (err) {
    console.error('Error checking tables:', err);
    return;
  }
  
  console.log(`\n📋 Available tables: ${tables.map(t => t.name).join(', ')}`);
  
  // Check if there are any other tables that might contain student data
  const possibleStudentTables = tables.filter(table => 
    table.name.toLowerCase().includes('student') ||
    table.name.toLowerCase().includes('user') ||
    table.name.toLowerCase().includes('account') ||
    table.name.toLowerCase().includes('admin') ||
    table.name.toLowerCase().includes('mentor')
  );
  
  if (possibleStudentTables.length > 0) {
    console.log('\n👥 Possible student/user tables:');
    possibleStudentTables.forEach(table => {
      console.log(`   - ${table.name}`);
    });
    
    // Check the first promising table
    const firstTable = possibleStudentTables[0].name;
    console.log(`\n🔍 Checking ${firstTable} table for data...`);
    
    db.all(`SELECT * FROM ${firstTable} LIMIT 5`, (err, rows) => {
      if (err) {
        console.error(`Error fetching from ${firstTable}:`, err);
        return;
      }
      
      console.log(`\n📊 Found ${rows.length} records in ${firstTable}:`);
      
      if (rows.length > 0) {
        console.log('\nSample data:');
        rows.forEach((row, index) => {
          console.log(`   ${index + 1}. ${JSON.stringify(row, null, 2).substring(0, 200)}...`);
        });
        
        // Check structure of this table
        db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${firstTable})`, (err, columns) => {
          if (err) {
            console.error(`Error getting table info for ${firstTable}:`, err);
            return;
          }
          
          console.log(`\n📋 ${firstTable} table structure:`);
          columns.forEach(col => {
            console.log(`   - ${col.name}: ${col.type}`);
          });
          
          db.close();
        });
      } else {
        console.log('ℹ️ No records found');
        db.close();
      }
    });
  } else {
    console.log('\n❌ No student/user related tables found');
    console.log('🔧 Database appears to be mostly empty');
    db.close();
  }
});
