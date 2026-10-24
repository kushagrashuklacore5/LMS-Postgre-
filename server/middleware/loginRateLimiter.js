// Simple Login Rate Limiting Middleware (Memory Store Only)
// No Redis dependency - uses in-memory storage
//
// Counts FAILED login attempts in a fixed window, per account (normalized email,
// across all IPs) and per client IP, and temporarily blocks whichever one reaches
// its limit. A successful login is never counted and clears that account's counter.

// A positive whole number from the environment, or the default (same convention as rateLimiter.js)
function positiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Configuration constants
const CONFIG = {
  // Failed attempts allowed for one account within the window, counted across all IPs
  MAX_FAILED_ATTEMPTS_PER_ACCOUNT: positiveInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT, 5),
  // Failed attempts allowed from one IP within the window, across all accounts.
  // Higher than the account limit because a whole campus can share one address.
  MAX_FAILED_ATTEMPTS_PER_IP: positiveInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP, 50),
  ATTEMPT_WINDOW_MS: positiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  BLOCK_DURATION_MS: positiveInt(process.env.LOGIN_RATE_LIMIT_BLOCK_MS, 15 * 60 * 1000),
  KEY_PREFIX: 'login:'
};

// Memory store: key -> { value, expiresAt }
const memoryStore = new Map();

function getMemoryKey(key) {
  const data = memoryStore.get(key);
  if (!data) return null;

  // Check if expired
  if (Date.now() > data.expiresAt) {
    memoryStore.delete(key);
    return null;
  }

  return data.value;
}

function setMemoryKey(key, value, expiresAt) {
  memoryStore.set(key, { value, expiresAt });
}

function deleteMemoryKey(key) {
  memoryStore.delete(key);
}

// One canonical form per account, so letter case or spaces cannot dodge the account counter.
// Anything that is not a plausible email string is treated as "no account" (IP counting only).
function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized !== '' && normalized.length <= 254 ? normalized : null;
}

// Generate keys for tracking
function generateKeys(ip, email = null) {
  const account = normalizeEmail(email);
  return {
    ipKey: `${CONFIG.KEY_PREFIX}fail:ip:${ip}`,
    emailKey: account ? `${CONFIG.KEY_PREFIX}fail:user:${account}` : null,
    ipBlockKey: `${CONFIG.KEY_PREFIX}block:ip:${ip}`,
    emailBlockKey: account ? `${CONFIG.KEY_PREFIX}block:user:${account}` : null
  };
}

