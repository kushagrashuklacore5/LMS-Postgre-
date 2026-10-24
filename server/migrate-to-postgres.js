const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// PostgreSQL connection config
const pgConfig = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'your_password',
  database: 'lms_database'
};

// SQLite database path
const sqlitePath = path.join(__dirname, 'data', 'lms-database.sqlite');

async function migrateToPostgres() {
  console.log('Starting migration from SQLite to PostgreSQL...');
  
  // Connect to PostgreSQL
  const pgClient = new Client(pgConfig);
  await pgClient.connect();
  
  // Connect to SQLite
  const sqliteDb = new sqlite3.Database(sqlitePath);
  
  try {
    // Get all table names from SQLite
    const tables = await new Promise((resolve, reject) => {
      db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.name));
      });
    });
    
    console.log('Tables to migrate:', tables);
    
    // Create PostgreSQL tables and migrate data
    for (const tableName of tables) {
      console.log(`\nMigrating table: ${tableName}`);
      
      // Get table schema from SQLite
      const schema = await new Promise((resolve, reject) => {
        db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      // Generate PostgreSQL CREATE TABLE statement
      const createTableSQL = generateCreateTableSQL(tableName, schema);
      console.log('Creating table:', createTableSQL);
      
      try {
        await pgClient.query(createTableSQL);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.error('Error creating table:', err);
        }
      }
      
      // Get data from SQLite
      const data = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      if (data.length > 0) {
        // Insert data into PostgreSQL
        const columns = Object.keys(data[0]);
        const values = data.map(row => columns.map(col => row[col]));
        
        const insertSQL = `
          INSERT INTO ${tableName} (${columns.join(', ')}) 
          VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
        `;
        
        for (const row of values) {
          try {
            await pgClient.query(insertSQL, row);
          } catch (err) {
            console.error('Error inserting row:', err.message);
          }
        }
        
        console.log(`Migrated ${data.length} rows from ${tableName}`);
      }
    }
    
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pgClient.end();
    db.close();
  }
}

function generateCreateTableSQL(tableName, schema) {
  let sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
  
  const columns = schema.map(col => {
    let columnDef = `  ${col.name} `;
    
    // Convert SQLite types to PostgreSQL types
    switch (col.type.toUpperCase()) {
      case 'INTEGER':
        if (col.pk) {
          columnDef += 'SERIAL PRIMARY KEY';
        } else {
          columnDef += 'INTEGER';
        }
        break;
      case 'TEXT':
        columnDef += 'TEXT';
        break;
      case 'REAL':
        columnDef += 'REAL';
        break;
      case 'BOOLEAN':
        columnDef += 'BOOLEAN';
        break;
      case 'DATETIME':
        columnDef += 'TIMESTAMP';
        break;
      case 'DATE':
        columnDef += 'DATE';
        break;
      default:
        columnDef += 'TEXT';
    }
    
    if (col.notnull && !col.pk) {
      columnDef += ' NOT NULL';
    }
    
    if (col.dflt_value) {
      columnDef += ` DEFAULT ${col.dflt_value}`;
    }
    
    return columnDef;
  });
  
  sql += columns.join(',\n');
  sql += '\n);';
  
  return sql;
}

// Run migration
migrateToPostgres().catch(console.error);
