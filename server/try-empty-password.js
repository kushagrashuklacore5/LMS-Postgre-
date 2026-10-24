const fs = require('fs');
const path = require('path');

console.log('🔧 Trying empty password for PostgreSQL...\n');

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

// Update the password to empty
const newPassword = ''; // Empty password
const regex = /^PG_PASSWORD=.*$/m;
if (regex.test(envContent)) {
  envContent = envContent.replace(regex, `PG_PASSWORD=${newPassword}`);
  console.log(`✅ Updated PG_PASSWORD to: [empty]`);
} else {
  envContent += `\nPG_PASSWORD=${newPassword}`;
  console.log(`✅ Added PG_PASSWORD: [empty]`);
}

// Write the updated .env file
fs.writeFileSync(envPath, envContent, 'utf8');

console.log('\n🎯 PostgreSQL password updated to empty!');
console.log('\n📋 New configuration:');
console.log(`   PG_PASSWORD=[empty]`);
console.log('\n⚠️  Trying to initialize with empty password...');

// Now try to initialize
const { Pool } = require('pg');

const testPool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: 'postgres', // Default database
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
});

async function testConnection() {
  try {
    await testPool.query('SELECT NOW()');
    console.log('✅ Connected successfully with empty password!');
    
    // Now try to initialize
    console.log('\n🗄️  Initializing database...');
    const { spawn } = require('child_process');
    const initProcess = spawn('node', ['init-postgres-db.js'], {
      cwd: __dirname,
      stdio: 'inherit'
    });
    
    initProcess.on('close', (code) => {
      if (code === 0) {
        console.log('🎯 Database initialization completed!');
      } else {
        console.log('❌ Database initialization failed');
      }
    });
    
  } catch (error) {
    console.log('❌ Empty password also failed');
    console.log('\n💡 Please check your PostgreSQL setup:');
    console.log('1. Make sure PostgreSQL is installed and running');
    console.log('2. Check your actual PostgreSQL password');
    console.log('3. Update PG_PASSWORD in .env file');
    console.log('4. Try running: psql -U postgres -h localhost');
  } finally {
    await testPool.end();
  }
}

testConnection();
