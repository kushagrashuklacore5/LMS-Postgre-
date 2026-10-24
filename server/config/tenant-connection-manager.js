const { Pool } = require('pg');
const { LRUCache } = require('lru-cache');

/**
 * PostgreSQL Tenant Connection Manager
 * 
 * Manages isolated PostgreSQL database connections per superadmin tenant.
 * Each superadmin gets their own dedicated PostgreSQL database with connection pooling.
 */
class TenantConnectionManager {
  constructor() {
    this.pools = new LRUCache({
      max: parseInt(process.env.TENANT_POOL_CACHE_SIZE) || 50,
      ttl: parseInt(process.env.TENANT_DB_POOL_IDLE_TIMEOUT) || 30000,
      dispose: (value, key) => {
        console.log(`🔌 Evicting tenant pool: ${key}`);
        value.pool.end();
      }
    });
    this.masterDB = null;
    this.config = {
      maxPoolSize: parseInt(process.env.TENANT_DB_POOL_MAX) || 10,
      idleTimeout: parseInt(process.env.TENANT_DB_POOL_IDLE_TIMEOUT) || 30000,
      connectTimeout: parseInt(process.env.TENANT_DB_CONNECT_TIMEOUT) || 5000,
      host: process.env.TENANT_DB_HOST || 'localhost',
      port: process.env.TENANT_DB_PORT || 5432,
      user: process.env.TENANT_DB_USER || 'postgres',
      password: process.env.TENANT_DB_PASSWORD || 'postgres',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  }

  /**
   * Set master database instance
   */
  setMasterDB(masterDB) {
    this.masterDB = masterDB;
  }

  /**
   * Get tenant database pool for a superadmin
   */
  async getPool(superadminId) {
    // Check cache first
    if (this.pools.has(superadminId)) {
      const poolInfo = this.pools.get(superadminId);
      poolInfo.lastUsed = Date.now();
      return poolInfo.pool;
    }

    // Look up tenant info from master DB
    const tenantInfo = await this.getTenantInfo(superadminId);
    if (!tenantInfo) {
      throw new Error(`Tenant not found for superadmin: ${superadminId}`);
    }

    // Create new pool
    const pool = await this.createTenantPool(tenantInfo);
    
    // Cache the pool
    this.pools.set(superadminId, {
      pool,
      lastUsed: Date.now(),
      tenantInfo
    });

    return pool;
  }

  /**
   * Get tenant information from master database
   */
  async getTenantInfo(superadminId) {
    try {
      const result = await this.masterDB.query(
        'SELECT * FROM superadmins WHERE id = $1 AND status = $2',
        [superadminId, 'active']
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting tenant info:', error);
      throw error;
    }
  }

  /**
   * Create a new tenant database pool
   */
  async createTenantPool(tenantInfo) {
    const pool = new Pool({
      host: tenantInfo.db_host || this.config.host,
      port: tenantInfo.db_port || this.config.port,
      database: tenantInfo.db_name,
      user: tenantInfo.db_user || this.config.user,
      password: tenantInfo.db_password,
      max: this.config.maxPoolSize,
      idleTimeoutMillis: this.config.idleTimeout,
      connectionTimeoutMillis: this.config.connectTimeout,
      ssl: this.config.ssl
    });

    // Handle pool errors
    pool.on('error', (err, client) => {
      console.error(`Unexpected error on idle tenant client (${tenantInfo.id}):`, err);
    });

    // Test connection
    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      console.log(`✅ Tenant pool connected: ${tenantInfo.id} -> ${tenantInfo.db_name}`);
    } finally {
      client.release();
    }

    return pool;
  }

  /**
   * Create a new tenant database and register it
   */
  async createTenantDatabase(superadminId, name, email, passwordHash) {
    const dbName = `tenant_${superadminId}_${Date.now()}`;
    
    try {
      // First, create the database using the master connection
      await this.masterDB.query(`CREATE DATABASE "${dbName}"`);
      
      // Connect to the new database and run migrations
      const tempPool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: dbName,
        user: this.config.user,
        password: this.config.password,
        max: 1,
        ssl: this.config.ssl
      });

      // Run migrations on the new database
      await this.runTenantMigrations(tempPool);
      await tempPool.end();

      // Register tenant in master database
      const result = await this.masterDB.query(`
        INSERT INTO superadmins 
        (id, email, password_hash, db_name, db_host, db_port, db_user, db_password) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [superadminId, email, passwordHash, dbName, this.config.host, this.config.port, this.config.user, this.config.password]);

      console.log(`✅ Tenant database created: ${dbName}`);
      return result.rows[0];
    } catch (error) {
      // If anything fails, try to clean up the database
      try {
        await this.masterDB.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      } catch (cleanupError) {
        console.error('Failed to cleanup database:', cleanupError);
      }
      throw error;
    }
  }

  /**
   * Run all tenant migrations on a new database
   */
  async runTenantMigrations(pool) {
    const migrationFiles = [
      'migration_001_create_universities.sql',
      'migration_002_create_users.sql',
      'migration_003_create_subscription_plans.sql',
      'migration_004_create_subscription_features.sql',
      'migration_005_create_superadmin_subscriptions.sql'
    ];

    const client = await pool.connect();
    try {
      for (const migrationFile of migrationFiles) {
        const migrationPath = require('path').join(__dirname, '..', 'database', 'migrations', migrationFile);
        const fs = require('fs');
        
        if (fs.existsSync(migrationPath)) {
          const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
          await client.query(migrationSQL);
          console.log(`✅ Migration applied: ${migrationFile}`);
        } else {
          console.warn(`⚠️ Migration file not found: ${migrationPath}`);
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      activePools: this.pools.size,
      maxPools: this.pools.max,
      config: this.config,
      tenants: Array.from(this.pools.entries()).map(([id, info]) => ({
        superadminId: id,
        lastUsed: info.lastUsed,
        databaseName: info.tenantInfo?.db_name
      }))
    };
  }

  /**
   * Close all tenant pools
   */
  async closeAll() {
    const closePromises = [];
    
    for (const [superadminId, poolInfo] of this.pools) {
      closePromises.push(
        poolInfo.pool.end().catch(err => {
          console.error(`Error closing tenant pool ${superadminId}:`, err);
        })
      );
    }
    
    await Promise.all(closePromises);
    this.pools.clear();
    console.log('🔌 All tenant pools closed');
  }
}

// Singleton instance
const tenantConnectionManager = new TenantConnectionManager();

module.exports = tenantConnectionManager;
