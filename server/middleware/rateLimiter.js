const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const MINUTE = 60 * 1000;

const createRateLimiter = ({ windowMs, max, message, keyGenerator, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });

// A whole school often shares one public IP address, so guessing limits are
// counted per IP *and* target account: one student's typos cannot lock out a
// classroom, yet each account still gets only a handful of guesses.
const perIpAndEmail = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${ipKeyGenerator(req.ip)}|${email}`;
};

// One school can share a single public IP address, so the overall ceiling is generous;
// the strict limits are the per-account ones above (login, password reset).
const generalMax = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 3000;
const generalWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || MINUTE;

const rateLimiters = {
  // Failed sign-ins only: 10 wrong passwords per account per 15 minutes
  login: createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 10,
    keyGenerator: perIpAndEmail,
    skipSuccessfulRequests: true,
    message: 'Too many login attempts. Please try again later.'
  }),

  register: createRateLimiter({
    windowMs: 60 * MINUTE,
    max: 20,
    message: 'Too many registration attempts. Please try again later.'
  }),

  // Password reset: sending codes, checking codes, setting the new password
  passwordReset: createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 10,
    keyGenerator: perIpAndEmail,
    message: 'Too many password reset attempts. Please try again later.'
  }),

  // File uploads, counted per signed-in account (not per IP: a school shares one address)
  upload: createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 60,
    keyGenerator: (req) => `user:${req.user?.userId ?? ipKeyGenerator(req.ip)}`,
    message: 'Too many uploads. Please try again in a few minutes.'
  }),

  general: createRateLimiter({
    windowMs: generalWindowMs,
    max: generalMax,
    message: 'Too many requests. Please try again later.'
  }),

  sensitive: createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 60,
    message: 'Too many sensitive operations. Please try again later.'
  }),

  createOrder: createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 30,
    message: 'Too many payment attempts. Please try again later.'
  }),

  verifyPayment: createRateLimiter({
    windowMs: 15 * MINUTE,
    max: 60,
    message: 'Too many payment verification attempts. Please try again later.'
  })
};

module.exports = { rateLimiters };
