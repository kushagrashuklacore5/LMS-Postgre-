const crypto = require('crypto');
const { getJwtSecret } = require('../config/jwt');

// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}

const dbGet = (req, sql, params = []) =>
  new Promise((resolve, reject) => {
    getDatabaseFromRequest(req).get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const dbRun = (req, sql, params = []) =>
  new Promise((resolve, reject) => {
    getDatabaseFromRequest(req).run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * One-time codes for password reset.
 *
 * - The code itself is never stored: only a keyed hash, so a copy of the
 *   database does not reveal usable codes.
 * - Every guess counts, right or wrong. After `maxAttempts` guesses the code
 *   is dead and a new one must be requested (a 6-digit code cannot be
 *   brute-forced in 5 tries).
 * - A code works once: verifying it opens a short window to set the password,
 *   and setting the password deletes it.
 * - Times are compared as numbers in JavaScript. (They used to be compared as
 *   text in SQL across two different formats, which kept codes valid for hours.)
 */
class OTPService {
  constructor() {
    this.otpExpiry = 10 * 60 * 1000; // a code can be entered for 10 minutes
    this.resetWindow = 10 * 60 * 1000; // after a correct code: 10 minutes to choose the new password
    this.maxAttempts = 5;
    this.resendCooldown = 60 * 1000; // 1 minute cooldown
  }

  // otp_reset is part of the database schema (database/postgres/migrations/002_otp_reset.sql);
  // the application role cannot create tables, so there is nothing to do here.
  ensureTable() {
    return Promise.resolve();
  }

  // Generate secure 6-digit OTP
  generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
  }

  hashOTP(email, otp) {
    return crypto.createHmac('sha256', getJwtSecret()).update(`${normalizeEmail(email)}:${String(otp).trim()}`).digest('hex');
  }

  async latest(req, email) {
    await this.ensureTable(req);
    return dbGet(req, 'SELECT * FROM otp_reset WHERE email = ? ORDER BY id DESC LIMIT 1', [normalizeEmail(email)]);
  }

  // Store a new code for this email (replacing any earlier one)
  async storeOTP(req, email, otp) {
    await this.ensureTable(req);
    const address = normalizeEmail(email);
    await dbRun(req, 'DELETE FROM otp_reset WHERE email = ?', [address]);
    const created = await dbRun(
      req,
      'INSERT INTO otp_reset (email, otp, expires_at, attempts, verified, created_at) VALUES (?, ?, ?, 0, 0, ?)',
      [address, this.hashOTP(address, otp), new Date(Date.now() + this.otpExpiry).toISOString(), new Date().toISOString()]
    );
    return { success: true, otpId: created.lastID };
  }

  // Verify a code. Each call uses up one attempt.
  async verifyOTP(req, email, otp) {
    const row = await this.latest(req, email);
    if (!row || row.verified || new Date(row.expires_at).getTime() <= Date.now()) {
      return { valid: false, reason: 'invalid_or_expired' };
    }
    if (row.attempts >= this.maxAttempts) {
      return { valid: false, reason: 'max_attempts' };
    }

    // Count the attempt before looking at the answer
    await dbRun(req, 'UPDATE otp_reset SET attempts = attempts + 1 WHERE id = ?', [row.id]);

    const expected = Buffer.from(row.otp);
    const given = Buffer.from(this.hashOTP(email, otp));
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      return {
        valid: false,
        reason: row.attempts + 1 >= this.maxAttempts ? 'max_attempts' : 'invalid_or_expired',
      };
    }

    await dbRun(req, 'UPDATE otp_reset SET verified = 1, expires_at = ? WHERE id = ?', [
      new Date(Date.now() + this.resetWindow).toISOString(),
      row.id,
    ]);
    return { valid: true, reason: 'success' };
  }

  // Check if email can request new OTP (cooldown)
  async canRequestOTP(req, email) {
    const row = await this.latest(req, email);
    if (!row) return { canRequest: true, cooldownRemaining: 0 };

    const timePassed = Date.now() - new Date(row.created_at).getTime();
    if (timePassed < this.resendCooldown) {
      return { canRequest: false, cooldownRemaining: Math.ceil((this.resendCooldown - timePassed) / 1000) };
    }
    return { canRequest: true, cooldownRemaining: 0 };
  }

  // Has a code for this email been verified, and is the reset window still open?
  async isOTPVerified(req, email) {
    const row = await this.latest(req, email);
    return { verified: Boolean(row && row.verified && new Date(row.expires_at).getTime() > Date.now()) };
  }

  // Cleanup expired OTPs
  async cleanupExpiredOTPs(req) {
    await this.ensureTable(req);
    const removed = await dbRun(req, 'DELETE FROM otp_reset WHERE expires_at <= ?', [new Date().toISOString()]);
    return { deleted: removed.changes };
  }

  // Clear OTP after successful password reset (makes the code single-use)
  async clearOTP(req, email) {
    await this.ensureTable(req);
    const removed = await dbRun(req, 'DELETE FROM otp_reset WHERE email = ?', [normalizeEmail(email)]);
    return { deleted: removed.changes };
  }
}

module.exports = new OTPService();
