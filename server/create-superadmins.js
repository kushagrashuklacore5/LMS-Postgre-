const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Set environment variables directly
process.env.PG_HOST = 'localhost';
process.env.PG_PORT = '5432';
process.env.PG_DATABASE = 'lms_database';
process.env.PG_USER = 'postgres';
process.env.PG_PASSWORD = 'postgres123';

console.log('=== CREATING 5 SUPERADMINS ===\n');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

// Define 5 superadmin users with unique domains
const superadmins = [
  {
    name: 'John Anderson',
    email: 'john.anderson@techcorp.com',
    domain: 'techcorp.com',
    password: '12345678'
  },
  {
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@edusolutions.net',
    domain: 'edusolutions.net',
    password: '12345678'
  },
  {
    name: 'Michael Chen',
    email: 'michael.chen@learnhub.org',
    domain: 'learnhub.org',
    password: '12345678'
  },
  {
    name: 'Emma Williams',
    email: 'emma.williams@academysuite.io',
    domain: 'academysuite.io',
    password: '12345678'
  },
  {
    name: 'David Rodriguez',
    email: 'david.rodriguez@smartlearn.co',
    domain: 'smartlearn.co',
    password: '12345678'
  }
];

async function createSuperadmins() {
  try {
    console.log('Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('Connected to lms_database\n');
    
    // Check current users
    const currentUsers = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`Current users in database: ${currentUsers.rows[0].count}`);
    
    // Hash the password once (same for all)
    const hashedPassword = await bcrypt.hash('12345678', 10);
    console.log('Password hashed successfully\n');
    
    console.log('Creating 5 superadmin users:\n');
    
    let createdCount = 0;
    let skippedCount = 0;
    
    for (const admin of superadmins) {
      try {
        // Check if user already exists
        const existingUser = await pool.query(
          'SELECT id FROM users WHERE email = $1',
          [admin.email]
        );
        
        if (existingUser.rows.length > 0) {
          console.log(`  ${admin.name} (${admin.email}) - ALREADY EXISTS - SKIPPING`);
          skippedCount++;
          continue;
        }
        
        // Insert the superadmin
        const insertResult = await pool.query(`
          INSERT INTO users (name, email, password, role, isapproved, createdat, updatedat)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING id
        `, [
          admin.name,
          admin.email,
          hashedPassword,
          'superadmin',
          true // isapproved
        ]);
        
        const userId = insertResult.rows[0].id;
        console.log(`  ${admin.name} (${admin.email}) - CREATED (ID: ${userId})`);
        console.log(`    Domain: ${admin.domain}`);
        console.log(`    Password: 12345678`);
        console.log(`    Role: superadmin`);
        console.log(`    Approved: Yes`);
        console.log('');
        
        createdCount++;
        
      } catch (error) {
        console.log(`  ${admin.name} (${admin.email}) - ERROR: ${error.message}`);
      }
    }
    
    // Verify creation
    console.log('='.repeat(50));
    console.log('SUPERADMIN CREATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Created: ${createdCount} new superadmins`);
    console.log(`Skipped: ${skippedCount} existing users`);
    
    // Show final user count
    const finalUsers = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`Total users in database: ${finalUsers.rows[0].count}`);
    
    // Show all superadmins
    console.log('\nAll superadmin users:');
    const allSuperadmins = await pool.query(
      'SELECT id, name, email, role, isapproved, createdat FROM users WHERE role = $1 ORDER BY id',
      ['superadmin']
    );
    
    if (allSuperadmins.rows.length === 0) {
      console.log('  No superadmin users found');
    } else {
      allSuperadmins.rows.forEach((admin, index) => {
        console.log(`  ${index + 1}. ${admin.name}`);
        console.log(`     Email: ${admin.email}`);
        console.log(`     ID: ${admin.id}`);
        console.log(`     Created: ${new Date(admin.createdat).toLocaleString()}`);
        console.log('');
      });
    }
    
    console.log('='.repeat(50));
    console.log('LOGIN CREDENTIALS FOR ALL SUPERADMINS:');
    console.log('='.repeat(50));
    
    superadmins.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.name}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Password: 12345678`);
      console.log(`   Domain: ${admin.domain}`);
      console.log('');
    });
    
    console.log('All superadmins can now login with their email and password: 12345678');
    
  } catch (error) {
    console.error('Error creating superadmins:', error.message);
    console.error('Full error details:', error);
  } finally {
    await pool.end();
  }
}

createSuperadmins();
