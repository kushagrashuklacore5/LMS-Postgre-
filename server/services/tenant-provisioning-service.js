const tenantConnectionManager = require('../config/tenant-connection-manager');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Tenant Provisioning Service
 * 
 * Handles the creation and provisioning of new tenant databases
 * when a new superadmin is registered.
 */
class TenantProvisioningService {
  constructor() {
    this.defaultSubscriptionPlan = process.env.DEFAULT_SUBSCRIPTION_PLAN || 'free';
    this.trialDurationDays = parseInt(process.env.TRIAL_DURATION_DAYS) || 30;
  }

  /**
   * Create a new tenant with superadmin
   * This is called when a new superadmin registers
   */
  async createTenant(superadminData) {
    const {
      name,
      email,
      password,
      subscriptionPlan = this.defaultSubscriptionPlan,
      isFreeTrial = true
    } = superadminData;

    const superadminId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      console.log(`🏗️  Creating tenant for superadmin: ${email}`);

      // 1. Create tenant database
      const tenantInfo = await tenantConnectionManager.createTenantDatabase(
        superadminId,
        name,
        email,
        hashedPassword
      );

      // 2. Initialize tenant database with default data
      await this.initializeTenantData(tenantInfo, superadminId);

      // 3. Create subscription record
      await this.createTenantSubscription(tenantInfo, subscriptionPlan, isFreeTrial);

      // 4. Create default university for the tenant
      await this.createDefaultUniversity(tenantInfo, superadminId);

      console.log(`✅ Tenant created successfully: ${tenantInfo.databaseName}`);
      
      return {
        success: true,
        tenant: {
          id: superadminId,
          name,
          email,
          databaseName: tenantInfo.databaseName,
          databasePath: tenantInfo.databasePath,
          subscriptionPlan,
          isFreeTrial,
          createdAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`❌ Failed to create tenant for ${email}:`, error);
      
      // Cleanup on failure
      await this.cleanupFailedTenant(superadminId, tenantInfo?.databasePath);
      
      throw error;
    }
  }

