const fs = require('fs');
const path = require('path');

console.log('Updating .env file with PostgreSQL password...');

// Read current .env
const envPath = path.join(__dirname, '.env');
let content = fs.readFileSync(envPath, 'utf8');

// Replace the placeholder password
content = content.replace('PG_PASSWORD=your_postgres_password', 'PG_PASSWORD=postgres123');

// Write back
fs.writeFileSync(envPath, content);

console.log('Updated .env file with password: postgres123');
console.log('');
console.log('Next steps:');
console.log('1. Make sure PostgreSQL is running');
console.log('2. Create database: CREATE DATABASE lms_database;');
console.log('3. Run migration: node quick-migrate.js');
console.log('4. Verify: node check-migration-status.js');
