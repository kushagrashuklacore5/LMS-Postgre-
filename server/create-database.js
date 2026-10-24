const { Client } = require('pg');

console.log('Creating PostgreSQL database...');

async function createDatabase() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres123',
    database: 'postgres' // Connect to default database first
  });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
    
    // Create the database
    await client.query('CREATE DATABASE lms_database');
    console.log('Database "lms_database" created successfully!');
    
    await client.end();
    console.log('Database is ready for migration!');
    
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('Database "lms_database" already exists');
    } else {
      console.error('Error creating database:', error.message);
    }
  }
}

createDatabase();
