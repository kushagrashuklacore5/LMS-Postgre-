const subscriptionController = require('../controllers/subscription-controller');

/**
 * Feature Access Middleware
 * Checks if the current user has access to a specific feature based on their subscription
 * 
 * Usage: router.use('/calendar', checkFeatureAccess('calendar'));
 *        router.post('/export', checkFeatureAccess('exportData'));
 */

const checkFeatureAccess = (featureName) => {
  return async (req, res, next) => {
    try {
      // Skip feature check for superadmin (they have access to everything)
      if (req.user?.role === 'superadmin' || req.user?.role === 'portal_admin') {
        console.log(`🔓 Feature access granted for superadmin/portal_admin: ${featureName}`);
        return next();
      }

      // Ensure user is authenticated
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          feature: featureName
        });
      }

      console.log(`🔍 Checking feature access for user ${req.user.userId}, feature: ${featureName}`);

      // Get user's subscription and features
      let subscription;
      let features;

      if (req.user?.role === 'superadmin' || req.user?.role === 'portal_admin') {
        // For superadmin/portal_admin, check both formats to find existing subscription
        const superadminFormat = `superadmin-${req.user.userId}`;
        const directFormat = req.user.userId.toString();
        
        // Try superadmin format first
        subscription = await subscriptionController.findSubscriptionById(superadminFormat);
        if (subscription) {
          features = subscriptionController.getFeaturesForPlan(subscription.planType);
        } else {
          // Try direct format
          subscription = await subscriptionController.findSubscriptionById(directFormat);
          if (subscription) {
            features = subscriptionController.getFeaturesForPlan(subscription.planType);
          } else {
            // Default to free features
            features = subscriptionController.getFeaturesForPlan('free');
          }
        }
      } else {
        // For regular users, use inheritance system
        const planInheritance = require('../controllers/plan-inheritance-controller');
        const userPlan = await planInheritance.getEffectiveUserPlan(req.user.userId);
        features = userPlan.features;
        subscription = userPlan.subscription;
      }

      // Check if subscription is expired
      const isExpired = subscription && (
        subscription.status !== 'active' || 
        new Date(subscription.expiryDate) < new Date()
      );

      // Check if feature is available
      const hasFeatureAccess = features && features[featureName] === true;

      console.log(`📊 Feature access check result:`, {
        userId: req.user.userId,
        feature: featureName,
        hasAccess: hasFeatureAccess,
        isExpired: isExpired,
        planType: subscription?.planType || 'free'
      });

      if (!hasFeatureAccess || isExpired) {
        const planName = subscription?.planName || 'Free';
        const message = isExpired 
          ? `Your subscription has expired. Please renew your subscription to access ${featureName}.`
          : `Feature "${featureName}" is not available on your current plan (${planName}). Upgrade your plan to access this feature.`;

        return res.status(403).json({
          success: false,
          message: message,
          feature: featureName,
          currentPlan: subscription?.planType || 'free',
          currentPlanName: planName,
          isExpired: isExpired,
          upgradeRequired: !isExpired && subscription?.planType === 'free'
        });
      }

      // Feature access granted
      console.log(`✅ Feature access granted: ${featureName} for user ${req.user.userId}`);
      next();

    } catch (error) {
      console.error(`❌ Error checking feature access for ${featureName}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check feature access',
        feature: featureName
      });
    }
  };
};

// Export the middleware function
module.exports = {
  checkFeatureAccess
};
