const express = require('express');
const router = express.Router();
const {
  getCurrentSubscription,
  createSubscriptionOrder,
  verifySubscriptionPayment,
  activateFreeTrial,
  cancelSubscription,
  checkFeatureAccess
} = require('../controllers/subscription-controller');
const authMiddleware = require('../middleware/authMiddleware');
const { rateLimiters } = require('../middleware/rateLimiter');

// Every subscription route needs a signed-in account; the plan always belongs to
// the caller. Which roles may change a plan is set in config/accessPolicy.js.
router.use(authMiddleware);

// Get current subscription
router.get('/current', getCurrentSubscription);

// Check feature access (Calendar, Export, etc.)
router.get('/check-feature-access', authMiddleware, checkFeatureAccess);

// Create subscription order
router.post('/create-order', rateLimiters.createOrder, createSubscriptionOrder);

// Verify subscription payment and activate
router.post('/verify-payment', rateLimiters.verifyPayment, verifySubscriptionPayment);

// Activate free trial
router.post('/activate-free-trial', rateLimiters.sensitive, activateFreeTrial);

// Cancel subscription
router.post('/cancel', cancelSubscription);

// The former "test-upgrade" (a paid plan without paying) and "debug-feature-access"
// routes are intentionally not registered.

module.exports = router;
