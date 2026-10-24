const fs = require('fs');
const path = require('path');

console.log('🔧 Updating PostgreSQL password...\n');

// Read current .env file
const envPath = path.join(__dirname, '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Found existing .env file');
} else {
  console.log('❌ .env file not found');
  process.exit(1);
}

// Update the password
const newPassword = 'postgres'; // Common default password
const regex = /^PG_PASSWORD=.*$/m;
if (regex.test(envContent)) {
  envContent = envContent.replace(regex, `PG_PASSWORD=${newPassword}`);
  console.log(`✅ Updated PG_PASSWORD to: ${newPassword}`);
} else {
  envContent += `\nPG_PASSWORD=${newPassword}`;
  console.log(`✅ Added PG_PASSWORD: ${newPassword}`);
}

// Write the updated .env file
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('\n🎯 PostgreSQL password updated!');
console.log('\n📋 New configuration:');
console.log(`   PG_PASSWORD=${newPassword}`);
console.log('\n⚠️  Make sure this matches your actual PostgreSQL password');
console.log('   If not, update it manually in the .env file');
