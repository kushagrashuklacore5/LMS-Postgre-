const jwt = require('jsonwebtoken');

/**
 * The only place that signs or verifies LMS session tokens.
 *
 * There is deliberately no fallback secret: a server that would sign tokens
 * with a value known from the source code is worse than one that refuses to
 * start, because anyone could then mint a token for any account.
 */
const ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32;

// Values that have appeared in this repository's source or env templates.
// They are public, so a deployment using one of them has no real secret.
const KNOWN_PUBLIC_SECRET_PATTERNS = [
  /^default_jwt_secret_key$/i,
  /your_.*secret/i,
  /change[-_ ]?(this|me)/i,
  /^secret$/i,
];

function secretProblem(value, name) {
  if (!value) return `${name} is not set`;
  if (KNOWN_PUBLIC_SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
    return `${name} is a placeholder value copied from a template`;
  }
  if (value.length < MIN_SECRET_LENGTH) {
    return `${name} must be at least ${MIN_SECRET_LENGTH} characters long`;
  }
  return null;
}

function readSecret(name) {
  const value = process.env[name];
  const problem = secretProblem(value, name);
  if (problem) {
    const error = new Error(`Authentication is not configured: ${problem}.`);
    error.code = 'AUTH_NOT_CONFIGURED';
    throw error;
  }
  return value;
}

const getJwtSecret = () => readSecret('JWT_SECRET');
const getRefreshSecret = () => readSecret('JWT_REFRESH_SECRET');

function signToken(payload, options = {}) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d', ...options, algorithm: ALGORITHM });
}

/** Throws (jsonwebtoken errors) when the token is missing, forged, malformed or expired. */
function verifyToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: [ALGORITHM] });
}

function signRefreshToken(payload, options = {}) {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: '7d', ...options, algorithm: ALGORITHM });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshSecret(), { algorithms: [ALGORITHM] });
}

module.exports = {
  signToken,
  verifyToken,
  signRefreshToken,
  verifyRefreshToken,
  getJwtSecret,
  secretProblem,
};
