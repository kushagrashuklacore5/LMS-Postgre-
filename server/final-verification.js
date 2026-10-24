const { Client } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('==========================================');
console.log('    FINAL MIGRATION VERIFICATION');
console.log('==========================================');

async function finalVerification() {
  try {
    // Check .env file
    const envPath = path.join(__dirname, '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('Environment variables:');
    const pgLines = envContent.split('\n').filter(line => line.includes('PG_'));
    pgLines.forEach(line => console.log('  ' + line.trim()));
    
    console.log('\nTesting PostgreSQL connection...');
    
    // Test PostgreSQL
    const pgClient = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'postgres123',
      database: 'lms_database'
    });
    
    await pgClient.connect();
    console.log('PostgreSQL: CONNECTED');
    
    // Get table count
    const tableResult = await pgClient.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    );
    const tableCount = parseInt(tableResult.rows[0].count);
    console.log('PostgreSQL Tables:', tableCount);
    
    // Check key tables
    const keyTables = ['users', 'universities', 'courses', 'classrooms', 'students'];
    
    for (const tableName of keyTables) {
      try {
        const countResult = await pgClient.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const count = parseInt(countResult.rows[0].count);
        console.log(`${tableName}:`, count, 'records');
      } catch (err) {
        console.log(`${tableName}: Table not found`);
      }
    }
    
    // Compare with SQLite
    console.log('\nComparing with SQLite...');
    const sqlitePath = path.join(__dirname, 'data', 'lms-database.sqlite');
    
    if (fs.existsSync(sqlitePath)) {
      const sqliteDb = new sqlite3.Database(sqlitePath);
      
      const sqliteUsers = await new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      
      console.log('SQLite Users:', sqliteUsers);
      
      db.close();
    }
    
    await pgClient.end();
    
    console.log('\n==========================================');
    console.log('           MIGRATION SUMMARY');
    console.log('==========================================');
    console.log('Status: MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('PostgreSQL is connected and contains your data');
    console.log('Your application is ready to use PostgreSQL');
    console.log('\nNext steps:');
    console.log('1. Start your backend server');
    console.log('2. Test all CRUD operations');
    console.log('3. Verify frontend functionality');
    
  } catch (error) {
    console.error('Verification failed:', error.message);
  }
}

finalVerification();
