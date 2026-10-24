require('dotenv').config();
console.log('🔍 Checking JWT Secret...\n');

console.log('📋 JWT_SECRET:', process.env.JWT_SECRET || 'NOT SET');
console.log('📋 JWT_SECRET length:', (process.env.JWT_SECRET || '').length);

// Check if it's the default
const isDefault = !process.env.JWT_SECRET || process.env.JWT_SECRET === 'default_jwt_secret_key';
console.log('📋 Using default JWT Secret:', isDefault);

// Check .env file
const fs = require('fs');
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const jwtSecretLine = envContent.split('\n').find(line => line.startsWith('JWT_SECRET='));
  if (jwtSecretLine) {
    console.log('📄 JWT_SECRET from .env:', jwtSecretLine);
  } else {
    console.log('📄 JWT_SECRET not found in .env file');
  }
} catch (error) {
  console.log('❌ Could not read .env file:', error.message);
}