// Get client IP address
function getClientIP(req) {
  return req.ip ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * Records one failed attempt against a counter key and returns the new count.
 * The window is fixed: it starts at the first failure and is not extended by later ones.
 * Reaching the limit starts a block and clears the counter, so a fresh window begins after the block.
 */
function recordFailure(counterKey, blockKey, limit, blockReason) {
  const now = Date.now();
  const current = getMemoryKey(counterKey) || { count: 0, windowStart: now };
  const updated = { count: current.count + 1, windowStart: current.windowStart };

  if (updated.count >= limit) {
    const expiresAt = now + CONFIG.BLOCK_DURATION_MS;
    setMemoryKey(blockKey, { blocked: true, expiresAt, blockReason, blockedAt: now }, expiresAt);
    deleteMemoryKey(counterKey);
  } else {
    setMemoryKey(counterKey, updated, updated.windowStart + CONFIG.ATTEMPT_WINDOW_MS);
  }
  return updated.count;
}

// Main rate limiting middleware
const loginRateLimiter = async (req, res, next) => {
  try {
    const ip = getClientIP(req);
    const account = normalizeEmail(req.body?.email);
    const { ipKey, emailKey, ipBlockKey, emailBlockKey } = generateKeys(ip, account);
    const who = `IP: ${ip}, Email: ${account || 'not provided'}`;

    console.log(`🔐 Login attempt - ${who}`);

    // Refuse while this IP or this account is blocked (the request never reaches the login handler)
    const ipBlock = getMemoryKey(ipBlockKey);
    const emailBlock = emailBlockKey ? getMemoryKey(emailBlockKey) : null;
    const activeBlock = ipBlock || emailBlock;
    if (activeBlock) {
      const remainingTime = Math.max(1, Math.ceil((activeBlock.expiresAt - Date.now()) / 1000));

      console.log(`🚫 Login blocked for ${remainingTime}s - ${who}`);

      res.set('Retry-After', String(remainingTime));
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again later.',
        blocked: true,
        remainingTime: remainingTime,
        blockType: ipBlock ? 'ip' : 'account'
      });
    }

    // Not blocked, continue to login.
    // The outcome is read from the response the login handler actually sends: its HTTP status,
    // plus the token on success. Only the status and the presence of a token are inspected;
    // nothing from the request or response body is logged.
    const originalJson = res.json;
    let outcomeRecorded = false;

    res.json = function(data) {
      if (!outcomeRecorded) {
        outcomeRecorded = true;
        const status = res.statusCode;
        const isSuccess = status >= 200 && status < 300 && Boolean(data && data.token);

        if (isSuccess) {
          console.log(`✅ Successful login - ${who}`);
          // A correct password clears this account's failures. The IP counter is deliberately
          // kept: otherwise one valid account could be used to reset guessing against others.
          if (emailKey) deleteMemoryKey(emailKey);
        } else if (status === 401) {
          // Wrong credentials (or unknown email): counts against the account and the IP
          console.log(`❌ Failed login - ${who}`);
          const ipCount = recordFailure(ipKey, ipBlockKey, CONFIG.MAX_FAILED_ATTEMPTS_PER_IP, 'ip_limit');
          const emailCount = emailKey
            ? recordFailure(emailKey, emailBlockKey, CONFIG.MAX_FAILED_ATTEMPTS_PER_ACCOUNT, 'account_limit')
            : 0;

          // Add attempt info to response for frontend
          if (data && typeof data === 'object') {
            data.attemptInfo = {
              ipAttempts: ipCount,
              emailAttempts: emailCount,
              maxAttempts: CONFIG.MAX_FAILED_ATTEMPTS_PER_ACCOUNT,
              remainingAttempts: Math.max(0, Math.min(
                CONFIG.MAX_FAILED_ATTEMPTS_PER_IP - ipCount,
                emailKey ? CONFIG.MAX_FAILED_ATTEMPTS_PER_ACCOUNT - emailCount : Infinity
              ))
            };
          }
        } else if (status >= 400 && status < 500) {
          // Malformed request (e.g. missing password): not a password guess, so it does not count
          // against any account, but it still counts against the sending IP
          console.log(`❌ Rejected login request (${status}) - ${who}`);
          recordFailure(ipKey, ipBlockKey, CONFIG.MAX_FAILED_ATTEMPTS_PER_IP, 'ip_limit');
        }
        // 5xx: a server fault is not a failed attempt by the user and is not counted
      }

      // Call original json
      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    console.error('❌ Rate limiting middleware error:', error);
    // If middleware fails, allow request to continue
    next();
  }
};

// Helper function to reset user's rate limit (for admin use)
async function resetUserRateLimit(ip, email = null) {
  try {
    const { ipKey, emailKey, ipBlockKey, emailBlockKey } = generateKeys(ip, email);

    deleteMemoryKey(ipKey);
    deleteMemoryKey(ipBlockKey);
    if (emailKey) {
      deleteMemoryKey(emailKey);
      deleteMemoryKey(emailBlockKey);
    }

    console.log(`🔄 Rate limit reset - IP: ${ip}, Email: ${normalizeEmail(email) || 'not provided'}`);
    return true;
  } catch (error) {
    console.error('❌ Error resetting rate limit:', error);
    return false;
  }
}

// Helper function to check if user is blocked
async function isUserBlocked(ip, email = null) {
  try {
    const { ipBlockKey, emailBlockKey } = generateKeys(ip, email);
    const blockData = getMemoryKey(ipBlockKey) || (emailBlockKey ? getMemoryKey(emailBlockKey) : null);

    if (!blockData) return null;

    const remainingTime = Math.ceil((blockData.expiresAt - Date.now()) / 1000);
    return {
      blocked: true,
      remainingTime,
      blockReason: blockData.blockReason,
      blockedAt: blockData.blockedAt
    };
  } catch (error) {
    console.error('❌ Error checking block status:', error);
    return null;
  }
}

// Cleanup expired entries periodically (unref: this timer must not keep the process alive)
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, data] of memoryStore.entries()) {
    if (now > data.expiresAt) {
      memoryStore.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} expired rate limiting entries`);
  }
}, 60000).unref(); // Clean every minute

module.exports = {
  loginRateLimiter,
  resetUserRateLimit,
  isUserBlocked,
  CONFIG
};
