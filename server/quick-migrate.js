#!/usr/bin/env node

const DatabaseMigrator = require('./migrate-to-postgres-safe');

console.log('==========================================');
console.log('    SQLITE TO POSTGRESQL MIGRATION');
console.log('==========================================');
console.log('');

async function runMigration() {
  try {
    console.log('Starting migration...');
    console.log('This will:');
    console.log('1. Create a backup of your SQLite database');
    console.log('2. Migrate all tables and data to PostgreSQL');
    console.log('3. Create indexes and constraints');
    console.log('4. Generate a migration log');
    console.log('');
    
    // Ask for confirmation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('Do you want to continue? (y/N): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('Migration cancelled.');
      process.exit(0);
    }
    
    console.log('');
    console.log('Starting migration...');
    
    const migrator = new DatabaseMigrator();
    await migrator.migrate();
    
    console.log('');
    console.log('==========================================');
    console.log('           MIGRATION COMPLETED!');
    console.log('==========================================');
    console.log('');
    console.log('Next steps:');
    console.log('1. Add USE_POSTGRES=true to your .env file');
    console.log('2. Restart your application');
    console.log('3. Test all functionality');
    console.log('');
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    console.log('');
    console.log('Please check:');
    console.log('1. PostgreSQL is running');
    console.log('2. Database credentials in .env are correct');
    console.log('3. Database exists in PostgreSQL');
    console.log('');
    process.exit(1);
  }
}

runMigration();
