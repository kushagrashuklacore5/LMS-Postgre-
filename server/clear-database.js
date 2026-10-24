const { Pool } = require('pg');

// Set environment variables directly
process.env.PG_HOST = 'localhost';
process.env.PG_PORT = '5432';
process.env.PG_DATABASE = 'lms_database';
process.env.PG_USER = 'postgres';
process.env.PG_PASSWORD = 'postgres123';

console.log('=== CLEARING ENTIRE DATABASE ===');
console.log('WARNING: This will delete ALL data from ALL tables!\n');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

async function clearDatabase() {
  try {
    console.log('Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('Connected to lms_database\n');
    
    // Get all table names
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    console.log(`Found ${tables.length} tables to clear:\n`);
    
    // Show tables with record counts before clearing
    console.log('BEFORE CLEARING - Record counts:');
    for (const table of tables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = countResult.rows[0].count;
        console.log(`  ${table}: ${count} records`);
      } catch (error) {
        console.log(`  ${table}: Error checking count - ${error.message}`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('STARTING DATABASE CLEARANCE...');
    console.log('='.repeat(50) + '\n');
    
    // Disable foreign key constraints temporarily
    await pool.query('SET session_replication_role = replica;');
    
    // Clear each table
    let totalDeleted = 0;
    for (const table of tables) {
      try {
        // Get count before deletion
        const beforeCount = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const recordsToDelete = parseInt(beforeCount.rows[0].count);
        
        if (recordsToDelete > 0) {
          // Delete all records
          await pool.query(`DELETE FROM ${table}`);
          console.log(`  ${table}: ${recordsToDelete} records DELETED`);
          totalDeleted += recordsToDelete;
        } else {
          console.log(`  ${table}: Already empty`);
        }
      } catch (error) {
        console.log(`  ${table}: Error deleting - ${error.message}`);
      }
    }
    
    // Re-enable foreign key constraints
    await pool.query('SET session_replication_role = DEFAULT;');
    
    console.log('\n' + '='.repeat(50));
    console.log('DATABASE CLEARANCE COMPLETE');
    console.log('='.repeat(50));
    console.log(`Total records deleted: ${totalDeleted}\n`);
    
    // Verify all tables are empty
    console.log('VERIFYING ALL TABLES ARE EMPTY:');
    let allEmpty = true;
    for (const table of tables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = countResult.rows[0].count;
        if (count > 0) {
          console.log(`  ${table}: ${count} records (NOT EMPTY!)`);
          allEmpty = false;
        } else {
          console.log(`  ${table}: 0 records (empty)`);
        }
      } catch (error) {
        console.log(`  ${table}: Error verifying - ${error.message}`);
        allEmpty = false;
      }
    }
    
    if (allEmpty) {
      console.log('\nSUCCESS: All tables are completely empty!');
    } else {
      console.log('\nWARNING: Some tables may still contain data');
    }
    
    // Reset sequences if they exist
    console.log('\nResetting auto-increment sequences...');
    try {
      const sequencesResult = await pool.query(`
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
      `);
      
      for (const seq of sequencesResult.rows) {
        try {
          await pool.query(`ALTER SEQUENCE ${seq.sequence_name} RESTART WITH 1`);
          console.log(`  ${seq.sequence_name}: Reset to 1`);
        } catch (error) {
          console.log(`  ${seq.sequence_name}: Error resetting - ${error.message}`);
        }
      }
    } catch (error) {
      console.log('Error resetting sequences:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('DATABASE COMPLETELY CLEARED');
    console.log('All data has been removed from all tables');
    console.log('Auto-increment sequences have been reset');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('Error clearing database:', error.message);
    console.error('Full error details:', error);
  } finally {
    await pool.end();
  }
}

clearDatabase();
