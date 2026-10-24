#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('==========================================');
console.log('    POSTGRESQL SETUP & MIGRATION');
console.log('==========================================');
console.log('');

async function setupAndMigrate() {
  console.log('This script will help you:');
console.log('1. Set up PostgreSQL database');
console.log('2. Migrate your SQLite data to PostgreSQL');
console.log('3. Configure your project to use PostgreSQL');
console.log('');

console.log('STEP 1: INSTALL POSTGRESQL');
console.log('=============================');
console.log('');
console.log('Option A: Manual Installation (Recommended)');
console.log('1. Download PostgreSQL from: https://www.postgresql.org/download/windows/');
console.log('2. Run the installer as Administrator');
console.log('3. Remember your postgres password');
console.log('4. Default port: 5432, user: postgres');
console.log('');
console.log('Option B: Using Chocolatey (requires Admin)');
console.log('Run PowerShell as Administrator and execute:');
console.log('choco install postgresql');
console.log('');
console.log('Option C: Using Docker (requires Docker Desktop)');
console.log('1. Install Docker Desktop from https://www.docker.com/products/docker-desktop/');
console.log('2. Run: docker run --name postgres-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15');
console.log('');

console.log('STEP 2: CREATE DATABASE');
console.log('=======================');
console.log('');
console.log('Open pgAdmin or psql and run:');
console.log('CREATE DATABASE lms_database;');
console.log('');
console.log('Or use the command line:');
console.log('createdb -U postgres lms_database');
console.log('');

console.log('STEP 3: UPDATE ENVIRONMENT');
console.log('============================');
console.log('');

// Update .env file
const envPath = path.join(__dirname, 'server', '.env');
const envBackupPath = path.join(__dirname, 'server', '.env.backup');

if (fs.existsSync(envPath)) {
  // Create backup
  fs.copyFileSync(envPath, envBackupPath);
  console.log('Created backup of .env file');
  
  // Read current .env
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Add PostgreSQL configuration if not present
  const pgConfig = `
# PostgreSQL Database Configuration
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_postgres_password
PG_DATABASE=lms_database

# Database Switch
USE_POSTGRES=true
`;
  
  if (!envContent.includes('PG_HOST')) {
    envContent += pgConfig;
    fs.writeFileSync(envPath, envContent);
    console.log('Added PostgreSQL configuration to .env file');
  } else {
    console.log('PostgreSQL configuration already exists in .env file');
  }
} else {
  console.log('No .env file found. Please create one with PostgreSQL configuration.');
}

console.log('');
console.log('STEP 4: RUN MIGRATION');
console.log('====================');
console.log('');
console.log('After PostgreSQL is installed and running:');
console.log('1. Update PG_PASSWORD in .env with your actual password');
console.log('2. Run: cd server && node quick-migrate.js');
console.log('');

console.log('STEP 5: VERIFY MIGRATION');
console.log('========================');
console.log('');
console.log('After migration:');
console.log('1. Start your backend server');
console.log('2. Check console for "Using PostgreSQL database" message');
console.log('3. Test all CRUD operations');
console.log('4. Verify data integrity');
console.log('');

console.log('NEED HELP?');
console.log('===========');
console.log('');
console.log('1. Check the MIGRATION_INSTRUCTIONS.txt file for detailed guide');
console.log('2. Ensure PostgreSQL service is running');
console.log('3. Verify database credentials in .env');
console.log('4. Check migration logs in /server/backups/');
console.log('');

console.log('READY TO PROCEED?');
console.log('==================');
console.log('');
console.log('1. Install PostgreSQL using one of the options above');
console.log('2. Update PG_PASSWORD in your .env file');
console.log('3. Run: node server/quick-migrate.js');
console.log('');
console.log('Your project will automatically use PostgreSQL after migration!');
}

setupAndMigrate().catch(console.error);
