// Password generation utility for frontend
export function generateVendorPassword(length = 8) {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset.charAt(randomIndex);
  }
  
  return password;
}

export function hashPassword(password) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}
