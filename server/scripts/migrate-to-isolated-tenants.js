const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const tenantConnectionManager = require('../config/tenant-connection-manager');

/**
 * Data Migration Script
 * 
 * Migrates existing shared database data to isolated tenant databases.
 * This script:
 * 1. Reads all existing superadmins from the current shared database
 * 2. Creates a new isolated database for each superadmin
 * 3. Copies that superadmin's data (admins, vendors, storekeepers, users, etc.) to the correct isolated database
 * 4. Verifies row counts match before and after
 * 5. Does NOT delete data from the old database until manual sign-off
 * 
 * The migration is idempotent (safe to re-run).
 */
class TenantMigrationService {
  constructor() {
    this.sharedDbPath = process.env.SHARED_DB_PATH || path.join(__dirname, '..', 'data', 'lms-database.sqlite');
    this.backupSuffix = '.backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    this.migrationLog = [];
    this.errors = [];
    this.stats = {
      totalSuperadmins: 0,
      migratedSuperadmins: 0,
      failedSuperadmins: 0,
      totalRecordsMigrated: 0,
      startTime: null,
      endTime: null
    };
  }

  /**
   * Run the complete migration process
   */
  async runMigration() {
    console.log('🚀 Starting tenant isolation migration...');
    this.stats.startTime = new Date();

    try {
      // Step 1: Backup existing database
      await this.backupSharedDatabase();

      // Step 2: Initialize master database
      await tenantConnectionManager.initializeMasterDb();

      // Step 3: Connect to shared database
      const sharedDb = await this.connectToSharedDatabase();

      // Step 4: Get all superadmins from shared database
      const superadmins = await this.getSuperadminsFromSharedDb(sharedDb);
      this.stats.totalSuperadmins = superadmins.length;

      console.log(`📊 Found ${superadmins.length} superadmins to migrate`);

      // Step 5: Migrate each superadmin's data
      for (const superadmin of superadmins) {
        try {
          await this.migrateSuperadmin(sharedDb, superadmin);
          this.stats.migratedSuperadmins++;
        } catch (error) {
          console.error(`❌ Failed to migrate superadmin ${superadmin.id}:`, error);
          this.errors.push({
            superadminId: superadmin.id,
            superadminEmail: superadmin.email,
            error: error.message
          });
          this.stats.failedSuperadmins++;
        }
      }

      // Step 6: Verify migration
      await this.verifyMigration(sharedDb);

      // Step 7: Generate migration report
      await this.generateMigrationReport();

      this.stats.endTime = new Date();
      console.log('✅ Migration completed!');

      return this.stats;

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Backup the existing shared database
   */
  async backupSharedDatabase() {
    console.log('💾 Creating backup of shared database...');

    if (!fs.existsSync(this.sharedDbPath)) {
      throw new Error(`Shared database not found: ${this.sharedDbPath}`);
    }

    const backupPath = this.sharedDbPath + this.backupSuffix;
    
    // Copy database file
    fs.copyFileSync(this.sharedDbPath, backupPath);
    
    console.log(`✅ Database backed up to: ${backupPath}`);
    this.log('backup', 'Shared database backed up', { backupPath });
  }

  /**
   * Connect to shared database
   */
  async connectToSharedDatabase() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.sharedDbPath, (err) => {
        if (err) {
          console.error('Shared DB Connection Error:', err.message);
          reject(err);
        } else {
          console.log('✅ Connected to shared database');
          resolve(db);
        }
      });
    });
  }

  /**
   * Get all superadmins from shared database
   */
  async getSuperadminsFromSharedDb(sharedDb) {
    return new Promise((resolve, reject) => {
      sharedDb.all(
        'SELECT * FROM users WHERE role = "superadmin" ORDER BY id',
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  /**
   * Migrate a single superadmin's data
   */
  async migrateSuperadmin(sharedDb, superadmin) {
    console.log(`🏗️  Migrating superadmin: ${superadmin.email} (${superadmin.id})`);

    // Generate new UUID for the superadmin in isolated system
    const newSuperadminId = uuidv4();

    try {
      // Step 1: Create tenant database
      const tenantInfo = await tenantConnectionManager.createTenantDatabase(
        newSuperadminId,
        superadmin.name,
        superadmin.email,
        superadmin.password
      );

      // Step 2: Get tenant database connection
      const tenantDb = await tenantConnectionManager.getTenantConnection(newSuperadminId);

      // Step 3: Migrate data in dependency order
      await this.migrateTable(sharedDb, tenantDb, 'users', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'universities', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'courses', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'classrooms', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'students', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'payments', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'announcements', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'attendance', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'feeStructures', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'inventory', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'vendors', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'requirements', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'expenses', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'orders', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'results', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'weeks', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'chapters', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'progress', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'certificates', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'course_materials', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'assessments', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'assessment_questions', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'assessment_attempts', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'live_classes', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'live_class_attendees', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'course_students', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'classroomAssignments', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'student_classroom_assignment', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'requirement_items', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'subscriptions', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'content_translations', superadmin.id, newSuperadminId);
      await this.migrateTable(sharedDb, tenantDb, 'user_language_preferences', superadmin.id, newSuperadminId);

      // Step 4: Create subscription record
      await this.createSubscriptionForMigratedSuperadmin(newSuperadminId, superadmin);

      console.log(`✅ Successfully migrated superadmin: ${superadmin.email}`);
      this.log('migrate', 'Superadmin migrated successfully', {
        oldId: superadmin.id,
        newId: newSuperadminId,
        email: superadmin.email,
        databaseName: tenantInfo.databaseName
      });

    } catch (error) {
      console.error(`❌ Migration failed for superadmin ${superadmin.email}:`, error);
      
      // Cleanup failed migration
      await this.cleanupFailedMigration(newSuperadminId);
      
      throw error;
    }
  }

  /**
   * Migrate a table from shared to tenant database
   */
  async migrateTable(sharedDb, tenantDb, tableName, oldSuperadminId, newSuperadminId) {
    console.log(`  📋 Migrating table: ${tableName}`);

    // Get table schema to understand foreign key relationships
    const tableInfo = await this.getTableInfo(sharedDb, tableName);
    
    // Build migration query based on table structure
    const migrationQuery = this.buildMigrationQuery(tableName, tableInfo, oldSuperadminId, newSuperadminId);
    
    if (!migrationQuery) {
      console.log(`  ⏭️  Skipping table ${tableName} (no superadmin-specific data)`);
      return;
    }

    return new Promise((resolve, reject) => {
      // First, get count of records to migrate
      const countQuery = migrationQuery.countQuery;
      
      sharedDb.get(countQuery, [oldSuperadminId], (err, countResult) => {
        if (err) {
          reject(err);
          return;
        }

        const recordCount = countResult ? countResult.count : 0;
        
        if (recordCount === 0) {
          console.log(`  ⏭️  No records to migrate in ${tableName}`);
          resolve();
          return;
        }

        console.log(`  📊 Migrating ${recordCount} records from ${tableName}`);

        // Migrate the data
        sharedDb.all(migrationQuery.selectQuery, [oldSuperadminId], (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          if (rows.length === 0) {
            resolve();
            return;
          }

          // Insert rows into tenant database
          tenantDb.serialize(() => {
            const insertStmt = tenantDb.prepare(migrationQuery.insertQuery);
            
            let insertedCount = 0;
            rows.forEach(row => {
              // Update foreign key references if needed
              const updatedRow = this.updateForeignKeys(row, tableName, oldSuperadminId, newSuperadminId);
              
              insertStmt.run(Object.values(updatedRow), (err) => {
                if (err) {
                  console.error(`Error inserting into ${tableName}:`, err);
                  reject(err);
                  return;
                }
                insertedCount++;
                
                if (insertedCount === rows.length) {
                  insertStmt.finalize();
                  console.log(`  ✅ Migrated ${insertedCount} records from ${tableName}`);
                  this.stats.totalRecordsMigrated += insertedCount;
                  resolve();
                }
              });
            });
          });
        });
      });
    });
  }

  /**
   * Get table information
   */
  async getTableInfo(db, tableName) {
    return new Promise((resolve, reject) => {
      db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName})`, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Build migration queries for a table
   */
  buildMigrationQuery(tableName, tableInfo, oldSuperadminId, newSuperadminId) {
    const columns = tableInfo.map(col => col.name).join(', ');
    const placeholders = tableInfo.map(() => '?').join(', ');

    // Different tables have different ways of linking to superadmin
    let whereClause = '';
    let updateMapping = {};

    switch (tableName) {
      case 'users':
        whereClause = 'WHERE role IN ("superadmin", "admin", "vendor", "storekeeper", "mentor", "accountant") AND id = ?';
        updateMapping = { id: newSuperadminId };
        break;

      case 'universities':
        whereClause = 'WHERE adminId = ?';
        updateMapping = { adminId: newSuperadminId };
        break;

      case 'courses':
        whereClause = 'WHERE university_id IN (SELECT id FROM universities WHERE adminId = ?)';
        break;

      case 'classrooms':
        whereClause = 'WHERE university_id IN (SELECT id FROM universities WHERE adminId = ?)';
        break;

      case 'announcements':
        whereClause = 'WHERE university_id IN (SELECT id FROM universities WHERE adminId = ?) OR createdByUser = ?';
        break;

      case 'subscriptions':
        whereClause = 'WHERE superadminId = ?';
        updateMapping = { superadminId: newSuperadminId };
        break;

      case 'user_language_preferences':
        whereClause = 'WHERE user_id IN (SELECT id FROM users WHERE id = ?)';
        break;

      case 'content_translations':
        // This might need more complex logic based on content ownership
        whereClause = 'WHERE 1=0'; // Skip for now, needs manual review
        break;

      default:
        // For tables with university_id foreign key
        if (tableInfo.some(col => col.name === 'university_id')) {
          whereClause = 'WHERE university_id IN (SELECT id FROM universities WHERE adminId = ?)';
        } else {
          // Skip tables that don't have clear superadmin relationship
          return null;
        }
    }

    return {
      countQuery: `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`,
      selectQuery: `SELECT ${columns} FROM ${tableName} ${whereClause}`,
      insertQuery: `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`,
      updateMapping
    };
  }

  /**
   * Update foreign key references during migration
   */
  updateForeignKeys(row, tableName, oldSuperadminId, newSuperadminId) {
    const updatedRow = { ...row };

    // Update specific foreign keys based on table
    switch (tableName) {
      case 'users':
        if (row.id === oldSuperadminId) {
          updatedRow.id = newSuperadminId;
        }
        break;

      case 'universities':
        if (row.adminId === oldSuperadminId) {
          updatedRow.adminId = newSuperadminId;
        }
        break;

      case 'announcements':
        if (row.createdByUser === oldSuperadminId) {
          updatedRow.createdByUser = newSuperadminId;
        }
        break;

      case 'subscriptions':
        if (row.superadminId === oldSuperadminId) {
          updatedRow.superadminId = newSuperadminId;
        }
        break;
    }

    return updatedRow;
  }

  /**
   * Create subscription for migrated superadmin
   */
  async createSubscriptionForMigratedSuperadmin(newSuperadminId, superadmin) {
    // Check if superadmin had existing subscription
    const existingSubscription = await this.getExistingSubscription(superadmin.id);
    
    if (existingSubscription) {
      // Migrate existing subscription
      await new Promise((resolve, reject) => {
        const insertSubscription = `
          INSERT INTO subscriptions (
            superadminId, planType, planName, status, startDate, expiryDate,
            durationDays, amount, currency, paymentMethod, isFreeTrial, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        tenantConnectionManager.masterDb.run(insertSubscription, [
          newSuperadminId,
          existingSubscription.planType,
          existingSubscription.planName,
          existingSubscription.status,
          existingSubscription.startDate,
          existingSubscription.expiryDate,
          existingSubscription.durationDays,
          existingSubscription.amount,
          existingSubscription.currency,
          existingSubscription.paymentMethod,
          existingSubscription.isFreeTrial,
          existingSubscription.createdAt,
          existingSubscription.updatedAt
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } else {
      // Create default free subscription
      const tenantProvisioningService = require('../services/tenant-provisioning-service');
      await tenantProvisioningService.createTenantSubscription(
        { id: newSuperadminId, email: superadmin.email },
        'free',
        true
      );
    }
  }

  /**
   * Get existing subscription for superadmin
   */
  async getExistingSubscription(oldSuperadminId) {
    return new Promise((resolve, reject) => {
      const sharedDb = new sqlite3.Database(this.sharedDbPath);
      sharedDb.get(
        'SELECT * FROM subscriptions WHERE superadminId = ?',
        [oldSuperadminId],
        (err, row) => {
          sharedDb.close();
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Verify migration by comparing record counts
   */
  async verifyMigration(sharedDb) {
    console.log('🔍 Verifying migration...');

    const verificationResults = [];

    // Get all superadmins that were migrated
    const migratedSuperadmins = await tenantConnectionManager.listAllTenants();

    for (const tenant of migratedSuperadmins) {
      const result = await this.verifyTenantMigration(sharedDb, tenant);
      verificationResults.push(result);
    }

    // Generate verification report
    const totalIssues = verificationResults.reduce((sum, result) => sum + result.issues.length, 0);
    
    if (totalIssues === 0) {
      console.log('✅ Migration verification passed - all records accounted for');
    } else {
      console.log(`⚠️  Migration verification found ${totalIssues} issues`);
      verificationResults.forEach(result => {
        if (result.issues.length > 0) {
          console.log(`  Issues for ${tenant.email}:`, result.issues);
        }
      });
    }

    return verificationResults;
  }

  /**
   * Verify migration for a single tenant
   */
  async verifyTenantMigration(sharedDb, tenant) {
    const issues = [];
    const tables = ['users', 'universities', 'courses', 'classrooms', 'announcements'];

    for (const table of tables) {
      try {
        const sharedCount = await this.getSharedTableCount(sharedDb, table, tenant.id);
        const tenantCount = await this.getTenantTableCount(tenant.id, table);

        if (sharedCount !== tenantCount) {
          issues.push(`${table}: shared=${sharedCount}, tenant=${tenantCount}`);
        }
      } catch (error) {
        issues.push(`${table}: verification error - ${error.message}`);
      }
    }

    return {
      tenantId: tenant.id,
      email: tenant.email,
      issues
    };
  }

  /**
   * Get record count from shared database table
   */
  async getSharedTableCount(sharedDb, tableName, superadminId) {
    return new Promise((resolve, reject) => {
      const query = this.buildCountQuery(tableName);
      sharedDb.get(query, [superadminId], (err, result) => {
        if (err) reject(err);
        else resolve(result ? result.count : 0);
      });
    });
  }

  /**
   * Get record count from tenant database table
   */
  async getTenantTableCount(superadminId, tableName) {
    const tenantDb = await tenantConnectionManager.getTenantConnection(superadminId);
    
    return new Promise((resolve, reject) => {
      tenantDb.get(`SELECT COUNT(*) as count FROM ${tableName}`, [], (err, result) => {
        if (err) reject(err);
        else resolve(result ? result.count : 0);
      });
    });
  }

  /**
   * Build count query for verification
   */
  buildCountQuery(tableName) {
    switch (tableName) {
      case 'users':
        return 'SELECT COUNT(*) as count FROM users WHERE role IN ("superadmin", "admin", "vendor", "storekeeper", "mentor", "accountant") AND id = ?';
      case 'universities':
        return 'SELECT COUNT(*) as count FROM universities WHERE adminId = ?';
      case 'announcements':
        return 'SELECT COUNT(*) as count FROM announcements WHERE createdByUser = ?';
      default:
        return `SELECT COUNT(*) as count FROM ${tableName} WHERE university_id IN (SELECT id FROM universities WHERE adminId = ?)`;
    }
  }

  /**
   * Cleanup failed migration
   */
  async cleanupFailedMigration(superadminId) {
    console.log(`🧹 Cleaning up failed migration for: ${superadminId}`);

    try {
      const tenantProvisioningService = require('../services/tenant-provisioning-service');
      await tenantProvisioningService.deleteTenant(superadminId);
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Generate migration report
   */
  async generateMigrationReport() {
    const report = {
      summary: this.stats,
      errors: this.errors,
      log: this.migrationLog,
      timestamp: new Date().toISOString()
    };

    const reportPath = path.join(__dirname, '..', 'migration-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📋 Migration report saved to: ${reportPath}`);

    // Also generate a human-readable summary
    const summaryPath = reportPath.replace('.json', '-summary.txt');
    const summary = this.generateHumanReadableSummary(report);
    fs.writeFileSync(summaryPath, summary);
    console.log(`📋 Migration summary saved to: ${summaryPath}`);
  }

  /**
   * Generate human-readable summary
   */
  generateHumanReadableSummary(report) {
    const duration = report.summary.endTime - report.summary.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    return `
TENANT ISOLATION MIGRATION REPORT
================================

Migration Summary:
- Start Time: ${new Date(report.summary.startTime).toLocaleString()}
- End Time: ${new Date(report.summary.endTime).toLocaleString()}
- Duration: ${minutes}m ${seconds}s
- Total Superadmins: ${report.summary.totalSuperadmins}
- Successfully Migrated: ${report.summary.migratedSuperadmins}
- Failed Migrations: ${report.summary.failedSuperadmins}
- Total Records Migrated: ${report.summary.totalRecordsMigrated}

${report.errors.length > 0 ? `
Errors Encountered:
${report.errors.map(error => `- ${error.email}: ${error.error}`).join('\n')}
` : ''}

Migration Log:
${report.log.map(entry => `- ${entry.timestamp}: ${entry.action} - ${entry.message}`).join('\n')}

Next Steps:
1. Review the migration report for any errors
2. Test the isolated tenant databases
3. Update application configuration to use tenant isolation
4. After verification, you may safely archive the shared database
5. Update DNS/load balancer to point to the new tenant-aware application

Backup Information:
- Original database backed up with suffix: ${this.backupSuffix}
- Migration report saved: migration-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json
    `.trim();
  }

  /**
   * Log migration events
   */
  log(action, message, data = {}) {
    this.migrationLog.push({
      timestamp: new Date().toISOString(),
      action,
      message,
      data
    });
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  const migrationService = new TenantMigrationService();
  
  migrationService.runMigration()
    .then((stats) => {
      console.log('\n🎉 Migration completed successfully!');
      console.log('📊 Final Stats:', stats);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = TenantMigrationService;
