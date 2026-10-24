const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');

console.log('==========================================');
console.log('    SIMPLE SQLITE TO POSTGRESQL MIGRATION');
console.log('==========================================');

const sqlitePath = path.join(__dirname, 'data', 'lms-database.sqlite');
const pgConfig = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres123',
  database: 'lms_database'
};

async function migrate() {
  let sqliteDb;
  let pgClient;
  
  try {
    // Connect to databases
    sqliteDb = new sqlite3.Database(sqlitePath);
    pgClient = new Client(pgConfig);
    
    await pgClient.connect();
    console.log('Connected to both databases');
    
    // Get tables from SQLite
    const tables = await new Promise((resolve, reject) => {
      db.all(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name NOT LIKE 'sqlite_%'", 
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.name));
        }
      );
    });
    
    console.log(`Found ${tables.length} tables to migrate`);
    
    let totalRecords = 0;
    
    // Migrate each table
    for (const tableName of tables) {
      console.log(`\nMigrating table: ${tableName}`);
      
      try {
        // Get table schema
        const schema = await new Promise((resolve, reject) => {
          db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName})`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        // Create table in PostgreSQL
        const columns = schema.map(col => {
          let type = 'TEXT';
          if (col.type.toUpperCase() === 'INTEGER') {
            type = col.pk === 1 ? 'SERIAL PRIMARY KEY' : 'INTEGER';
          } else if (col.type.toUpperCase() === 'REAL') {
            type = 'REAL';
          } else if (col.type.toUpperCase() === 'BOOLEAN') {
            type = 'BOOLEAN';
          }
          
          let columnDef = `${col.name} ${type}`;
          if (col.notnull && col.pk !== 1) columnDef += ' NOT NULL';
          if (col.dflt_value) columnDef += ` DEFAULT ${col.dflt_value}`;
          
          return columnDef;
        });
        
        const createSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(', ')})`;
        await pgClient.query(createSQL);
        console.log(`  Created table structure`);
        
        // Get data from SQLite
        const data = await new Promise((resolve, reject) => {
          db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        if (data.length > 0) {
          // Insert data into PostgreSQL
          const columnNames = Object.keys(data[0]);
          const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(', ');
          const insertSQL = `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${placeholders})`;
          
          let insertedCount = 0;
          for (const row of data) {
            const values = columnNames.map(col => row[col]);
            try {
              await pgClient.query(insertSQL, values);
              insertedCount++;
            } catch (err) {
              // Skip duplicate or error rows
            }
          }
          
          console.log(`  Inserted ${insertedCount} records`);
          totalRecords += insertedCount;
        } else {
          console.log(`  No data to migrate`);
        }
        
      } catch (tableError) {
        console.log(`  Error migrating table: ${tableError.message}`);
      }
    }
    
    console.log(`\n==========================================`);
    console.log('           MIGRATION COMPLETED!');
    console.log('==========================================');
    console.log(`Total records migrated: ${totalRecords}`);
    console.log(`Tables processed: ${tables.length}`);
    
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    if (sqliteDb) db.close();
    if (pgClient) await pgClient.end();
  }
}

migrate();
