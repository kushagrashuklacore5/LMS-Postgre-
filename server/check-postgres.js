const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking PostgreSQL installation and status...\n');

// Check if PostgreSQL is installed
function checkPostgresInstallation() {
  return new Promise((resolve) => {
    const psql = spawn('psql', ['--version'], { stdio: 'pipe' });
    
    psql.on('close', (code) => {
      if (code === 0) {
        let output = '';
        psql.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        psql.stdout.on('end', () => {
          console.log('✅ PostgreSQL is installed');
          console.log(`📋 Version: ${output.trim()}`);
          resolve(true);
        });
      } else {
        console.log('❌ PostgreSQL is not installed or not in PATH');
        resolve(false);
      }
    });
    
    psql.on('error', () => {
      console.log('❌ PostgreSQL command not found');
      resolve(false);
    });
  });
}

// Check if PostgreSQL service is running
function checkPostgresService() {
  return new Promise((resolve) => {
    const sc = spawn('sc', ['query', 'postgresql'], { stdio: 'pipe' });
    
    sc.on('close', (code) => {
      if (code === 0) {
        let output = '';
        sc.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        sc.stdout.on('end', () => {
          if (output.includes('RUNNING')) {
            console.log('✅ PostgreSQL service is running');
            resolve(true);
          } else {
            console.log('⚠️  PostgreSQL service is installed but not running');
            resolve(false);
          }
        });
      } else {
        console.log('⚠️  Could not check PostgreSQL service status');
        resolve(false);
      }
    });
    
    sc.on('error', () => {
      console.log('⚠️  Could not check PostgreSQL service (not on Windows?)');
      resolve(false);
    });
  });
}

// Test connection
async function testConnection() {
  const { Pool } = require('pg');
  
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: 'postgres',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    connectionTimeoutMillis: 2000,
  });
  
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connection successful');
    await pool.end();
    return true;
  } catch (error) {
    console.log('❌ PostgreSQL connection failed:', error.message);
    await pool.end();
    return false;
  }
}

// Main check function
async function main() {
  const isInstalled = await checkPostgresInstallation();
  const isRunning = await checkPostgresService();
  const canConnect = await testConnection();
  
  console.log('\n📊 Summary:');
  console.log(`   Installation: ${isInstalled ? '✅' : '❌'}`);
  console.log(`   Service: ${isRunning ? '✅' : '❌'}`);
  console.log(`   Connection: ${canConnect ? '✅' : '❌'}`);
  
  if (!isInstalled) {
    console.log('\n🔧 To install PostgreSQL:');
    console.log('Windows:');
    console.log('1. Download from: https://www.postgresql.org/download/windows/');
    console.log('2. Run the installer and note the password');
    console.log('3. Make sure to add PostgreSQL to PATH\n');
    
    console.log('macOS:');
    console.log('1. brew install postgresql');
    console.log('2. brew services start postgresql\n');
    
    console.log('Linux (Ubuntu/Debian):');
    console.log('1. sudo apt update');
    console.log('2. sudo apt install postgresql postgresql-contrib');
    console.log('3. sudo systemctl start postgresql\n');
  }
  
  if (isInstalled && !isRunning) {
    console.log('\n🚀 To start PostgreSQL service:');
    console.log('Windows:');
    console.log('1. Open Services (services.msc)');
    console.log('2. Find "postgresql-x64-XX" service');
    console.log('3. Right-click and select "Start"\n');
    
    console.log('macOS:');
    console.log('1. brew services start postgresql\n');
    
    console.log('Linux:');
    console.log('1. sudo systemctl start postgresql\n');
  }
  
  if (isInstalled && isRunning && !canConnect) {
    console.log('\n🔑 To fix connection:');
    console.log('1. Find your PostgreSQL password');
    console.log('2. Update PG_PASSWORD in .env file');
    console.log('3. Try: psql -U postgres -h localhost');
    console.log('4. If it asks for password, that\'s your password');
    console.log('5. Update .env with: PG_PASSWORD=your_actual_password\n');
  }
  
  if (isInstalled && isRunning && canConnect) {
    console.log('\n🎉 PostgreSQL is ready!');
    console.log('Run: node init-postgres-db.js to initialize the database');
  }
  
  // Show current config
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    console.log('\n📄 Current configuration:');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const pgVars = envContent.split('\n')
      .filter(line => line.startsWith('PG_'))
      .map(line => line.replace(/#.*$/, '').trim());
    
    pgVars.forEach(varLine => {
      if (varLine) {
        const [key, value] = varLine.split('=');
        if (key === 'PG_PASSWORD') {
          console.log(`   ${key}=${value ? '********' : '[empty]'}`);
        } else {
          console.log(`   ${key}=${value}`);
        }
      }
    });
  }
}

main().catch(console.error);
