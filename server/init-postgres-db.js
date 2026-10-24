const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

console.log('🗄️  Initializing PostgreSQL database...\n');

// Connection to PostgreSQL server (without specifying database)
const adminPool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: 'postgres', // Connect to default database first
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'password',
});

async function initializeDatabase() {
  try {
    console.log('🔗 Connecting to PostgreSQL server...');
    
    // Test connection
    await adminPool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL server');
    
    // Create the database if it doesn't exist
    const dbName = process.env.PG_DATABASE || 'lms_prod';
    try {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Created database: ${dbName}`);
    } catch (err) {
      if (err.code === '42P04') { // Database already exists
        console.log(`✅ Database ${dbName} already exists`);
      } else {
        throw err;
      }
    }
    
    // Close admin connection
    await adminPool.end();
    
    // Connect to the new database
    const dbPool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      database: dbName,
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'password',
    });
    
    console.log(`🔗 Connecting to database: ${dbName}`);
    
    // Read and execute the schema file
    const schemaPath = path.join(__dirname, 'database', 'postgres-schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Split the schema into individual statements
      const statements = schema
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      console.log('📝 Executing schema statements...');
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await dbPool.query(statement);
            console.log(`✅ Executed: ${statement.substring(0, 50)}...`);
          } catch (err) {
            console.log(`⚠️  Skipped (may already exist): ${statement.substring(0, 50)}...`);
          }
        }
      }
      
      console.log('✅ Database schema initialized successfully!');
    } else {
      console.log('❌ Schema file not found:', schemaPath);
    }
    
    // Test the database
    const result = await dbPool.query('SELECT COUNT(*) as user_count FROM users');
    console.log(`👥 Users in database: ${result.rows[0].user_count}`);
    
    const uniResult = await dbPool.query('SELECT COUNT(*) as uni_count FROM universities');
    console.log(`🏫 Universities in database: ${uniResult.rows[0].uni_count}`);
    
    // Close the database connection
    await dbPool.end();
    
    console.log('\n🎯 PostgreSQL database initialization completed!');
    console.log('\n📋 Database ready for use with:');
    console.log(`   Database: ${dbName}`);
    console.log(`   Host: ${process.env.PG_HOST || 'localhost'}`);
    console.log(`   Port: ${process.env.PG_PORT || 5432}`);
    console.log(`   User: ${process.env.PG_USER || 'postgres'}`);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Troubleshooting tips:');
      console.log('1. Make sure PostgreSQL is installed and running');
      console.log('2. Check that PostgreSQL is accepting connections');
      console.log('3. Verify the host and port in your environment variables');
      console.log('4. Check your PostgreSQL username and password');
    } else if (error.code === '28P01') {
      console.log('\n💡 Authentication failed:');
      console.log('1. Check your PostgreSQL password');
      console.log('2. Verify the username in your environment variables');
      console.log('3. Make sure the user has necessary permissions');
    }
    
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase();
