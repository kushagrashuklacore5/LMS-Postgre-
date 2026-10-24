// The handlers below use the shared LMS database connection.
const db = require('../config/database-switch');
const express = require('express');
const router = express.Router();
const planInheritance = require('../controllers/plan-inheritance-controller');

// One session check for the whole API (signed token, account re-read from the database)
const authenticateToken = require('../middleware/authMiddleware');

// Get effective user plan (inherits from SuperAdmin)
router.get('/effective-plan', authenticateToken, async (req, res) => {
  try {
    const userPlan = await planInheritance.getEffectiveUserPlan(req.user.userId);
    res.json({
      success: true,
      plan: userPlan
    });
  } catch (error) {
    console.error('Error getting effective plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get effective plan',
      error: error.message
    });
  }
});

// Propagate plan changes (for testing)
router.post('/propagate', authenticateToken, async (req, res) => {
  try {
    const { superadminId, planType, planName, expiryDate } = req.body;
    
    if (!superadminId || !planType) {
      return res.status(400).json({
        success: false,
        message: 'superadminId and planType are required'
      });
    }
    
    const result = await planInheritance.propagatePlanToUsers(
      superadminId, 
      planType, 
      planName || 'Free', 
      expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );
    
    res.json({
      success: true,
      message: 'Plan propagated successfully',
      result
    });
  } catch (error) {
    console.error('Error propagating plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to propagate plan',
      error: error.message
    });
  }
});

// Check and handle expired subscriptions (automated job endpoint)
router.post('/check-expiration', authenticateToken, async (req, res) => {
  try {
    // Only allow superadmin to trigger expiration check
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only superadmin can trigger expiration check'
      });
    }
    
    const result = await planInheritance.checkExpiredSubscriptions();
    
    res.json({
      success: true,
      message: 'Expiration check completed',
      result
    });
  } catch (error) {
    console.error('Error checking expiration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check expiration',
      error: error.message
    });
  }
});

// Get subscription status for all users under a SuperAdmin
router.get('/users-status/:superadminId', authenticateToken, async (req, res) => {
  try {
    const { superadminId } = req.params;
    
    // Only allow superadmin to check their users' status
    if (req.user.role !== 'superadmin' || req.user.userId !== superadminId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    
    
    db.all(`
      SELECT u.id, u.name, u.role, u.subscriptionPlan, uni.name as university_name
      FROM users u
      LEFT JOIN universities uni ON u.university_id = uni.id
      WHERE uni.adminId = ?
      ORDER BY u.role, u.name
    `, [superadminId], (err, users) => {
      if (err) {
        console.error('Error getting users status:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to get users status',
          error: err.message
        });
      }
      
      res.json({
        success: true,
        superadminId,
        users: users.map(user => ({
          id: user.id,
          name: user.name,
          role: user.role,
          university: user.university_name,
          currentPlan: user.subscriptionPlan || 'free',
          canAccessCalendar: user.subscriptionPlan === 'standard' || user.subscriptionPlan === 'professional'
        }))
      });
    });
  } catch (error) {
    console.error('Error getting users status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users status',
      error: error.message
    });
  }
});

module.exports = router;
