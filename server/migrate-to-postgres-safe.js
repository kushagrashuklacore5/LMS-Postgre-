const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  sqlite: {
    path: path.join(__dirname, 'data', 'lms-database.sqlite')
  },
  postgres: {
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'lms_database'
  },
  backupDir: path.join(__dirname, 'backups')
};

// Ensure backup directory exists
if (!fs.existsSync(config.backupDir)) {
  fs.mkdirSync(config.backupDir, { recursive: true });
}

class DatabaseMigrator {
  constructor() {
    this.pgClient = null;
    this.sqliteDb = null;
    this.migrationLog = [];
  }

  async initialize() {
    console.log('Initializing migration...');
    
    // Connect to PostgreSQL
    this.pgClient = new Client(config.postgres);
    await this.pgClient.connect();
    console.log('Connected to PostgreSQL');
    
    // Connect to SQLite
    this.sqliteDb = new sqlite3.Database(config.sqlite.path);
    console.log('Connected to SQLite');
  }

  async createBackup() {
    console.log('Creating backup of SQLite database...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(config.backupDir, `lms-database-backup-${timestamp}.sqlite`);
    
    return new Promise((resolve, reject) => {
      fs.copyFile(config.sqlite.path, backupPath, (err) => {
        if (err) reject(err);
        else {
          console.log(`Backup created: ${backupPath}`);
          resolve(backupPath);
        }
      });
    });
  }

  async getTableSchema(tableName) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName})`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getTableIndexes(tableName) {
    return new Promise((resolve, reject) => {
      this.db.all(`PRAGMA index_list(${tableName})`, async (err, indexes) => {
        if (err) reject(err);
        else {
          const indexDetails = [];
          for (const index of indexes) {
            const details = await new Promise((res, rej) => {
              this.db.all(`PRAGMA index_info(${index.name})`, (e, rows) => {
                if (e) rej(e);
                else res({ ...index, columns: rows });
              });
            });
            indexDetails.push(details);
          }
          resolve(indexDetails);
        }
      });
    });
  }

  async getForeignKeys(tableName) {
    return new Promise((resolve, reject) => {
      this.db.all(`PRAGMA foreign_key_list(${tableName})`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  convertSQLiteTypeToPostgres(sqliteType, isPrimaryKey = false) {
    const type = sqliteType.toUpperCase();
    
    if (isPrimaryKey) {
      return 'SERIAL PRIMARY KEY';
    }
    
    switch (type) {
      case 'INTEGER':
        return 'INTEGER';
      case 'TEXT':
        return 'TEXT';
      case 'REAL':
        return 'REAL';
      case 'BOOLEAN':
        return 'BOOLEAN';
      case 'DATETIME':
      case 'TIMESTAMP':
        return 'TIMESTAMP';
      case 'DATE':
        return 'DATE';
      case 'BLOB':
        return 'BYTEA';
      default:
        return 'TEXT';
    }
  }

  generateCreateTableSQL(tableName, schema, foreignKeys) {
    let sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    const columns = [];
    const constraints = [];

    // Add columns
    for (const col of schema) {
      let columnDef = `  ${col.name} `;
      
      const isPrimaryKey = col.pk === 1;
      columnDef += this.convertSQLiteTypeToPostgres(col.type, isPrimaryKey);
      
      if (col.notnull && !isPrimaryKey) {
        columnDef += ' NOT NULL';
      }
      
      if (col.dflt_value) {
        // Handle default values
        let defaultValue = col.dflt_value;
        if (defaultValue === 'CURRENT_TIMESTAMP') {
          defaultValue = 'CURRENT_TIMESTAMP';
        } else if (typeof defaultValue === 'string' && defaultValue.startsWith("'") && defaultValue.endsWith("'")) {
          // Keep string defaults as-is
        } else {
          // Handle numeric defaults
          if (!isNaN(defaultValue)) {
            defaultValue = defaultValue;
          } else {
            defaultValue = `'${defaultValue}'`;
          }
        }
        columnDef += ` DEFAULT ${defaultValue}`;
      }
      
      columns.push(columnDef);
    }

    // Add foreign key constraints
    for (const fk of foreignKeys) {
      constraints.push(`  FOREIGN KEY (${fk.from}) REFERENCES ${fk.table}(${fk.to})`);
    }

    sql += columns.join(',\n');
    
    if (constraints.length > 0) {
      sql += ',\n' + constraints.join(',\n');
    }
    
    sql += '\n);';
    
    return sql;
  }

  async createTable(tableName) {
    console.log(`Creating table: ${tableName}`);
    
    const schema = await this.getTableSchema(tableName);
    const foreignKeys = await this.getForeignKeys(tableName);
    
    const createSQL = this.generateCreateTableSQL(tableName, schema, foreignKeys);
    
    try {
      await this.pgClient.query(createSQL);
      console.log(`Table ${tableName} created successfully`);
      this.migrationLog.push(`Created table: ${tableName}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`Table ${tableName} already exists`);
      } else {
        console.error(`Error creating table ${tableName}:`, error.message);
        throw error;
      }
    }
  }

  async migrateTableData(tableName) {
    console.log(`Migrating data for table: ${tableName}`);
    
    // Get row count first
    const count = await new Promise((resolve, reject) => {
      this.db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    if (count === 0) {
      console.log(`No data to migrate in table: ${tableName}`);
      return;
    }
    
    console.log(`Found ${count} rows to migrate`);
    
    // Get all data
    const data = await new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (data.length === 0) return;
    
    // Get column names
    const columns = Object.keys(data[0]);
    
    // Prepare insert statement
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertSQL = `
      INSERT INTO ${tableName} (${columns.join(', ')}) 
      VALUES (${placeholders})
      ON CONFLICT DO NOTHING
    `;
    
    let migratedCount = 0;
    let errorCount = 0;
    
    // Insert data in batches
    const batchSize = 100;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      for (const row of batch) {
        const values = columns.map(col => {
          const value = row[col];
          // Handle special cases
          if (value === null || value === undefined) return null;
          if (typeof value === 'object') return JSON.stringify(value);
          return value;
        });
        
        try {
          await this.pgClient.query(insertSQL, values);
          migratedCount++;
        } catch (error) {
          errorCount++;
          if (errorCount <= 5) { // Log first 5 errors only
            console.error(`Error inserting row in ${tableName}:`, error.message);
          }
        }
      }
      
      // Progress indicator
      if ((i + batchSize) % 1000 === 0 || i + batchSize >= data.length) {
        console.log(`Progress: ${Math.min(i + batchSize, data.length)}/${data.length} rows processed`);
      }
    }
    
    console.log(`Table ${tableName}: ${migratedCount} rows migrated, ${errorCount} errors`);
    this.migrationLog.push(`Migrated ${tableName}: ${migratedCount} rows, ${errorCount} errors`);
  }

  async createIndexes(tableName) {
    const indexes = await this.getTableIndexes(tableName);
    
    for (const indexInfo of indexes) {
      if (indexInfo.origin === 'pk') continue; // Skip primary keys
      
      const columns = indexInfo.columns.map(col => col.name).join(', ');
      const indexName = `idx_${tableName}_${indexInfo.name}`;
      
      try {
        await this.pgClient.query(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`);
        console.log(`Created index: ${indexName}`);
      } catch (error) {
        console.error(`Error creating index ${indexName}:`, error.message);
      }
    }
  }

  async migrate() {
    try {
      console.log('Starting safe migration from SQLite to PostgreSQL...');
      
      // Step 1: Create backup
      await this.createBackup();
      
      // Step 2: Get all tables
      const tables = await new Promise((resolve, reject) => {
        this.db.all(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name NOT LIKE 'sqlite_%'", 
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(row => row.name));
          }
        );
      });
      
      console.log(`Found ${tables.length} tables to migrate:`, tables);
      
      // Step 3: Create all tables first
      console.log('\n=== Creating Tables ===');
      for (const tableName of tables) {
        await this.createTable(tableName);
      }
      
      // Step 4: Migrate data
      console.log('\n=== Migrating Data ===');
      for (const tableName of tables) {
        await this.migrateTableData(tableName);
      }
      
      // Step 5: Create indexes
      console.log('\n=== Creating Indexes ===');
      for (const tableName of tables) {
        await this.createIndexes(tableName);
      }
      
      // Step 6: Write migration log
      const logPath = path.join(config.backupDir, `migration-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      fs.writeFileSync(logPath, this.migrationLog.join('\n'));
      
      console.log('\n=== Migration Summary ===');
      console.log(`Migration completed successfully!`);
      console.log(`Tables migrated: ${tables.length}`);
      console.log(`Backup created: ${config.backupDir}`);
      console.log(`Migration log: ${logPath}`);
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    } finally {
      if (this.pgClient) await this.pgClient.end();
      if (this.sqliteDb) await this.db.close();
    }
  }
}

// Run migration
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  migrator.migrate().catch(console.error);
}

module.exports = DatabaseMigrator;
