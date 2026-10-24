#!/usr/bin/env node

console.log('==========================================');
console.log('    QUICK POSTGRESQL VERIFICATION');
console.log('==========================================');
console.log('');

async function quickVerify() {
  try {
    // Load environment variables
    const path = require('path');
    const fs = require('fs');
    
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
      console.log('ERROR: .env file not found');
      console.log('Please ensure PostgreSQL is configured in your .env file');
      process.exit(1);
    }
    
    // Read and parse .env
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envLines = envContent.split('\n');
    const envVars = {};
    
    envLines.forEach(line => {
      const parts = line.split('=');
      const key = parts[0];
      const valueParts = parts.slice(1);
      if (key && !key.startsWith('#')) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });
    
    console.log('Checking PostgreSQL configuration...');
    
    // Check required environment variables
    const requiredVars = ['PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD', 'PG_DATABASE'];
    const missingVars = requiredVars.filter(var => !envVars[var]);
    
    if (missingVars.length > 0) {
      console.log('ERROR: Missing required environment variables:');
      missingVars.forEach(var => console.log(`  - ${var}`));
      process.exit(1);
    }
    
    console.log('Environment variables found');
    
    // Test PostgreSQL connection
    const { Client } = require('pg');
    const client = new Client({
      host: envVars.PG_HOST,
      port: parseInt(envVars.PG_PORT),
      user: envVars.PG_USER,
      password: envVars.PG_PASSWORD,
      database: envVars.PG_DATABASE
    });
    
    console.log('Testing PostgreSQL connection...');
    await client.connect();
    console.log('PostgreSQL connection successful');
    
    // Get table count
    const tableResult = await client.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tableCount = parseInt(tableResult.rows[0].count);
    console.log(`Tables found in PostgreSQL: ${tableCount}`);
    
    // Get total record count
    const recordResult = await client.query(`
      SELECT SUM(n_tup_ins) as total_records
      FROM pg_stat_user_tables
    `);
    const totalRecords = parseInt(recordResult.rows[0].total_records) || 0;
    console.log(`Total records in PostgreSQL: ${totalRecords.toLocaleString()}`);
    
    // Check if SQLite exists and compare
    const sqlitePath = path.join(__dirname, 'data', 'lms-database.sqlite');
    if (fs.existsSync(sqlitePath)) {
      console.log('\nComparing with SQLite database...');
      
      const sqlite3 = require('sqlite3');
      const sqliteDb = new sqlite3.Database(sqlitePath);
      
      // Get SQLite table count
      const sqliteTableCount = await new Promise((resolve, reject) => {
        db.get(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", 
          (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          }
        );
      });
      
      console.log(`Tables found in SQLite: ${sqliteTableCount}`);
      
      // Get SQLite record counts
      const sqliteTables = await new Promise((resolve, reject) => {
        db.all(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name NOT LIKE 'sqlite_%'", 
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(row => row.name));
          }
        );
      });
      
      let totalSQLiteRecords = 0;
      for (const tableName of sqliteTables.slice(0, 10)) { // Check first 10 tables
        const count = await new Promise((res, rej) => {
          db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
            if (err) rej(err);
            else res(row.count);
          });
        });
        totalSQLiteRecords += count;
      }
      
      console.log(`Sample SQLite records (first 10 tables): ${totalSQLiteRecords.toLocaleString()}`);
      
      db.close();
      
      // Basic comparison
      if (tableCount >= sqliteTableCount * 0.9) {
        console.log('\nTable count looks good!');
      } else {
        console.log('\nWARNING: Table count seems low');
      }
    }
    
    await client.end();
    
    console.log('\n==========================================');
    console.log('         VERIFICATION COMPLETE');
    console.log('==========================================');
    console.log('');
    console.log('PostgreSQL Status: CONNECTED');
    console.log(`Tables: ${tableCount}`);
    console.log(`Records: ${totalRecords.toLocaleString()}`);
    console.log('');
    console.log('For detailed verification, run:');
    console.log('node verify-postgres-migration.js');
    console.log('');
    
  } catch (error) {
    console.error('Verification failed:', error.message);
    console.log('');
    console.log('Common issues:');
    console.log('1. PostgreSQL is not running');
    console.log('2. Database credentials are incorrect');
    console.log('3. Database does not exist');
    console.log('4. Network connectivity issues');
    process.exit(1);
  }
}

quickVerify();
