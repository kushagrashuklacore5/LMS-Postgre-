const express = require('express');
const router = express.Router();
const planMonitor = require('../schedulers/plan-monitor');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * Plan Monitor API Routes
 * For monitoring and managing the automated plan propagation system
 */

// Get plan monitor status (SuperAdmin only)
router.get('/status', authMiddleware, async (req, res) => {
  try {
    // Only allow SuperAdmin to view monitor status
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const status = planMonitor.getStatus();
    res.json({
      success: true,
      monitor: {
        isRunning: status.isRunning,
        lastCheckTime: status.lastCheckTime,
        checkInterval: status.checkInterval,
        cachedPlans: status.cachedPlans,
        nextCheck: status.nextCheck
      }
    });
  } catch (error) {
    console.error('Error getting monitor status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get monitor status'
    });
  }
});

// Force immediate plan check (SuperAdmin only)
router.post('/force-check', authMiddleware, async (req, res) => {
  try {
    // Only allow SuperAdmin to force check
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    await planMonitor.forceCheck();
    
    res.json({
      success: true,
      message: 'Plan change check triggered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error forcing plan check:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to force plan check'
    });
  }
});

// Get cached plan for a SuperAdmin
router.get('/cached-plan/:superadminId', authMiddleware, async (req, res) => {
  try {
    const { superadminId } = req.params;
    
    // Allow users to check their own SuperAdmin's plan
    const userPlan = await require('../controllers/plan-inheritance-controller').getEffectiveUserPlan(req.user.userId);
    const cachedPlan = planMonitor.getCachedPlan(superadminId);
    
    res.json({
      success: true,
      superadminId,
      cachedPlan: cachedPlan || null,
      userEffectivePlan: {
        planType: userPlan.planType,
        canAccessCalendar: userPlan.canAccessCalendar,
        isExpired: userPlan.isExpired
      }
    });
  } catch (error) {
    console.error('Error getting cached plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cached plan'
    });
  }
});

// Start/stop monitor (SuperAdmin only)
router.post('/toggle', authMiddleware, async (req, res) => {
  try {
    // Only allow SuperAdmin to control monitor
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin only.'
      });
    }

    const { action } = req.body;
    
    if (action === 'start') {
      planMonitor.start();
      res.json({
        success: true,
        message: 'Plan monitor started',
        timestamp: new Date().toISOString()
      });
    } else if (action === 'stop') {
      planMonitor.stop();
      res.json({
        success: true,
        message: 'Plan monitor stopped',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid action. Use "start" or "stop".'
      });
    }
  } catch (error) {
    console.error('Error toggling monitor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle monitor'
    });
  }
});

module.exports = router;
