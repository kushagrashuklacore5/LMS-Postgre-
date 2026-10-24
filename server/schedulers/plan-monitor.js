const db = require('../config/database-switch');
const planInheritance = require('../controllers/plan-inheritance-controller');

/**
 * Automated Plan Monitoring System
 * Continuously monitors SuperAdmin plan changes and propagates them to all users
 */

class PlanMonitor {
  constructor() {
    this.lastCheckTime = new Date();
    this.checkInterval = 30000; // Check every 30 seconds
    this.isRunning = false;
    this.planCache = new Map(); // Cache to detect changes
  }

  /**
   * Start the plan monitoring service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Plan monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Automated Plan Monitoring System...');
    console.log(`📅 Checking for plan changes every ${this.checkInterval / 1000} seconds`);

    // Initial load
    this.loadCurrentPlans().then(() => {
      // Start periodic monitoring
      this.monitorInterval = setInterval(() => {
        this.checkForPlanChanges();
      }, this.checkInterval);
    });
  }

  /**
   * Stop the plan monitoring service
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Plan monitor is not running');
      return;
    }

    this.isRunning = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    console.log('🛑 Plan monitoring service stopped');
  }

  /**
   * Load current SuperAdmin plans into cache
   */
  async loadCurrentPlans() {
    try {
      const subscriptions = await this.getAllSubscriptions();
      
      this.planCache.clear();
      subscriptions.forEach(sub => {
        this.planCache.set(sub.superadminId, {
          planType: sub.planType,
          planName: sub.planName,
          status: sub.status,
          expiryDate: sub.expiryDate,
          lastUpdated: sub.updatedAt || sub.createdAt
        });
      });

      console.log(`📊 Loaded ${this.planCache.size} SuperAdmin plans into cache`);
    } catch (error) {
      console.error('❌ Error loading current plans:', error);
    }
  }

  /**
   * Get all current subscriptions
   */
  getAllSubscriptions() {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT DISTINCT superadminId, planType, planName, status, expiryDate, updatedAt, createdAt
        FROM subscriptions 
        WHERE status = 'active'
        ORDER BY superadminId
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Check for plan changes and propagate them
   */
  async checkForPlanChanges() {
    try {
      const currentSubscriptions = await this.getAllSubscriptions();
      const changes = [];

      for (const sub of currentSubscriptions) {
        const cached = this.planCache.get(sub.superadminId);
        
        // Check if plan has changed
        if (!cached || 
            cached.planType !== sub.planType ||
            cached.planName !== sub.planName ||
            cached.status !== sub.status ||
            cached.expiryDate !== sub.expiryDate) {
          
          changes.push({
            superadminId: sub.superadminId,
            oldPlan: cached,
            newPlan: {
              planType: sub.planType,
              planName: sub.planName,
              status: sub.status,
              expiryDate: sub.expiryDate
            }
          });

          // Update cache
          this.planCache.set(sub.superadminId, {
            planType: sub.planType,
            planName: sub.planName,
            status: sub.status,
            expiryDate: sub.expiryDate,
            lastUpdated: sub.updatedAt || sub.createdAt
          });
        }
      }

      // Check for removed SuperAdmins
      for (const [superadminId] of this.planCache) {
        const exists = currentSubscriptions.find(sub => sub.superadminId === superadminId);
        if (!exists) {
          changes.push({
            superadminId: superadminId,
            oldPlan: this.planCache.get(superadminId),
            newPlan: null,
            removed: true
          });
          this.planCache.delete(superadminId);
        }
      }

      // Propagate changes
      if (changes.length > 0) {
        await this.propagatePlanChanges(changes);
      }

    } catch (error) {
      console.error('❌ Error checking for plan changes:', error);
    }
  }

  /**
   * Propagate plan changes to all users under affected SuperAdmins
   */
  async propagatePlanChanges(changes) {
    console.log(`🔄 Detected ${changes.length} plan change(s), propagating to users...`);

    for (const change of changes) {
      try {
        const { superadminId, oldPlan, newPlan, removed } = change;

        if (removed) {
          console.log(`🗑️ SuperAdmin ${superadminId} removed, downgrading all users to free`);
          await planInheritance.propagatePlanToUsers(superadminId, 'free', 'Free', new Date().toISOString());
        } else {
          console.log(`📋 SuperAdmin ${superadminId} plan changed: ${oldPlan?.planName || 'unknown'} → ${newPlan.planName}`);
          await planInheritance.propagatePlanToUsers(
            superadminId, 
            newPlan.planType, 
            newPlan.planName, 
            newPlan.expiryDate
          );
        }

        console.log(`✅ Successfully propagated plan change for SuperAdmin ${superadminId}`);

      } catch (error) {
        console.error(`❌ Error propagating change for SuperAdmin ${change.superadminId}:`, error);
      }
    }
  }

  /**
   * Force immediate check for plan changes
   */
  async forceCheck() {
    console.log('🔍 Forcing immediate plan change check...');
    await this.checkForPlanChanges();
  }

  /**
   * Update cache for specific SuperAdmin (for immediate updates)
   */
  updateCache(superadminId, planData) {
    this.planCache.set(superadminId, {
      planType: planData.planType,
      planName: planData.planName,
      status: planData.status,
      expiryDate: planData.expiryDate,
      lastUpdated: planData.lastUpdated
    });
    console.log(`🗂️ Cache updated immediately for SuperAdmin ${superadminId}: ${planData.planName}`);
  }

  /**
   * Get current monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastCheckTime: this.lastCheckTime,
      checkInterval: this.checkInterval,
      cachedPlans: this.planCache.size,
      nextCheck: new Date(Date.now() + this.checkInterval)
    };
  }

  /**
   * Get cached plan for a SuperAdmin
   */
  getCachedPlan(superadminId) {
    return this.planCache.get(superadminId);
  }
}

// Create singleton instance
const planMonitor = new PlanMonitor();

// Auto-start if not in test environment
if (process.env.NODE_ENV !== 'test') {
  planMonitor.start();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down plan monitor...');
  planMonitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down plan monitor...');
  planMonitor.stop();
  process.exit(0);
});

module.exports = planMonitor;
