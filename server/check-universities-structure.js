const { Pool } = require('pg');

// Set environment variables directly
process.env.PG_HOST = 'localhost';
process.env.PG_PORT = '5432';
process.env.PG_DATABASE = 'lms_database';
process.env.PG_USER = 'postgres';
process.env.PG_PASSWORD = 'postgres123';

console.log('=== CHECKING UNIVERSITIES TABLE STRUCTURE ===\n');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

async function checkUniversitiesStructure() {
  try {
    console.log('Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('Connected to lms_database\n');
    
    // Check if universities table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'universities'
      );
    `);
    
    if (tableExists.rows[0].exists) {
      console.log('Universities table exists');
      
      // Get table structure
      const structure = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'universities' AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      
      console.log('\nUniversities table columns:');
      structure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default})`);
      });
      
      // Check current data
      const currentData = await pool.query('SELECT * FROM universities LIMIT 5');
      console.log('\nCurrent data in universities table:');
      if (currentData.rows.length === 0) {
        console.log('  No data found');
      } else {
        currentData.rows.forEach((row, index) => {
          console.log(`  ${index + 1}. ${JSON.stringify(row)}`);
        });
      }
      
    } else {
      console.log('Universities table does not exist');
      
      // Create the universities table with proper structure
      console.log('\nCreating universities table...');
      await pool.query(`
        CREATE TABLE universities (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT,
          address TEXT,
          phone TEXT,
          createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('Universities table created successfully');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error details:', error);
  } finally {
    await pool.end();
  }
}

checkUniversitiesStructure();