  /**
   * Initialize tenant database with default data
   */
  async initializeTenantData(tenantInfo, superadminId) {
    console.log(`🔧 Initializing data for tenant: ${tenantInfo.databaseName}`);

    // Get tenant database connection
    const tenantDb = await tenantConnectionManager.getTenantConnection(superadminId);

    return new Promise((resolve, reject) => {
      tenantDb.serialize(() => {
        // Insert the superadmin user into the tenant database
        const insertSuperadmin = `
          INSERT INTO users (id, name, email, password, role, isApproved, subscriptionPlan, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        tenantDb.run(insertSuperadmin, [
          superadminId,
          tenantInfo.name,
          tenantInfo.email,
          tenantInfo.password, // Already hashed
          'superadmin',
          1, // Auto-approved
          'free' // Default plan, will be updated by subscription
        ], function(err) {
          if (err) {
            console.error('Error inserting superadmin:', err);
            reject(err);
            return;
          }

          console.log(`✅ Superadmin user created in tenant database`);

          // Insert default system data
          Promise.all([
            insertDefaultSystemData(tenantDb, superadminId),
            insertDefaultFeeStructures(tenantDb),
            insertDefaultInventory(tenantDb)
          ]).then(() => {
            console.log(`✅ Default data initialized for tenant: ${tenantInfo.databaseName}`);
            resolve();
          }).catch(reject);
        });
      });
    });
  }

  /**
   * Create subscription record for the tenant
   */
  async createTenantSubscription(tenantInfo, planType, isFreeTrial) {
    console.log(`💳 Creating subscription for tenant: ${tenantInfo.databaseName}`);

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(startDate.getDate() + (isFreeTrial ? this.trialDurationDays : 30));

    const subscriptionData = {
      superadminId: tenantInfo.id,
      planType: planType.toLowerCase(),
      planName: planType.charAt(0).toUpperCase() + planType.slice(1) + ' Plan',
      status: 'active',
      startDate: startDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      durationDays: isFreeTrial ? this.trialDurationDays : 30,
      amount: isFreeTrial ? 0 : this.getPlanPrice(planType),
      currency: 'INR',
      paymentMethod: isFreeTrial ? 'free_trial' : null,
      isFreeTrial: isFreeTrial ? 1 : 0
    };

    return new Promise((resolve, reject) => {
      const insertSubscription = `
        INSERT INTO subscriptions (
          superadminId, planType, planName, status, startDate, expiryDate,
          durationDays, amount, currency, paymentMethod, isFreeTrial, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      tenantConnectionManager.masterDb.run(insertSubscription, [
        subscriptionData.superadminId,
        subscriptionData.planType,
        subscriptionData.planName,
        subscriptionData.status,
        subscriptionData.startDate,
        subscriptionData.expiryDate,
        subscriptionData.durationDays,
        subscriptionData.amount,
        subscriptionData.currency,
        subscriptionData.paymentMethod,
        subscriptionData.isFreeTrial
      ], function(err) {
        if (err) {
          console.error('Error creating subscription:', err);
          reject(err);
        } else {
          console.log(`✅ Subscription created: ${planType} plan for ${tenantInfo.email}`);
          resolve(subscriptionData);
        }
      });
    });
  }

  /**
   * Create default university for the tenant
   */
  async createDefaultUniversity(tenantInfo, superadminId) {
    console.log(`🏫 Creating default university for tenant: ${tenantInfo.databaseName}`);

    const tenantDb = await tenantConnectionManager.getTenantConnection(superadminId);

    return new Promise((resolve, reject) => {
      const insertUniversity = `
        INSERT INTO universities (name, area, adminId, subscriptionPlan, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      tenantDb.run(insertUniversity, [
        `${tenantInfo.name} University`,
        'Default Location',
        superadminId,
        this.defaultSubscriptionPlan
      ], function(err) {
        if (err) {
          console.error('Error creating default university:', err);
          reject(err);
        } else {
          console.log(`✅ Default university created for tenant: ${tenantInfo.databaseName}`);
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Insert default system data
   */
  async insertDefaultSystemData(tenantDb, superadminId) {
    const defaultData = [
      // Default announcements
      [
        'Welcome to Your LMS!',
        'Welcome to the Learning Management System. This is your personalized platform for managing education.',
        null,
        superadminId,
        'superadmin',
        'all',
        'normal',
        null,
        '[]',
        1 // Default university ID
      ]
    ];

    const insertAnnouncement = `
      INSERT INTO announcements (
        university_id, title, content, courseId, createdByUser, createdByRole,
        publishFor, priority, attachments, readBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    for (const announcement of defaultData) {
      await new Promise((resolve, reject) => {
        tenantDb.run(insertAnnouncement, announcement, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Insert default fee structures
   */
  async insertDefaultFeeStructures(tenantDb) {
    const defaultFeeStructures = [
      ['Primary', '1-5', 5000, 1000, 500, 300, 200, 500, 7500],
      ['Middle', '6-8', 6000, 1200, 600, 400, 250, 600, 9050],
      ['High', '9-10', 7000, 1500, 700, 500, 300, 700, 10700],
      ['Higher Secondary', '11-12', 8000, 1800, 800, 600, 350, 800, 12350]
    ];

    const insertFeeStructure = `
      INSERT INTO feeStructures (
        university_id, category, grade, tuitionFee, transportFee, computerLabFee,
        libraryFee, sportsFee, examinationFee, miscellaneousFee, totalFee, createdAt
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    for (const feeStructure of defaultFeeStructures) {
      await new Promise((resolve, reject) => {
        tenantDb.run(insertFeeStructure, feeStructure, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Insert default inventory items
   */
  async insertDefaultInventory(tenantDb) {
    const defaultInventory = [
      ['Whiteboard Markers', 'Stationery', 50, 15, null, '2024-01-01', 'Black markers for whiteboards'],
      ['Chalk Boxes', 'Stationery', 20, 5, null, '2024-01-01', 'White chalk for classroom use'],
      ['Notebooks', 'Stationery', 200, 20, null, '2024-01-01', 'Student notebooks'],
      ['Desk Chairs', 'Furniture', 50, 500, null, '2024-01-01', 'Student chairs'],
      ['Desks', 'Furniture', 50, 800, null, '2024-01-01', 'Student desks']
    ];

    const insertInventory = `
      INSERT INTO inventory (
        itemName, category, quantity, unitPrice, vendorId, purchaseDate, description, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    for (const item of defaultInventory) {
      await new Promise((resolve, reject) => {
        tenantDb.run(insertInventory, item, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }

  /**
   * Get plan price
   */
  getPlanPrice(planType) {
    const prices = {
      free: 0,
      basic: 999,
      standard: 1999,
      professional: 4999,
      enterprise: 9999
    };
    return prices[planType.toLowerCase()] || 0;
  }

  /**
   * Cleanup failed tenant creation
   */
  async cleanupFailedTenant(superadminId, databasePath) {
    console.log(`🧹 Cleaning up failed tenant: ${superadminId}`);

    try {
      // Remove from master database
      await new Promise((resolve, reject) => {
        tenantConnectionManager.masterDb.run(
          'DELETE FROM superadmin_registry WHERE id = ?',
          [superadminId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Remove database file if it exists
      if (databasePath && require('fs').existsSync(databasePath)) {
        require('fs').unlinkSync(databasePath);
        console.log(`🗑️  Deleted database file: ${databasePath}`);
      }

      // Remove from connection cache
      if (tenantConnectionManager.connections.has(superadminId)) {
        const connection = tenantConnectionManager.connections.get(superadminId);
        connection.db.close();
        tenantConnectionManager.connections.delete(superadminId);
      }

      console.log(`✅ Cleanup completed for failed tenant: ${superadminId}`);
    } catch (error) {
      console.error(`❌ Error during cleanup for ${superadminId}:`, error);
    }
  }

  /**
   * Upgrade tenant subscription
   */
  async upgradeTenantSubscription(superadminId, newPlanType, paymentInfo) {
    console.log(`⬆️  Upgrading subscription for tenant: ${superadminId} to ${newPlanType}`);

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(startDate.getDate() + 30);

    const subscriptionData = {
      superadminId,
      planType: newPlanType.toLowerCase(),
      planName: newPlanType.charAt(0).toUpperCase() + newPlanType.slice(1) + ' Plan',
      status: 'active',
      startDate: startDate.toISOString(),
      expiryDate: expiryDate.toISOString(),
      durationDays: 30,
      amount: this.getPlanPrice(newPlanType),
      currency: 'INR',
      paymentMethod: paymentInfo.method,
      paymentId: paymentInfo.paymentId,
      isFreeTrial: 0
    };

    return new Promise((resolve, reject) => {
      // Update existing subscription or create new one
      const upsertSubscription = `
        INSERT OR REPLACE INTO subscriptions (
          superadminId, planType, planName, status, startDate, expiryDate,
          durationDays, amount, currency, paymentMethod, paymentId, isFreeTrial, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      tenantConnectionManager.masterDb.run(upsertSubscription, [
        subscriptionData.superadminId,
        subscriptionData.planType,
        subscriptionData.planName,
        subscriptionData.status,
        subscriptionData.startDate,
        subscriptionData.expiryDate,
        subscriptionData.durationDays,
        subscriptionData.amount,
        subscriptionData.currency,
        subscriptionData.paymentMethod,
        subscriptionData.paymentId,
        subscriptionData.isFreeTrial
      ], function(err) {
        if (err) {
          console.error('Error upgrading subscription:', err);
          reject(err);
        } else {
          console.log(`✅ Subscription upgraded for tenant: ${superadminId}`);
          resolve(subscriptionData);
        }
      });
    });
  }

  /**
   * Cancel tenant subscription
   */
  async cancelTenantSubscription(superadminId, reason) {
    console.log(`❌ Cancelling subscription for tenant: ${superadminId}`);

    return new Promise((resolve, reject) => {
      const cancelSubscription = `
        UPDATE subscriptions 
        SET status = 'cancelled', updatedAt = CURRENT_TIMESTAMP
        WHERE superadminId = ? AND status = 'active'
      `;

      tenantConnectionManager.masterDb.run(cancelSubscription, [superadminId], function(err) {
        if (err) {
          console.error('Error cancelling subscription:', err);
          reject(err);
        } else {
          console.log(`✅ Subscription cancelled for tenant: ${superadminId}`);
          resolve({ cancelled: true, reason });
        }
      });
    });
  }

  /**
   * Get tenant information
   */
  async getTenantInfo(superadminId) {
    return await tenantConnectionManager.getTenantInfo(superadminId);
  }

  /**
   * List all tenants (for admin purposes)
   */
  async listAllTenants() {
    return new Promise((resolve, reject) => {
      tenantConnectionManager.masterDb.all(
        'SELECT id, name, email, database_name, status, created_at FROM superadmin_registry ORDER BY created_at DESC',
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
   * Delete tenant (admin only - complete removal)
   */
  async deleteTenant(superadminId) {
    console.log(`🗑️  Deleting tenant: ${superadminId}`);

    try {
      const tenantInfo = await this.getTenantInfo(superadminId);
      if (!tenantInfo) {
        throw new Error('Tenant not found');
      }

      // Close tenant connection
      if (tenantConnectionManager.connections.has(superadminId)) {
        const connection = tenantConnectionManager.connections.get(superadminId);
        connection.db.close();
        tenantConnectionManager.connections.delete(superadminId);
      }

      // Delete database file
      if (require('fs').existsSync(tenantInfo.database_path)) {
        require('fs').unlinkSync(tenantInfo.database_path);
      }

      // Remove from master database
      await new Promise((resolve, reject) => {
        tenantConnectionManager.masterDb.run(
          'DELETE FROM superadmin_registry WHERE id = ?',
          [superadminId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      console.log(`✅ Tenant deleted: ${superadminId}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Error deleting tenant ${superadminId}:`, error);
      throw error;
    }
  }
}

module.exports = new TenantProvisioningService();
