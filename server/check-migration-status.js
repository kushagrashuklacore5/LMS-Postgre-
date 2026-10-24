#!/usr/bin/env node

const { Client } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('==========================================');
console.log('       MIGRATION STATUS CHECKER');
console.log('==========================================');

async function checkMigrationStatus() {
  try {
    // Check if PostgreSQL is configured
    const envPath = path.join(__dirname, '.env');
    let usePostgres = false;
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      usePostgres = envContent.includes('USE_POSTGRES=true');
    }
    
    console.log('\nDatabase Configuration:');
    console.log('USE_POSTGRES:', usePostgres ? 'true (PostgreSQL)' : 'false/not set (SQLite)');
    
    if (usePostgres) {
      console.log('\nChecking PostgreSQL connection...');
      
      // Load PostgreSQL config
      const pgConfig = {
        host: process.env.PG_HOST || 'localhost',
        port: process.env.PG_PORT || 5432,
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'postgres',
        database: process.env.PG_DATABASE || 'lms_database'
      };
      
      const pgClient = new Client(pgConfig);
      
      try {
        await pgClient.connect();
        console.log('PostgreSQL: CONNECTED');
        
        // Check if database has tables
        const tableResult = await pgClient.query(
          "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        );
        const tableCount = parseInt(tableResult.rows[0].count);
        console.log('PostgreSQL Tables:', tableCount);
        
        if (tableCount > 0) {
          console.log('Status: PostgreSQL database is populated');
          
          // Get some sample data
          const sampleResult = await pgClient.query(
            "SELECT SUM(n_tup_ins) as total_records FROM pg_stat_user_tables"
          );
          const totalRecords = parseInt(sampleResult.rows[0].total_records) || 0;
          console.log('Total Records:', totalRecords.toLocaleString());
          
          // Check key tables
          const keyTables = ['users', 'universities', 'courses'];
          for (const tableName of keyTables) {
            try {
              const countResult = await pgClient.query(`SELECT COUNT(*) as count FROM ${tableName}`);
              const count = parseInt(countResult.rows[0].count);
              console.log(`${tableName}:`, count, 'records');
            } catch (err) {
              console.log(`${tableName}: Table not found`);
            }
          }
          
        } else {
          console.log('Status: PostgreSQL database exists but appears empty');
          console.log('You may need to run the migration');
        }
        
        await pgClient.end();
        
      } catch (pgError) {
        console.log('PostgreSQL: CONNECTION FAILED');
        console.log('Error:', pgError.message);
        console.log('\nPossible causes:');
        console.log('1. PostgreSQL is not running');
        console.log('2. Database credentials are incorrect');
        console.log('3. Database does not exist');
      }
    }
    
    // Check SQLite status
    console.log('\nChecking SQLite database...');
    const sqlitePath = path.join(__dirname, 'data', 'lms-database.sqlite');
    
    if (fs.existsSync(sqlitePath)) {
      const sqliteDb = new sqlite3.Database(sqlitePath);
      
      try {
        const tableCount = await new Promise((resolve, reject) => {
          db.get(
            "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", 
            (err, row) => {
              if (err) reject(err);
              else resolve(row.count);
            }
          );
        });
        
        console.log('SQLite: CONNECTED');
        console.log('SQLite Tables:', tableCount);
        
        if (tableCount > 0) {
          // Get user count as sample
          const userCount = await new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
              if (err) reject(err);
              else resolve(row.count);
            });
          });
          
          console.log('SQLite Users:', userCount);
          console.log('Status: SQLite database has data');
        }
        
        db.close();
        
      } catch (sqliteError) {
        console.log('SQLite: ERROR');
        console.log('Error:', sqliteError.message);
      }
    } else {
      console.log('SQLite: Database file not found');
    }
    
    // Summary and recommendations
    console.log('\n==========================================');
    console.log('              SUMMARY & RECOMMENDATIONS');
    console.log('==========================================');
    
    if (usePostgres) {
      console.log('\nYour application is configured to use PostgreSQL');
      console.log('\nRecommended actions:');
      console.log('1. If PostgreSQL shows "CONNECTED" and has data: Migration complete!');
      console.log('2. If PostgreSQL shows "CONNECTION FAILED": Check PostgreSQL installation');
      console.log('3. If PostgreSQL shows "empty": Run migration with "node quick-migrate.js"');
      console.log('4. Test your application to ensure it works with PostgreSQL');
    } else {
      console.log('\nYour application is configured to use SQLite');
      console.log('\nTo migrate to PostgreSQL:');
      console.log('1. Install PostgreSQL');
      console.log('2. Add USE_POSTGRES=true to your .env file');
      console.log('3. Update PostgreSQL credentials in .env');
      console.log('4. Run: node quick-migrate.js');
    }
    
    console.log('\nVerification commands:');
    console.log('- Quick check: node quick-verify-fixed.js');
    console.log('- Detailed verification: node verify-postgres-migration.js');
    console.log('- Re-run migration: node quick-migrate.js');
    
  } catch (error) {
    console.error('Status check failed:', error.message);
  }
}

checkMigrationStatus();
