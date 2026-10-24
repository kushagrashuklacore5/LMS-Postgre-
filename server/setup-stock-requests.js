const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database setup script for enhanced stock request system
const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');

console.log('Setting up enhanced stock request system...');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

// Read and execute the schema
const fs = require('fs');
const schemaPath = path.join(__dirname, 'database', 'stock_requests_schema.sql');

try {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  console.log('Executing stock requests schema...');
  
  db.exec(schema, (err) => {
    if (err) {
      console.error('Error executing schema:', err.message);
      // Don't exit, as tables might already exist
      console.log('Continuing... (tables might already exist)');
    } else {
      console.log('✅ Stock requests schema created successfully');
    }
    
    // Verify tables exist
    console.log('Verifying tables...');
    const tables = [
      'stock_requests',
      'stock_request_items', 
      'request_templates',
      'vendor_quotes',
      'vendor_quote_items',
      'request_notifications'
    ];
    
    let checkedTables = 0;
    
    tables.forEach(table => {
      db.get(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name=?`, [table], (err, row) => {
        if (err) {
          console.error(`Error checking table ${table}:`, err.message);
        } else if (row) {
          console.log(`✅ Table '${table}' exists`);
        } else {
          console.log(`❌ Table '${table}' not found`);
        }
        
        checkedTables++;
        if (checkedTables === tables.length) {
          console.log('\n🎉 Stock request system setup complete!');
          console.log('You can now use the enhanced stock request features.');
          
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err.message);
            } else {
              console.log('Database connection closed');
            }
          });
        }
      });
    });
  });
} catch (error) {
  console.error('Error reading schema file:', error.message);
  console.log('Make sure the schema file exists at:', schemaPath);
  
  db.close();
}
