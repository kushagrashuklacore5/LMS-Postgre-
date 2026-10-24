const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up PostgreSQL environment...\n');

// Read current .env file or create a new one
const envPath = path.join(__dirname, '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Found existing .env file');
} else {
  console.log('📝 Creating new .env file');
}

// Update or add PostgreSQL environment variables
const postgresVars = {
  'USE_POSTGRES': 'true',
  'PG_HOST': 'localhost',
  'PG_PORT': '5432',
  'PG_DATABASE': 'lms_prod',
  'PG_USER': 'postgres',
  'PG_PASSWORD': 'password'
};

// Update existing variables or add new ones
Object.entries(postgresVars).forEach(([key, value]) => {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, `${key}=${value}`);
    console.log(`✅ Updated ${key}`);
  } else {
    envContent += `\n${key}=${value}`;
    console.log(`✅ Added ${key}`);
  }
});

// Write the updated .env file
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('\n🎯 PostgreSQL environment setup completed!');
console.log('\n📋 Environment variables set:');
Object.entries(postgresVars).forEach(([key, value]) => {
  console.log(`   ${key}=${value}`);
});

console.log('\n⚠️  IMPORTANT:');
console.log('1. Make sure PostgreSQL is installed and running');
console.log('2. Create a database named "lms_prod"');
console.log('3. Update PG_PASSWORD with your actual PostgreSQL password');
console.log('4. Restart the server after making changes');
