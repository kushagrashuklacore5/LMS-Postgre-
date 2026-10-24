const express = require('express');
const router = express.Router();
const passwordResetController = require('../controllers/passwordResetController');
const { rateLimiters } = require('../middleware/rateLimiter');

// Guessing limit per IP and email address, on every step of the flow
router.use(rateLimiters.passwordReset);

// Step 1: Send OTP to email
router.post('/send-otp', passwordResetController.sendOTP);

// Step 2: Verify OTP
router.post('/verify-otp', passwordResetController.verifyOTP);

// Step 3: Reset password
router.post('/reset-password', passwordResetController.resetPassword);

// Check OTP cooldown status
router.get('/check-cooldown', passwordResetController.checkCooldown);

module.exports = router;
