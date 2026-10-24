const express = require('express');
const router = express.Router();

// Ids in the URL must name a record the caller may work with: same school, and for
// students and teachers their own classes, courses and records (helpers/schoolScope.js).
const { guardParams } = require("../helpers/schoolScope");
guardParams(router, { studentId: "user" });
const { createOrder, verifyPayment, getTransactionHistory, generateInvoice, getAllTransactions } = require('../controllers/payment-controller');
const { rateLimiters } = require('../middleware/rateLimiter');
const { requirePaymentAuth, requireRoles, resolveStudentScope, STAFF_ROLES } = require('../middleware/paymentAuth');

const PAYER_ROLES = ['student', ...STAFF_ROLES];

// Students may only read their own transactions; the "demo" (all records) view is staff-only
const ownTransactionsOnly = (req, res, next) => {
  if (STAFF_ROLES.includes(req.user.role)) return next();
  if (resolveStudentScope(req, res, req.params.studentId) === null) return;
  next();
};

// Create Razorpay order - rate limited (50 requests per minute)
router.post('/create-order', rateLimiters.createOrder, requirePaymentAuth, requireRoles(PAYER_ROLES), createOrder);

// Verify Razorpay payment - rate limited (50 requests per minute)
router.post('/verify-payment', rateLimiters.verifyPayment, requirePaymentAuth, requireRoles(PAYER_ROLES), verifyPayment);

// Generate professional invoice - rate limited (50 requests per minute)
router.post('/generate-invoice', rateLimiters.sensitive, generateInvoice);

// Get transaction history for a student
router.get('/transactions/:studentId', requirePaymentAuth, requireRoles(PAYER_ROLES), ownTransactionsOnly, getTransactionHistory);

// Get all transactions for accountant portal
router.get('/all-transactions', requirePaymentAuth, requireRoles(STAFF_ROLES), getAllTransactions);

module.exports = router;
