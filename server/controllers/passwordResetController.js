const bcrypt = require('bcryptjs');
const otpService = require('../services/otpService');
const emailService = require('../services/emailService');

// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}

const dbGet = (req, sql, params) =>
  new Promise((resolve, reject) => {
    getDatabaseFromRequest(req).get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const dbRun = (req, sql, params) =>
  new Promise((resolve, reject) => {
    getDatabaseFromRequest(req).run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes });
    });
  });

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

// The same answer whether or not the address has an account, so this form
// cannot be used to find out who is registered.
const OTP_REQUEST_ACCEPTED = {
  success: true,
  message: 'If the email exists, an OTP will be sent'
};

// Password Reset Controller
const passwordResetController = {
  // Step 1: Send OTP to email
  sendOTP: async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      const user = await dbGet(req, 'SELECT id FROM users WHERE email = ?', [email]);
      if (user) {
        const cooldown = await otpService.canRequestOTP(req, email);
        if (cooldown.canRequest) {
          const otp = otpService.generateOTP();
          await otpService.storeOTP(req, email, otp);
          // The code leaves the server only inside this email - never in the HTTP response or the logs.
          const emailResult = await emailService.sendOTPEmail(email, otp);
          if (!emailResult.success) {
            console.error('Send OTP: the email could not be delivered');
          }
        }
      }

      res.status(200).json(OTP_REQUEST_ACCEPTED);
    } catch (error) {
      console.error('Send OTP error:', error.message);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // Step 2: Verify OTP
  verifyOTP: async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const otp = req.body?.otp;

      if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP are required' });
      }

      const verification = await otpService.verifyOTP(req, email, otp);

      if (!verification.valid) {
        const message =
          verification.reason === 'max_attempts'
            ? 'Maximum attempts reached. Please request a new OTP'
            : 'Invalid or expired OTP';
        return res.status(400).json({ success: false, message, reason: verification.reason });
      }

      res.status(200).json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
      console.error('Verify OTP error:', error.message);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // Step 3: Reset password
  resetPassword: async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const { newPassword, confirmPassword } = req.body || {};

      if (!email || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
      }
      if (typeof newPassword !== 'string' || newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
      }

      // A code for this address must have been verified a moment ago
      const otpCheck = await otpService.isOTPVerified(req, email);
      if (!otpCheck.verified) {
        return res.status(400).json({ success: false, message: 'OTP verification required' });
      }

      // The code is used up before the password changes, so it can never be replayed
      await otpService.clearOTP(req, email);

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updated = await dbRun(req, 'UPDATE users SET password = ?, sessions_valid_from = ? WHERE email = ?', [
        hashedPassword,
        Math.floor(Date.now() / 1000),
        email
      ]);
      if (updated.changes === 0) {
        return res.status(400).json({ success: false, message: 'OTP verification required' });
      }

      res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      console.error('Reset password error:', error.message);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  },

  // Cooldown before another code can be requested. It answers the same way for
  // every address the caller has not just requested a code for.
  checkCooldown: async (req, res) => {
    try {
      const email = normalizeEmail(req.query?.email);
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      const cooldownCheck = await otpService.canRequestOTP(req, email);
      res.status(200).json({
        success: true,
        canRequest: cooldownCheck.canRequest,
        cooldownRemaining: cooldownCheck.cooldownRemaining
      });
    } catch (error) {
      console.error('Check cooldown error:', error.message);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

module.exports = passwordResetController;
