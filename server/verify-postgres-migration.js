#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
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
  }
};

class MigrationVerifier {
  constructor() {
    this.pgClient = null;
    this.sqliteDb = null;
    this.verificationResults = {
      tables: {},
      summary: {
        totalTables: 0,
        matchedTables: 0,
        totalRecords: { sqlite: 0, postgres: 0 },
        mismatchedTables: []
      }
    };
  }

  async initialize() {
    console.log('Initializing verification...');
    
    // Connect to PostgreSQL
    this.pgClient = new Client(config.postgres);
    await this.pgClient.connect();
    console.log('Connected to PostgreSQL');
    
    // Connect to SQLite
    this.sqliteDb = new sqlite3.Database(config.sqlite.path);
    console.log('Connected to SQLite');
  }

  async getTableList(db, type) {
    if (type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.all(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name NOT LIKE 'sqlite_%'", 
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(row => row.name));
          }
        );
      });
    } else {
      const result = await this.pgClient.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
      );
      return result.rows.map(row => row.table_name);
    }
  }

  async getRecordCount(db, tableName, type) {
    if (type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
    } else {
      const result = await this.pgClient.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      return parseInt(result.rows[0].count);
    }
  }

  async getTableSchema(db, tableName, type) {
    if (type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    } else {
      const result = await this.pgClient.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `, [tableName]);
      return result.rows;
    }
  }

  async compareTableSchemas(tableName) {
    const sqliteSchema = await this.getTableSchema(this.sqliteDb, tableName, 'sqlite');
    const pgSchema = await this.getTableSchema(this.pgClient, tableName, 'postgres');
    
    const differences = [];
    
    // Compare column counts
    if (sqliteSchema.length !== pgSchema.length) {
      differences.push(`Column count mismatch: SQLite(${sqliteSchema.length}) vs PostgreSQL(${pgSchema.length})`);
    }
    
    // Compare column names and types
    for (const sqliteCol of sqliteSchema) {
      const pgCol = pgSchema.find(col => col.column_name === sqliteCol.name);
      
      if (!pgCol) {
        differences.push(`Column '${sqliteCol.name}' missing in PostgreSQL`);
        continue;
      }
      
      // Basic type comparison (simplified)
      const sqliteType = sqliteCol.type.toUpperCase();
      const pgType = pgCol.data_type.toUpperCase();
      
      if (!this.areTypesCompatible(sqliteType, pgType)) {
        differences.push(`Type mismatch for '${sqliteCol.name}': SQLite(${sqliteType}) vs PostgreSQL(${pgType})`);
      }
    }
    
    return differences;
  }

  areTypesCompatible(sqliteType, pgType) {
    const typeMap = {
      'INTEGER': ['INTEGER', 'BIGINT', 'SMALLINT'],
      'TEXT': ['TEXT', 'VARCHAR', 'CHAR'],
      'REAL': ['REAL', 'DOUBLE PRECISION', 'NUMERIC'],
      'BOOLEAN': ['BOOLEAN'],
      'DATETIME': ['TIMESTAMP', 'TIMESTAMP WITHOUT TIME ZONE'],
      'DATE': ['DATE'],
      'BLOB': ['BYTEA']
    };
    
    const compatiblePgTypes = typeMap[sqliteType] || [];
    return compatiblePgTypes.some(type => pgType.includes(type));
  }

  async sampleDataComparison(tableName, limit = 5) {
    // Get sample data from both databases
    const sqliteData = await new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM ${tableName} LIMIT ${limit}`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const pgData = await this.pgClient.query(`SELECT * FROM ${tableName} LIMIT ${limit}`);
    
    const differences = [];
    
    if (sqliteData.length !== pgData.rows.length) {
      differences.push(`Sample data count mismatch: SQLite(${sqliteData.length}) vs PostgreSQL(${pgData.rows.length})`);
    }
    
    // Compare structure of first row
    if (sqliteData.length > 0 && pgData.rows.length > 0) {
      const sqliteKeys = Object.keys(sqliteData[0]).sort();
      const pgKeys = Object.keys(pgData.rows[0]).sort();
      
      if (JSON.stringify(sqliteKeys) !== JSON.stringify(pgKeys)) {
        differences.push(`Column structure mismatch in sample data`);
      }
    }
    
    return differences;
  }

  async verifyTable(tableName) {
    console.log(`\nVerifying table: ${tableName}`);
    
    const result = {
      name: tableName,
      sqliteRecords: 0,
      postgresRecords: 0,
      recordsMatch: false,
      schemaDifferences: [],
      dataDifferences: [],
      status: 'pending'
    };
    
    try {
      // Get record counts
      result.sqliteRecords = await this.getRecordCount(this.sqliteDb, tableName, 'sqlite');
      result.postgresRecords = await this.getRecordCount(this.pgClient, tableName, 'postgres');
      
      // Check if records match
      result.recordsMatch = result.sqliteRecords === result.postgresRecords;
      
      // Compare schemas
      result.schemaDifferences = await this.compareTableSchemas(tableName);
      
      // Sample data comparison (only if records exist)
      if (result.sqliteRecords > 0 && result.postgresRecords > 0) {
        result.dataDifferences = await this.sampleDataComparison(tableName);
      }
      
      // Determine status
      if (result.recordsMatch && result.schemaDifferences.length === 0 && result.dataDifferences.length === 0) {
        result.status = 'perfect';
      } else if (result.recordsMatch) {
        result.status = 'good';
      } else {
        result.status = 'issues';
      }
      
      console.log(`  Records: SQLite(${result.sqliteRecords}) vs PostgreSQL(${result.postgresRecords}) - ${result.recordsMatch ? 'MATCH' : 'MISMATCH'}`);
      console.log(`  Status: ${result.status.toUpperCase()}`);
      
      if (result.schemaDifferences.length > 0) {
        console.log(`  Schema issues: ${result.schemaDifferences.length}`);
      }
      
      if (result.dataDifferences.length > 0) {
        console.log(`  Data issues: ${result.dataDifferences.length}`);
      }
      
    } catch (error) {
      result.status = 'error';
      result.error = error.message;
      console.log(`  ERROR: ${error.message}`);
    }
    
    return result;
  }

  async runVerification() {
    try {
      console.log('==========================================');
      console.log('    POSTGRESQL MIGRATION VERIFICATION');
      console.log('==========================================');
      
      await this.initialize();
      
      // Get table lists
      const sqliteTables = await this.getTableList(this.sqliteDb, 'sqlite');
      const postgresTables = await this.getTableList(this.pgClient, 'postgres');
      
      console.log(`\nTables found: SQLite(${sqliteTables.length}) vs PostgreSQL(${postgresTables.length})`);
      
      // Find tables in SQLite but not in PostgreSQL
      const missingInPostgres = sqliteTables.filter(table => !postgresTables.includes(table));
      if (missingInPostgres.length > 0) {
        console.log(`\nWARNING: ${missingInPostgres.length} tables missing in PostgreSQL:`);
        missingInPostgres.forEach(table => console.log(`  - ${table}`));
      }
      
      // Find tables in PostgreSQL but not in SQLite
      const extraInPostgres = postgresTables.filter(table => !sqliteTables.includes(table));
      if (extraInPostgres.length > 0) {
        console.log(`\nINFO: ${extraInPostgres.length} extra tables in PostgreSQL:`);
        extraInPostgres.forEach(table => console.log(`  - ${table}`));
      }
      
      // Verify common tables
      const commonTables = sqliteTables.filter(table => postgresTables.includes(table));
      this.verificationResults.summary.totalTables = commonTables.length;
      
      console.log(`\nVerifying ${commonTables.length} common tables...`);
      
      for (const tableName of commonTables) {
        const result = await this.verifyTable(tableName);
        this.verificationResults.tables[tableName] = result;
        
        // Update summary
        this.verificationResults.summary.totalRecords.sqlite += result.sqliteRecords;
        this.verificationResults.summary.totalRecords.postgres += result.postgresRecords;
        
        if (result.status === 'perfect' || result.status === 'good') {
          this.verificationResults.summary.matchedTables++;
        } else {
          this.verificationResults.summary.mismatchedTables.push(tableName);
        }
      }
      
      // Print summary
      this.printSummary();
      
      // Generate detailed report
      await this.generateReport();
      
    } catch (error) {
      console.error('Verification failed:', error);
    } finally {
      if (this.pgClient) await this.pgClient.end();
      if (this.sqliteDb) await this.db.close();
    }
  }

  printSummary() {
    console.log('\n==========================================');
    console.log('              VERIFICATION SUMMARY');
    console.log('==========================================');
    
    const summary = this.verificationResults.summary;
    
    console.log(`\nTables Verified: ${summary.matchedTables}/${summary.totalTables}`);
    console.log(`Total Records: SQLite(${summary.totalRecords.sqlite}) vs PostgreSQL(${summary.totalRecords.postgres})`);
    
    const recordMatch = summary.totalRecords.sqlite === summary.totalRecords.postgres;
    console.log(`Record Match: ${recordMatch ? 'YES' : 'NO'}`);
    
    if (summary.mismatchedTables.length > 0) {
      console.log(`\nTables with Issues (${summary.mismatchedTables.length}):`);
      summary.mismatchedTables.forEach(table => {
        const result = this.verificationResults.tables[table];
        console.log(`  - ${table}: ${result.status.toUpperCase()}`);
        if (result.error) console.log(`    Error: ${result.error}`);
      });
    }
    
    // Overall status
    const successRate = (summary.matchedTables / summary.totalTables) * 100;
    console.log(`\nSuccess Rate: ${successRate.toFixed(1)}%`);
    
    if (successRate >= 95 && recordMatch) {
      console.log('\nOVERALL STATUS: EXCELLENT - Migration appears successful! ');
    } else if (successRate >= 80) {
      console.log('\nOVERALL STATUS: GOOD - Migration mostly successful with minor issues');
    } else {
      console.log('\nOVERALL STATUS: NEEDS ATTENTION - Migration has significant issues');
    }
  }

  async generateReport() {
    const reportPath = path.join(__dirname, 'backups', `migration-verification-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    
    try {
      const report = {
        timestamp: new Date().toISOString(),
        config: config.postgres,
        summary: this.verificationResults.summary,
        tables: this.verificationResults.tables
      };
      
      require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\nDetailed report saved to: ${reportPath}`);
    } catch (error) {
      console.error('Error saving report:', error.message);
    }
  }
}

// Run verification
if (require.main === module) {
  const verifier = new MigrationVerifier();
  verifier.runVerification().catch(console.error);
}

module.exports = MigrationVerifier;
