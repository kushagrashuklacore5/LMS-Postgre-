const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 10;
const BCRYPT_PREFIX = /^\$2[aby]\$/;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * Generate a random password for vendors
 * @param {number} length - Length of the password (default: 12)
 * @returns {string} Generated password
 */
function generateVendorPassword(length = 12) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%&';
  const charset = uppercase + lowercase + numbers + special;
  const pick = (alphabet) => alphabet.charAt(crypto.randomInt(alphabet.length));

  // At least one character of each kind, the rest from the full set
  const characters = [pick(uppercase), pick(lowercase), pick(numbers), pick(special)];
  while (characters.length < length) characters.push(pick(charset));

  // Shuffle so the guaranteed characters are not always in front
  for (let i = characters.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join('');
}

/**
 * Hash a password for storage (bcrypt, salted).
 * @param {string} password - Plain text password
 * @returns {string} Hashed password
 */
function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

const constantTimeEquals = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

/**
 * Checks a password against a stored value.
 *
 * Accounts created by older code may still hold an unsalted SHA-256 digest or
 * the plain password. Those still sign in, and `needsUpgrade` tells the caller
 * to replace the stored value with a bcrypt hash straight away.
 *
 * @returns {Promise<{ valid: boolean, needsUpgrade: boolean }>}
 */
async function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || plain === '' || typeof stored !== 'string' || stored === '') {
    return { valid: false, needsUpgrade: false };
  }
  if (BCRYPT_PREFIX.test(stored)) {
    return { valid: await bcrypt.compare(plain, stored), needsUpgrade: false };
  }
  if (SHA256_HEX.test(stored)) {
    const digest = crypto.createHash('sha256').update(plain).digest('hex');
    const valid = constantTimeEquals(digest, stored.toLowerCase());
    return { valid, needsUpgrade: valid };
  }
  const valid = constantTimeEquals(plain, stored);
  return { valid, needsUpgrade: valid };
}

module.exports = {
  generatePassword: generateVendorPassword, // same generator for every first password
  generateVendorPassword,
  hashPassword,
  verifyPassword
};
