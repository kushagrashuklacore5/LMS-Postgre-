const { Pool } = require('pg');
const sqliteDb = require('./sqlite-db');

class MasterDatabase {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.useSQLite = false;
  }

  async connect() {
    if (this.isConnected && this.pool) {
      return this.pool;
    }

    // SQLite unless PostgreSQL was asked for explicitly
    if (process.env.USE_POSTGRES !== 'true') {
      this.useSQLite = true;
      this.isConnected = true;
      return sqliteDb;
    }

    try {
      this.pool = new Pool({
        host: process.env.MASTER_DB_HOST || 'localhost',
        port: process.env.MASTER_DB_PORT || 5432,
        database: process.env.MASTER_DB_NAME || 'master_db',
        user: process.env.MASTER_DB_USER || 'postgres',
        password: process.env.MASTER_DB_PASSWORD || 'postgres',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Handle pool errors
      this.pool.on('error', (err, client) => {
        console.error('Unexpected error on idle master DB client', err);
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      console.log('✅ Master database connected successfully');
      console.log(`🗄️ Database: ${process.env.MASTER_DB_NAME || 'master_db'}`);
      
      return this.pool;
    } catch (error) {
      console.error('❌ Master database connection failed:', error.message);
      console.error('Please check your MASTER_DB_* environment variables');
      
      // Fallback to SQLite if PostgreSQL fails
      console.log('🔄 Falling back to SQLite for master database...');
      this.useSQLite = true;
      this.isConnected = true;
      return sqliteDb;
    }
  }

  async query(sql, params = []) {
    if (!this.isConnected) {
      await this.connect();
    }
    
    if (this.useSQLite) {
      // Use SQLite interface
      return new Promise((resolve, reject) => {
        if (sql.trim().startsWith('SELECT') || sql.trim().startsWith('select')) {
          sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows });
          });
        } else {
          sqliteDb.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ rows: [], rowCount: this.changes });
          });
        }
      });
    }
    
    // Use PostgreSQL
    return this.pool.query(sql, params);
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('Master database connection closed');
    }
  }
}

// Singleton instance
const masterDB = new MasterDatabase();
module.exports = masterDB;
