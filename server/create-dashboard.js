const { Client } = require('pg');

console.log('Creating database dashboard views...');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres123',
  database: 'lms_database'
});

client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL');
    
    // Create database dashboard view
    const dashboardSQL = `CREATE OR REPLACE VIEW database_dashboard AS
SELECT 
    t.table_name,
    COALESCE(s.n_live_tup, 0) as record_count,
    CASE 
        WHEN COALESCE(s.n_live_tup, 0) > 0 THEN 'HAS DATA'
        ELSE 'EMPTY'
    END as status,
    CASE 
        WHEN t.table_name IN ('users', 'universities', 'courses', 'classrooms', 'students') THEN 'KEY TABLE'
        ELSE 'SUPPORTING TABLE'
    END as table_type
FROM information_schema.tables t
LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname
WHERE t.table_schema = 'public' 
  AND t.table_type = 'BASE TABLE'
ORDER BY 
    CASE 
        WHEN t.table_name IN ('users', 'universities', 'courses', 'classrooms', 'students') THEN 1
        ELSE 2
    END,
    s.n_live_tup DESC,
    t.table_name`;
    
    return client.query(dashboardSQL);
  })
  .then(() => {
    console.log('Database dashboard view created!');
    
    // Create complete data overview
    const overviewSQL = `CREATE OR REPLACE VIEW complete_data_overview AS
SELECT 
    'Users' as table_name,
    COUNT(*) as count,
    'Active users in the system' as description
FROM users

UNION ALL

SELECT 
    'Universities' as table_name,
    COUNT(*) as count,
    'Educational institutions' as description
FROM universities

UNION ALL

SELECT 
    'Courses' as table_name,
    COUNT(*) as count,
    'Available courses' as description
FROM courses

UNION ALL

SELECT 
    'Classrooms' as table_name,
    COUNT(*) as count,
    'Virtual classrooms' as description
FROM classrooms

UNION ALL

SELECT 
    'Students' as table_name,
    COUNT(*) as count,
    'Enrolled students' as description
FROM students

UNION ALL

SELECT 
    'Payments' as table_name,
    COUNT(*) as count,
    'Payment records' as description
FROM payments

UNION ALL

SELECT 
    'Inventory' as table_name,
    COUNT(*) as count,
    'Inventory items' as description
FROM inventory

UNION ALL

SELECT 
    'Vendors' as table_name,
    COUNT(*) as count,
    'Vendor records' as description
FROM vendors

ORDER BY count DESC`;
    
    return client.query(overviewSQL);
  })
  .then(() => {
    console.log('Complete data overview view created!');
    console.log('\nDashboard views are now ready!');
    console.log('\nIn pgAdmin, you can now:');
    console.log('1. Expand lms_database');
    console.log('2. Expand Views');
    console.log('3. Click on database_dashboard');
    console.log('4. Click on complete_data_overview');
    console.log('\nThese views show your entire database in table form!');
  })
  .catch(err => {
    console.error('Error:', err.message);
  })
  .finally(() => {
    client.end();
  });
