const planInheritance = require('../controllers/plan-inheritance-controller');

/**
 * Automated Subscription Expiration Scheduler
 * Runs periodically to check and handle expired subscriptions
 */

class SubscriptionScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.checkInterval = 60 * 60 * 1000; // Check every hour (in milliseconds)
  }

  // Start the scheduler
  start() {
    if (this.isRunning) {
      console.log('⚠️  Subscription scheduler is already running');
      return;
    }

    console.log('🚀 Starting subscription expiration scheduler...');
    console.log(`📅 Checking every ${this.checkInterval / 1000 / 60} minutes`);
    
    this.isRunning = true;

    // Run immediately on start
    this.checkExpiredSubscriptions();

    // Set up recurring checks
    this.intervalId = setInterval(() => {
      this.checkExpiredSubscriptions();
    }, this.checkInterval);
  }

  // Stop the scheduler
  stop() {
    if (!this.isRunning) {
      console.log('⚠️  Subscription scheduler is not running');
      return;
    }

    console.log('🛑 Stopping subscription expiration scheduler...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
  }

  // Check for expired subscriptions and handle them
  async checkExpiredSubscriptions() {
    try {
      console.log(`🔍 Checking for expired subscriptions at ${new Date().toLocaleString()}`);
      
      const result = await planInheritance.checkExpiredSubscriptions();
      
      if (result.expiredCount > 0) {
        console.log(`✅ Processed ${result.expiredCount} expired subscriptions`);
        console.log(`👥 Downgraded ${result.updatedCount} users to Free plan`);
        
        // Optional: Send notifications to affected SuperAdmins
        await this.notifyExpiredSubscriptions(result);
      } else {
        console.log('ℹ️  No expired subscriptions found');
      }
      
    } catch (error) {
      console.error('❌ Error in subscription scheduler:', error);
    }
  }

  // Notify SuperAdmins about expired subscriptions (optional)
  async notifyExpiredSubscriptions(result) {
    try {
      // This is where you could implement email notifications
      // For now, just log the notification
      console.log('📧 Notifications sent for expired subscriptions');
      
      // Example notification implementation:
      // - Send email to SuperAdmins
      // - Create in-app notifications
      // - Log for audit trail
      
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      nextCheck: this.isRunning ? new Date(Date.now() + this.checkInterval).toLocaleString() : null
    };
  }
}

// Create singleton instance
const subscriptionScheduler = new SubscriptionScheduler();

// Auto-start scheduler when server starts
subscriptionScheduler.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down subscription scheduler...');
  subscriptionScheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down subscription scheduler...');
  subscriptionScheduler.stop();
  process.exit(0);
});

module.exports = subscriptionScheduler;
