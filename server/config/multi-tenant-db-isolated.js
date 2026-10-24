
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// All SQLite files live beside the main LMS database, so pointing LMS_SQLITE_PATH
// at a test file moves these too.
const DATA_DIR = path.dirname(require('./dbPath').DB_PATH);

// Base directory for tenant databases
const TENANT_DB_DIR = path.join(DATA_DIR, 'tenants');

// Ensure tenant directory exists
if (!fs.existsSync(TENANT_DB_DIR)) {
  fs.mkdirSync(TENANT_DB_DIR, { recursive: true });
}

// Main database for superadmin management ONLY
const MAIN_DB_PATH = path.join(DATA_DIR, 'lms-main.sqlite');
const mainDb = new sqlite3.Database(MAIN_DB_PATH);

// Cache for tenant database connections
const tenantDbCache = new Map();

// Initialize main database (ONLY for superadmins)
function initializeMainDatabase() {
  console.log('=== Initializing Main Database (SuperAdmins Only) ===');
  
  mainDb.serialize(() => {
    // Users table - ONLY for superadmins
    mainDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        status TEXT DEFAULT 'active',
        database_id TEXT UNIQUE
      )
    `, (err) => {
      if (err) {
        console.error('Error creating main users table:', err);
      } else {
        console.log('Main users table created (superadmins only)');
      }
    });
  });
}

// Get tenant database connection
function getTenantDatabase(superadminId) {
  // Check cache first
  if (tenantDbCache.has(superadminId)) {
    return tenantDbCache.get(superadminId);
  }

  // Create tenant database path
  const tenantDbPath = path.join(TENANT_DB_DIR, `tenant_${superadminId}.sqlite`);
  
  console.log(`\n=== Loading Tenant Database for Superadmin ${superadminId} ===`);
  console.log(`Database path: ${tenantDbPath}`);
  
  // Create tenant database connection
  const tenantDb = new sqlite3.Database(tenantDbPath, (err) => {
    if (err) {
      console.error(`Error connecting to tenant database ${superadminId}:`, err);
      return;
    }
    console.log(`Tenant database connected for superadmin ${superadminId}`);
  });

  // Cache the connection
  tenantDbCache.set(superadminId, tenantDb);

  return tenantDb;
}

// Delete tenant database
function deleteTenantDatabase(superadminId) {
  const tenantDbPath = path.join(TENANT_DB_DIR, `tenant_${superadminId}.sqlite`);
  
  try {
    // Close database connection if cached
    if (tenantDbCache.has(superadminId)) {
      const db = tenantDbCache.get(superadminId);
      db.close((err) => {
        if (err) {
          console.error(`Error closing tenant database ${superadminId}:`, err);
        } else {
          console.log(`Tenant database ${superadminId} closed`);
        }
      });
      tenantDbCache.delete(superadminId);
    }

    // Delete database file
    if (fs.existsSync(tenantDbPath)) {
      fs.unlinkSync(tenantDbPath);
      console.log(`Tenant database ${superadminId} deleted successfully`);
      return true;
    } else {
      console.log(`Tenant database ${superadminId} file not found`);
      return false;
    }
  } catch (error) {
    console.error(`Error deleting tenant database ${superadminId}:`, error);
    return false;
  }
}

// Initialize main database on startup
initializeMainDatabase();

module.exports = {
  mainDb,
  getTenantDatabase,
  deleteTenantDatabase,
  TENANT_DB_DIR
};
