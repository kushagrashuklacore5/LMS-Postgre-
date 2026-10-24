require('dotenv').config();

console.log('=== Environment Variables ===');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'UNDEFINED');
if (process.env.JWT_SECRET) {
  console.log('JWT_SECRET length:', process.env.JWT_SECRET.length);
  console.log('JWT_SECRET (first 10 chars):', process.env.JWT_SECRET.substring(0, 10) + '...');
}

// Generate a token with the current secret
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 69, email: 'portal@core5.co.in', role: 'portal_admin' },
  process.env.JWT_SECRET || 'default_jwt_secret_key',
  { expiresIn: '24h' }
);

console.log('Generated token (first 50 chars):', token.substring(0, 50) + '...');

// Test verification
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret_key');
  console.log('Token verification: SUCCESS');
  console.log('Decoded:', decoded);
} catch (error) {
  console.log('Token verification FAILED:', error.message);
}

process.exit(0);
