const { Pool } = require('pg');

// Create a connection pool with default postgres database
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres', // Connect to default database first
  user: 'postgres',
  password: 'postgres',
});

async function setupDatabase() {
  try {
    console.log('🔍 Setting up PostgreSQL database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL successfully');
    
    // Create the lms_database if it doesn't exist
    await pool.query('CREATE DATABASE lms_database');
    console.log('✅ Database lms_database created');
    
    // Close the connection to default database
    await pool.end();
    
    // Connect to the new database
    const lmsPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'lms_database',
      user: 'postgres',
      password: 'postgres',
    });
    
    // Create tables
    console.log('🏗️ Creating tables...');
    
    // Users table
    await lmsPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        university_id INTEGER DEFAULT 1,
        is_approved BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created');
    
    // Universities table
    await lmsPool.query(`
      CREATE TABLE IF NOT EXISTS universities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        area TEXT,
        adminId INTEGER,
        subscriptionPlan TEXT DEFAULT 'free',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Universities table created');
    
    // Close connection
    await lmsPool.end();
    
    console.log('🎉 PostgreSQL database setup completed successfully!');
    console.log('📊 Database: lms_database');
    console.log('👤 User: postgres');
    console.log('🔑 Password: postgres');
    
  } catch (error) {
    if (error.code === '42P04') {
      console.log('✅ Database lms_database already exists');
    } else {
      console.error('❌ Error setting up database:', error.message);
    }
  }
}

setupDatabase();
